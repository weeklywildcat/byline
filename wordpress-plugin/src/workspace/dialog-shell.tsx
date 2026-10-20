import type { FormEvent, ReactNode } from "react";
import { Button } from "../home/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../home/ui/dialog";
import { InlineError } from "./fields";

export type WorkspaceDialogProps = {
  open: boolean;
  onClose: () => void;
  finalFocus: () => HTMLElement | null;
  title: string;
  description?: string;
  submitLabel: string;
  pendingLabel?: string;
  pending?: boolean;
  /** A server rejection shown beside the form, with an optional reload for a stale edit. */
  error?: string;
  onReload?: () => void;
  onSubmit: () => void;
  /** Extra footer controls on the left, such as Delete. */
  secondary?: ReactNode;
  /** Set while another overlay (the WordPress media library) must be usable above this one. */
  modal?: boolean;
  /** Anything below the form fields that is not part of the submit flow. */
  readOnly?: boolean;
  children: ReactNode;
};

/**
 * The one dialog frame for source, appointment and production editing. On a
 * phone it fills the screen; the body scrolls while the actions stay in reach.
 */
export function WorkspaceDialog({ open, onClose, finalFocus, title, description, submitLabel, pendingLabel = "Saving…", pending, error, onReload, onSubmit, secondary, modal = true, readOnly, children }: WorkspaceDialogProps) {
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!pending && !readOnly) onSubmit();
  };
  return <Dialog open={open} modal={modal} onOpenChange={(next) => { if (!next && !pending && modal) onClose(); }}>
    <DialogContent className="ws-dialog" finalFocus={finalFocus}>
      <DialogHeader><DialogTitle>{title}</DialogTitle>{description ? <DialogDescription>{description}</DialogDescription> : null}</DialogHeader>
      <form className="ws-dialog-form" onSubmit={submit} noValidate>
        <div className="ws-dialog-body">
          {children}
          {error ? <InlineError>{error}{onReload ? <> <Button type="button" variant="link" onClick={onReload}>Reload</Button></> : null}</InlineError> : null}
        </div>
        <DialogFooter className="ws-dialog-footer">
          {secondary ? <div className="ws-dialog-secondary">{secondary}</div> : null}
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>{readOnly ? "Close" : "Cancel"}</Button>
          {readOnly ? null : <Button type="submit" disabled={pending}>{pending ? pendingLabel : submitLabel}</Button>}
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
