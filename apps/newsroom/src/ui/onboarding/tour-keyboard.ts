/**
 * The tour's keyboard. Driver.js headless has none, so Byline decides here,
 * as a pure function of the key and where focus is:
 *
 * - Escape ends the tour (recorded as skipped).
 * - Arrow Right / Arrow Left move between informational steps.
 * - Tab moves only among the tour card's controls and, on a step that asks
 *   the reader to use a control, that control; never into the dimmed page.
 *
 * Keys typed into a field, an editable region or an ARIA widget that uses
 * arrows itself are left alone, as is anything inside another dialog or menu.
 */
export type TourKeyIntent = "skip" | "next" | "back" | "tab" | null;

const WIDGET_ROLES = '[role="textbox"], [role="searchbox"], [role="combobox"], [role="listbox"], [role="option"], [role="menu"], [role="menuitem"], [role="menubar"], [role="slider"], [role="spinbutton"], [role="grid"], [role="gridcell"], [role="tree"], [role="treeitem"], [role="tablist"], [role="tab"], [role="radiogroup"], [role="radio"]';
const NON_TEXT_INPUTS = new Set(["button", "checkbox", "radio", "submit", "reset", "image", "file", "color", "range"]);

/** A place the reader types or a widget that owns its own keys. */
export function ownsKeys(target: Element | null): boolean {
  if (!target) return false;
  if (target instanceof HTMLInputElement) return !NON_TEXT_INPUTS.has(target.type) || target.type === "range";
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLElement && target.isContentEditable) return true;
  return Boolean(target.closest(WIDGET_ROLES));
}

export type TourKeyContext = {
  /** The key event's target. */
  target: Element | null;
  /** The tour card (focus inside it is always the tour's). */
  card: Element | null;
  /** The step's target element, if any. */
  highlighted: Element | null;
  stepKind: "info" | "action" | "status";
  canGoBack: boolean;
};

export function tourKeyIntent(event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "defaultPrevented" | "isComposing">, context: TourKeyContext): TourKeyIntent {
  if (event.defaultPrevented || event.isComposing || event.metaKey || event.ctrlKey || event.altKey) return null;
  const { target, card } = context;
  const inCard = Boolean(target && card?.contains(target));
  // Another dialog or menu (the leave-without-saving prompt, an open menu) keeps its own keys.
  if (!inCard && target?.closest('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]')) return null;
  if (event.key === "Tab") return "tab";
  if (event.key === "Escape") return !inCard && target instanceof HTMLElement && ownsKeys(target) && !target.closest("a, button") ? null : "skip";
  if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return null;
  if (!inCard && ownsKeys(target)) return null;
  if (event.key === "ArrowRight") return context.stepKind === "info" ? "next" : null;
  return context.stepKind !== "status" && context.canGoBack ? "back" : null;
}

const TABBABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** The focusable controls inside an element, in order. */
export function tabbables(root: Element | null): HTMLElement[] {
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLElement>(TABBABLE)).filter((element) => !element.closest("[inert]") && element.getClientRects().length > 0);
}

/** Whether the element itself can take keyboard focus. */
export function focusable(element: Element | null): element is HTMLElement {
  return element instanceof HTMLElement && element.matches(TABBABLE) && element.getClientRects().length > 0;
}

/** The next element in the tour's own Tab order: the highlighted control (action steps) first, then the card. */
export function nextTabStop(order: readonly HTMLElement[], active: Element | null, backwards: boolean): HTMLElement | null {
  if (!order.length) return null;
  const at = active ? order.indexOf(active as HTMLElement) : -1;
  if (at === -1) return backwards ? order[order.length - 1]! : order[0]!;
  return order[(at + (backwards ? -1 : 1) + order.length) % order.length]!;
}
