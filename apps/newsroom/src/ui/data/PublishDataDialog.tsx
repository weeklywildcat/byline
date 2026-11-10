"use client";

import { Alert, AlertDescription, AlertTitle } from "@byline/newsroom-ui/ui/alert";
import { Badge } from "@byline/newsroom-ui/ui/badge";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@byline/newsroom-ui/ui/dialog";
import { Spinner } from "@byline/newsroom-ui/ui/spinner";
import { Globe, Lock } from "lucide-react";
import { useState } from "react";
import type { DatasetDetail } from "../../data/server";
import { formatWhen } from "./status";

/**
 * Publishing data, said plainly before it happens: which rows and fields
 * readers will get, what stays in the newsroom, and which public projects
 * update with the next site build. The server re-checks everything and
 * refuses a release that is incomplete or would break a public project.
 */
export function PublishDataDialog({ open, onOpenChange, detail, included, excluded, onPublish }: { open: boolean; onOpenChange: (open: boolean) => void; detail: DatasetDetail; included: number; excluded: number; onPublish: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<{ message: string; issues: string[] } | null>(null);
  const fields = detail.dataset.schema.fields;
  const publicFields = fields.filter((field) => field.visibility === "public");
  const privateFields = fields.filter((field) => field.visibility === "private");
  const liveProjects = detail.usedBy.filter((project) => project.publication !== "draft");
  const publish = async () => {
    setBusy(true);
    setProblem(null);
    try {
      await onPublish();
      onOpenChange(false);
    } catch (error) {
      const data = (error as { data?: { issues?: unknown } }).data;
      setProblem({ message: (error as Error).message, issues: Array.isArray(data?.issues) ? (data.issues as string[]).slice(0, 12) : [] });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busy) { setProblem(null); onOpenChange(next); } }}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Publish {detail.dataset.title}?</DialogTitle>
          <DialogDescription>
            This makes a permanent public copy of the data as it is now. Later edits stay in the newsroom until you publish again.
            {detail.release ? ` The current published copy is from ${formatWhen(detail.release.releasedAt, detail.timeZone)}.` : ""}
          </DialogDescription>
        </DialogHeader>
        <dl className="grid gap-3 text-sm">
          <div className="flex items-baseline justify-between gap-4 border-b pb-3">
            <dt className="text-muted-foreground">Rows</dt>
            <dd className="text-right"><span className="font-medium tabular-nums">{included.toLocaleString("en-US")}</span>{excluded ? <span className="text-muted-foreground"> · {excluded} kept out</span> : null}</dd>
          </div>
          <div className="grid gap-1.5 border-b pb-3">
            <dt className="flex items-center gap-1.5 text-muted-foreground"><Globe className="size-3.5" />Readers get</dt>
            <dd className="flex flex-wrap gap-1.5">{publicFields.length ? publicFields.map((field) => <Badge key={field.key} variant="outline" className="font-normal">{field.label}</Badge>) : <span className="text-destructive">No public fields yet.</span>}</dd>
          </div>
          {privateFields.length ? (
            <div className="grid gap-1.5 border-b pb-3">
              <dt className="flex items-center gap-1.5 text-muted-foreground"><Lock className="size-3.5" />Stays in the newsroom</dt>
              <dd className="flex flex-wrap gap-1.5">{privateFields.map((field) => <Badge key={field.key} variant="secondary" className="font-normal">{field.label}</Badge>)}</dd>
            </div>
          ) : null}
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-muted-foreground">Public projects</dt>
            <dd className="text-right">{liveProjects.length ? liveProjects.map((project) => project.title).join(", ") : <span className="text-muted-foreground">None yet</span>}</dd>
          </div>
        </dl>
        {liveProjects.length ? <p className="text-sm text-muted-foreground">Those pages update with the next build of the public site.</p> : null}
        {problem ? (
          <Alert variant="destructive">
            <AlertTitle>Not published</AlertTitle>
            <AlertDescription>
              <p>{problem.message}</p>
              {problem.issues.length ? <ul className="mt-1 list-disc pl-4">{problem.issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul> : null}
            </AlertDescription>
          </Alert>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button type="button" onClick={() => void publish()} disabled={busy || !publicFields.length || !included}>{busy ? <Spinner data-icon="inline-start" /> : null}Publish data</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
