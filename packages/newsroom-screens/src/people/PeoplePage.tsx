import { useEffect, useId, useState, type ReactNode } from "react";
import { Badge } from "@byline/newsroom-ui/ui/badge";
import { Button } from "@byline/newsroom-ui/ui/button";
import { ButtonGroup } from "@byline/newsroom-ui/ui/button-group";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@byline/newsroom-ui/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@byline/newsroom-ui/ui/dialog";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@byline/newsroom-ui/ui/empty";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from "@byline/newsroom-ui/ui/field";
import { TextField } from "@byline/newsroom-ui/components/form-fields";
import { InlineAlert } from "@byline/newsroom-ui/components/inline-alert";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@byline/newsroom-ui/ui/input-group";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@byline/newsroom-ui/ui/item";
import { RadioGroup, RadioGroupItem } from "@byline/newsroom-ui/ui/radio-group";
import { Skeleton } from "@byline/newsroom-ui/ui/skeleton";
import { Spinner } from "@byline/newsroom-ui/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@byline/newsroom-ui/ui/tabs";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
  SearchX,
  UsersRound,
  X,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import type { PeopleApi } from "./people-api";
import {
  PEOPLE_VIEWS,
  PERSON_ACCESS_ROLES,
  personFlags,
  personInitials,
  type NewPerson,
  type PeopleQuery,
  type PersonDetail,
  type PersonRow,
} from "./people-model";
import { peopleKeys, usePeople } from "./people-query";

const PAGE_SIZE = 50;

export function PersonAvatar({
  person,
  className = "size-10",
  onError,
}: {
  person: Pick<PersonRow, "name" | "portrait">;
  className?: string;
  onError?: () => void;
}) {
  return (
    <Avatar className={className} aria-hidden="true">
      {person.portrait?.url ? (
        <AvatarImage src={person.portrait.url} alt="" onError={onError} />
      ) : null}
      <AvatarFallback>{personInitials(person.name)}</AvatarFallback>
    </Avatar>
  );
}

/** A plain click opens in place; modified clicks keep the browser's own behaviour. */
export function inPlace(event: React.MouseEvent, open: () => void) {
  if (
    event.button ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  )
    return;
  event.preventDefault();
  open();
}

/** The editor's compact identity directory. Its host owns the URL and navigation. */
export function PeoplePage({
  api,
  query,
  onQueryChange,
  href,
  onOpen,
  nav,
}: {
  api: PeopleApi;
  query: PeopleQuery;
  onQueryChange: (query: PeopleQuery) => void;
  href: (id: number) => string;
  onOpen: (id: number) => void;
  /** The team's sibling screens, shown under the page header. */
  nav?: ReactNode;
}) {
  const result = usePeople(api, query);
  const cache = useQueryClient();
  const [creating, setCreating] = useState(false);
  // Keep in-progress keystrokes synchronous, as Media does. Next applies
  // native history updates concurrently; binding the input directly to its
  // search params can replace fast typing with an older render's value.
  const [searchText, setSearchText] = useState(query.search);
  useEffect(() => {
    setSearchText(query.search);
  }, [query.search]);
  useEffect(() => {
    if (searchText === query.search) return;
    const timer = window.setTimeout(
      () => onQueryChange({ ...query, search: searchText, page: 1 }),
      250,
    );
    return () => window.clearTimeout(timer);
  }, [query, onQueryChange, searchText]);
  const data = result.data;
  const canCreate = Boolean(data?.canCreate);
  const first = data ? (data.page - 1) * PAGE_SIZE + 1 : 0;
  const last = data ? first + data.people.length - 1 : 0;

  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">People</h1>
          <p className="max-w-prose text-sm text-muted-foreground">
            Bylines, staff profiles, guest contributors and newsroom access.
          </p>
        </div>
        {canCreate ? (
          <Button
            type="button"
            onClick={() => setCreating(true)}
            className="pointer-coarse:min-h-11"
          >
            <Plus data-icon="inline-start" aria-hidden="true" />
            New person
          </Button>
        ) : null}
      </header>
      {nav}
      <div
        className="flex flex-wrap items-center justify-between gap-3"
        role="toolbar"
        aria-label="Filter people"
      >
        <Tabs
          value={query.view}
          onValueChange={(view) =>
            onQueryChange({
              ...query,
              view: view as PeopleQuery["view"],
              page: 1,
            })
          }
        >
          <TabsList
            className="max-w-full flex-wrap group-data-horizontal/tabs:h-auto"
            aria-label="People views"
          >
            {Object.entries(PEOPLE_VIEWS).map(([value, label]) => (
              <TabsTrigger
                key={value}
                value={value}
                className="pointer-coarse:min-h-11"
              >
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <InputGroup className="w-full sm:w-72 pointer-coarse:min-h-11">
          <InputGroupAddon>
            <Search aria-hidden="true" />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            aria-label="Search People"
            placeholder="Search name or role…"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && searchText) {
                event.preventDefault();
                setSearchText("");
              }
            }}
          />
          {searchText ? (
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                size="icon-xs"
                aria-label="Clear search"
                onClick={() => setSearchText("")}
              >
                <X aria-hidden="true" />
              </InputGroupButton>
            </InputGroupAddon>
          ) : null}
        </InputGroup>
      </div>

      {result.isPending ? (
        <div
          className="divide-y overflow-hidden rounded-xl border"
          aria-busy="true"
          aria-label="Loading people"
        >
          {[0, 1, 2, 3].map((id) => (
            <div key={id} className="flex items-center gap-3 px-3 py-3">
              <Skeleton className="size-10 rounded-full" />
              <div className="grid flex-1 gap-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
          ))}
        </div>
      ) : result.isError ? (
        <InlineAlert
          title="People couldn’t be loaded"
          onAction={() => void result.refetch()}
        >
          {result.error.message}
        </InlineAlert>
      ) : data?.people.length ? (
        <ItemGroup
          className="gap-0 divide-y overflow-hidden rounded-xl border"
          aria-label="People"
        >
          {data.people.map((person) => (
            <div role="listitem" key={person.id}>
              <PersonListItem
                person={person}
                showStatus={query.view === "all"}
                href={href(person.id)}
                onOpen={() => onOpen(person.id)}
              />
            </div>
          ))}
        </ItemGroup>
      ) : (
        <Empty className="rounded-xl border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              {query.search ? (
                <SearchX aria-hidden="true" />
              ) : (
                <UsersRound aria-hidden="true" />
              )}
            </EmptyMedia>
            <EmptyTitle>
              {query.search ? "No matching people" : "No people in this view"}
            </EmptyTitle>
            <EmptyDescription>
              {query.search
                ? "Try a different name or newsroom role."
                : query.view === "active"
                ? "Add the first staff member to start crediting bylines."
                : `Nobody is listed under ${PEOPLE_VIEWS[query.view]} yet.`}
            </EmptyDescription>
          </EmptyHeader>
          {query.search ? (
            <EmptyContent>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSearchText("")}
              >
                Clear search
              </Button>
            </EmptyContent>
          ) : canCreate ? (
            <EmptyContent>
              <Button type="button" size="sm" onClick={() => setCreating(true)}>
                <Plus data-icon="inline-start" aria-hidden="true" />
                New person
              </Button>
            </EmptyContent>
          ) : null}
        </Empty>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p
          className="text-sm text-muted-foreground tabular-nums"
          aria-live="polite"
          aria-atomic="true"
        >
          {result.isPending
            ? "Loading people…"
            : data
            ? data.pages > 1
              ? `${first}–${last} of ${data.total} people`
              : `${data.total} ${data.total === 1 ? "person" : "people"}`
            : ""}
        </p>
        {data && data.pages > 1 ? (
          <nav aria-label="People pages">
            <ButtonGroup>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={query.page <= 1}
                onClick={() => onQueryChange({ ...query, page: query.page - 1 })}
              >
                <ChevronLeft data-icon="inline-start" aria-hidden="true" />
                Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={query.page >= data.pages}
                onClick={() => onQueryChange({ ...query, page: query.page + 1 })}
              >
                Next
                <ChevronRight data-icon="inline-end" aria-hidden="true" />
              </Button>
            </ButtonGroup>
          </nav>
        ) : null}
      </div>

      {creating ? (
        <NewPersonDialog
          api={api}
          onClose={() => setCreating(false)}
          onCreated={(detail) => {
            cache.setQueryData(
              peopleKeys.detail(detail.person.id, false),
              detail,
            );
            void cache.invalidateQueries({ queryKey: peopleKeys.all });
            setCreating(false);
            onOpen(detail.person.id);
          }}
        />
      ) : null}
    </>
  );
}

function PersonListItem({
  person,
  showStatus,
  href,
  onOpen,
}: {
  person: PersonRow;
  showStatus: boolean;
  href: string;
  onOpen: () => void;
}) {
  const flags = personFlags(person, { showStatus });
  const access = person.access;
  return (
    <Item
      className="flex-nowrap rounded-none border-0 px-4"
      render={<a href={href} onClick={(event) => inPlace(event, onOpen)} />}
      data-person-row={person.id}
    >
      <ItemMedia>
        <PersonAvatar person={person} />
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle className="line-clamp-none flex-wrap gap-x-2 gap-y-1">
          <span className="break-words">{person.name}</span>
          {flags.map((flag, index) => (
            <Badge
              key={flag}
              variant={showStatus && index === 0 ? "secondary" : "outline"}
              className="font-normal"
            >
              {flag}
            </Badge>
          ))}
        </ItemTitle>
        <ItemDescription className="line-clamp-1 break-words">
          {person.newsroomRole || "No newsroom role"}
        </ItemDescription>
      </ItemContent>
      <ItemActions className="shrink-0">
        {access ? (
          <Badge
            variant={access.enabled ? "secondary" : "destructive"}
            className="hidden sm:inline-flex"
            title="Newsroom access"
          >
            {access.enabled ? PERSON_ACCESS_ROLES[access.role] : "Access off"}
          </Badge>
        ) : null}
        <ChevronRight
          className="size-4 text-muted-foreground"
          aria-hidden="true"
        />
        <span className="sr-only">Edit {person.name}</span>
      </ItemActions>
    </Item>
  );
}

const PERSON_TYPES: Array<{
  value: NewPerson["type"];
  title: string;
  description: string;
}> = [
  {
    value: "active",
    title: "Current staff",
    description: "Listed in the staff directory, with a public profile page.",
  },
  {
    value: "guest",
    title: "Guest contributor",
    description:
      "Byline only to start: outside the directory, without a profile page.",
  },
];

function NewPersonDialog({
  api,
  onClose,
  onCreated,
}: {
  api: PeopleApi;
  onClose: () => void;
  onCreated: (detail: PersonDetail) => void;
}) {
  const id = useId();
  const [input, setInput] = useState<NewPerson>({
    name: "",
    type: "active",
    newsroomRole: "",
  });
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const save = async () => {
    setAttempted(true);
    if (!input.name.trim() || saving) return;
    setSaving(true);
    setError("");
    try {
      onCreated(
        await api.create({
          ...input,
          name: input.name.trim(),
          newsroomRole: input.newsroomRole?.trim() ?? "",
        }),
      );
    } catch (caught) {
      setError((caught as Error).message);
      setSaving(false);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
    >
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto sm:max-w-md"
        showCloseButton={!saving}
      >
        <DialogHeader>
          <DialogTitle>New person</DialogTitle>
          <DialogDescription>
            Add someone who can be credited on stories. Newsroom access can be
            given from their profile afterwards.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void save();
          }}
        >
          <FieldGroup>
            <TextField
              label="Name"
              value={input.name}
              maxLength={120}
              autoFocus
              disabled={saving}
              onChange={(name) => setInput({ ...input, name })}
              hint="As it should appear on bylines."
              error={
                attempted && !input.name.trim()
                  ? "Give this person a name."
                  : undefined
              }
            />
            <FieldSet disabled={saving}>
              <FieldLegend variant="label">Type</FieldLegend>
              <RadioGroup
                value={input.type}
                onValueChange={(type) =>
                  setInput({ ...input, type: type as NewPerson["type"] })
                }
              >
                {PERSON_TYPES.map((type) => (
                  <FieldLabel key={type.value} htmlFor={`${id}-${type.value}`}>
                    <Field orientation="horizontal">
                      <FieldContent>
                        <FieldTitle id={`${id}-${type.value}-title`}>
                          {type.title}
                        </FieldTitle>
                        <FieldDescription id={`${id}-${type.value}-help`}>
                          {type.description}
                        </FieldDescription>
                      </FieldContent>
                      <RadioGroupItem
                        id={`${id}-${type.value}`}
                        value={type.value}
                        aria-labelledby={`${id}-${type.value}-title`}
                        aria-describedby={`${id}-${type.value}-help`}
                      />
                    </Field>
                  </FieldLabel>
                ))}
              </RadioGroup>
            </FieldSet>
            <TextField
              label="Newsroom role"
              optional
              value={input.newsroomRole ?? ""}
              maxLength={80}
              disabled={saving}
              onChange={(newsroomRole) => setInput({ ...input, newsroomRole })}
              placeholder="Photographer"
            />
          </FieldGroup>
          {error ? <FieldError>{error}</FieldError> : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Spinner data-icon="inline-start" /> : null}
              {saving ? "Creating…" : "Create person"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
