import { reportingHeadline } from "./workspace-model";
import { useWorkspace } from "./workspace-context";

/** The reporting situation in two lines. Shown first on a phone, before the full plan. */
export function ReportingSummaryStrip() {
  const { data, timezone, sectionError } = useWorkspace();
  if (sectionError("reporting")) return null;
  const headline = reportingHeadline(data.reporting, timezone);
  if (!headline) return null;
  return <section aria-label="Reporting at a glance" className="flex flex-col gap-1 px-1 text-sm @3xl/ws:hidden">
    {headline.next ? <p><span className="mr-2 font-medium">Next</span>{headline.next}</p> : null}
    {headline.counts ? <p className="text-muted-foreground">{headline.counts}</p> : null}
  </section>;
}
