import { exactDate, relativeTime } from "../home/newsroom-model";
import { Card, CardContent, CardHeader, CardTitle } from "../admin-ui/ui/card";
import { Empty, EmptyHeader, EmptyTitle } from "../admin-ui/ui/empty";
import { Item, ItemActions, ItemContent, ItemGroup, ItemTitle } from "../admin-ui/ui/item";
import { SectionFailed } from "./parts";
import { workspaceActivityCopy } from "./workspace-model";
import { useWorkspace } from "./workspace-context";

export function ActivitySection() {
  const { data, timezone, now, reload, sectionError, caps } = useWorkspace();
  // The audit trail names other people's work; a participant never receives it.
  if (caps.role === "participant") return null;
  const failed = sectionError("activity");
  const items = data.activity.slice(0, 8);
  return <Card size="sm" role="region" aria-labelledby="ws-activity-title" id="ws-activity" className="order-4 lg:order-none">
    <CardHeader><CardTitle id="ws-activity-title" role="heading" aria-level={2}>Recent Activity</CardTitle></CardHeader>
    <CardContent className="px-0">
      {failed ? <div className="px-3"><SectionFailed what="recent activity" onRetry={() => void reload()} /></div> : items.length
        ? <ItemGroup role="group" aria-label="Recent activity" className="gap-0">{items.map((item) => <Item key={item.id} size="xs">
          <ItemContent><ItemTitle className="line-clamp-none font-normal">{workspaceActivityCopy(item)}</ItemTitle></ItemContent>
          <ItemActions><time className="text-xs whitespace-nowrap text-muted-foreground" dateTime={item.occurredAt} title={exactDate(item.occurredAt, timezone)}>{relativeTime(item.occurredAt, timezone, now)}</time></ItemActions>
        </Item>)}</ItemGroup>
        : <div className="px-3"><Empty className="py-5"><EmptyHeader><EmptyTitle>No recent activity.</EmptyTitle></EmptyHeader></Empty></div>}
    </CardContent>
  </Card>;
}
