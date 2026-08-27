import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { HomepagePackages, ThisWeekCard as SharedThisWeekCard } from "@byline/ui";
import { migrateDesignDocumentV1ToV2 } from "@byline/design";
import { NewsletterSignupForm } from "@/components/NewsletterSignupForm";
import { PollWidget } from "@/components/PollWidget";
import { resolvePublishedDesignBlocks } from "@/lib/design-resolution";
import { resolveHomepageDocument } from "@/lib/homepage-resolution";
import { toCalendarEntries } from "@/lib/homepage-packages";
import { WEEKLY_WILDCAT_PUBLICATION } from "@/lib/publication";
import type { SchoolEvent, SportsGame } from "@/lib/headless";
import type { WordPressPost } from "@/lib/wordpress";
import { PreMigrationDesignHomepage } from "./baseline/pre-migration-design-homepage";
import { game, post } from "./fixtures/sports-fixture";

type V1Block = { type: string; props: Record<string, unknown> };
type V1Document = {
  schemaVersion: 1;
  template: string;
  theme: string;
  editor: { engine: string; version: string };
  layout: { root: Record<string, unknown>; content: V1Block[] };
};

const fixture = JSON.parse(
  readFileSync(new URL("./fixtures/v1-homepage-parity.json", import.meta.url), "utf8")
) as V1Document;

const POSTS = Array.from({ length: 25 }, (_, index) => post(index + 1, index % 2 ? "news" : "features"));
const SCHEDULE: {
  recentScores: SportsGame[];
  upcomingGames: SportsGame[];
  schoolEvents: SchoolEvent[];
} = {
  recentScores: [game(9001, "football"), game(9002, "soccer"), game(9003, "basketball")],
  upcomingGames: [
    game(9101, "softball", { upcoming: true }),
    game(9102, "volleyball", { upcoming: true }),
    game(9103, "tennis", { upcoming: true }),
    game(9104, "golf", { upcoming: true })
  ],
  schoolEvents: []
};

function v1Document(content: V1Block[]): V1Document {
  return { ...fixture, layout: { ...fixture.layout, content } };
}

function relevantBlockClasses(markup: string) {
  const dom = new JSDOM(`<body>${markup}</body>`);
  const visibleClassPattern = /^(?:top-stories|the-brief|brief-digest-layout|brief-support-list|in-focus|live-package-label|special-coverage|opinion-package|opinion-rail|from-field|section-header-row|field-|more-weekly|more-story-grid|more-compact-list|byline-design-utility|this-week|homepage-poll|home-newsletter|article-newsletter|home-story)/;

  return [...dom.window.document.body.querySelectorAll("*")].flatMap((element) =>
    [...element.classList].filter((className) => visibleClassPattern.test(className))
  );
}

function semanticMarkupSummary(markup: string) {
  const dom = new JSDOM(`<body>${markup}</body>`);
  const root = dom.window.document.body;

  return {
    structures: relevantBlockClasses(markup),
    headings: [...root.querySelectorAll("h2, h3, h4, h5, .live-package-label")].map((element) => element.textContent?.trim() ?? ""),
    copy: [
      ...root.querySelectorAll(
        ".opinion-package-header p, .more-utility-block p, .this-week-empty, .homepage-poll-note, .article-newsletter-copy p"
      )
    ].map((element) => element.textContent?.trim() ?? ""),
    stories: [...root.querySelectorAll(".home-story")].map((story) => ({
      variant: [...story.classList].find((className) => className.startsWith("home-story-") && className !== "home-story-no-image") ?? "",
      title: story.querySelector("h2")?.textContent?.trim() ?? "",
      href: story.querySelector("h2 a")?.getAttribute("href") ?? "",
      showAuthor: Boolean(story.querySelector(".home-story-author")),
      showDeck: Boolean(story.querySelector(".home-story-deck"))
    })),
    links: [...root.querySelectorAll("a")].map((link) => ({
      href: link.getAttribute("href") ?? "",
      text: link.textContent?.trim() ?? ""
    }))
  };
}

async function renderOld(content: V1Block[]) {
  const blocks = await resolvePublishedDesignBlocks(content, POSTS);

  return renderToStaticMarkup(
    <PreMigrationDesignHomepage blocks={blocks} sportsSchedule={SCHEDULE} theme="weekly-wildcat" />
  );
}

function renderNew(document: V1Document) {
  const migrated = migrateDesignDocumentV1ToV2(document, "home");
  const resolved = resolveHomepageDocument({
    document: migrated.document,
    posts: POSTS,
    publication: WEEKLY_WILDCAT_PUBLICATION,
    sportsSchedule: SCHEDULE
  });

  return renderToStaticMarkup(
    <main className="byline-publication-preview live-home-shell" data-theme="weekly-wildcat">
      <HomepagePackages
        packages={resolved.packages}
        theme="weekly-wildcat"
        slots={{
          poll: <PollWidget />,
          calendar: ({ package: resolvedPackage }) => {
            if (!("latest" in resolvedPackage)) return null;

            return (
              <SharedThisWeekCard
                entries={toCalendarEntries(SCHEDULE.schoolEvents, SCHEDULE.upcomingGames, resolvedPackage.utility.calendarLimit ?? 3)}
                heading={resolvedPackage.utility.calendarHeading ?? "At NSHS"}
                scheduleHref="/sports/schedule/"
              />
            );
          },
          newsletter: ({ package: resolvedPackage }) => {
            if (!("label" in resolvedPackage)) return null;

            return (
              <NewsletterSignupForm
                heading={resolvedPackage.heading}
                showLabel={resolvedPackage.presentation.showLabel}
              />
            );
          }
        }}
      />
    </main>
  );
}

describe("schema-v1 renderer parity", () => {
  it("checks every visible v1 block against the frozen old renderer", async () => {
    const convertedBlocks = fixture.layout.content.filter((block) => block.type !== "divider");

    for (const block of convertedBlocks) {
      const oldSummary = semanticMarkupSummary(await renderOld([block]));
      const newSummary = semanticMarkupSummary(renderNew(v1Document([block])));

      expect(newSummary, `v1 ${block.type} parity`).toEqual(oldSummary);
    }
  });

  it("keeps full-document story order, copy, presentation flags, and structure", async () => {
    const contentWithoutDivider = fixture.layout.content.filter((block) => block.type !== "divider");
    const oldSummary = semanticMarkupSummary(await renderOld(contentWithoutDivider));
    const newSummary = semanticMarkupSummary(renderNew(v1Document(contentWithoutDivider)));

    expect(newSummary).toEqual(oldSummary);
    expect(newSummary.stories.map((story) => story.title)).toHaveLength(25);
    expect(newSummary.stories.filter((story) => story.variant === "home-story-more-compact")).toHaveLength(5);
    expect(newSummary.stories.filter((story) => story.variant === "home-story-opinion")).toHaveLength(4);
  });

  it("keeps the old brief markup when only one story resolves", async () => {
    const brief = fixture.layout.content.find((block) => block.type === "story-list");
    if (!brief) throw new Error("The parity fixture must include a story-list block.");

    const singleStoryBrief = {
      ...brief,
      props: { ...brief.props, query: { type: "manual", postIds: [2] } }
    };
    const oldMarkup = semanticMarkupSummary(await renderOld([singleStoryBrief]));
    const newMarkup = semanticMarkupSummary(renderNew(v1Document([singleStoryBrief])));

    expect(newMarkup).toEqual(oldMarkup);
    expect(newMarkup.structures).not.toContain("brief-digest-layout-single");
    expect(newMarkup.structures).not.toContain("brief-support-list");
  });

  it("retains a real v1 divider and proves the live fallback still renders it", async () => {
    const divider = fixture.layout.content.find((block) => block.type === "divider");
    if (!divider) throw new Error("The parity fixture must include a divider.");

    const migrated = migrateDesignDocumentV1ToV2(fixture, "home");
    expect(migrated.document.legacy?.unconvertedBlocks).toEqual([divider]);
    expect(await renderOld(fixture.layout.content)).toContain("byline-design-divider");
  });
});
