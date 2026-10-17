export type TimelineItem = { label: string; title: string; body: string };
export const MAX_TIMELINE_ITEMS = 25;
export function changeTimeline(items: TimelineItem[], action: "add" | "remove" | "up" | "down", index = items.length - 1) {
  const next = [...items];
  if (action === "add" && next.length < MAX_TIMELINE_ITEMS) {
    next.push({ label: "", title: "", body: "" });
    return { items: next, focusIndex: next.length - 1 };
  }
  if (index < 0 || index >= next.length) return { items, focusIndex: 0 };
  if (action === "remove" && next.length > 1) {
    next.splice(index, 1);
    return { items: next, focusIndex: Math.min(index, next.length - 1) };
  }
  const destination = action === "up" ? index - 1 : action === "down" ? index + 1 : -1;
  if (destination >= 0 && destination < next.length) {
    [next[index], next[destination]] = [next[destination], next[index]];
    return { items: next, focusIndex: destination };
  }
  return { items, focusIndex: index };
}
