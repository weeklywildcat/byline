import type { ComponentProps, KeyboardEvent } from "react";
import { cn } from "../lib/utils";

/**
 * A form-shaped group for a small editor that renders inside another form —
 * the Payload Story document, whose <form> wraps the whole Story screen.
 * HTML forms cannot nest: a nested <form> is dropped by the parser or, when
 * created by React, its native submit reaches Payload's form and reloads the
 * page. So this is a labelled group, its save Button is `type="button"` and
 * calls the mutation directly, and Enter is handled here on purpose:
 *
 * - Enter in a single-line Input saves (and never implicitly submits the
 *   outer form);
 * - in a Textarea, Enter keeps making new lines and ⌘/Ctrl+Enter saves;
 * - Escape cancels when `onCancel` is given.
 *
 * Validation stays with the caller: `onSubmit` decides whether there is
 * anything to save. Portaled Dialog/Sheet/Popover content is outside the
 * outer form's DOM and may use a real <form>.
 */
export function InlineForm({ label, onSubmit, onCancel, className, onKeyDown, ...props }: Omit<ComponentProps<"div">, "onSubmit" | "role"> & { label: string; onSubmit: () => void; onCancel?: () => void }) {
  function keys(event: KeyboardEvent<HTMLDivElement>) {
    onKeyDown?.(event);
    if (event.defaultPrevented || event.nativeEvent.isComposing) return;
    const target = event.target as HTMLElement;
    if (event.key === "Escape" && onCancel) {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
      return;
    }
    if (event.key !== "Enter") return;
    if (target instanceof HTMLTextAreaElement) {
      if (!(event.metaKey || event.ctrlKey)) return;
    } else if (!(target instanceof HTMLInputElement) || ["button", "checkbox", "radio", "submit", "reset", "file"].includes(target.type)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    onSubmit();
  }
  return <div role="group" aria-label={label} data-inline-form="" className={cn(className)} onKeyDown={keys} {...props} />;
}
