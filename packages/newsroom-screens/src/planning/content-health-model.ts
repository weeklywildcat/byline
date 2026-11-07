import type {
  ContentHealthIssue,
  ContentHealthSeverity,
} from "./planning-model";
export const healthSeverityLabels = {
  error: "Critical",
  warning: "Needs attention",
  info: "Improvement",
};
export const healthCategories: Record<string, string> = {
  links: "Links",
  "images-accessibility": "Images & accessibility",
};
const rank = { error: 0, warning: 1, info: 2 };
export function worstSeverity(
  issues: ContentHealthIssue[],
): ContentHealthSeverity {
  return issues.reduce<ContentHealthSeverity>(
    (worst, issue) =>
      rank[issue.severity] < rank[worst] ? issue.severity : worst,
    "info",
  );
}
export function healthCheckId(issue: ContentHealthIssue): string {
  return (issue.checkId || issue.type).replace(
    /^link-[a-f0-9]+$/,
    "broken-link",
  );
}
export function groupHealthIssues(issues: ContentHealthIssue[]) {
  const groups = new Map<string, ContentHealthIssue[]>();
  for (const issue of issues) {
    const key = healthCheckId(issue);
    groups.set(key, [...(groups.get(key) ?? []), issue]);
  }
  return [...groups]
    .map(([id, occurrences]) => ({
      id,
      occurrences,
      severity: worstSeverity(occurrences),
      storyCount: new Set(occurrences.map((i) => i.story?.id).filter(Boolean))
        .size,
    }))
    .sort(
      (a, b) =>
        rank[a.severity] - rank[b.severity] ||
        b.storyCount - a.storyCount ||
        a.id.localeCompare(b.id),
    );
}
export function groupHealthStories(issues: ContentHealthIssue[]) {
  const groups = new Map<number, ContentHealthIssue[]>();
  for (const issue of issues)
    if (issue.story)
      groups.set(issue.story.id, [
        ...(groups.get(issue.story.id) ?? []),
        issue,
      ]);
  return [...groups]
    .map(([id, occurrences]) => ({
      id,
      story: occurrences[0].story!,
      occurrences,
      severity: worstSeverity(occurrences),
      categories: [
        ...new Set(occurrences.map((i) => i.category).filter(Boolean)),
      ],
    }))
    .sort(
      (a, b) =>
        rank[a.severity] - rank[b.severity] ||
        b.occurrences.length - a.occurrences.length ||
        a.story.title.localeCompare(b.story.title),
    );
}
