"use client";

import { peopleKeys } from "@byline/newsroom-screens/people/people-query";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@byline/newsroom-ui/ui/dialog";
import { Input } from "@byline/newsroom-ui/ui/input";
import { useQueryClient } from "@tanstack/react-query";
import { useId, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { createPayloadPeopleApi } from "../people/payload-people-api";
import { postJson } from "./api";
import { relationshipOptionsKey } from "./RelationPickers";
import type { StoryScreenContext } from "./StoryScreen";

export function QuickCreateRelation({ context, kind, onCreated }: { context: StoryScreenContext; kind: "guest" | "topic"; onCreated: (id: number) => void }) {
  const guest = kind === "guest";
  const workspace = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const field = useId();
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy || !name.trim()) return;
    setBusy(true); setError("");
    try {
      const id = guest
        ? Number((await createPayloadPeopleApi(context.api).create({ type: "guest", name: name.trim(), newsroomRole: role.trim() })).person.id)
        : (await postJson<{ doc: { id: number } }>(context.api, "/topics", { name: name.trim() })).doc.id;
      await workspace.invalidateQueries({ queryKey: relationshipOptionsKey(guest ? "people" : "topics") });
      if (guest) void context.shellQueries.invalidateQueries({ queryKey: peopleKeys.all });
      onCreated(id);
      toast.success(guest ? "Guest contributor added to the byline." : "Topic added to the story.");
      setOpen(false);
    } catch (error) {
      setError((error as Error).message ?? "Byline could not create this item.");
    } finally {
      setBusy(false);
    }
  }
  return <Dialog open={open} onOpenChange={(next) => {
    if (busy) return;
    if (next) { setName(""); setRole(""); setError(""); }
    setOpen(next);
  }}>
    <DialogTrigger render={<Button type="button" size="sm" variant="ghost" />}>{guest ? "Create guest contributor" : "Create topic"}</DialogTrigger>
    <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-auto">
      <DialogHeader>
        <DialogTitle>{guest ? "Create guest contributor" : "Create topic"}</DialogTitle>
        <DialogDescription>{guest ? "This adds a public byline identity without creating a sign-in account." : "The new topic will be available to the whole newsroom."}</DialogDescription>
      </DialogHeader>
      <form className="grid gap-3" onSubmit={save}>
        <div className="grid gap-1"><label htmlFor={field}>{guest ? "Byline name" : "Topic name"}</label><Input id={field} required maxLength={guest ? 120 : 80} value={name} onChange={(event) => setName(event.target.value)} /></div>
        {guest ? <div className="grid gap-1"><label htmlFor={`${field}-role`}>Byline role (optional)</label><Input id={`${field}-role`} maxLength={80} value={role} onChange={(event) => setRole(event.target.value)} /></div> : null}
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter><DialogClose render={<Button type="button" variant="outline" disabled={busy} />}>Cancel</DialogClose><Button type="submit" disabled={busy || !name.trim()}>{busy ? "Creating…" : "Create and add"}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
