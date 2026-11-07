import { AssigneePicker, DatePicker } from "../editorial/pickers";
import { PeopleAvatars } from "@byline/newsroom-ui/components/people-avatars";
import type { ContributorEntry } from "../editorial/editorial-model";
import { collectionStatuses, collectionTypes, edgeChanges, storySummary, type Collection } from "./collection-model";
import { Choice, EntityPicker } from "./collection-ui";
import type { CollectionActions } from "./collection-query";

/**
 * The Collection's properties, easy to change in place. Status, type and
 * dates show at once and roll back if the save fails. The lead and team are
 * not ordinary text: only the lead or an editor may change them, and they
 * change only once the server agrees.
 */
export function CollectionProperties({
  collection: c,
  people,
  timezone,
  actions,
}: {
  collection: Collection;
  people: ContributorEntry[];
  timezone: string;
  actions: CollectionActions;
}) {
  const accounts = people.filter((p) => p.kind !== "guest");
  const members = accounts.map((p) => ({ id: Number(p.id), name: p.name, imageUrl: p.imageUrl }));
  const busy = actions.update.isPending || actions.team.isPending;
  const disabled = !c.canEdit || busy;
  const team = !(c.canManageTeam ?? c.canEdit) || busy;
  const archive = c.canArchive ?? c.canEdit;
  return (
    <aside
      aria-label="Collection properties"
      className="order-2 flex min-w-0 flex-col gap-4 border-t pt-5 pointer-coarse:[&_button]:min-h-11 @min-[960px]/collection:order-none @min-[960px]/collection:border-t-0 @min-[960px]/collection:border-l @min-[960px]/collection:pt-0 @min-[960px]/collection:pl-6"
    >
      <h2 className="text-sm font-semibold">Properties</h2>
      <dl className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-3 text-sm">
        <dt className="text-muted-foreground">Status</dt>
        <dd>
          <Choice
            label="Property status"
            value={c.status}
            options={archive ? collectionStatuses : Object.fromEntries(Object.entries(collectionStatuses).filter(([key]) => key !== "archived" || c.status === "archived"))}
            appearance="value"
            disabled={disabled || (c.archived && !archive)}
            onChange={(status) => actions.update.mutate({ status: status as Collection["status"] })}
          />
        </dd>
        <dt className="text-muted-foreground">Type</dt>
        <dd>
          <Choice label="Property type" value={c.type} options={collectionTypes} appearance="value" disabled={disabled} onChange={(type) => actions.update.mutate({ type: type as Collection["type"] })} />
        </dd>
        <dt className="text-muted-foreground">Lead</dt>
        <dd>
          <AssigneePicker
            appearance="value"
            label="Lead"
            people={accounts}
            value={accounts.find((p) => Number(p.id) === c.lead?.id) || null}
            clearable={false}
            disabled={team}
            onChange={(p) => {
              if (p) actions.update.mutate({ leadId: Number(p.id) });
            }}
          />
        </dd>
        <dt className="text-muted-foreground">Team</dt>
        <dd>
          <EntityPicker
            label="Team"
            items={members.filter((p) => p.id !== c.lead?.id)}
            selected={members.filter((p) => c.members.some((m) => m.id === p.id))}
            itemLabel={(p) => p.name}
            disabled={team}
            appearance="value"
            triggerLabel={c.members.length ? undefined : team ? "No team yet" : "Add people…"}
            onChange={(next) => {
              const changes = edgeChanges(c.members.map((p) => p.id), next.map((p) => p.id));
              actions.team.mutate({ add: changes.filter((x) => x.linked).map((x) => x.target), remove: changes.filter((x) => !x.linked).map((x) => x.target) });
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
          <DatePicker appearance="value" dateOnly label="Start date" value={c.startDate} timezone={timezone} disabled={disabled} onChange={(startDate) => actions.update.mutate({ startDate: startDate || "" })} />
        </dd>
        <dt className="text-muted-foreground">Target / end</dt>
        <dd>
          <DatePicker appearance="value" dateOnly label="End date" value={c.endDate} timezone={timezone} disabled={disabled} onChange={(endDate) => actions.update.mutate({ endDate: endDate || "" })} />
        </dd>
      </dl>
      <p className="text-xs text-muted-foreground">
        {c.storyCount} {c.storyCount === 1 ? "story" : "stories"}
        {storySummary(c) ? ` · ${storySummary(c)}` : ""}
      </p>
      {c.canEdit && !(c.canManageTeam ?? c.canEdit) ? <p className="text-xs text-muted-foreground">The lead or an editor changes the team.</p> : null}
    </aside>
  );
}
