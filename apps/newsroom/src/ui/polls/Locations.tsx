"use client";

import { InlineAlert } from "@byline/newsroom-ui/components/inline-alert";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@byline/newsroom-ui/ui/empty";
import { Input } from "@byline/newsroom-ui/ui/input";
import { Switch } from "@byline/newsroom-ui/ui/switch";
import { Field, FieldLabel } from "@byline/newsroom-ui/ui/field";
import { Item, ItemActions, ItemContent, ItemGroup, ItemTitle } from "@byline/newsroom-ui/ui/item";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPin, Plus } from "lucide-react";
import { useState } from "react";
import { useNewsroomRoutes } from "../shell/account";
import { fetchOverview, pollKeys, saveLocation } from "./api";
import { ListSkeleton, PageHeader, PollsBreadcrumb } from "./PollStudio";

/** Polling locations (editors): the places an interviewer chooses from. Retired places stay on old sessions. */
export function Locations() {
  const { api } = useNewsroomRoutes();
  const queries = useQueryClient();
  const overview = useQuery({ queryKey: pollKeys.overview(), queryFn: () => fetchOverview(api) });
  const [name, setName] = useState("");
  const save = useMutation({
    mutationFn: (input: { id: number | null; name?: string; active?: boolean }) => saveLocation(api, input.id, input),
    onSuccess: () => { setName(""); void queries.invalidateQueries({ queryKey: pollKeys.all }); }
  });
  const data = overview.data;
  return (
    <main className="mx-auto flex w-full min-w-0 max-w-[720px] flex-col gap-4 px-4 py-5 lg:px-6">
      <PollsBreadcrumb trail={[{ label: "Locations" }]} />
      <PageHeader level="detail" title="Polling locations" description="Interviewers choose from these when they start a session. A location that's off stays on past sessions." />
      {save.isError ? <InlineAlert title="The location wasn't saved">{(save.error as Error).message}</InlineAlert> : null}
      {data && !data.me.canManage ? <p className="text-sm text-muted-foreground">Only editors change locations.</p> : null}
      {data?.me.canManage ? (
        <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); if (name.trim()) save.mutate({ id: null, name }); }}>
          <Input aria-label="New location" placeholder="e.g. Library entrance" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} />
          <Button type="submit" disabled={!name.trim() || save.isPending}><Plus data-icon="inline-start" />Add</Button>
        </form>
      ) : null}
      {!data ? <ListSkeleton /> : (
        data.locations.length ? (
          <ItemGroup className="gap-0 rounded-lg border">
            {data.locations.map((location, index) => (
              <Item key={location.id} className={index ? "rounded-none border-t-border" : "rounded-none"}>
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
        ) : (
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon"><MapPin /></EmptyMedia>
              <EmptyTitle>No locations yet</EmptyTitle>
              <EmptyDescription>Without a list, interviewers type where they are.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )
      )}
    </main>
  );
}
