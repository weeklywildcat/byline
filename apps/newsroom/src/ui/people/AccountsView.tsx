"use client";

import { Badge } from "@byline/newsroom-ui/ui/badge";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Checkbox } from "@byline/newsroom-ui/ui/checkbox";
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList, ComboboxTrigger } from "@byline/newsroom-ui/ui/combobox";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@byline/newsroom-ui/ui/dialog";
import { Input } from "@byline/newsroom-ui/ui/input";
import { Item, ItemContent, ItemGroup, ItemTitle } from "@byline/newsroom-ui/ui/item";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@byline/newsroom-ui/ui/select";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useId, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { ROLE_OPTIONS, type Role } from "../../domain/vocabulary";
import type { AccountList, AccountRow } from "../../newsroom/accounts";
import { createBylineRequest } from "../home/payload-fetchers";
import { useNewsroomRoutes } from "../shell/account";
import { useOptions, type Option } from "../story/RelationPickers";

type Edit = { id?: number; name: string; email: string; role: Role; enabled: boolean; linkedPerson: string | number | null; password: string; expected?: string };
const newAccount = (): Edit => ({ name: "", email: "", role: "staff", enabled: true, linkedPerson: null, password: "" });
const roleLabel = (role: Role) => ROLE_OPTIONS.find((item) => item.value === role)?.label ?? role;

export function AccountsView() {
  const routes = useNewsroomRoutes();
  const params = useSearchParams();
  const query = params?.get("q") ?? "";
  const page = Math.max(1, Number(params?.get("page")) || 1);
  const request = createBylineRequest(routes.api);
  const cache = useQueryClient();
  const accounts = useQuery({ queryKey: ["byline", "accounts", query, page], queryFn: () => request<AccountList>(`/accounts?${new URLSearchParams({ search: query, page: String(page) })}`) });
  const people = useOptions(routes.api, "people", "name");
  const [editing, setEditing] = useState<Edit | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const trigger = useRef<HTMLElement | null>(null);
  const prefix = useId();
  const selected = people.find((person) => String(person.id) === String(editing?.linkedPerson)) ?? null;

  function move(search: string, index: number) {
    const next = new URLSearchParams({ tab: "access" });
    if (search) next.set("q", search);
    if (index !== 1) next.set("page", String(index));
    window.history.pushState(null, "", `${routes.admin}/people?${next}`);
  }

  function open(account?: AccountRow) {
    trigger.current = document.activeElement as HTMLElement | null;
    setError("");
    setEditing(account ? { id: account.id, name: account.name, email: account.email, role: account.role, enabled: account.enabled, linkedPerson: account.linkedPerson, password: "", expected: account.revision } : newAccount());
  }
  const change = (input: Partial<Edit>) => setEditing((current) => current && { ...current, ...input });
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editing || busy) return;
    setBusy(true); setError("");
    try {
      const { id, ...data } = editing;
      await request(id ? `/accounts/${id}` : "/accounts", id ? "PATCH" : "POST", data);
      void cache.invalidateQueries({ queryKey: ["byline", "accounts"] });
      toast.success(id ? "Account updated." : "Account created.");
      setEditing(null);
    } catch (error) {
      setError((error as { message?: string }).message ?? "The account could not be saved.");
      void accounts.refetch();
    } finally {
      setBusy(false);
    }
  }

  return <section className="grid gap-3" aria-label="Newsroom access">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div><h1 className="text-2xl font-semibold">Newsroom access</h1><p className="text-sm text-muted-foreground">Sign-in accounts are separate from public bylines.</p></div>
      <Button type="button" size="sm" onClick={() => open()}>Add account</Button>
    </div>
    <form key={query} className="flex max-w-lg gap-2" onSubmit={(event) => { event.preventDefault(); move(String(new FormData(event.currentTarget).get("search") ?? "").trim(), 1); }}>
      <Input aria-label="Search accounts" name="search" placeholder="Search name or email" defaultValue={query} />
      <Button type="submit" size="sm" variant="outline">Search</Button>
    </form>
    {accounts.isPending ? <p role="status">Loading accounts…</p> : accounts.isError ? <p role="alert">Accounts could not be loaded.</p> : accounts.data.accounts.length ? <ItemGroup className="gap-2">
      {accounts.data.accounts.map((account) => <Item key={account.id} size="sm" variant="outline">
        <ItemContent className="min-w-0 [overflow-wrap:anywhere]">
          <ItemTitle>{account.name}</ItemTitle>
          <p className="text-xs text-muted-foreground">{account.email}</p>
          <p className="text-xs text-muted-foreground">{people.find((person) => person.id === account.linkedPerson)?.label ?? "No public Person linked"} · {account.googleConnected ? "Google connected" : "Google not connected"}</p>
        </ItemContent>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{roleLabel(account.role)}</Badge><Badge variant={account.enabled ? "outline" : "secondary"}>{account.enabled ? "Enabled" : "Disabled"}</Badge>
          <Button type="button" variant="outline" size="sm" aria-label={`Edit account for ${account.name}`} onClick={() => open(account)}>Edit</Button>
        </div>
      </Item>)}
    </ItemGroup> : <p className="text-sm text-muted-foreground">{query ? "No matching accounts." : "Add an account to give someone newsroom access."}</p>}
    {page > 1 || accounts.data?.hasNextPage ? <div className="flex gap-2">
      <Button type="button" variant="outline" size="sm" disabled={page === 1} onClick={() => move(query, page - 1)}>Previous</Button>
      <Button type="button" variant="outline" size="sm" disabled={!accounts.data?.hasNextPage} onClick={() => move(query, page + 1)}>Next</Button>
    </div> : null}
    <Dialog open={editing !== null} onOpenChange={(open) => { if (!open && !busy) setEditing(null); }}>
      <DialogContent finalFocus={() => trigger.current?.isConnected ? trigger.current : true} className="max-h-[calc(100dvh-2rem)] overflow-auto">
        <DialogHeader>
          <DialogTitle>{editing?.id ? "Edit account" : "Add account"}</DialogTitle>
          <DialogDescription>{editing?.id ? "Change this person's sign-in access. Their public bylines stay intact." : "Use the person's Google Workspace address. If Google sign-in is configured, they can sign in once enabled. Byline does not send an invitation."}</DialogDescription>
        </DialogHeader>
        {editing ? <form className="grid gap-3" onSubmit={save}>
          <label htmlFor={`${prefix}-name`}>Name</label><Input id={`${prefix}-name`} maxLength={120} required value={editing.name} onChange={(e) => change({ name: e.target.value })} />
          <label htmlFor={`${prefix}-email`}>Email</label><Input id={`${prefix}-email`} type="email" required value={editing.email} onChange={(e) => change({ email: e.target.value })} />
          <Select items={ROLE_OPTIONS} value={editing.role} onValueChange={(role) => { if (role) change({ role }); }}>
            <SelectTrigger aria-label="Account role"><SelectValue /></SelectTrigger>
            <SelectContent>{ROLE_OPTIONS.map(({ value, label }) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
          </Select>
          <label className="flex items-center gap-2"><Checkbox checked={editing.enabled} onCheckedChange={(enabled) => change({ enabled })} /> Enable sign-in</label>
          <Combobox items={people} value={selected} itemToStringLabel={(person: Option) => person.label} isItemEqualToValue={(a: Option, b: Option) => String(a.id) === String(b.id)} onValueChange={(person: Option | null) => change({ linkedPerson: person?.id ?? null })}>
            <ComboboxTrigger render={<Button type="button" variant="outline" aria-label="Linked public Person" />}><span className="truncate">{selected?.label ?? "Link a public Person (optional)"}</span></ComboboxTrigger>
            <ComboboxContent><ComboboxInput showTrigger={false} aria-label="Find a public Person" placeholder="Find a public Person…" /><ComboboxEmpty>No matching People.</ComboboxEmpty><ComboboxList>{(person: Option) => <ComboboxItem key={person.id} value={person}>{person.label}</ComboboxItem>}</ComboboxList></ComboboxContent>
          </Combobox>
          {editing.linkedPerson ? <Button type="button" variant="ghost" size="sm" className="w-fit" onClick={() => change({ linkedPerson: null })}>Unlink Person</Button> : null}
          <label htmlFor={`${prefix}-password`}>{editing.id ? "New local password (optional)" : "Local password (optional)"}</label>
          <Input id={`${prefix}-password`} type="password" autoComplete="new-password" minLength={12} maxLength={128} value={editing.password} onChange={(e) => change({ password: e.target.value })} />
          <p className="text-xs text-muted-foreground">For email and password sign-in. {editing.id ? "Leave blank to keep the existing credential." : "Leave blank if the account will use Google."}</p>
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter><DialogClose render={<Button type="button" variant="outline" disabled={busy} />}>Cancel</DialogClose><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save account"}</Button></DialogFooter>
        </form> : null}
      </DialogContent>
    </Dialog>
  </section>;
}
