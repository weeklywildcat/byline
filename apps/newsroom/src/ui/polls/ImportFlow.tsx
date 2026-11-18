"use client";

import { InlineAlert } from "@byline/newsroom-ui/components/inline-alert";
import { Alert, AlertDescription, AlertTitle } from "@byline/newsroom-ui/ui/alert";
import { Button } from "@byline/newsroom-ui/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@byline/newsroom-ui/ui/dropdown-menu";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@byline/newsroom-ui/ui/empty";
import { Separator } from "@byline/newsroom-ui/ui/separator";
import { TextField } from "@byline/newsroom-ui/components/form-fields";
import { Spinner } from "@byline/newsroom-ui/ui/spinner";
import { cn } from "@byline/newsroom-ui/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, ChevronDown, ChevronRight, CircleAlert, CircleCheck, Download, FileSpreadsheet, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { isAnswerable } from "../../polls/engine/types";
import { hasErrors } from "../../polls/engine/xlsform";
import { useNewsroomRoutes } from "../shell/account";
import { createSurvey, fetchSurvey, pollKeys, publishSurvey, updateSurvey, uploadWorkbook, type ImportPreview } from "./api";
import { PageHeader, PollsBreadcrumb, TemplateItems, usePollsNavigation } from "./PollStudio";
import { IssueList, PreviewPanel, QuestionMap } from "./Review";

/**
 * Spreadsheet import (docs/wildcat-polls.md#import): Upload → Review (the
 * validation and every question) → Preview → Publish. Nothing is saved until
 * the last step; the preview is the real respondent screen running the real
 * logic.
 */

const STEPS = ["Upload", "Review", "Preview", "Publish"] as const;
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
    onSuccess: (result) => { setPreview(result); setStep("Review"); }
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
      go({ poll: id, tab: publish ? "overview" : "build" });
    }
  });
  const pick = (file: File | undefined) => { if (file) upload.mutate(file); };
  const index = STEPS.indexOf(step);
  const errors = preview?.issues.filter((issue) => issue.severity === "error").length ?? 0;
  const warnings = preview?.issues.filter((issue) => issue.severity === "warning").length ?? 0;

  const title = pollId ? "Import a new version" : "Import a spreadsheet";
  return (
    <main className="mx-auto flex w-full min-w-0 max-w-[1240px] flex-col gap-4 px-4 py-5 lg:px-6" data-polls-import="">
      <PollsBreadcrumb trail={pollId ? [{ label: existing.data?.survey.title ?? "Poll", target: { poll: pollId } }, { label: "Import" }] : [{ label: "Import" }]} />
      <PageHeader
        level="detail"
        title={title}
        description={pollId ? "The workbook replaces this poll's draft. Published versions, and every response to them, stay as they are." : "An XLSForm workbook with survey, choices and settings sheets. Nothing is saved until you publish or save a draft."}
        actions={(
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button type="button" variant="outline" />}><Download data-icon="inline-start" />Templates<ChevronDown data-icon="inline-end" /></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60"><TemplateItems api={api} /></DropdownMenuContent>
          </DropdownMenu>
        )}
      />

      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm" aria-label="Import steps">
        {STEPS.map((name, i) => (
          <li key={name} className="flex items-center gap-2">
            <span className={i === index ? "font-medium text-foreground" : i < index ? "text-foreground" : "text-muted-foreground"} aria-current={i === index ? "step" : undefined}>{name}</span>
            {i < STEPS.length - 1 ? <ChevronRight className="size-3.5 text-muted-foreground" aria-hidden="true" /> : null}
          </li>
        ))}
      </ol>
      <Separator />

      {step === "Upload" ? (
        <section className="flex flex-col gap-4">
          <Empty
            className={cn("border border-dashed transition-colors", dragging && "border-primary bg-muted/50")}
            onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => { event.preventDefault(); setDragging(false); pick(event.dataTransfer.files[0]); }}
          >
            <EmptyHeader>
              <EmptyMedia variant="icon">{upload.isPending ? <Spinner /> : <FileSpreadsheet />}</EmptyMedia>
              <EmptyTitle>{upload.isPending ? "Reading the workbook…" : "Choose an .xlsx workbook"}</EmptyTitle>
              <EmptyDescription>Or drop it here. Byline reads the sheets and runs nothing in the file.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button type="button" disabled={upload.isPending} onClick={() => input.current?.click()}><Upload data-icon="inline-start" />Choose file</Button>
              <input ref={input} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" tabIndex={-1} aria-label="Workbook" onChange={(event) => { pick(event.target.files?.[0]); event.target.value = ""; }} data-polls-upload="" />
            </EmptyContent>
          </Empty>
          {upload.isError ? <InlineAlert title="That workbook couldn't be read">{(upload.error as Error).message}</InlineAlert> : null}
        </section>
      ) : null}

      {preview && step === "Review" ? (
        <section className="flex flex-col gap-4">
          <div>
            <h2 className="text-base font-semibold">{preview.definition.settings.title}</h2>
            <p className="text-sm text-muted-foreground">{preview.source.filename} · {preview.definition.questions.filter(isAnswerable).length} questions · {preview.definition.lists.length} choice lists</p>
          </div>
          {errors ? (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertTitle>{errors} {errors === 1 ? "error" : "errors"} to fix in the workbook before this can be published.</AlertTitle>
              {warnings ? <AlertDescription>{warnings} {warnings === 1 ? "warning" : "warnings"} too.</AlertDescription> : null}
            </Alert>
          ) : (
            <Alert>
              <CircleCheck />
              <AlertTitle>No errors.</AlertTitle>
              {warnings ? <AlertDescription>{warnings} {warnings === 1 ? "warning" : "warnings"} to look at below.</AlertDescription> : null}
            </Alert>
          )}
          <IssueList issues={preview.issues} />
          <QuestionMap definition={preview.definition} issues={preview.issues} />
          <Nav back={() => setStep("Upload")} backLabel="Choose a different file" next={() => setStep("Preview")} nextLabel="Try it" />
        </section>
      ) : null}

      {preview && step === "Preview" ? (
        <section className="flex flex-col gap-4">
          <PreviewPanel definition={preview.definition} />
          <Nav back={() => setStep("Review")} next={() => setStep("Publish")} nextLabel="Continue to publish" />
        </section>
      ) : null}

      {preview && step === "Publish" ? (
        <section className="flex max-w-2xl flex-col gap-5">
          {blocked ? <InlineAlert title="This workbook has errors">Fix them in the spreadsheet and upload it again, or save it as a draft and fix it here.</InlineAlert> : null}
          <TextField label="What changed" optional value={note} onChange={setNote} maxLength={500} placeholder="e.g. Reworded the artwork questions" hint="Kept with the version, for whoever reads the history." />
          <p className="text-sm text-muted-foreground">Publishing creates a version that can never be changed. Respondents answer the newest version; earlier responses keep the questions they saw.</p>
          {finish.isError ? <InlineAlert title="That didn't finish">{(finish.error as Error).message}</InlineAlert> : null}
          <div className="flex flex-wrap gap-2 border-t pt-4">
            <Button type="button" variant="outline" onClick={() => setStep("Preview")}><ArrowLeft data-icon="inline-start" />Back</Button>
            <span className="flex-1" />
            <Button type="button" variant="outline" disabled={finish.isPending} onClick={() => finish.mutate(false)}>Save as draft</Button>
            <Button type="button" disabled={blocked || finish.isPending} onClick={() => finish.mutate(true)}>{finish.isPending ? <Spinner data-icon="inline-start" /> : null}Publish</Button>
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
