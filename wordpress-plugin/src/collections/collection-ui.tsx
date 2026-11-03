import type { ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { PeopleAvatars } from "../admin-ui/components/people-avatars";
import { valueSelectTriggerClass } from "../admin-ui/components/pickers";
import { Button } from "../admin-ui/ui/button";
import { Badge } from "../admin-ui/ui/badge";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "../admin-ui/ui/combobox";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "../admin-ui/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../admin-ui/ui/dropdown-menu";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "../admin-ui/ui/empty";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "../admin-ui/ui/item";
import { ItemButton } from "../admin-ui/components/item-button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../admin-ui/ui/select";
import { appointmentLine } from "../workspace/schedule-model";
import { interviewAppointment } from "./interview-schedule";
import { exactDate } from "../home/newsroom-model";
import type { PlanningStory } from "../planning/planning-model";
import {
  collectionActions,
  collectionStatuses,
  collectionTypes,
  interviewStatuses,
  storySummary,
  type Collection,
  type CollectionAction,
  type Interview,
} from "./collection-model";
export type MenuAction = {
  id: string;
  label: string;
  run: () => void;
  disabled?: boolean;
};
export function ActionMenu({
  actions,
  label = "Collection actions",
}: {
  actions: MenuAction[];
  label?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            className="pointer-coarse:min-h-11 pointer-coarse:min-w-11"
            aria-label={label}
          />
        }
      >
        <MoreHorizontal aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {actions.map((a) => (
          <DropdownMenuItem
            key={a.id}
            disabled={a.disabled}
            className="pointer-coarse:min-h-11"
            onClick={a.run}
          >
            {a.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
export function Choice({
  label,
  value,
  options,
  onChange,
  disabled,
  appearance = "field",
}: {
  label: string;
  value: string;
  options: Record<string, string>;
  onChange: (value: string) => void;
  disabled?: boolean;
  appearance?: "field" | "value";
}) {
  return (
    <Select
      items={Object.entries(options).map(([value, label]) => ({
        value,
        label,
      }))}
      value={value}
      onValueChange={(v) => {
        if (v !== null) onChange(v);
      }}
      disabled={disabled}
    >
      <SelectTrigger
        aria-label={label}
        className={
          appearance === "value"
            ? `${valueSelectTriggerClass} pointer-coarse:min-h-11`
            : "w-full pointer-coarse:min-h-11"
        }
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        {Object.entries(options).map(([id, text]) => (
          <SelectItem key={id} value={id} className="pointer-coarse:min-h-11">
            {text}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
export function EntityPicker<T extends { id: number }>({
  label,
  items,
  selected,
  onChange,
  itemLabel,
  children,
  disabled,
  onSearch,
  itemDisabled,
  appearance = "field",
  triggerLabel,
}: {
  label: string;
  items: T[];
  selected: T[];
  onChange: (next: T[]) => void;
  itemLabel: (item: T) => string;
  children: (item: T) => ReactNode;
  disabled?: boolean;
  onSearch?: (query: string) => void;
  itemDisabled?: (item: T) => boolean;
  appearance?: "field" | "value";
  triggerLabel?: string;
}) {
  return (
    <Combobox
      multiple
      items={items}
      value={selected}
      onValueChange={onChange}
      onInputValueChange={onSearch}
      itemToStringLabel={itemLabel}
      isItemEqualToValue={(a, b) => a.id === b.id}
      disabled={disabled}
    >
      <ComboboxTrigger
        render={
          <Button
            variant={appearance === "value" ? "ghost" : "outline"}
            className={
              appearance === "value"
                ? "-ml-2 h-auto max-w-full justify-start px-2 py-1 font-normal whitespace-normal pointer-coarse:min-h-11"
                : "w-full justify-between font-normal pointer-coarse:min-h-11"
            }
            aria-label={label}
          />
        }
      >
        <span className="truncate">
          {triggerLabel || (selected.length
            ? selected.map(itemLabel).join(", ")
            : `Choose ${label.toLowerCase()}…`)}
        </span>
      </ComboboxTrigger>
      <ComboboxContent
        positionMethod="fixed"
        className="max-w-[calc(100vw-2rem)]"
      >
        <ComboboxInput
          showTrigger={false}
          aria-label={`Search ${label.toLowerCase()}`}
          placeholder={`Search ${label.toLowerCase()}…`}
        />
        <ComboboxEmpty>No matches.</ComboboxEmpty>
        <ComboboxList>
          {(item: T) => (
            <ComboboxItem
              key={item.id}
              value={item}
              disabled={itemDisabled?.(item)}
              className="pointer-coarse:min-h-11"
            >
              {children(item)}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
export function CollectionEmpty({
  title,
  children,
  actions,
}: {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <Empty className="py-6">
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{children}</EmptyDescription>
      </EmptyHeader>
      {actions ? (
        <EmptyContent className="flex-row flex-wrap">{actions}</EmptyContent>
      ) : null}
    </Empty>
  );
}
export function CollectionRow({
  collection: c,
  timezone,
  onAction,
}: {
  collection: Collection;
  timezone: string;
  onAction: (action: CollectionAction, c: Collection) => void;
}) {
  const actions = collectionActions(c).map((a) => ({
    ...a,
    run: () => onAction(a.id, c),
  }));
  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <Item
            size="sm"
            className="rounded-none border-b last:border-b-0"
            data-collection-id={c.id}
          />
        }
      >
        <ItemContent>
          <button
            type="button"
            className="flex min-h-12 flex-col gap-1 text-left"
            onClick={() => onAction("open", c)}
          >
            <ItemTitle className="text-[15px] font-semibold">
              {c.name}
            </ItemTitle>
            <ItemDescription className="line-clamp-none">
              {collectionTypes[c.type]} · {collectionStatuses[c.status]}
              {c.startDate
                ? ` · ${exactDate(c.startDate, timezone)}${
                    c.endDate && c.endDate !== c.startDate
                      ? ` – ${exactDate(c.endDate, timezone)}`
                      : ""
                  }`
                : ""}
            </ItemDescription>
            <span className="text-xs text-muted-foreground">
              {c.storyCount} stories
              {storySummary(c) ? ` · ${storySummary(c)}` : ""} ·{" "}
              {c.interviewCount} interviews · {c.openTaskCount} open tasks
            </span>
          </button>
        </ItemContent>
        <ItemActions className="hidden flex-col items-end gap-1 sm:flex">
          <span className="text-sm">{c.lead?.name || "No lead"}</span>
          <PeopleAvatars people={c.members} />
        </ItemActions>
        <ItemActions>
          <ActionMenu label={`Actions for ${c.name}`} actions={actions} />
        </ItemActions>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        {actions.map((a) => (
          <ContextMenuItem
            key={a.id}
            className="pointer-coarse:min-h-11"
            onClick={a.run}
          >
            {a.label}
          </ContextMenuItem>
        ))}
      </ContextMenuContent>
    </ContextMenu>
  );
}
export function InterviewRow({
  interview: i,
  timezone,
  onOpen,
}: {
  interview: Interview;
  timezone: string;
  onOpen: () => void;
}) {
  return (
    <ItemButton size="sm" onClick={onOpen} className="min-h-16">
      <ItemContent>
        <ItemTitle>{i.interviewee}</ItemTitle>
        <ItemDescription className="line-clamp-none">
          {interviewStatuses[i.status]} ·{" "}
          {i.completedAt
            ? exactDate(i.completedAt, timezone)
            : appointmentLine(interviewAppointment(i), timezone)}{" "}
          ·{" "}
          {i.interviewers.length
            ? `${i.interviewers.map((p) => p.name).join(", ")} · `
            : ""}
          {i.storyIds.length} linked stories
          {i.resourceIds.length ? " · Recording / resource" : ""}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <PeopleAvatars people={i.interviewers} />
        <Badge variant="outline" className="hidden sm:inline-flex">
          {interviewStatuses[i.status]}
        </Badge>
      </ItemActions>
    </ItemButton>
  );
}
export function StoryOption({ story }: { story: PlanningStory }) {
  return (
    <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
      <span className="min-w-0">
        <span className="block truncate font-medium">{story.title}</span>
        <span className="block text-xs text-muted-foreground">
          {story.workflow.label}
          {story.sections?.length ? ` · ${story.sections.join(" / ")}` : ""}
        </span>
      </span>
      <PeopleAvatars people={story.authors} />
    </span>
  );
}
