"use client";

import { InlineAlert } from "@byline/newsroom-ui/components/inline-alert";
import { Button, buttonVariants } from "@byline/newsroom-ui/ui/button";
import { TextField } from "@byline/newsroom-ui/components/form-fields";
import { Spinner } from "@byline/newsroom-ui/ui/spinner";
import { cn } from "@byline/newsroom-ui/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check, FileSpreadsheet, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { isAnswerable } from "../../polls/engine/types";
import { hasErrors } from "../../polls/engine/xlsform";
import { useNewsroomRoutes } from "../shell/account";
import { createSurvey, fetchSurvey, pollKeys, publishSurvey, updateSurvey, uploadWorkbook, type ImportPreview } from "./api";
import { PageHeader, TemplatesMenu, usePollsNavigation } from "./PollStudio";
import { IssueList, PreviewPanel, QuestionMap } from "./Review";

/**
 * Spreadsheet import (docs/wildcat-polls.md#import): Upload → Validate →
 * Review → Preview → Publish. Nothing is saved until the last step; the
 * preview is the real respondent screen running the real logic.
 */

const STEPS = ["Upload", "Validate", "Review", "Preview", "Publish"] as const;
type Step = (typeof STEPS)[number];

export function ImportFlow({ pollId }: { pollId: number | null }) {
  const { api } = useNewsroomRoutes();
  const go = usePollsNavigation();
  const queries = useQueryClient();
  const existing = useQuery({ queryKey: pollKeys.survey(pollId ?? 0), queryFn: () => fetchSurvey(api, pollId!), enabled: Boolean(pollId) });
  const [step, setStep] = useState<Step>("Upload");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [note, setNote] = useState("");
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const upload = useMutation({
    mutationFn: (file: File) => uploadWorkbook(api, file),
    onSuccess: (result) => { setPreview(result); setStep("Validate"); }
  });
  const blocked = preview ? hasErrors(preview.issues) : true;
  const finish = useMutation({
    mutationFn: async (publish: boolean) => {
      if (!preview) throw new Error("Upload a workbook first.");
      let id = pollId;
      if (!id) {
        id = (await createSurvey(api, { definition: preview.definition, sourceFilename: preview.source.filename })).id;
      } else {
        const current = existing.data ?? await fetchSurvey(api, id);
        await updateSurvey(api, id, { draft: preview.definition, draftRevision: current.survey.draftRevision ?? 0, draftSource: preview.source.filename });
      }
      if (publish) {
        const fresh = await fetchSurvey(api, id);
        await publishSurvey(api, id, { draftRevision: fresh.survey.draftRevision ?? 0, note: note.trim() || `Imported from ${preview.source.filename}` });
      }
      return id;
    },
    onSuccess: async (id, publish) => {
      await queries.invalidateQueries({ queryKey: pollKeys.all });
      go({ poll: id, tab: publish ? "overview" : "questions" });
    }
  });
  const pick = (file: File | undefined) => { if (file) upload.mutate(file); };
  const index = STEPS.indexOf(step);
  const errors = preview?.issues.filter((issue) => issue.severity === "error").length ?? 0;
  const warnings = preview?.issues.filter((issue) => issue.severity === "warning").length ?? 0;

  return (
    <main className="mx-auto flex w-full min-w-0 max-w-[1240px] flex-col gap-6 px-4 py-6 lg:px-6" data-polls-import="">
      <PageHeader
        back={<Button type="button" variant="ghost" className="-ml-3 self-start" onClick={() => go(pollId ? { poll: pollId } : {})}><ArrowLeft data-icon="inline-start" />{pollId ? existing.data?.survey.title ?? "Poll" : "Polls"}</Button>}
        title={pollId ? "Import a new version" : "Import a spreadsheet"}
        description={pollId ? "The workbook replaces this poll's draft. Published versions, and every response to them, stay exactly as they are." : "An XLSForm-style workbook with survey, choices and settings sheets. Nothing is saved until you choose to."}
        actions={<TemplatesMenu api={api} />}
      />

      <ol className="flex flex-wrap items-center gap-x-1 gap-y-2 text-sm" aria-label="Import steps">
        {STEPS.map((name, i) => (
          <li key={name} className="flex items-center gap-1">
            <span className={cn("inline-flex h-8 items-center gap-2 rounded-full px-3", i === index ? "bg-foreground text-background" : i < index ? "text-foreground" : "text-muted-foreground")} aria-current={i === index ? "step" : undefined}>
              <span className="tabular-nums">{i < index ? <Check className="size-3.5" aria-hidden="true" /> : i + 1}</span>{name}
            </span>
            {i < STEPS.length - 1 ? <span className="h-px w-4 bg-border" aria-hidden="true" /> : null}
          </li>
        ))}
      </ol>

      {step === "Upload" ? (
        <section className="flex flex-col gap-4">
          <label
            className={cn("flex min-h-64 cursor-pointer flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors", dragging ? "border-(--poll-accent) bg-(--poll-accent-soft)" : "border-border hover:border-foreground/40")}
            onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => { event.preventDefault(); setDragging(false); pick(event.dataTransfer.files[0]); }}
          >
            {upload.isPending ? <Spinner className="size-6" /> : <FileSpreadsheet className="size-8 text-muted-foreground" aria-hidden="true" />}
            <span className="font-(family-name:--poll-serif) text-2xl font-medium">{upload.isPending ? "Reading the workbook…" : "Choose an .xlsx workbook"}</span>
            <span className="max-w-md text-sm text-muted-foreground">Or drop it here. Byline reads the survey, choices and settings sheets and runs nothing in the file.</span>
            <span className={buttonVariants({ size: "lg" })}><Upload data-icon="inline-start" aria-hidden="true" />Choose file</span>
            <input ref={input} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" onChange={(event) => { pick(event.target.files?.[0]); event.target.value = ""; }} data-polls-upload="" />
          </label>
          {upload.isError ? <InlineAlert title="That workbook couldn't be read">{(upload.error as Error).message}</InlineAlert> : null}
        </section>
      ) : null}

      {preview && step === "Validate" ? (
        <section className="flex flex-col gap-4">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <h2 className="font-(family-name:--poll-serif) text-2xl font-medium">{preview.definition.settings.title}</h2>
            <p className="text-sm text-muted-foreground">{preview.source.filename} · {preview.definition.questions.filter(isAnswerable).length} questions · {preview.definition.lists.length} choice lists</p>
          </div>
          <p className={cn("text-base font-medium", errors ? "text-destructive" : "text-foreground")} role="status">
            {errors ? `${errors} error${errors === 1 ? "" : "s"} to fix in the workbook before this can be published.` : "No errors."}{warnings ? ` ${warnings} warning${warnings === 1 ? "" : "s"}.` : ""}
          </p>
          <IssueList issues={preview.issues} />
          <Nav back={() => setStep("Upload")} backLabel="Upload a different file" next={() => setStep("Review")} nextLabel="Review questions" nextDisabled={false} />
        </section>
      ) : null}

      {preview && step === "Review" ? (
        <section className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">Check the order, the wording and every condition, written out in words.</p>
          <QuestionMap definition={preview.definition} issues={preview.issues} />
          <Nav back={() => setStep("Validate")} next={() => setStep("Preview")} nextLabel="Try it" />
        </section>
      ) : null}

      {preview && step === "Preview" ? (
        <section className="flex flex-col gap-4">
          <PreviewPanel definition={preview.definition} />
          <Nav back={() => setStep("Review")} next={() => setStep("Publish")} nextLabel="Continue" />
        </section>
      ) : null}

      {preview && step === "Publish" ? (
        <section className="flex max-w-2xl flex-col gap-5">
          {blocked ? <InlineAlert title="This workbook has errors">Fix them in the spreadsheet and upload it again. You can still save it as a draft to fix here.</InlineAlert> : null}
          <TextField label="What changed" optional value={note} onChange={setNote} maxLength={500} placeholder="e.g. Reworded the artwork questions" hint="Kept with the version, for whoever reads the history." />
          <p className="text-sm text-muted-foreground">Publishing creates a new version that can never be changed. Respondents answer the newest version; earlier responses keep the questions they saw.</p>
          {finish.isError ? <InlineAlert title="That didn't finish">{(finish.error as Error).message}</InlineAlert> : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => setStep("Preview")}><ArrowLeft data-icon="inline-start" />Back</Button>
            <span className="flex-1" />
            <Button type="button" variant="outline" disabled={finish.isPending} onClick={() => finish.mutate(false)}>Save as draft</Button>
            <Button type="button" disabled={blocked || finish.isPending} onClick={() => finish.mutate(true)}>{finish.isPending ? <Spinner /> : null}Publish</Button>
          </div>
        </section>
      ) : null}
    </main>
  );
}

function Nav({ back, backLabel = "Back", next, nextLabel, nextDisabled }: { back: () => void; backLabel?: string; next: () => void; nextLabel: string; nextDisabled?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2 border-t pt-4">
      <Button type="button" variant="outline" onClick={back}><ArrowLeft data-icon="inline-start" />{backLabel}</Button>
      <span className="flex-1" />
      <Button type="button" disabled={nextDisabled} onClick={next}>{nextLabel}<ArrowRight data-icon="inline-end" /></Button>
    </div>
  );
}
