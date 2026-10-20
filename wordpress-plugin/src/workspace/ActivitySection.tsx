import { exactDate, relativeTime } from "../home/newsroom-model";
import { EmptyState } from "../admin-ui/components/empty-state";
import { ItemList } from "../admin-ui/components/item-list";
import { Panel } from "../admin-ui/components/panel";
import { Item, ItemActions, ItemContent, ItemTitle } from "../admin-ui/ui/item";
import { SectionFailed } from "./parts";
import { workspaceActivityCopy } from "./workspace-model";
import { useWorkspace } from "./workspace-context";

export function ActivitySection() {
  const { data, timezone, now, reload, sectionError, caps } = useWorkspace();
  // The audit trail names other people's work; a participant never receives it.
  if (caps.role === "participant") return null;
  const failed = sectionError("activity");
  const items = data.activity.slice(0, 8);
  return <Panel id="ws-activity" title="Recent Activity" className="order-3 @3xl/ws:order-none" contentClassName="px-0">
    {failed ? <SectionFailed what="recent activity" onRetry={() => void reload()} /> : items.length
      ? <ItemList>{items.map((item) => <Item key={item.id} size="xs">
        <ItemContent><ItemTitle className="line-clamp-none font-normal">{workspaceActivityCopy(item)}</ItemTitle></ItemContent>
        <ItemActions><time className="text-xs whitespace-nowrap text-muted-foreground" dateTime={item.occurredAt} title={exactDate(item.occurredAt, timezone)}>{relativeTime(item.occurredAt, timezone, now)}</time></ItemActions>
      </Item>)}</ItemList>
      : <div className="px-3"><EmptyState title="No recent activity." /></div>}
  </Panel>;
}
