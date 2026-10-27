import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StoryCollectionContext } from "../src/collections/StoryCollectionContext";
import {
  collectionsKey,
  storyCollectionsKey,
  type CollectionApi,
} from "../src/collections/collection-api";
import type {
  Collection,
  Interview,
  StoryCollections,
} from "../src/collections/collection-model";

const collection = {
  id: 1,
  name: "Election coverage",
  canEdit: true,
} as Collection;
const interview = {
  id: 2,
  collectionId: 1,
  interviewee: "Principal",
  canEdit: true,
} as Interview;
const data: StoryCollections = {
  canManage: true,
  collections: [collection],
  interviews: [interview],
  availableInterviews: [
    { ...interview, id: 3, interviewee: "Unlinked source" },
  ],
  resources: [],
};
function render(context: StoryCollections, compact = true) {
  const client = new QueryClient();
  client.setQueryData(storyCollectionsKey(7), context);
  client.setQueryData(collectionsKey, { collections: [collection] });
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <StoryCollectionContext
        storyId={7}
        api={{} as CollectionApi}
        compact={compact}
      />
    </QueryClientProvider>,
  );
}

describe("Story Collections in Peek", () => {
  it("starts collapsed with linked context summarized, without exposing pickers or unlinked reporting", () => {
    const html = render(data);
    expect(html).toContain("Collections &amp; interviews");
    expect(html).toContain("Election coverage");
    expect(html).toContain("1 shared interview");
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("Unlinked source");
    expect(html).not.toContain('role="combobox"');
    expect(html).not.toContain("No interviews explicitly linked");
  });

  it("leaves an empty manager a compact way to link reporting and omits an empty observer section", () => {
    const empty = { ...data, collections: [], interviews: [], resources: [] };
    expect(render(empty)).toContain("No linked collections");
    expect(render({ ...empty, canManage: false })).toBe("");
  });

  it("keeps explicitly linked interviews and resources visible in the summary without collection membership", () => {
    const html = render({
      ...data,
      canManage: false,
      collections: [],
      resources: [
        {
          id: 4,
          label: "Recording",
          url: "https://example.test/audio",
          kind: "Audio",
          attachmentId: 0,
          storyIds: [7],
        },
      ],
    });
    expect(html).toContain("1 shared interview · 1 shared resource");
    expect(html).toContain('aria-expanded="false"');
  });

  it("keeps the full workspace expanded with navigation and relationship controls", () => {
    const html = render(data, false);
    expect(html).toContain("Election coverage");
    expect(html).toContain("Principal");
    expect(html).toContain('aria-label="Story collections"');
    expect(html).toContain('aria-label="Add from Collection"');
    expect(html).toContain("&amp;interview=2");
    expect(html).not.toContain("Collections &amp; interviews");
  });
});
