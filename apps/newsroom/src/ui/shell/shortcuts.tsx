"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@byline/newsroom-ui/ui/dialog";
import { Kbd, KbdGroup } from "@byline/newsroom-ui/ui/kbd";
import { createContext, Fragment, use, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { useNewsroomAccount, useNewsroomRoutes } from "./account";
import { useBylineCreate } from "./create";
import { ShellLayer } from "./layer";
import { useShellNavigation } from "./navigation";
import { useBylineSearch } from "./search";
import { createShortcutMachine, shortcutGroups } from "./shortcuts-model";

const subscribeNothing = () => () => {};

/** ⌘ on Apple devices, Ctrl elsewhere; "Ctrl" during server rendering and hydration. */
export function useModifierLabel() {
  return useSyncExternalStore(subscribeNothing, () => (/Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent) ? "⌘" : "Ctrl"), () => "Ctrl");
}

type BylineShortcuts = { openHelp: () => void };

const ShortcutsContext = createContext<BylineShortcuts>({ openHelp: () => {} });

export const useBylineShortcuts = () => use(ShortcutsContext);

/**
 * Keyboard navigation for the newsroom, everywhere (`shortcuts-model.ts`):
 * `?` lists the keys, `/` opens Search, `c` starts a story and `g` then a
 * letter goes to a destination through the shell's guarded navigation, so an
 * open story still saves first. Keys are the shell's only while nothing is
 * being typed into and no menu or dialog is open.
 */
export function BylineShortcutsProvider({ children }: { children: ReactNode }) {
  const account = useNewsroomAccount();
  const routes = useNewsroomRoutes();
  const { openSearch } = useBylineSearch();
  const { actions, openCreate, creating } = useBylineCreate();
  const { navigate } = useShellNavigation();
  const [open, setOpen] = useState(false);
  const role = account?.role ?? null;
  const canCreateStory = actions.some((action) => action.kind === "story");
  const machine = useMemo(() => (role ? createShortcutMachine({ role, canCreateStory }) : null), [role, canCreateStory]);

  useEffect(() => {
    if (!machine) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (creating) return;
      const { action, consumed } = machine.press(event, event.target);
      if (!action) return;
      if (consumed) event.preventDefault();
      if (action.type === "help") setOpen(true);
      else if (action.type === "search") openSearch();
      else if (action.type === "create-story") openCreate("story");
      else navigate(`${routes.admin}${action.path}`);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [machine, creating, openSearch, openCreate, navigate, routes.admin]);

  const value = useMemo<BylineShortcuts>(() => ({ openHelp: () => setOpen(true) }), []);
  return (
    <ShortcutsContext value={value}>
      {children}
      {account ? <ShellLayer active={open}><ShortcutsDialog open={open} onOpenChange={setOpen} role={account.role} canCreateStory={canCreateStory} /></ShellLayer> : null}
    </ShortcutsContext>
  );
}

function ShortcutsDialog({ open, onOpenChange, role, canCreateStory }: { open: boolean; onOpenChange: (open: boolean) => void; role: NonNullable<ReturnType<typeof useNewsroomAccount>>["role"]; canCreateStory: boolean }) {
  const modifier = useModifierLabel();
  const groups = shortcutGroups(role, { canCreateStory, modifier });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-full overflow-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Single keys work when you are not typing in a field. To go somewhere, press G, then the letter.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-5 sm:grid-cols-2">
          {groups.map((group) => (
            <section key={group.title} aria-label={group.title} className="grid content-start gap-2">
              <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{group.title}</h3>
              <ul className="grid gap-1.5">
                {group.items.map((item) => (
                  <li key={item.label} className="flex items-center justify-between gap-3 text-sm">
                    <span>{item.label}</span>
                    <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                      {item.keys.map((combo, index) => (
                        <Fragment key={combo.join("+")}>
                          {index ? <span aria-hidden="true">or</span> : null}
                          <KbdGroup>{combo.map((part, partIndex) => <Fragment key={part}>{partIndex && combo[0] === "G" ? <span aria-hidden="true">then</span> : null}<Kbd>{part}</Kbd></Fragment>)}</KbdGroup>
                        </Fragment>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
