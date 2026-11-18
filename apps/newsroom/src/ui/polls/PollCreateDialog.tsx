"use client";

import { ChoiceCards } from "@byline/newsroom-ui/components/choice-cards";
import { TextField } from "@byline/newsroom-ui/components/form-fields";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@byline/newsroom-ui/ui/dialog";
import { FieldError, FieldGroup } from "@byline/newsroom-ui/ui/field";
import { Spinner } from "@byline/newsroom-ui/ui/spinner";
import { useState } from "react";
import { postJson } from "../story/api";

type Start = "spreadsheet" | "blank" | "example";

/**
 * The global Create menu's "Poll" (editors). Small on purpose: it only decides
 * how the poll starts, then hands over to Poll Studio, where the import flow
 * and the editor live. It doesn't load Poll Studio or the survey engine.
 */
export function PollCreateDialog({ api, admin, onClose, navigate }: { api: string; admin: string; onClose: () => void; navigate: (href: string) => void }) {
  const [start, setStart] = useState<Start>("spreadsheet");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    if (start === "spreadsheet") { onClose(); navigate(`${admin}/polls?view=import`); return; }
    setBusy(true);
    setError(null);
    try {
      const { id } = await postJson<{ id: number }>(api, "/byline/polls/surveys", start === "example" ? { example: true } : { title: title.trim() || "Untitled poll" });
      onClose();
      navigate(`${admin}/polls?poll=${id}${start === "blank" ? "&tab=build" : ""}`);
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={(event) => { event.preventDefault(); void submit(); }} className="contents">
          <DialogHeader>
            <DialogTitle>New poll</DialogTitle>
            <DialogDescription>Students answer it on a kiosk iPad or a public link. Nothing is public until you publish it.</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <ChoiceCards label="How to start" value={start} onChange={setStart} options={[
              { value: "spreadsheet", title: "Import a spreadsheet", description: "An .xlsx workbook in the XLSForm format. An AI assistant can write one from the guide." },
              { value: "blank", title: "Build it here", description: "Start with an empty poll and add questions in Poll Studio." },
              { value: "example", title: "Start from the example", description: "AI at Ninety Six High School, with its branching questions." }
            ]} />
            {start === "blank" ? <TextField label="Title" value={title} onChange={setTitle} maxLength={200} autoFocus /> : null}
            {error ? <FieldError>{error}</FieldError> : null}
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? <Spinner /> : null}{start === "spreadsheet" ? "Choose a file" : "Create poll"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
