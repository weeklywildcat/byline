import { useState, type FormEvent, type ReactNode } from "react";
import { InlineAlert } from "../admin-ui/components/inline-alert";
import { Button } from "../admin-ui/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../admin-ui/ui/dialog";
import { FieldGroup } from "../admin-ui/ui/field";

export type WorkspaceDialogProps = {
  open: boolean;
  onClose: () => void;
  finalFocus: () => HTMLElement | null;
  title: string;
  description?: string;
  submitLabel: string;
  pendingLabel?: string;
  pending?: boolean;
  /** A server rejection shown above the actions, with an optional reload for a stale edit. */
  error?: string;
  onReload?: () => void;
  onSubmit: () => void;
  /** Extra footer controls on the left, such as Delete. */
  secondary?: ReactNode;
  /** Set while another overlay (the WordPress media library) must be usable above this one. */
  modal?: boolean;
  readOnly?: boolean;
  children: ReactNode;
};

/**
 * The one dialog for source, appointment, production, task and link editing: a
 * Nova Dialog whose form scrolls between its header and footer.
 */
export function WorkspaceDialog({ open, onClose, finalFocus, title, description, submitLabel, pendingLabel = "Saving…", pending, error, onReload, onSubmit, secondary, modal = true, readOnly, children }: WorkspaceDialogProps) {
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!pending && !readOnly) onSubmit();
  };
  return <Dialog open={open} modal={modal} onOpenChange={(next) => { if (!next && !pending && modal) onClose(); }}>
    <DialogContent finalFocus={finalFocus} className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)] sm:max-w-lg">
      <DialogHeader><DialogTitle>{title}</DialogTitle>{description ? <DialogDescription>{description}</DialogDescription> : null}</DialogHeader>
      <form onSubmit={submit} noValidate className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto] gap-4">
        <FieldGroup className="no-scrollbar -mx-4 min-h-0 w-auto gap-4 overflow-y-auto px-4 pb-1">
          {children}
          {error ? <InlineAlert onAction={onReload} actionLabel="Reload">{error}</InlineAlert> : null}
        </FieldGroup>
        <DialogFooter className="items-center">
          {secondary ? <div className="sm:mr-auto">{secondary}</div> : null}
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>{readOnly ? "Close" : "Cancel"}</Button>
          {readOnly ? null : <Button type="submit" disabled={pending}>{pending ? pendingLabel : submitLabel}</Button>}
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}

/** Remove/Delete with a plain confirmation in the footer. Marking something cancelled is the gentler route, so the prompt says so. */
export function RemoveControl({ label, prompt, confirmLabel, pendingLabel, pending, removing, onConfirm, onStart }: { label: string; prompt: string; confirmLabel: string; pendingLabel: string; pending: boolean; removing: boolean; onConfirm: () => void; onStart?: () => void }) {
  const [confirming, setConfirming] = useState(false);
  return confirming
    ? <div role="group" aria-label={`Confirm: ${label.toLowerCase()}`} className="flex flex-wrap items-center gap-2 text-sm">
      <span>{prompt}</span>
      <Button type="button" variant="destructive" disabled={pending} onClick={() => { onStart?.(); onConfirm(); }}>{removing ? pendingLabel : confirmLabel}</Button>
      <Button type="button" variant="ghost" disabled={pending} onClick={() => setConfirming(false)}>Keep</Button>
    </div>
    : <Button type="button" variant="destructive" disabled={pending} onClick={() => setConfirming(true)}>{label}</Button>;
}
