"use client";

import { Alert, AlertAction, AlertDescription, AlertTitle } from "@byline/newsroom-ui/ui/alert";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@byline/newsroom-ui/ui/alert-dialog";
import { Badge } from "@byline/newsroom-ui/ui/badge";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@byline/newsroom-ui/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@byline/newsroom-ui/ui/empty";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@byline/newsroom-ui/ui/field";
import { Input } from "@byline/newsroom-ui/ui/input";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemSeparator, ItemTitle } from "@byline/newsroom-ui/ui/item";
import { RadioGroup, RadioGroupItem } from "@byline/newsroom-ui/ui/radio-group";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@byline/newsroom-ui/ui/sheet";
import { Skeleton } from "@byline/newsroom-ui/ui/skeleton";
import { Spinner } from "@byline/newsroom-ui/ui/spinner";
import { Textarea } from "@byline/newsroom-ui/ui/textarea";
import { AdminRoot } from "@byline/newsroom-ui/components/admin-root";
import { ChevronRight, Plus } from "lucide-react";
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

export function RolesScreen() {
  const { api, admin } = useNewsroomRoutes();
  const params = useSearchParams();
  const overview = useRoles(api);
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

  return (
    <AdminRoot toaster={false} className="byline-roles">
      <main className="mx-auto flex w-full min-w-0 max-w-[960px] flex-col gap-5 px-4 py-6 lg:px-6" data-byline-roles-screen="">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="grid gap-1">
            <h1 className="text-2xl font-semibold tracking-tight">Roles</h1>
            <p className="max-w-prose text-sm text-muted-foreground">Newsroom roles decide who reviews which stories. They don’t give anyone access to anything; that stays with each account’s security role.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" variant="outline" nativeButton={false} role="link" render={<ShellLink href={`${admin}/people?view=rollover`} />}>New school year</Button>
            <Button type="button" size="sm" onClick={() => setCreating(true)} disabled={!data}><Plus aria-hidden="true" />New role</Button>
          </div>
        </header>
        <TeamNav current="roles" />

        {overview.isError ? <Alert variant="destructive"><AlertTitle>Roles couldn’t be loaded</AlertTitle><AlertDescription>{problemsOf(overview.error)[0]}</AlertDescription><AlertAction><Button type="button" size="sm" variant="outline" onClick={() => void overview.refetch()}>Try again</Button></AlertAction></Alert> : null}
        {data && !data.year ? <Alert><AlertTitle>No school year is active</AlertTitle><AlertDescription>Roles can be set up, but nobody can be added to one until a school year is active, and reviews can’t be routed.</AlertDescription></Alert> : null}

        {overview.isPending ? <div className="grid gap-2" aria-busy="true">{[0, 1, 2].map((n) => <Skeleton key={n} className="h-16 rounded-lg" />)}</div> : null}
        {data && !roles.length ? <Empty><EmptyHeader><EmptyTitle>No roles yet</EmptyTitle><EmptyDescription>Create the first role to start routing reviews.</EmptyDescription></EmptyHeader></Empty> : null}
        {data && roles.length ? (
          <ItemGroup className="rounded-lg border border-border" aria-label="Newsroom roles">
            {roles.map((role, index) => (
              <div key={role.id}>
                {index ? <ItemSeparator /> : null}
                <RoleItem role={role} year={data.year?.name ?? null} onOpen={() => setOpenId(role.id)} />
              </div>
            ))}
          </ItemGroup>
        ) : null}
        {archivedCount ? <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => setShowArchived((value) => !value)} aria-pressed={showArchived}>{showArchived ? "Hide archived roles" : `Show ${archivedCount} archived`}</Button> : null}
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
    <Item render={<button type="button" onClick={onOpen} aria-label={`${role.name}: ${role.members.length} ${role.members.length === 1 ? "member" : "members"}${year ? ` in ${year}` : ""}. Open`} />} className="w-full cursor-pointer text-left hover:bg-muted/50">
      <ItemContent>
        <ItemTitle>
          {role.name}
          {role.archived ? <Badge variant="outline">Archived</Badge> : null}
          {role.scopeKind !== "none" ? <Badge variant="secondary">{SCOPE_LABELS[role.scopeKind]}</Badge> : null}
        </ItemTitle>
        <ItemDescription>{role.description || "No description."}</ItemDescription>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
          <span>{role.members.length ? <>{names.join(", ")}{more > 0 ? ` and ${more} more` : ""}</> : "Nobody holds this role this year."}</span>
          {covered.slice(0, 4).map((scope) => <Badge key={scope} variant="outline">{scope}</Badge>)}
          {covered.length > 4 ? <span>+{covered.length - 4}</span> : null}
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
  const ids = { name: useId(), description: useId(), waiting: useId(), scope: useId() };
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [waitingLabel, setWaitingLabel] = useState(role?.waitingLabel ?? "");
  const [scopeKind, setScopeKind] = useState<RoleRow["scopeKind"]>(role?.scopeKind ?? "none");
  const [problems, setProblems] = useState<string[]>([]);
  const [member, setMember] = useState<{ existing: RoleMember | null } | null>(null);
  const [removing, setRemoving] = useState<RoleMember | null>(null);
  const hasScoped = role?.members.some((entry) => entry.scopeMode === "scoped") ?? false;
  const changed = role !== null && (name !== role.name || description !== role.description || waitingLabel !== role.waitingLabel || scopeKind !== role.scopeKind);

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
        <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-lg">
          {role ? (
            <>
              <SheetHeader>
                <SheetTitle>{role.name}</SheetTitle>
                <SheetDescription>{role.members.length} {role.members.length === 1 ? "member" : "members"} in {overview.year?.name ?? "no active year"}. Changes apply to reviews routed from now on; reviews already in progress keep the routing they were submitted with.</SheetDescription>
              </SheetHeader>
              <div className="grid gap-6 px-4 pb-4">
                {problems.length ? <Alert variant="destructive"><AlertTitle>{problems.length === 1 ? "That didn’t work" : "Fix these first"}</AlertTitle><AlertDescription>{problems.map((problem) => <span key={problem} className="block">{problem}</span>)}</AlertDescription></Alert> : null}

                <form onSubmit={save} className="grid gap-4">
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor={ids.name}>Name</FieldLabel>
                      <Input id={ids.name} value={name} maxLength={80} onChange={(event) => setName(event.target.value)} required />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor={ids.description}>Description</FieldLabel>
                      <Textarea id={ids.description} value={description} maxLength={400} rows={2} onChange={(event) => setDescription(event.target.value)} />
                    </Field>
                    <FieldSet>
                      <FieldLegend variant="label">What the role is scoped to</FieldLegend>
                      <RadioGroup value={scopeKind} onValueChange={(next) => setScopeKind(next as RoleRow["scopeKind"])} disabled={hasScoped} aria-label="What the role is scoped to">
                        {(["none", "section", "media"] as const).map((kind) => (
                          <Field key={kind} orientation="horizontal">
                            <RadioGroupItem value={kind} id={`${ids.scope}-${kind}`} />
                            <FieldLabel htmlFor={`${ids.scope}-${kind}`} className="font-normal">{SCOPE_LABELS[kind]}</FieldLabel>
                          </Field>
                        ))}
                      </RadioGroup>
                      <FieldDescription>{hasScoped ? "Remove this role’s scoped members to change what it is scoped to." : SCOPE_HELP[scopeKind]}</FieldDescription>
                    </FieldSet>
                    {scopeKind !== "none" ? (
                      <Field>
                        <FieldLabel htmlFor={ids.waiting}>What reporters see while waiting</FieldLabel>
                        <Input id={ids.waiting} value={waitingLabel} maxLength={80} placeholder={scopeKind === "section" ? "{scope} Editor" : "{scope} Desk"} onChange={(event) => setWaitingLabel(event.target.value)} />
                        <FieldDescription>{"{scope}"} becomes the Section or media type: “{(waitingLabel || "{scope} Editor").replace("{scope}", scopeKind === "section" ? "Sports" : "Photo")}”.</FieldDescription>
                      </Field>
                    ) : null}
                  </FieldGroup>
                  <div><Button type="submit" size="sm" disabled={!changed || writes.saveRole.isPending || !name.trim()}>{writes.saveRole.isPending ? <Spinner /> : null}Save role</Button></div>
                </form>

                <FieldSet>
                  <div className="flex items-center justify-between gap-2">
                    <FieldLegend variant="label" className="mb-0">Members{overview.year ? ` · ${overview.year.name}` : ""}</FieldLegend>
                    <Button type="button" size="sm" variant="outline" disabled={role.archived || !overview.year} onClick={() => setMember({ existing: null })}><Plus aria-hidden="true" />Add person</Button>
                  </div>
                  {role.members.length ? (
                    <ItemGroup className="rounded-lg border border-border">
                      {role.members.map((entry, index) => {
                        const badges = scopeBadges(entry, role);
                        return (
                          <div key={entry.id}>
                            {index ? <ItemSeparator /> : null}
                            <Item size="sm">
                              <ItemContent>
                                <ItemTitle>{entry.name}</ItemTitle>
                                <ItemDescription className="flex flex-wrap items-center gap-1">
                                  {entry.scopeMode === "global" ? <Badge variant="outline">{role.scopeKind === "none" ? "Everything" : "Everywhere else"}</Badge> : badges.map((badge) => <Badge key={badge} variant="secondary">{badge}</Badge>)}
                                </ItemDescription>
                              </ItemContent>
                              <ItemActions>
                                <Button type="button" size="xs" variant="ghost" onClick={() => setMember({ existing: entry })} aria-label={`Edit ${entry.name}’s membership`}>Edit</Button>
                                <Button type="button" size="xs" variant="ghost" onClick={() => setRemoving(entry)} aria-label={`Remove ${entry.name} from ${role.name}`}>Remove</Button>
                              </ItemActions>
                            </Item>
                          </div>
                        );
                      })}
                    </ItemGroup>
                  ) : <p className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">Nobody holds {role.name} in {overview.year?.name ?? "this year"}. A review routed here would fail until someone does.</p>}
                </FieldSet>

                <FieldSet>
                  <FieldLegend variant="label">Used by</FieldLegend>
                  {role.usedBy.length ? (
                    <div className="flex flex-wrap gap-1">{role.usedBy.map((workflow) => <Badge key={workflow.id} variant="outline" render={<ShellLink href={`${admin}/review-workflows?workflow=${workflow.id}`} />}>{workflow.name}</Badge>)}</div>
                  ) : <p className="text-sm text-muted-foreground">No review workflow routes to this role.</p>}
                </FieldSet>
              </div>
              <SheetFooter>
                <Button type="button" size="sm" variant="outline" onClick={() => archive(!role.archived)} disabled={writes.saveRole.isPending}>{role.archived ? "Restore role" : "Archive role"}</Button>
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
            <AlertDialogDescription>New reviews won’t route to them for this role. Their past reviews and the earlier years’ membership stay in the record.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
            <Button type="button" variant="destructive" disabled={writes.removeMember.isPending} onClick={() => role && removing && writes.removeMember.mutate({ roleId: role.id, assignmentId: removing.id }, { onSuccess: () => { toast.success(`${removing.name} removed.`); setRemoving(null); }, onError: (error) => { toast.error(problemsOf(error)[0]); setRemoving(null); } })}>Remove</Button>
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
  const ids = { person: useId(), scope: useId(), where: useId() };
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
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{existing ? `${existing.name} in ${role.name}` : `Add someone to ${role.name}`}</DialogTitle>
          <DialogDescription>{role.scopeKind === "none" ? "They’ll be routed reviews for every story this role handles." : "Choose what they cover. Someone with a specific scope is chosen before people who cover everything."}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={ids.person}>Person</FieldLabel>
              <ChoiceCombobox id={ids.person} choices={people} value={userId} onChange={setUserId} placeholder="Search people…" disabled={existing !== null} />
              <FieldDescription>Workload shown here is a hint for deciding. It never stops you assigning anyone.</FieldDescription>
            </Field>
            {role.scopeKind !== "none" ? (
              <FieldSet>
                <FieldLegend variant="label">Covers</FieldLegend>
                <RadioGroup value={mode} onValueChange={(next) => setMode(next as "global" | "scoped")} aria-label="What they cover">
                  <Field orientation="horizontal">
                    <RadioGroupItem value="scoped" id={`${ids.scope}-scoped`} />
                    <FieldLabel htmlFor={`${ids.scope}-scoped`} className="font-normal">{role.scopeKind === "section" ? "Specific Sections" : "Specific media types"}</FieldLabel>
                  </Field>
                  <Field orientation="horizontal">
                    <RadioGroupItem value="global" id={`${ids.scope}-global`} />
                    <FieldLabel htmlFor={`${ids.scope}-global`} className="font-normal">Everything else</FieldLabel>
                  </Field>
                </RadioGroup>
                {mode === "scoped" ? (
                  <Field>
                    <FieldLabel htmlFor={ids.where}>{role.scopeKind === "section" ? "Sections" : "Media types"}</FieldLabel>
                    {role.scopeKind === "section"
                      ? <ChoicesCombobox id={ids.where} choices={sectionChoices} value={sections} onChange={setSections} placeholder="Choose Sections…" />
                      : <ChoicesCombobox id={ids.where} choices={mediaChoices} value={media} onChange={setMedia} placeholder="Choose media types…" />}
                  </Field>
                ) : <FieldDescription>They’re the fallback for anything nobody with a specific scope covers.</FieldDescription>}
              </FieldSet>
            ) : null}
            {problems.length ? <FieldError errors={problems.map((message) => ({ message }))} /> : null}
          </FieldGroup>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" disabled={writes.saveMember.isPending} />}>Cancel</DialogClose>
            <Button type="submit" disabled={writes.saveMember.isPending || !userId}>{writes.saveMember.isPending ? <Spinner /> : null}{existing ? "Save" : "Add to role"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* --------------------------------------------------------------- new role */

function NewRoleDialog({ api, open, onOpenChange, onCreated }: { api: string; open: boolean; onOpenChange: (open: boolean) => void; onCreated: (id: number) => void }) {
  const writes = useRoleWrites(api);
  const ids = { name: useId(), description: useId(), scope: useId() };
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
      <DialogContent>
        <DialogHeader><DialogTitle>New role</DialogTitle><DialogDescription>A role is a job in the newsroom that reviews are routed to, like Copy Desk or Sports Editor.</DialogDescription></DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <FieldGroup>
            <Field><FieldLabel htmlFor={ids.name}>Name</FieldLabel><Input id={ids.name} value={name} maxLength={80} onChange={(event) => setName(event.target.value)} required autoFocus /></Field>
            <Field><FieldLabel htmlFor={ids.description}>Description</FieldLabel><Textarea id={ids.description} value={description} maxLength={400} rows={2} onChange={(event) => setDescription(event.target.value)} /></Field>
            <FieldSet>
              <FieldLegend variant="label">What the role is scoped to</FieldLegend>
              <RadioGroup value={scopeKind} onValueChange={(next) => setScopeKind(next as RoleRow["scopeKind"])} aria-label="What the role is scoped to">
                {(["none", "section", "media"] as const).map((kind) => (
                  <Field key={kind} orientation="horizontal"><RadioGroupItem value={kind} id={`${ids.scope}-${kind}`} /><FieldLabel htmlFor={`${ids.scope}-${kind}`} className="font-normal">{SCOPE_LABELS[kind]}</FieldLabel></Field>
                ))}
              </RadioGroup>
              <FieldDescription>{SCOPE_HELP[scopeKind]}</FieldDescription>
            </FieldSet>
            {problems.length ? <FieldError errors={problems.map((message) => ({ message }))} /> : null}
          </FieldGroup>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" disabled={writes.saveRole.isPending} />}>Cancel</DialogClose>
            <Button type="submit" disabled={writes.saveRole.isPending || !name.trim()}>{writes.saveRole.isPending ? <Spinner /> : null}Create role</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
