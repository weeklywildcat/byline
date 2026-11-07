import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@byline/newsroom-ui/ui/alert-dialog";

/**
 * One unsaved-changes guard for a Collection workspace. Its explicit-save
 * editors (the brief, an interview, the public presentation) register while
 * they hold unsaved changes; anything that would abandon them (switching
 * Collection or section, closing an interview, the browser's Back and
 * Forward, the host's navigation) asks once, here, before going on.
 */
type Editor = { label: string; dirty: () => boolean; discard?: () => void };

export type CollectionGuard = {
  /** Whether any editor holds unsaved changes. */
  isDirty: () => boolean;
  /** Runs `proceed` now, or after the reader agrees to discard unsaved changes. */
  guard: (proceed: () => void) => void;
  /** What is unsaved, for a host's own leave prompt. */
  describe: () => string;
};

type Registry = CollectionGuard & {
  register: (key: string, editor: Editor) => () => void;
};

const GuardContext = createContext<Registry | null>(null);

export function CollectionGuardProvider({
  children,
  onReady,
}: {
  children: ReactNode;
  /** The host's handle on the guard (its history and leave prompts). */
  onReady?: (guard: CollectionGuard | null) => void;
}) {
  const editors = useRef(new Map<string, Editor>());
  const [pending, setPending] = useState<(() => void) | null>(null);
  const dirty = useCallback(
    () => [...editors.current.values()].filter((editor) => editor.dirty()),
    [],
  );
  const describe = useCallback(() => {
    const labels = dirty().map((editor) => editor.label);
    return labels.length ? `Your changes to ${labels.join(" and ")} haven’t been saved.` : "";
  }, [dirty]);
  const value = useMemo<Registry>(
    () => ({
      register: (key, editor) => {
        editors.current.set(key, editor);
        return () => {
          if (editors.current.get(key) === editor) editors.current.delete(key);
        };
      },
      isDirty: () => dirty().length > 0,
      guard: (proceed) => (dirty().length ? setPending(() => proceed) : proceed()),
      describe,
    }),
    [dirty, describe],
  );
  useEffect(() => {
    onReady?.(value);
    return () => onReady?.(null);
  }, [onReady, value]);
  return (
    <GuardContext value={value}>
      {children}
      <AlertDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
      >
        <AlertDialogContent size="sm" data-collection-unsaved="">
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>{describe() || "Your changes haven’t been saved."}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                for (const editor of dirty()) editor.discard?.();
                const proceed = pending;
                setPending(null);
                proceed?.();
              }}
            >
              Discard changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </GuardContext>
  );
}

/** The workspace's guard; outside one, nothing is guarded. */
export function useCollectionGuard(): CollectionGuard {
  const registry = use(GuardContext);
  return registry ?? { isDirty: () => false, guard: (proceed) => proceed(), describe: () => "" };
}

/** While mounted, report an editor's unsaved state to the workspace guard. */
export function useGuardedEditor(key: string, label: string, dirty: () => boolean, discard?: () => void) {
  const registry = use(GuardContext);
  const latest = useRef({ dirty, discard });
  latest.current = { dirty, discard };
  useEffect(() => {
    if (!registry) return undefined;
    return registry.register(key, {
      label,
      dirty: () => latest.current.dirty(),
      discard: () => latest.current.discard?.(),
    });
  }, [registry, key, label]);
}
