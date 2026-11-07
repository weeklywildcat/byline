"use client";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { PeoplePage } from "@byline/newsroom-screens/people/PeoplePage";
import { PersonEditor } from "@byline/newsroom-screens/people/PersonEditor";
import {
  peopleQuery,
  type PeopleQuery,
} from "@byline/newsroom-screens/people/people-model";
import { peopleKeys } from "@byline/newsroom-screens/people/people-query";
import type { PersonWork } from "@byline/newsroom-screens/people/person-form";
import { weeklyWildcatTheme } from "@byline/theme-weekly-wildcat";
import { themeTokensToCssVariables } from "@byline/ui";
import { AdminRoot } from "@byline/newsroom-ui/components/admin-root";
import { Button } from "@byline/newsroom-ui/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@byline/newsroom-ui/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@byline/newsroom-ui/ui/empty";
import { Skeleton } from "@byline/newsroom-ui/ui/skeleton";
import { useMediaWorkspace } from "../media/MediaWorkspaceShell";
import type { MediaPicker } from "@byline/newsroom-screens/workspace/media-picker";
import { useNewsroomRoutes } from "../shell/account";
import { createHistoryGuard } from "../shell/history-guard";
import { useLeaveGuard, useShellNavigation } from "../shell/navigation";
import { createPayloadPeopleApi } from "./payload-people-api";

export const peopleHistory = createHistoryGuard("bylinePeople");
const previewStyle = themeTokensToCssVariables(
  weeklyWildcatTheme.tokens,
) as CSSProperties;

/** Global sidebar throughout. Person selection and list state live in the URL. */
export function NewsroomPeopleScreen({ self = false }: { self?: boolean }) {
  return (
    <AdminRoot toaster={false} className="byline-people">
      <main
        className="mx-auto flex w-full min-w-0 max-w-[1240px] flex-col gap-5 px-4 py-6 lg:px-6"
        data-byline-people-screen=""
      >
        <PeopleBody self={self} />
      </main>
    </AdminRoot>
  );
}

function PeopleBody({ self }: { self: boolean }) {
  const routes = useNewsroomRoutes();
  const params = useSearchParams();
  const query = peopleQuery(new URLSearchParams(params?.toString()));
  const candidate = Number(params?.get("person"));
  const personId =
    Number.isSafeInteger(candidate) && candidate > 0 ? candidate : null;
  const { navigate } = useShellNavigation();
  const { pick } = useMediaWorkspace();
  const media = useMemo<MediaPicker>(
    () => ({
      available: () => true,
      label: "Choose photo",
      pick: async () =>
        (
          await pick({
            kind: "image",
            restrictedKind: "image",
            title: "Choose portrait",
            confirmLabel: "Use portrait",
            multiple: false,
          })
        ).map((asset) => ({
          id: asset.id,
          title: asset.filename,
          previewUrl: asset.previewUrl,
          mimeType: asset.mimeType,
        })),
    }),
    [pick],
  );
  const api = useMemo(() => createPayloadPeopleApi(routes.api), [routes.api]);
  const cache = useQueryClient();
  const work = useRef<PersonWork | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<(() => void) | null>(null);
  const onWorkChange = useCallback((next: PersonWork | null) => {
    work.current = next;
    setBusy(Boolean(next?.saving));
  }, []);
  const guard = useCallback((proceed: () => void) => {
    if (work.current?.dirty || work.current?.saving) setPending(() => proceed);
    else proceed();
  }, []);
  useLeaveGuard(() => ({
    modified: work.current?.dirty ?? false,
    saving: work.current?.saving ?? false,
    explicit: true,
    description: "Your changes to this public profile haven’t been saved.",
    discard: () => {
      work.current?.discard();
      work.current = null;
    },
  }));
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => {
      if (work.current?.dirty || work.current?.saving) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", unload);
    return () => window.removeEventListener("beforeunload", unload);
  }, []);
  peopleHistory.useGuard({
    dirty: () => Boolean(work.current?.dirty || work.current?.saving),
    ask: guard,
    location: `${self}:${params?.toString()}`,
  });
  const href = (id: number | null, nextQuery = query) => {
    const search = new URLSearchParams();
    if (nextQuery.view !== "active") search.set("view", nextQuery.view);
    if (nextQuery.search) search.set("search", nextQuery.search);
    if (nextQuery.page > 1) search.set("page", String(nextQuery.page));
    if (id) search.set("person", String(id));
    return `${routes.admin}/people${search.size ? `?${search}` : ""}`;
  };
  const open = (id: number | null) =>
    guard(() =>
      peopleHistory.push(
        href(id, peopleQuery(new URLSearchParams(window.location.search))),
      ),
    );
  const changeQuery = (next: PeopleQuery) => {
    // Native URL updates can precede Next's concurrent render. Compose only
    // the changed controls onto the live URL so a quick search after a tab
    // click cannot restore the previous tab.
    const latest = peopleQuery(new URLSearchParams(window.location.search));
    const viewChanged = next.view !== query.view;
    const searchChanged = next.search !== query.search;
    peopleHistory.replace(
      href(null, {
        view: viewChanged ? next.view : latest.view,
        search: searchChanged ? next.search : latest.search,
        page: viewChanged || searchChanged ? 1 : next.page,
      }),
    );
  };
  const detail = useQuery({
    queryKey: peopleKeys.detail(personId, self),
    queryFn: () => (self ? api.profile() : api.detail(personId!)),
    enabled: self || personId !== null,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const [reloadKey, setReloadKey] = useState(0);
  const reload = () =>
    guard(() => {
      work.current?.discard();
      void detail.refetch().then((result) => {
        if (!result.isError) setReloadKey((key) => key + 1);
      });
    });

  return (
    <>
      {self || personId !== null ? (
        detail.isPending ? (
          <div className="space-y-5" aria-label="Loading profile">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-96 w-full" />
          </div>
        ) : detail.isError ? (
          <div role="alert" className="space-y-3">
            <h1 className="text-xl font-semibold">Profile unavailable</h1>
            <p>{detail.error.message}</p>
            <Button
              type="button"
              variant="outline"
              onClick={() => void detail.refetch()}
            >
              Try again
            </Button>
            {!self ? (
              <Button type="button" variant="ghost" onClick={() => open(null)}>
                Back to People
              </Button>
            ) : null}
          </div>
        ) : detail.data ? (
          <PersonEditor
            key={`${self}:${detail.data.person.id}:${reloadKey}`}
            api={api}
            detail={detail.data}
            self={self}
            media={media}
            previewStyle={previewStyle}
            onWorkChange={onWorkChange}
            onBack={self ? undefined : () => open(null)}
            onNavigate={navigate}
            onReload={reload}
            onSaved={(saved) => {
              cache.setQueryData(peopleKeys.detail(personId, self), saved);
              void cache.invalidateQueries({ queryKey: ["people", "list"] });
            }}
          />
        ) : (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>My profile</EmptyTitle>
              <EmptyDescription>
                Your account does not have a public byline profile yet. Ask an
                editor to link one.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )
      ) : (
        <PeoplePage
          api={api}
          query={query}
          onQueryChange={changeQuery}
          href={(id) => href(id)}
          onOpen={open}
        />
      )}
      <Dialog
        open={pending !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setPending(null);
        }}
      >
        <DialogContent showCloseButton={!busy}>
          <DialogHeader>
            <DialogTitle>Discard unsaved changes?</DialogTitle>
            <DialogDescription>
              {busy
                ? "Wait for the current operation to finish before leaving this profile."
                : "Your changes to this public profile haven’t been saved."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPending(null)}
            >
              Keep editing
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={() => {
                const proceed = pending;
                work.current?.discard();
                work.current = null;
                setPending(null);
                proceed?.();
              }}
            >
              Discard changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
