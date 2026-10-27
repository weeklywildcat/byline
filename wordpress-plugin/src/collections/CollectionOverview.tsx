import type { ReactNode } from "react";
import { Button } from "../admin-ui/ui/button";
import {
  ItemGroup,
  ItemContent,
  ItemTitle,
  ItemDescription,
} from "../admin-ui/ui/item";
import { ItemButton } from "../admin-ui/components/item-button";
import type { ContributorEntry } from "../editorial/editorial-model";
import type { StoryFetchers } from "../story/story-fetchers";
import { exactDate } from "../home/newsroom-model";
import { CollectionPublicCoverage } from "./CollectionPublicCoverage";
import { CollectionBrief } from "./CollectionBrief";
import { CollectionProperties } from "./CollectionProperties";
import { CollectionTasks } from "./CollectionTasks";
import { CollectionEmpty } from "./collection-ui";
import type { CollectionDetail } from "./collection-model";
import type { ReturnTypeOfCollectionActions } from "./collection-query";
export type UpcomingItem = {
  id: string;
  title: string;
  date: string;
  label: string;
  open: () => void;
};
export function CollectionOverview({
  detail,
  actions,
  fetchers,
  people,
  timezone,
  upcoming,
  heading,
  stories,
  interviews,
}: {
  detail: CollectionDetail;
  actions: ReturnTypeOfCollectionActions;
  fetchers: StoryFetchers;
  people: ContributorEntry[];
  timezone: string;
  upcoming: UpcomingItem[];
  heading: (
    title: string,
    kind?: "existing" | "interview" | "task",
  ) => ReactNode;
  stories: ReactNode;
  interviews: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_19rem]">
      <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-7">
        <div className="order-1 lg:order-none">
          <CollectionBrief collection={detail.collection} actions={actions} />
        </div>
        <section className="order-3 lg:order-none">
          {heading("Upcoming")}
          <ItemGroup className="gap-0">
            {upcoming.map((e) => (
              <ItemButton key={e.id} size="sm" onClick={e.open}>
                <ItemContent>
                  <ItemTitle>{e.title}</ItemTitle>
                  <ItemDescription>
                    {e.label} · {exactDate(e.date, timezone)}
                  </ItemDescription>
                </ItemContent>
              </ItemButton>
            ))}
          </ItemGroup>
          {!upcoming.length ? (
            <CollectionEmpty title="No upcoming dates">
              Schedule an interview, appointment, or deadline.
            </CollectionEmpty>
          ) : null}
          <Button
            variant="link"
            className="px-0"
            render={
              <a
                href={`admin.php?page=byline-planning&tab=calendar&collection=${detail.collection.id}`}
              />
            }
          >
            View in Calendar ↗
          </Button>
        </section>
        <section className="order-4 lg:order-none">
          {heading("Stories", "existing")}
          {stories}
        </section>
        <section className="order-5 lg:order-none">
          {heading("Interviews", "interview")}
          {interviews}
        </section>
        <section className="order-6 lg:order-none">
          {heading("Open tasks", "task")}
          <CollectionTasks
            detail={detail}
            fetchers={fetchers}
            people={people}
            timezone={timezone}
            refresh={actions.refresh}
            preview
          />
        </section>
        <div className="order-7 lg:order-none"><CollectionPublicCoverage detail={detail} actions={actions} /></div>
      </div>
      <CollectionProperties
        collection={detail.collection}
        actions={actions}
        people={people}
        timezone={timezone}
      />
    </div>
  );
}
