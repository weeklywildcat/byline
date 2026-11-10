import { useEffect, useState } from "react";
import { Badge } from "@byline/newsroom-ui/ui/badge";
import { Button } from "@byline/newsroom-ui/ui/button";
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
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@byline/newsroom-ui/ui/empty";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@byline/newsroom-ui/ui/field";
import { TextField } from "@byline/newsroom-ui/components/form-fields";
import {
  InputGroup,
  InputGroupAddon,
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
import { Tabs, TabsList, TabsTrigger } from "@byline/newsroom-ui/ui/tabs";
import { ChevronRight, Plus, Search } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import type { PeopleApi } from "./people-api";
import {
  PEOPLE_VIEWS,
  PERSON_ACCESS_ROLES,
  personInitials,
  personSummary,
  type NewPerson,
  type PeopleQuery,
  type PersonDetail,
  type PersonRow,
} from "./people-model";
import { peopleKeys, usePeople } from "./people-query";

export function PersonAvatar({
  person,
  large = false,
}: {
  person: Pick<PersonRow, "name" | "portrait">;
  large?: boolean;
}) {
  return (
    <Avatar className={large ? "size-24" : "size-10"} aria-hidden="true">
      {person.portrait?.url ? (
        <AvatarImage src={person.portrait.url} alt="" />
      ) : null}
      <AvatarFallback>{personInitials(person.name)}</AvatarFallback>
    </Avatar>
  );
}

/** The editor's compact identity directory. Its host owns the URL and navigation. */
export function PeoplePage({
  api,
  query,
  onQueryChange,
  href,
  onOpen,
}: {
  api: PeopleApi;
  query: PeopleQuery;
  onQueryChange: (query: PeopleQuery) => void;
  href: (id: number) => string;
  onOpen: (id: number) => void;
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
  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">People</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Public bylines, staff profiles, guest contributors and newsroom access in one place.
          </p>
        </div>
        {result.data?.canCreate ? (
          <Button
            type="button"
            onClick={() => setCreating(true)}
            className="pointer-coarse:min-h-11"
          >
            <Plus aria-hidden="true" />
            New person
          </Button>
        ) : null}
      </header>
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
          className="flex h-auto w-fit max-w-full flex-wrap"
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
      <InputGroup className="max-w-md pointer-coarse:min-h-11">
        <InputGroupAddon>
          <Search aria-hidden="true" />
        </InputGroupAddon>
        <InputGroupInput
          aria-label="Search People"
          placeholder="Search name or newsroom role…"
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
        />
      </InputGroup>
      <p
        className="text-sm text-muted-foreground"
        aria-live="polite"
        aria-atomic="true"
      >
        {result.isPending
          ? "Loading people…"
          : result.data
          ? `${result.data.total} ${
              result.data.total === 1 ? "person" : "people"
            }`
          : ""}
      </p>
      {result.isPending ? (
        <div className="space-y-3" aria-label="Loading people">
          {[0, 1, 2].map((id) => (
            <Skeleton key={id} className="h-16 w-full" />
          ))}
        </div>
      ) : result.isError ? (
        <div role="alert" className="space-y-3">
          <p>{result.error.message}</p>
          <Button
            type="button"
            variant="outline"
            onClick={() => void result.refetch()}
          >
            Try again
          </Button>
        </div>
      ) : result.data?.people.length ? (
        <ItemGroup className="gap-1" aria-label="People">
          {result.data.people.map((person) => (
            <Item
              key={person.id}
              size="sm"
              render={
                <a
                  href={href(person.id)}
                  onClick={(event) => {
                    if (
                      event.button ||
                      event.metaKey ||
                      event.ctrlKey ||
                      event.shiftKey ||
                      event.altKey
                    )
                      return;
                    event.preventDefault();
                    onOpen(person.id);
                  }}
                />
              }
              className="min-h-16 flex-nowrap"
              data-person-row={person.id}
            >
              <ItemMedia>
                <PersonAvatar person={person} />
              </ItemMedia>
              <ItemContent className="min-w-0">
                <ItemTitle className="max-w-full break-words">
                  {person.name}
                </ItemTitle>
                <ItemDescription className="line-clamp-none break-words">
                  {personSummary(person, { showStatus: query.view === "all" })}
                </ItemDescription>
              </ItemContent>
              <ItemActions className="shrink-0">
                {person.access !== undefined ? (
                  <Badge variant={person.access?.enabled ? "outline" : "secondary"} className="hidden sm:inline-flex">
                    {!person.access ? "No access" : person.access.enabled ? PERSON_ACCESS_ROLES[person.access.role] : "Access off"}
                  </Badge>
                ) : null}
                <ChevronRight className="size-4" aria-hidden="true" />
                <span className="sr-only">Edit {person.name}</span>
              </ItemActions>
            </Item>
          ))}
        </ItemGroup>
      ) : (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>
              {query.search ? "No matching people" : "No people in this view"}
            </EmptyTitle>
            <EmptyDescription>
              {query.search
                ? "Try a different name or newsroom role."
                : "New people can be added with New person."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
      {result.data && result.data.pages > 1 ? (
        <nav className="flex items-center gap-3" aria-label="People pages">
          <Button
            type="button"
            variant="outline"
            disabled={query.page <= 1}
            onClick={() => onQueryChange({ ...query, page: query.page - 1 })}
          >
            Previous
          </Button>
          <span className="text-sm">
            Page {result.data.page} of {result.data.pages}
          </span>
          <Button
            type="button"
            variant="outline"
            disabled={query.page >= result.data.pages}
            onClick={() => onQueryChange({ ...query, page: query.page + 1 })}
          >
            Next
          </Button>
        </nav>
      ) : null}
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

function NewPersonDialog({
  api,
  onClose,
  onCreated,
}: {
  api: PeopleApi;
  onClose: () => void;
  onCreated: (detail: PersonDetail) => void;
}) {
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
            Add the Person first. Newsroom access can be granted from their profile.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-5"
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
                aria-label="Type"
              >
                <Field orientation="horizontal">
                  <RadioGroupItem id="new-person-staff" value="active" />
                  <FieldLabel htmlFor="new-person-staff">
                    Current staff
                  </FieldLabel>
                </Field>
                <Field orientation="horizontal">
                  <RadioGroupItem id="new-person-guest" value="guest" />
                  <FieldLabel htmlFor="new-person-guest">
                    Guest contributor
                  </FieldLabel>
                </Field>
              </RadioGroup>
              <p className="text-sm text-muted-foreground">
                {input.type === "guest"
                  ? "Byline only to start: outside the staff directory, without a profile page."
                  : "Starts in the staff directory with a public profile page."}
              </p>
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
              {saving ? "Creating…" : "Create person"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
