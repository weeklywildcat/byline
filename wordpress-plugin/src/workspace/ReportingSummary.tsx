import { reportingHeadline } from "./workspace-model";
import { useWorkspace } from "./workspace-context";

/** The reporting situation in two lines. Shown first on a phone, before the full plan. */
export function ReportingSummaryStrip() {
  const { data, timezone, sectionError } = useWorkspace();
  if (sectionError("reporting")) return null;
  const headline = reportingHeadline(data.reporting, timezone);
  if (!headline) return null;
  return <section aria-label="Reporting at a glance" className="ws-glance">
    {headline.next ? <p><span className="ws-glance-label">Next</span>{headline.next}</p> : null}
    {headline.counts ? <p className="ws-glance-counts">{headline.counts}</p> : null}
  </section>;
}
