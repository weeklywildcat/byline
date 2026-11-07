import type { ReactNode } from "react";
import { ItemContent, ItemDescription, ItemGroup, ItemTitle, ItemActions } from "@byline/newsroom-ui/ui/item";
import { ItemButton } from "@byline/newsroom-ui/components/item-button";
import { PeopleAvatars } from "@byline/newsroom-ui/components/people-avatars";
import { appointmentLine } from "../workspace/schedule-model";
import { CollectionEmpty, InterviewRow } from "./collection-ui";
import { useCollectionHost } from "./collection-host";
import type { CollectionDetail } from "./collection-model";
import type { AddKind } from "./CollectionWorkspace";

/**
 * The cross-story reporting layer: the Collection's shared interviews (one
 * interview can serve several stories), then its stories' own appointments,
 * read through from each story and opened in that story's Plan. The
 * Collection never keeps copies of Story appointments.
 */
export function CollectionReporting({
  detail,
  timezone,
  heading,
  onOpenInterview,
}: {
  detail: CollectionDetail;
  timezone: string;
  heading: (title: string, kind?: AddKind, count?: number) => ReactNode;
  onOpenInterview: (id: number) => void;
}) {
  const host = useCollectionHost();
  const active = detail.interviews.filter((i) => i.status !== "cancelled");
  const cancelled = detail.interviews.filter((i) => i.status === "cancelled");
  const appointments = (detail.appointments ?? []).filter((a) => a.status !== "cancelled");
  return (
    <div className="flex min-w-0 flex-col gap-8">
      <section>
        {heading("Shared interviews", "interview", active.length)}
        {active.length ? (
          <ItemGroup className="gap-0">
            {active.map((i) => (
              <InterviewRow key={i.id} interview={i} timezone={timezone} onOpen={() => onOpenInterview(i.id)} />
            ))}
          </ItemGroup>
        ) : (
          <CollectionEmpty title="No shared interviews yet">Plan an interview once, and link every story that will use it.</CollectionEmpty>
        )}
        {cancelled.length ? (
          <details className="mt-3">
            <summary className="cursor-pointer text-sm text-muted-foreground">{cancelled.length} cancelled</summary>
            <ItemGroup className="mt-2 gap-0">
              {cancelled.map((i) => (
                <InterviewRow key={i.id} interview={i} timezone={timezone} onOpen={() => onOpenInterview(i.id)} />
              ))}
            </ItemGroup>
          </details>
        ) : null}
      </section>
      <section aria-labelledby="collection-story-reporting">
        <h2 id="collection-story-reporting" className="mb-1 text-base font-semibold">
          Story reporting <span className="ml-1 text-sm font-normal text-muted-foreground">{appointments.length}</span>
        </h2>
        <p className="mb-3 text-sm text-muted-foreground">Appointments planned in this Collection’s stories. They open in the story’s Plan.</p>
        {appointments.length ? (
          <ItemGroup className="gap-0">
            {appointments.map((a) => (
              <ItemButton key={`${a.storyId}-${a.id}`} size="sm" onClick={() => host.openStoryWorkspace(a.storyId, { appointmentId: a.id })}>
                <ItemContent>
                  <ItemTitle>{a.title}</ItemTitle>
                  <ItemDescription className="line-clamp-1">
                    {appointmentLine(a, timezone)} · {a.storyTitle}
                  </ItemDescription>
                </ItemContent>
                {a.assignees.length ? (
                  <ItemActions>
                    <PeopleAvatars people={a.assignees} />
                  </ItemActions>
                ) : null}
              </ItemButton>
            ))}
          </ItemGroup>
        ) : (
          <p className="text-sm text-muted-foreground">No appointments in these stories yet.</p>
        )}
      </section>
    </div>
  );
}
