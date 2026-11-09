"use client";

import { Alert, AlertDescription, AlertTitle } from "@byline/newsroom-ui/ui/alert";
import { Button } from "@byline/newsroom-ui/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@byline/newsroom-ui/ui/toggle-group";
import { LIVE_MODE_OPTIONS, type LiveMode } from "../../domain/live-coverage";
import { Property } from "../story/parts";
import { useLiveCoverage } from "./LiveCoverageProvider";

/**
 * Story mode: `[ Standard ] [ Live ]`, labelled, never an empty selection. Live is a mode of this Story, not a
 * second Story or a content type. It is one of the Story's properties, a row beside Section and Story type,
 * not a bar of its own above the headline. Only editor-level people can change it (the server decides too); staff see
 * the real state, disabled, only when the Story is in Live mode.
 */
export function StoryModeControl() {
  const live = useLiveCoverage();
  const desk = live?.desk;
  // A failed load must not look like "this Story has no live controls": say so, and offer to try again.
  if (live && !desk && live.error) {
    return (
      <Alert variant="destructive" className="my-1" role="alert" data-live-error="">
        <AlertTitle>Live coverage controls couldn't load</AlertTitle>
        <AlertDescription>
          <p>{live.error.message || "Byline couldn't reach the live desk."}</p>
          <Button type="button" variant="outline" size="sm" className="mt-2 max-sm:min-h-11" onClick={live.retry}>Try again</Button>
        </AlertDescription>
      </Alert>
    );
  }
  if (!live || !desk) return null;
  const canChange = desk.canControl && !live.readOnly;
  if (!canChange && desk.mode === "standard") return null;
  return (
    <Property label="Story mode" labelId="story-mode-label">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1" data-story-mode={desk.mode}>
        <ToggleGroup
          aria-labelledby="story-mode-label"
          variant="outline"
          size="sm"
          spacing={0}
          value={[desk.mode]}
          disabled={!canChange || live.busy}
          onValueChange={(next: string[]) => {
            const chosen = next[0] as LiveMode | undefined;
            // A group is never empty: pressing the selected mode again does nothing.
            if (chosen) live.setMode(chosen);
          }}
        >
          {LIVE_MODE_OPTIONS.map((option) => <ToggleGroupItem key={option.value} value={option.value} className="max-sm:min-h-11 max-sm:px-4">{option.label}</ToggleGroupItem>)}
        </ToggleGroup>
        <p className="text-xs text-muted-foreground">
          {desk.mode === "live"
            ? canChange ? "The article plus a live timeline readers can follow." : "Only editors can change the story mode."
            : desk.updates.length ? "A normal article. Earlier live updates are kept." : "A normal article. Choose Live to add timestamped updates."}
        </p>
      </div>
    </Property>
  );
}
