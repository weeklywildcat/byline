import { exactDate } from "../home/newsroom-model";
import { Note, SectionFailed, SectionHeading } from "./fields";
import { workspaceActivityCopy } from "./workspace-model";
import { useWorkspace } from "./workspace-context";

export function ActivitySection() {
  const { data, timezone, reload, sectionError, caps } = useWorkspace();
  // The audit trail names other people's work; a participant never receives it.
  if (caps.role === "participant") return null;
  const failed = sectionError("activity");
  const items = data.activity.slice(0, 8);
  return <section aria-labelledby="ws-activity" className="ws-section ws-activity">
    <SectionHeading id="ws-activity" title="Recent Activity" />
    {failed ? <SectionFailed what="recent activity" onRetry={() => void reload()} /> : items.length
      ? <ul className="ws-activity-list">{items.map((item) => <li key={item.id}><span className="ws-activity-copy">{workspaceActivityCopy(item)}</span><time dateTime={item.occurredAt}>{exactDate(item.occurredAt, timezone)}</time></li>)}</ul>
      : <Note>No recent activity.</Note>}
  </section>;
}
