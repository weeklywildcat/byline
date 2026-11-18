import { graphlib, layout } from "@dagrejs/dagre";
import type { Point, Positions } from "./logic-positions";
import { END, ownerId, START, type LogicProjection } from "../../polls/engine/logic-map";

export const QUESTION_WIDTH = 228;
export const TERMINAL_WIDTH = 104;
export const SECTION_HEIGHT = 80;
export const MAX_MAP_CHOICES = 3;
/** Only the order path drives rank. Conditional dependencies can never change the order on the map. */
export function arrangeLogicMap(map: LogicProjection): Positions {
  const graph = new graphlib.Graph().setGraph({ rankdir: "LR", ranksep: 128, ranker: "longest-path" });
  for (const [index, id] of map.order.entries()) {
    graph.setNode(id, { width: id === START || id === END ? TERMINAL_WIDTH : QUESTION_WIDTH, height: 48 });
    if (index) graph.setEdge(map.order[index - 1], id, {});
  }
  layout(graph);

  const positions: Record<string, Point> = {};
  for (const id of map.order) {
    const node = graph.node(id);
    positions[id] = { x: node.x - node.width / 2, y: 0 };
  }
  const lanes = new Map<number, number>();
  const sections = [...map.targets.values()].filter((target) => target.kind === "section")
    .sort((a, b) => a.start - b.start || a.item.groups.length - b.item.groups.length);
  for (const section of sections) {
    const lane = Math.max(section.item.groups.length, lanes.get(section.start) ?? 0);
    const anchor = positions[map.order[section.start + 1]];
    positions[ownerId(section)] = { x: anchor.x, y: -(lane + 1) * (SECTION_HEIGHT + 34) };
    lanes.set(section.start, lane + 1);
  }
  return positions;
}
