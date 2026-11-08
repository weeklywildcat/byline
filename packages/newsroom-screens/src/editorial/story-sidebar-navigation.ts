/**
 * The small, Byline-owned command bridge used by admin surfaces that need to
 * open a particular Story sidebar panel.
 *
 * Content Health is rendered by the Planning entrypoint, while the Story
 * sidebar is rendered by the block-editor entrypoint. They therefore cannot
 * pass React props directly. The bridge deliberately carries only a closed
 * panel vocabulary. It is a command channel, not a DOM-navigation escape
 * hatch.
 */

export const STORY_SIDEBAR_PANEL_IDS = [
  "workflow",
  "tasks",
  "visuals",
  "contributors"
] as const;

export type StorySidebarPanel = (typeof STORY_SIDEBAR_PANEL_IDS)[number];

export type StorySidebarNavigationCommand = {
  panel: StorySidebarPanel;
};

export const STORY_SIDEBAR_NAVIGATION_EVENT = "byline:story-sidebar-command";
export const STORY_SIDEBAR_NAVIGATION_GLOBAL = "bylineStorySidebarNavigation";

export type StorySidebarPanelOpenState = Record<StorySidebarPanel, boolean>;

type StorySidebarNavigationBridge = {
  pending?: unknown;
  publish: (value: unknown) => boolean;
};

declare global {
  interface Window {
    bylineStorySidebarNavigation?: StorySidebarNavigationBridge;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

/** Normalize a panel without accepting labels, selectors, or arbitrary paths. */
export function normalizeStorySidebarPanel(value: unknown): StorySidebarPanel | null {
  return typeof value === "string" && (STORY_SIDEBAR_PANEL_IDS as readonly string[]).includes(value)
    ? value as StorySidebarPanel
    : null;
}

/** Normalize the event/global payload at the command boundary. */
export function normalizeStorySidebarNavigationCommand(value: unknown): StorySidebarNavigationCommand | null {
  if (!isRecord(value) || !hasOnlyKeys(value, ["panel"])) return null;
  const panel = normalizeStorySidebarPanel(value.panel);
  return panel ? { panel } : null;
}

export function createStorySidebarPanelOpenState(initial: StorySidebarPanel = "workflow"): StorySidebarPanelOpenState {
  const panel = normalizeStorySidebarPanel(initial) || "workflow";
  return STORY_SIDEBAR_PANEL_IDS.reduce((state, id) => {
    state[id] = id === panel;
    return state;
  }, {} as StorySidebarPanelOpenState);
}

/** Preserve ordinary user toggles without coupling panels to one another. */
export function setStorySidebarPanelOpen(
  current: StorySidebarPanelOpenState,
  panel: unknown,
  opened: boolean
): StorySidebarPanelOpenState {
  const normalized = normalizeStorySidebarPanel(panel);
  if (!normalized) return current;
  return { ...current, [normalized]: Boolean(opened) };
}

/** Focus a requested panel and close the default Workflow panel if necessary. */
export function focusStorySidebarPanel(
  current: StorySidebarPanelOpenState,
  panel: unknown
): StorySidebarPanelOpenState {
  const normalized = normalizeStorySidebarPanel(panel);
  if (!normalized) return current;
  return createStorySidebarPanelOpenState(normalized);
}

function browserWindow(targetWindow?: Window): Window | null {
  if (targetWindow) return targetWindow;
  return typeof window !== "undefined" ? window : null;
}

/**
 * Install the bridge object while preserving a pending command published
 * before the editor bundle mounted. Replacing an existing publish function is
 * intentional: only this module owns command interpretation.
 */
export function installStorySidebarNavigationBridge(targetWindow?: Window): StorySidebarNavigationBridge | null {
  const target = browserWindow(targetWindow);
  if (!target) return null;

  const existing = target.bylineStorySidebarNavigation;
  const pending = isRecord(existing) ? existing.pending : undefined;
  const bridge: StorySidebarNavigationBridge = {
    pending,
    publish: (value: unknown) => publishStorySidebarNavigation(value, target)
  };
  target.bylineStorySidebarNavigation = bridge;
  return bridge;
}

/** Publish a validated command and retain it until the sidebar consumes it. */
export function publishStorySidebarNavigation(value: unknown, targetWindow?: Window): boolean {
  const command = normalizeStorySidebarNavigationCommand(value);
  const target = browserWindow(targetWindow);
  if (!command || !target) return false;

  const bridge = installStorySidebarNavigationBridge(target);
  if (!bridge) return false;
  bridge.pending = command;

  if (typeof CustomEvent === "function") {
    target.dispatchEvent(new CustomEvent(STORY_SIDEBAR_NAVIGATION_EVENT, { detail: command }));
  }
  return true;
}

/** Consume the one-shot command retained for a bundle load-order race. */
export function consumeStorySidebarNavigation(targetWindow?: Window): StorySidebarNavigationCommand | null {
  const target = browserWindow(targetWindow);
  const bridge = target?.bylineStorySidebarNavigation;
  if (!target || !isRecord(bridge)) return null;

  const command = normalizeStorySidebarNavigationCommand(bridge.pending);
  bridge.pending = null;
  return command;
}

/** Subscribe to live commands without trusting arbitrary event detail. */
export function subscribeToStorySidebarNavigation(
  targetWindow: Window,
  onCommand: (command: StorySidebarNavigationCommand) => void
): () => void {
  const handle = (event: Event) => {
    const detail = (event as CustomEvent<unknown>).detail;
    const command = normalizeStorySidebarNavigationCommand(detail);
    if (command) onCommand(command);
  };

  targetWindow.addEventListener(STORY_SIDEBAR_NAVIGATION_EVENT, handle);
  return () => targetWindow.removeEventListener(STORY_SIDEBAR_NAVIGATION_EVENT, handle);
}
