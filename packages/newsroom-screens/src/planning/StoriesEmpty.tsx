import { Button } from "@byline/newsroom-ui/ui/button";
import { NothingHere } from "./PlanningPage";
import type { StoryScope } from "./stories-scope";

/**
 * What each scope says when it holds nothing. With filters on, it says the filters may
 * be the reason and offers Clear; without, it says what would belong there.
 */
export function storiesEmptyCopy(scope: StoryScope, filtersActive: boolean): { title: string; description: string } {
  if (scope === "published") {
    return { title: "No published stories", description: filtersActive ? "Your filters may be hiding published stories." : "Stories appear here once they are published." };
  }
  if (scope === "all") {
    return { title: "No stories match", description: filtersActive ? "Your filters may be hiding stories. Clear them to see every story." : "There are no stories yet." };
  }
  return { title: "No stories in progress", description: filtersActive ? "Your filters may be hiding stories in progress." : "Drafts, scheduled stories and stories with work still open appear here." };
}

export function StoriesEmpty({ scope, filtersActive, onClear }: { scope: StoryScope; filtersActive: boolean; onClear: () => void }) {
  const copy = storiesEmptyCopy(scope, filtersActive);
  return <NothingHere title={copy.title} description={copy.description} action={filtersActive ? <Button variant="outline" onClick={onClear}>Clear filters</Button> : undefined} />;
}
