"use client";

import { Alert, AlertAction, AlertDescription, AlertTitle } from "@byline/newsroom-ui/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@byline/newsroom-ui/ui/alert-dialog";
import { Badge } from "@byline/newsroom-ui/ui/badge";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@byline/newsroom-ui/ui/dialog";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@byline/newsroom-ui/ui/empty";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSeparator, FieldSet } from "@byline/newsroom-ui/ui/field";
import { Input } from "@byline/newsroom-ui/ui/input";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@byline/newsroom-ui/ui/item";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@byline/newsroom-ui/ui/sheet";
import { Skeleton } from "@byline/newsroom-ui/ui/skeleton";
import { Spinner } from "@byline/newsroom-ui/ui/spinner";
import { Switch } from "@byline/newsroom-ui/ui/switch";
import { Textarea } from "@byline/newsroom-ui/ui/textarea";
import { AdminRoot } from "@byline/newsroom-ui/components/admin-root";
import { ChoiceCards, type ChoiceCard } from "@byline/newsroom-ui/components/choice-cards";
import { CalendarPlus, ChevronRight, CircleAlert, Pencil, Plus, ShieldCheck, Trash2, UserPlus, UsersRound } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useId, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { workloadHint } from "../../domain/workload";
import { problemsOf, rememberInUrl, useRoleWrites, useRoles, useWorkload, type RoleMember, type RoleRow, type RolesOverview } from "./api";
import { ChoiceCombobox, ChoicesCombobox, type Choice } from "./pickers";
import { useNewsroomRoutes } from "../shell/account";
import { ShellLink } from "../shell/navigation";
import { TeamNav } from "./TeamNav";

/**
 * Newsroom Roles (docs/newsroom-roles.md): who reviews what this school year.
 * A role is operational ("Section Editor routes Sports review"); it grants no
 * access. Roles are Items, a role opens in a right Sheet, and a scoped
 * membership is edited in a Dialog. Earlier years are history, not listed.
 */

const SCOPE_LABELS = { none: "Everything", section: "By Section", media: "By media type" } as const;
const SCOPE_HELP = {
  none: "Everyone in the role covers every story.",
  section: "Each member covers the Sections you choose. Anyone with no Section covers everything.",
  media: "Each member covers the media types you choose (photo, video, graphics…)."
} as const;
const SCOPE_CHOICES: ReadonlyArray<ChoiceCard<RoleRow["scopeKind"]>> = (["none", "section", "media"] as const).map((kind) => ({ value: kind, title: SCOPE_LABELS[kind], description: SCOPE_HELP[kind] }));

export function RolesScreen() {
  const { api, admin } = useNewsroomRoutes();
  const params = useSearchParams();
  const overview = useRoles(api);
  const archivedId = useId();
  const [openId, open_] = useState<number | null>(() => {
    const candidate = Number(params?.get("role"));
    return Number.isSafeInteger(candidate) && candidate > 0 ? candidate : null;
  });
  const setOpenId = (id: number | null) => { open_(id); rememberInUrl("role", id); };
  const [creating, setCreating] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const data = overview.data;
  const open = data?.roles.find((role) => role.id === openId) ?? null;
  const roles = data?.roles.filter((role) => showArchived || !role.archived) ?? [];
  const archivedCount = data?.roles.filter((role) => role.archived).length ?? 0;
  const unstaffed = data?.year ? roles.filter((role) => !role.archived && !role.members.length).length : 0;

  return (
    <AdminRoot toaster={false} className="byline-roles">
      <main className="mx-auto flex w-full min-w-0 max-w-[960px] flex-col gap-5 px-4 py-6 lg:px-6" data-byline-roles-screen="">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="grid gap-1">
            <h1 className="text-2xl font-semibold tracking-tight">Roles</h1>
            <p className="max-w-prose text-sm text-muted-foreground">Newsroom roles decide who reviews which stories. They don’t give anyone access to anything; that stays with each account’s security role.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" nativeButton={false} role="link" render={<ShellLink href={`${admin}/people?view=rollover`} />}><CalendarPlus data-icon="inline-start" aria-hidden="true" />New school year</Button>
            <Button type="button" onClick={() => setCreating(true)} disabled={!data}><Plus data-icon="inline-start" aria-hidden="true" />New role</Button>
          </div>
        </header>
        <TeamNav current="roles" />

        {overview.isError ? <Alert variant="destructive"><CircleAlert aria-hidden="true" /><AlertTitle>Roles couldn’t be loaded</AlertTitle><AlertDescription>{problemsOf(overview.error)[0]}</AlertDescription><AlertAction><Button type="button" size="xs" variant="outline" onClick={() => void overview.refetch()}>Try again</Button></AlertAction></Alert> : null}
        {data && !data.year ? (
          <Alert>
            <CircleAlert aria-hidden="true" />
            <AlertTitle>No school year is active</AlertTitle>
            <AlertDescription>Roles can be set up, but nobody can be added to one until a school year is active, and reviews can’t be routed.</AlertDescription>
            <AlertAction><Button type="button" size="xs" variant="outline" nativeButton={false} role="link" render={<ShellLink href={`${admin}/people?view=rollover`} />}>Start a year</Button></AlertAction>
          </Alert>
        ) : null}

        {data ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {data.year ? <>{roles.length} {roles.length === 1 ? "role" : "roles"} in <span className="font-medium text-foreground">{data.year.name}</span></> : `${roles.length} ${roles.length === 1 ? "role" : "roles"}`}
              {unstaffed ? <> · <span className="text-destructive">{unstaffed} with nobody in {unstaffed === 1 ? "it" : "them"}</span></> : null}
            </p>
            {archivedCount ? (
              <Field orientation="horizontal" className="w-auto">
                <FieldLabel htmlFor={archivedId} className="font-normal text-muted-foreground">Show {archivedCount} archived</FieldLabel>
                <Switch id={archivedId} size="sm" checked={showArchived} onCheckedChange={(next) => setShowArchived(next === true)} />
              </Field>
            ) : null}
          </div>
        ) : null}

        {overview.isPending ? <div className="divide-y overflow-hidden rounded-xl border" aria-busy="true">{[0, 1, 2].map((n) => <div key={n} className="grid gap-2 px-4 py-3.5"><Skeleton className="h-4 w-40" /><Skeleton className="h-3 w-64" /></div>)}</div> : null}
        {data && !roles.length ? (
          <Empty className="rounded-xl border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon"><ShieldCheck aria-hidden="true" /></EmptyMedia>
              <EmptyTitle>No roles yet</EmptyTitle>
              <EmptyDescription>A role is a job reviews are routed to, like Copy Desk or Sports Editor. Create the first one to start routing reviews.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent><Button type="button" size="sm" onClick={() => setCreating(true)}><Plus data-icon="inline-start" aria-hidden="true" />New role</Button></EmptyContent>
          </Empty>
        ) : null}
        {data && roles.length ? (
          <ItemGroup className="gap-0 divide-y overflow-hidden rounded-xl border" aria-label="Newsroom roles">
            {roles.map((role) => (
              <div role="listitem" key={role.id}>
                <RoleItem role={role} year={data.year?.name ?? null} onOpen={() => setOpenId(role.id)} />
              </div>
            ))}
          </ItemGroup>
        ) : null}
      </main>

      {data ? <RoleSheet key={open?.id ?? "none"} api={api} overview={data} role={open} onClose={() => setOpenId(null)} /> : null}
      <NewRoleDialog api={api} open={creating} onOpenChange={setCreating} onCreated={(id) => setOpenId(id)} />
    </AdminRoot>
  );
}

function scopeBadges(member: RoleMember, role: RoleRow): string[] {
  if (member.scopeMode === "global") return [];
  return role.scopeKind === "section" ? member.sections : member.mediaTypes.map((type) => type.charAt(0).toUpperCase() + type.slice(1));
}

function RoleItem({ role, year, onOpen }: { role: RoleRow; year: string | null; onOpen: () => void }) {
  const names = role.members.slice(0, 3).map((member) => member.name);
  const more = role.members.length - names.length;
  // What the role's scoped members cover, once each: the Sections or media types, not a count.
  const covered = [...new Set(role.members.flatMap((member) => scopeBadges(member, role)))];
  return (
    <Item render={<button type="button" onClick={onOpen} aria-label={`${role.name}: ${role.members.length} ${role.members.length === 1 ? "member" : "members"}${year ? ` in ${year}` : ""}. Open`} />} className="flex-nowrap rounded-none border-0 px-4 text-left hover:bg-muted/50" data-role-row={role.id}>
      <ItemMedia variant="icon" className={role.archived ? "opacity-50" : undefined}><UsersRound aria-hidden="true" /></ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle className="line-clamp-none flex-wrap gap-x-2 gap-y-1">
          <span className="break-words">{role.name}</span>
          {role.scopeKind !== "none" ? <Badge variant="secondary">{SCOPE_LABELS[role.scopeKind]}</Badge> : null}
          {role.archived ? <Badge variant="outline">Archived</Badge> : null}
        </ItemTitle>
        {role.description ? <ItemDescription className="line-clamp-1">{role.description}</ItemDescription> : null}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          {role.members.length
            ? <span className="text-muted-foreground">{names.join(", ")}{more > 0 ? ` and ${more} more` : ""}</span>
            : role.archived ? <span className="text-muted-foreground">No members</span> : <Badge variant="destructive">Nobody holds this role this year</Badge>}
          {covered.slice(0, 4).map((scope) => <Badge key={scope} variant="outline" className="font-normal">{scope}</Badge>)}
          {covered.length > 4 ? <span className="text-xs text-muted-foreground">+{covered.length - 4}</span> : null}
        </div>
      </ItemContent>
      <ItemActions><ChevronRight aria-hidden="true" className="size-4 text-muted-foreground" /></ItemActions>
    </Item>
  );
}

/* ------------------------------------------------------------------ Sheet */

function RoleSheet({ api, overview, role, onClose }: { api: string; overview: RolesOverview; role: RoleRow | null; onClose: () => void }) {
  const writes = useRoleWrites(api);
  const { admin } = useNewsroomRoutes();
  const ids = { form: useId(), name: useId(), description: useId(), waiting: useId(), members: useId(), details: useId(), used: useId() };
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [waitingLabel, setWaitingLabel] = useState(role?.waitingLabel ?? "");
  const [scopeKind, setScopeKind] = useState<RoleRow["scopeKind"]>(role?.scopeKind ?? "none");
  const [problems, setProblems] = useState<string[]>([]);
  const [member, setMember] = useState<{ existing: RoleMember | null } | null>(null);
  const [removing, setRemoving] = useState<RoleMember | null>(null);
  const hasScoped = role?.members.some((entry) => entry.scopeMode === "scoped") ?? false;
  const changed = role !== null && (name !== role.name || description !== role.description || waitingLabel !== role.waitingLabel || scopeKind !== role.scopeKind);
  const yearName = overview.year?.name ?? "this year";

  function save(event: FormEvent) {
    event.preventDefault();
    if (!role) return;
    setProblems([]);
    writes.saveRole.mutate({ id: role.id, data: { name, description, waitingLabel, scopeKind, expectedRevision: role.revision } }, {
      onSuccess: () => toast.success("Role saved."),
      onError: (error) => setProblems(problemsOf(error))
    });
  }
  function archive(next: boolean) {
    if (!role) return;
    setProblems([]);
    writes.saveRole.mutate({ id: role.id, data: { archived: next } }, { onSuccess: () => toast.success(next ? "Role archived." : "Role restored."), onError: (error) => setProblems(problemsOf(error)) });
  }

  return (
    <>
      <Sheet open={role !== null} onOpenChange={(next) => { if (!next) onClose(); }}>
        <SheetContent side="right" className="w-full gap-0 sm:max-w-lg">
          {role ? (
            <>
              <SheetHeader className="border-b">
                <SheetTitle className="flex flex-wrap items-center gap-2">{role.name}{role.archived ? <Badge variant="outline">Archived</Badge> : null}</SheetTitle>
                <SheetDescription>{role.members.length} {role.members.length === 1 ? "member" : "members"} in {overview.year?.name ?? "no active year"}. Changes apply to reviews routed from now on; reviews already in progress keep their routing.</SheetDescription>
              </SheetHeader>
              <div className="grid min-h-0 flex-1 content-start gap-6 overflow-y-auto p-4">
                {problems.length ? <Alert variant="destructive"><CircleAlert aria-hidden="true" /><AlertTitle>{problems.length === 1 ? "That didn’t work" : "Fix these first"}</AlertTitle><AlertDescription>{problems.map((problem) => <span key={problem} className="block">{problem}</span>)}</AlertDescription></Alert> : null}

                <section aria-labelledby={ids.members} className="grid gap-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 id={ids.members} className="text-sm font-medium">Members{overview.year ? <span className="font-normal text-muted-foreground"> · {overview.year.name}</span> : null}</h3>
                    {role.members.length ? <Button type="button" size="sm" variant="outline" disabled={role.archived || !overview.year} onClick={() => setMember({ existing: null })}><UserPlus data-icon="inline-start" aria-hidden="true" />Add person</Button> : null}
                  </div>
                  {role.members.length ? (
                    <ItemGroup className="gap-0 divide-y overflow-hidden rounded-lg border">
                      {role.members.map((entry) => {
                        const badges = scopeBadges(entry, role);
                        return (
                          <div role="listitem" key={entry.id}>
                            <Item size="sm" className="flex-nowrap rounded-none border-0">
                              <ItemContent className="min-w-0">
                                <ItemTitle>{entry.name}</ItemTitle>
                                <div className="flex flex-wrap items-center gap-1">
                                  {entry.scopeMode === "global" ? <Badge variant="outline" className="font-normal">{role.scopeKind === "none" ? "Everything" : "Everything else"}</Badge> : badges.map((badge) => <Badge key={badge} variant="secondary">{badge}</Badge>)}
                                </div>
                              </ItemContent>
                              <ItemActions className="gap-0.5">
                                <Button type="button" size="icon-sm" variant="ghost" onClick={() => setMember({ existing: entry })} aria-label={`Edit ${entry.name}’s membership`} title="Edit coverage"><Pencil aria-hidden="true" /></Button>
                                <Button type="button" size="icon-sm" variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={() => setRemoving(entry)} aria-label={`Remove ${entry.name} from ${role.name}`} title="Remove"><Trash2 aria-hidden="true" /></Button>
                              </ItemActions>
                            </Item>
                          </div>
                        );
                      })}
                    </ItemGroup>
                  ) : (
                    <Empty className="gap-3 rounded-lg border border-dashed p-5">
                      <EmptyHeader>
                        <EmptyMedia variant="icon"><UserPlus aria-hidden="true" /></EmptyMedia>
                        <EmptyTitle className="text-sm">Nobody holds {role.name} in {yearName}</EmptyTitle>
                        <EmptyDescription>A review routed here would fail until someone does.</EmptyDescription>
                      </EmptyHeader>
                      <EmptyContent><Button type="button" size="sm" disabled={role.archived || !overview.year} onClick={() => setMember({ existing: null })}><UserPlus data-icon="inline-start" aria-hidden="true" />Add person</Button></EmptyContent>
                    </Empty>
                  )}
                </section>

                <FieldSeparator />

                <section aria-labelledby={ids.details} className="grid gap-3">
                  <h3 id={ids.details} className="text-sm font-medium">Details</h3>
                  <form id={ids.form} onSubmit={save}>
                    <FieldGroup>
                      <Field>
                        <FieldLabel htmlFor={ids.name}>Name</FieldLabel>
                        <Input id={ids.name} value={name} maxLength={80} onChange={(event) => setName(event.target.value)} required />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor={ids.description}>Description <span className="font-normal text-muted-foreground">Optional</span></FieldLabel>
                        <Textarea id={ids.description} value={description} maxLength={400} rows={2} onChange={(event) => setDescription(event.target.value)} />
                      </Field>
                      <FieldSet>
                        <FieldLegend variant="label">What the role is scoped to</FieldLegend>
                        {hasScoped ? <FieldDescription>Remove this role’s scoped members to change what it is scoped to.</FieldDescription> : null}
                        <ChoiceCards value={scopeKind} onChange={setScopeKind} options={SCOPE_CHOICES} disabled={hasScoped} label="What the role is scoped to" />
                      </FieldSet>
                      {scopeKind !== "none" ? (
                        <Field>
                          <FieldLabel htmlFor={ids.waiting}>What reporters see while waiting</FieldLabel>
                          <Input id={ids.waiting} value={waitingLabel} maxLength={80} placeholder={scopeKind === "section" ? "{scope} Editor" : "{scope} Desk"} onChange={(event) => setWaitingLabel(event.target.value)} />
                          <FieldDescription>{"{scope}"} becomes the Section or media type: “{(waitingLabel || "{scope} Editor").replace("{scope}", scopeKind === "section" ? "Sports" : "Photo")}”.</FieldDescription>
                        </Field>
                      ) : null}
                    </FieldGroup>
                  </form>
                </section>

                <FieldSeparator />

                <section aria-labelledby={ids.used} className="grid gap-2">
                  <h3 id={ids.used} className="text-sm font-medium">Used by</h3>
                  {role.usedBy.length ? (
                    <div className="flex flex-wrap gap-1.5">{role.usedBy.map((workflow) => <Badge key={workflow.id} variant="outline" render={<ShellLink href={`${admin}/review-workflows?workflow=${workflow.id}`} />}>{workflow.name}</Badge>)}</div>
                  ) : <p className="text-sm text-muted-foreground">No review workflow routes to this role.</p>}
                </section>
              </div>
              <SheetFooter className="flex-row items-center justify-between border-t">
                <Button type="button" size="sm" variant="ghost" className={role.archived ? undefined : "text-muted-foreground"} onClick={() => archive(!role.archived)} disabled={writes.saveRole.isPending}>{role.archived ? "Restore role" : "Archive role"}</Button>
                <div className="flex items-center gap-2">
                  {changed ? <Button type="button" size="sm" variant="ghost" onClick={() => { setName(role.name); setDescription(role.description); setWaitingLabel(role.waitingLabel); setScopeKind(role.scopeKind); setProblems([]); }}>Cancel changes</Button> : null}
                  <Button type="submit" form={ids.form} size="sm" disabled={!changed || writes.saveRole.isPending || !name.trim()}>{writes.saveRole.isPending ? <Spinner data-icon="inline-start" /> : null}Save role</Button>
                </div>
              </SheetFooter>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      {role ? <MemberDialog api={api} overview={overview} role={role} existing={member?.existing ?? null} open={member !== null} onOpenChange={(next) => { if (!next) setMember(null); }} /> : null}
      <AlertDialog open={removing !== null} onOpenChange={(next) => { if (!next) setRemoving(null); }}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removing?.name} from {role?.name}?</AlertDialogTitle>
            <AlertDialogDescription>New reviews won’t route to them for this role. Their past reviews and earlier years’ membership stay in the record.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
            <AlertDialogAction type="button" variant="destructive" disabled={writes.removeMember.isPending} onClick={() => role && removing && writes.removeMember.mutate({ roleId: role.id, assignmentId: removing.id }, { onSuccess: () => { toast.success(`${removing.name} removed.`); setRemoving(null); }, onError: (error) => { toast.error(problemsOf(error)[0]); setRemoving(null); } })}>{writes.removeMember.isPending ? <Spinner data-icon="inline-start" /> : null}Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/* ------------------------------------------------------------- member Dialog */

function MemberDialog({ api, overview, role, existing, open, onOpenChange }: { api: string; overview: RolesOverview; role: RoleRow; existing: RoleMember | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const writes = useRoleWrites(api);
  const workload = useWorkload(api, open);
  const ids = { person: useId(), where: useId() };
  const [userId, setUserId] = useState<string | null>(existing ? String(existing.userId) : null);
  const [mode, setMode] = useState<"global" | "scoped">(existing?.scopeMode ?? (role.scopeKind === "none" ? "global" : "scoped"));
  const [sections, setSections] = useState<string[]>(existing?.sectionIds.map(String) ?? []);
  const [media, setMedia] = useState<string[]>(existing?.mediaTypes ?? []);
  const [problems, setProblems] = useState<string[]>([]);

  const people = useMemo<Choice[]>(() => {
    const held = new Set(role.members.filter((entry) => entry.id !== existing?.id).map((entry) => entry.userId));
    const hints = new Map(workload.data?.rows.map((row) => [row.userId, workloadHint(row)]) ?? []);
    // Advisory only: workload never disables or hides anyone.
    return overview.people.filter((person) => !held.has(person.id)).map((person) => ({ value: String(person.id), label: person.name, description: hints.get(person.id) || undefined }));
  }, [overview.people, role.members, existing, workload.data]);
  const sectionChoices = overview.sections.map((section) => ({ value: String(section.id), label: section.name }));
  const mediaChoices = overview.mediaTypes.map((type) => ({ value: type.value, label: type.label }));
  const covers: ReadonlyArray<ChoiceCard<"global" | "scoped">> = [
    { value: "scoped", title: role.scopeKind === "section" ? "Specific Sections" : "Specific media types", description: "Chosen before anyone who covers everything else." },
    { value: "global", title: "Everything else", description: "The fallback for anything nobody with a specific scope covers." }
  ];

  function submit(event: FormEvent) {
    event.preventDefault();
    setProblems([]);
    writes.saveMember.mutate(
      { roleId: role.id, assignmentId: existing?.id ?? null, data: { userId: Number(userId), scopeMode: mode, sectionIds: sections.map(Number), mediaTypes: media } },
      { onSuccess: () => { toast.success(existing ? "Membership saved." : "Added to the role."); onOpenChange(false); }, onError: (error) => setProblems(problemsOf(error)) }
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-full overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{existing ? `${existing.name} in ${role.name}` : `Add someone to ${role.name}`}</DialogTitle>
          <DialogDescription>{role.scopeKind === "none" ? "They’ll be routed reviews for every story this role handles." : "Choose what they cover."}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={ids.person}>Person</FieldLabel>
              <ChoiceCombobox id={ids.person} choices={people} value={userId} onChange={setUserId} placeholder="Search people…" disabled={existing !== null} />
              <FieldDescription>Each person’s current workload is shown as a hint. It never stops you assigning anyone.</FieldDescription>
            </Field>
            {role.scopeKind !== "none" ? (
              <FieldSet>
                <FieldLegend variant="label">Covers</FieldLegend>
                <ChoiceCards value={mode} onChange={setMode} options={covers} label="What they cover" />
                {mode === "scoped" ? (
                  <Field>
                    <FieldLabel htmlFor={ids.where}>{role.scopeKind === "section" ? "Sections" : "Media types"}</FieldLabel>
                    {role.scopeKind === "section"
                      ? <ChoicesCombobox id={ids.where} choices={sectionChoices} value={sections} onChange={setSections} placeholder="Choose Sections…" />
                      : <ChoicesCombobox id={ids.where} choices={mediaChoices} value={media} onChange={setMedia} placeholder="Choose media types…" />}
                  </Field>
                ) : null}
              </FieldSet>
            ) : null}
            {problems.length ? <FieldError errors={problems.map((message) => ({ message }))} /> : null}
          </FieldGroup>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" disabled={writes.saveMember.isPending} />}>Cancel</DialogClose>
            <Button type="submit" disabled={writes.saveMember.isPending || !userId}>{writes.saveMember.isPending ? <Spinner data-icon="inline-start" /> : null}{existing ? "Save" : "Add to role"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* --------------------------------------------------------------- new role */

function NewRoleDialog({ api, open, onOpenChange, onCreated }: { api: string; open: boolean; onOpenChange: (open: boolean) => void; onCreated: (id: number) => void }) {
  const writes = useRoleWrites(api);
  const ids = { name: useId(), description: useId() };
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [scopeKind, setScopeKind] = useState<RoleRow["scopeKind"]>("none");
  const [problems, setProblems] = useState<string[]>([]);

  function submit(event: FormEvent) {
    event.preventDefault();
    setProblems([]);
    writes.saveRole.mutate({ id: null, data: { name, description, scopeKind } }, {
      onSuccess: (next) => {
        const created = next.roles.filter((role) => role.name === name.trim()).sort((a, b) => b.id - a.id)[0];
        toast.success("Role created.");
        setName(""); setDescription(""); setScopeKind("none");
        onOpenChange(false);
        if (created) onCreated(created.id);
      },
      onError: (error) => setProblems(problemsOf(error))
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-full overflow-y-auto sm:max-w-md">
        <DialogHeader><DialogTitle>New role</DialogTitle><DialogDescription>A role is a job in the newsroom that reviews are routed to, like Copy Desk or Sports Editor.</DialogDescription></DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <FieldGroup>
            <Field><FieldLabel htmlFor={ids.name}>Name</FieldLabel><Input id={ids.name} value={name} maxLength={80} onChange={(event) => setName(event.target.value)} required placeholder="Copy Desk" /></Field>
            <Field><FieldLabel htmlFor={ids.description}>Description <span className="font-normal text-muted-foreground">Optional</span></FieldLabel><Textarea id={ids.description} value={description} maxLength={400} rows={2} onChange={(event) => setDescription(event.target.value)} /></Field>
            <FieldSet>
              <FieldLegend variant="label">What the role is scoped to</FieldLegend>
              <ChoiceCards value={scopeKind} onChange={setScopeKind} options={SCOPE_CHOICES} label="What the role is scoped to" />
            </FieldSet>
            {problems.length ? <FieldError errors={problems.map((message) => ({ message }))} /> : null}
          </FieldGroup>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" disabled={writes.saveRole.isPending} />}>Cancel</DialogClose>
            <Button type="submit" disabled={writes.saveRole.isPending || !name.trim()}>{writes.saveRole.isPending ? <Spinner data-icon="inline-start" /> : null}Create role</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
