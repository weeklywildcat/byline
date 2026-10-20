import { toast } from "sonner";

type UndoToastOptions = {
  undo: () => Promise<void> | void;
  restored?: string;
  failed?: string;
  duration?: number;
};

/**
 * Success feedback for a reversible workspace change.
 *
 * Undo is deliberately a compensating server mutation rather than a client-only
 * rollback: if it fails, the cache is refreshed by the caller and the user is
 * told instead of showing a state the server never accepted.
 */
export function workspaceUndoToast(message: string, options: UndoToastOptions) {
  let running = false;
  toast.success(message, {
    duration: options.duration ?? 10_000,
    action: {
      label: "Undo",
      onClick: () => {
        if (running) return;
        running = true;
        void Promise.resolve()
          .then(() => options.undo())
          .then(() => { if (options.restored) toast.success(options.restored); })
          .catch(() => toast.error(options.failed || "That change couldn't be undone. Reload to see the latest version."))
          .finally(() => { running = false; });
      }
    }
  });
}

/** Success feedback for a workspace change that is not safely reversible. */
export function workspaceToast(message: string) {
  toast.success(message);
}
