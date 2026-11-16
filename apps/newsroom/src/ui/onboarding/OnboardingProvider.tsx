"use client";

import { useAuth, usePreferences } from "@payloadcms/ui";
import { usePathname } from "next/navigation";
import { createContext, lazy, Suspense, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { navigationFor, primaryLocationFor } from "../../domain/navigation";
import type { User } from "../../payload-types";
import { useNewsroomAccount, useNewsroomRoutes } from "../shell/account";
import { ShellLayer } from "../shell/layer";
import { useShellNavigation } from "../shell/navigation";
import { useModifierLabel } from "../shell/shortcuts";
import { clearTourHandoff, saveTourHandoff, takeTourHandoff } from "./tour-handoff";
import { normalizeInstant, normalizeWelcomePreference, welcomeIsDue, welcomePreferenceAfter, WELCOME_ONBOARDING_PREFERENCE, type OnboardingOutcome } from "./tour-preferences";
import { isTourId, stepsFor, type TourContext } from "./tour-registry";
import { createTourRun, type TourRun } from "./tour-run";
import { afterFrame, isTourTargetVisible, resolveTourTarget } from "./tour-targets";

// Loaded only when there is something to show; Driver.js itself only when a tour starts (tour-run.ts).
const WelcomeDialog = lazy(() => import("./WelcomeDialog"));
const BylineTour = lazy(() => import("./BylineTour"));

type Mode = { kind: "welcome"; replay: boolean } | { kind: "tour"; run: TourRun; replay: boolean; id: number } | null;

type Onboarding = {
  /** Shows the welcome again (account menu → Take the Byline tour), from the beginning. */
  replayWelcome: () => void;
};

const OnboardingContext = createContext<Onboarding>({ replayWelcome: () => {} });

export const useOnboarding = () => use(OnboardingContext);

const samePath = (left: string, right: string) => left.replace(/\/+$/, "") === right.replace(/\/+$/, "");

/** Resolves once the shell's navigation (the account control or More) is on screen, or after a couple of seconds regardless. */
function navigationRendered(timeoutMs = 2_000): Promise<void> {
  const started = performance.now();
  return new Promise((resolve) => {
    const check = () => {
      if (resolveTourTarget(["account", "more"]) || performance.now() - started > timeoutMs) resolve();
      else afterFrame(check);
    };
    check();
  });
}

/**
 * First-run onboarding for the whole shell (mounted once, in BylineShell).
 *
 * On a Byline screen, once per page load, it greets an account whose welcome
 * is due (tour-preferences.ts): never finished or skipped, or re-requested by
 * an administrator. "Show me around" runs the welcome tour over the real
 * interface. Only the reader's explicit choices are recorded, in their own
 * Payload Preference: finishing (completed), or Skip / Escape (skipped).
 * Tearing a run down because the shell navigated or unmounted records
 * nothing. A reload mid-tour, including one while a step is opening another
 * screen, picks the tour up again through a short-lived handoff in this tab
 * (tour-handoff.ts).
 */
export function OnboardingProvider({ children }: { children: ReactNode }) {
  const account = useNewsroomAccount();
  const { user } = useAuth<User>();
  const { getPreference, setPreference } = usePreferences();
  const routes = useNewsroomRoutes();
  const pathname = usePathname() ?? "";
  const { navigate } = useShellNavigation();
  const modifier = useModifierLabel();
  const [mode, setMode] = useState<Mode>(null);
  const modeRef = useRef<Mode>(null);
  modeRef.current = mode;
  const runs = useRef(0);
  const requestedAt = normalizeInstant(user?.welcomeOnboardingRequestedAt);
  const onBylineScreen = primaryLocationFor(pathname, routes.admin) !== null;

  // Where focus goes back to when onboarding ends.
  const returnFocus = useRef<() => HTMLElement | null>(() => null);
  const restoreFocus = useCallback(() => {
    // A closing dialog keeps the page inert for its exit animation: try again until focus can land.
    const attempt = (left: number) => {
      const preferred = returnFocus.current();
      const heading = document.querySelector<HTMLElement>("main h1");
      const into = preferred && isTourTargetVisible(preferred) ? preferred : heading;
      if (!into) return;
      if (into === heading && !heading.hasAttribute("tabindex")) heading.setAttribute("tabindex", "-1");
      into.focus({ preventScroll: true });
      if (document.activeElement !== into && left > 0) window.setTimeout(() => attempt(left - 1), 60);
    };
    afterFrame(() => attempt(10));
  }, []);

  const record = useCallback(async (outcome: OnboardingOutcome) => {
    clearTourHandoff();
    try {
      const previous = await getPreference<unknown>(WELCOME_ONBOARDING_PREFERENCE);
      await setPreference(WELCOME_ONBOARDING_PREFERENCE, welcomePreferenceAfter(outcome, previous, requestedAt));
    } catch {
      toast.error("Byline couldn’t save that, so the welcome may appear again.");
    }
  }, [getPreference, setPreference, requestedAt]);

  const startTour = useCallback((replay: boolean, resumeStepId?: string): boolean => {
    if (!account) return false;
    const navigation = navigationFor(account.role);
    const context: TourContext = {
      role: account.role,
      navigation: new Set(navigation.map((item) => item.key)),
      publishDesks: navigation.filter((item) => item.group === "publish").map((item) => item.label),
      visible: (anchor) => resolveTourTarget([anchor]) !== null,
      modifier
    };
    const steps = stepsFor("welcome", context);
    const startAt = resumeStepId ? steps.findIndex((step) => step.id === resumeStepId) : 0;
    if (!steps.length || startAt < 0) return false;
    const pathFor = (screen: string) => `${routes.admin}${screen}` || "/";
    const first = steps[startAt]!;
    // The tour begins on its first step's screen; the shell navigates there (and guards unsaved work).
    if (!resumeStepId && first.screen !== undefined && !samePath(pathname, pathFor(first.screen))) navigate(pathFor(first.screen));
    const run = createTourRun({
      tour: "welcome",
      steps,
      replay,
      startAt,
      onWaitingForScreen: (step) => saveTourHandoff({ tour: "welcome", stepId: step.id, expectedPath: pathFor(step.screen ?? ""), replay }),
      // Where the tour is in this tab, so a reload picks it up again (briefly; see tour-handoff.ts).
      onShown: (step) => saveTourHandoff({ tour: "welcome", stepId: step.id, expectedPath: window.location.pathname, replay })
    });
    runs.current += 1;
    setMode({ kind: "tour", run, replay, id: runs.current });
    run.start().catch(() => {
      run.dispose();
      setMode(null);
      toast.error("The Byline tour couldn’t start. Try again from your account menu.");
    });
    return true;
  }, [account, modifier, navigate, pathname, routes.admin]);

  // Once per page load and account, on a Byline screen: resume a tour that was crossing screens, or greet if due.
  const decided = useRef<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!account || mode || !onBylineScreen) return;
    const key = String(account.id);
    if (decided.current === key) return;
    decided.current = key;
    const greetIfDue = () =>
      getPreference<unknown>(WELCOME_ONBOARDING_PREFERENCE).then(
        (stored) => {
          if (!mounted.current || !welcomeIsDue(stored, requestedAt)) return;
          returnFocus.current = () => null;
          // Someone an administrator invited back has been here before: "Welcome back".
          const returning = normalizeWelcomePreference(stored) !== null;
          setMode((current) => current ?? { kind: "welcome", replay: returning });
        },
        () => undefined
      );
    // Read (and removed) once, by the first decision for this account on this page.
    const handoff = takeTourHandoff(pathname, isTourId);
    if (!handoff) return void greetIfDue();
    // The steps depend on the layout, so wait for the shell's navigation to render before deciding them.
    void navigationRendered().then(() => {
      if (mounted.current && !startTour(handoff.replay, handoff.stepId)) void greetIfDue();
    });
  }, [account, mode, onBylineScreen, pathname, startTour, getPreference, requestedAt]);

  // While the welcome is open, fetch the tour's code so "Show me around" starts at once.
  const welcoming = mode?.kind === "welcome";
  useEffect(() => {
    if (!welcoming) return;
    void import("./BylineTour").catch(() => undefined);
    void import("driver.js/headless").catch(() => undefined);
  }, [welcoming]);

  // A run never outlives the shell or the mode that owns it (this records nothing).
  useEffect(() => () => {
    if (mode?.kind === "tour") mode.run.dispose();
  }, [mode]);

  const end = useCallback((outcome: OnboardingOutcome) => {
    const current = modeRef.current;
    if (current?.kind === "tour") current.run.dispose();
    setMode(null);
    void record(outcome);
    restoreFocus();
  }, [record, restoreFocus]);

  const replayWelcome = useCallback(() => {
    if (!account) return;
    returnFocus.current = () => resolveTourTarget(["account", "more"]);
    setMode((current) => current ?? { kind: "welcome", replay: true });
  }, [account]);

  const value = useMemo<Onboarding>(() => ({ replayWelcome }), [replayWelcome]);

  return (
    <OnboardingContext value={value}>
      {children}
      {account ? (
        <ShellLayer active={mode !== null}>
          <Suspense fallback={null}>
            {mode?.kind === "welcome" ? (
              <WelcomeDialog
                name={user?.name}
                replay={mode.replay}
                onSkip={() => end("skipped")}
                onStart={() => {
                  if (!startTour(mode.replay)) end("skipped");
                }}
              />
            ) : mode?.kind === "tour" ? (
              <BylineTour key={mode.id} run={mode.run} admin={routes.admin} pathname={pathname} onSkip={() => end("skipped")} onFinish={() => end("completed")} />
            ) : null}
          </Suspense>
        </ShellLayer>
      ) : null}
    </OnboardingContext>
  );
}
