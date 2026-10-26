import { AssigneePicker, DatePicker } from "../admin-ui/components/pickers";
import { PeopleAvatars } from "../admin-ui/components/people-avatars";
import type { ContributorEntry } from "../editorial/editorial-model";
import {
  collectionStatuses,
  collectionTypes,
  edgeChanges,
  storySummary,
  type Collection,
} from "./collection-model";
import { Choice, EntityPicker } from "./collection-ui";
import type { ReturnTypeOfCollectionActions } from "./collection-query";
export function CollectionProperties({
  collection: c,
  people,
  timezone,
  actions,
}: {
  collection: Collection;
  people: ContributorEntry[];
  timezone: string;
  actions: ReturnTypeOfCollectionActions;
}) {
  const members = people.map((p) => ({
    id: Number(p.id),
    name: p.name,
    imageUrl: p.imageUrl,
  }));
  const disabled =
    !c.canEdit || actions.update.isPending || actions.link.isPending;
  return (
    <aside
      aria-label="Collection properties"
      className="order-2 lg:order-none pointer-coarse:[&_button]:min-h-11 flex min-w-0 flex-col gap-4 border-t pt-5 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6"
    >
      <h2 className="text-sm font-semibold">Properties</h2>
      <dl className="grid grid-cols-[6rem_minmax(0,1fr)] items-center gap-x-3 gap-y-3 text-sm">
        <dt className="text-muted-foreground">Status</dt>
        <dd>
          <Choice
            label="Property status"
            value={c.status}
            options={collectionStatuses}
            appearance="value"
            disabled={disabled}
            onChange={(status) =>
              actions.update.mutate({ status: status as Collection["status"] })
            }
          />
        </dd>
        <dt className="text-muted-foreground">Type</dt>
        <dd>
          <Choice
            label="Property type"
            value={c.type}
            options={collectionTypes}
            appearance="value"
            disabled={disabled}
            onChange={(type) =>
              actions.update.mutate({ type: type as Collection["type"] })
            }
          />
        </dd>
        <dt className="text-muted-foreground">Lead</dt>
        <dd>
          <AssigneePicker
            appearance="value"
            label="Lead"
            people={people}
            value={people.find((p) => Number(p.id) === c.lead?.id) || null}
            disabled={disabled}
            onChange={(p) =>
              actions.update.mutate({ leadId: Number(p?.id) || 0 })
            }
          />
        </dd>
        <dt className="text-muted-foreground">Members</dt>
        <dd>
          <EntityPicker
            label="Members"
            items={members}
            selected={members.filter((p) =>
              c.members.some((m) => m.id === p.id),
            )}
            itemLabel={(p) => p.name}
            disabled={disabled}
            appearance="value"
            onChange={(next) => {
              for (const change of edgeChanges(
                c.members.map((p) => p.id),
                next.map((p) => p.id),
              ))
                actions.link.mutate({
                  kind: "member",
                  target: change.target,
                  linked: change.linked,
                });
            }}
          >
            {(p) => (
              <span className="flex items-center gap-2">
                <PeopleAvatars people={[p]} />
                {p.name}
              </span>
            )}
          </EntityPicker>
        </dd>
        <dt className="text-muted-foreground">Start</dt>
        <dd>
          <DatePicker
            appearance="value"
            dateOnly
            label="Start date"
            value={c.startDate}
            timezone={timezone}
            disabled={disabled}
            onChange={(startDate) =>
              actions.update.mutate({ startDate: startDate || "" })
            }
          />
        </dd>
        <dt className="text-muted-foreground">Target / end</dt>
        <dd>
          <DatePicker
            appearance="value"
            dateOnly
            label="End date"
            value={c.endDate}
            timezone={timezone}
            disabled={disabled}
            onChange={(endDate) =>
              actions.update.mutate({ endDate: endDate || "" })
            }
          />
        </dd>
      </dl>
      <p className="text-xs text-muted-foreground">
        {c.storyCount} stories{storySummary(c) ? ` · ${storySummary(c)}` : ""}
      </p>
    </aside>
  );
}
