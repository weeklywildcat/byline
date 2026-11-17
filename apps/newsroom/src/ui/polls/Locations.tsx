"use client";

import { InlineAlert } from "@byline/newsroom-ui/components/inline-alert";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Input } from "@byline/newsroom-ui/ui/input";
import { Switch } from "@byline/newsroom-ui/ui/switch";
import { Field, FieldLabel } from "@byline/newsroom-ui/ui/field";
import { Item, ItemActions, ItemContent, ItemGroup, ItemTitle } from "@byline/newsroom-ui/ui/item";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus } from "lucide-react";
import { useState } from "react";
import { useNewsroomRoutes } from "../shell/account";
import { fetchOverview, pollKeys, saveLocation } from "./api";
import { ListSkeleton, PageHeader, usePollsNavigation } from "./PollStudio";

/** Polling locations (editors): the places an interviewer chooses from. Retired places stay on old sessions. */
export function Locations() {
  const { api } = useNewsroomRoutes();
  const go = usePollsNavigation();
  const queries = useQueryClient();
  const overview = useQuery({ queryKey: pollKeys.overview(), queryFn: () => fetchOverview(api) });
  const [name, setName] = useState("");
  const save = useMutation({
    mutationFn: (input: { id: number | null; name?: string; active?: boolean }) => saveLocation(api, input.id, input),
    onSuccess: () => { setName(""); void queries.invalidateQueries({ queryKey: pollKeys.all }); }
  });
  const data = overview.data;
  return (
    <main className="mx-auto flex w-full min-w-0 max-w-[720px] flex-col gap-6 px-4 py-6 lg:px-6">
      <PageHeader back={<Button type="button" variant="ghost" className="-ml-3 self-start" onClick={() => go({})}><ArrowLeft data-icon="inline-start" />Polls</Button>} title="Polling locations" description="Interviewers pick from this list when they start a session. Turning one off keeps it on past sessions." />
      {save.isError ? <InlineAlert title="The location wasn't saved">{(save.error as Error).message}</InlineAlert> : null}
      {data && !data.me.canManage ? <p className="text-muted-foreground">Only editors change locations.</p> : null}
      {data?.me.canManage ? (
        <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); if (name.trim()) save.mutate({ id: null, name }); }}>
          <Input aria-label="New location" placeholder="e.g. Library entrance" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} />
          <Button type="submit" disabled={!name.trim() || save.isPending}><Plus data-icon="inline-start" />Add</Button>
        </form>
      ) : null}
      {!data ? <ListSkeleton /> : (
        data.locations.length ? (
          <ItemGroup className="rounded-lg border">
            {data.locations.map((location) => (
              <Item key={location.id}>
                <ItemContent><ItemTitle>{location.name}</ItemTitle></ItemContent>
                <ItemActions>
                  <Field orientation="horizontal">
                    <FieldLabel htmlFor={`location-${location.id}`} className="font-normal text-muted-foreground">{location.active ? "In use" : "Off"}</FieldLabel>
                    <Switch id={`location-${location.id}`} checked={location.active} disabled={!data.me.canManage || save.isPending} onCheckedChange={(active) => save.mutate({ id: location.id, active })} aria-label={`${location.name} in use`} />
                  </Field>
                </ItemActions>
              </Item>
            ))}
          </ItemGroup>
        ) : <p className="text-sm text-muted-foreground">No locations yet.</p>
      )}
    </main>
  );
}
