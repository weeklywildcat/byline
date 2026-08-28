import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ArticleCorrectionNotices } from "@/components/ArticleCorrectionNotices";
import { ReaderFeedbackForm } from "@/components/ReaderFeedbackForm";
import { getPublicCorrectionLog } from "@/lib/content";
import { getNewsArticleSchema } from "@/lib/seo";
import {
  getPostContributors,
  getPublicCorrectionsForPost,
  normalizePublicCorrection,
  normalizePublicCoverage,
  type WordPressPost
} from "@/lib/wordpress";
import {
  publicEditorialCoverage,
  publicEditorialPosts,
  publicEditorialRemoteCorrections
} from "@/tests/fixtures/public-editorial-content";

describe("public editorial surfaces", () => {
  it("keeps ordered user and guest bylines public-safe", () => {
    const contributors = getPostContributors(publicEditorialPosts[0]);

    expect(contributors.map((contributor) => contributor.name)).toEqual(["Alex Rivera", "Jordan Guest"]);
    expect(contributors[1]).not.toHaveProperty("email");
    expect(contributors[1]).not.toHaveProperty("privateNote");
    expect(contributors[1]).toMatchObject({ role: "Community contributor", socials: { website: "https://jordan.example.test" } });
  });

  it("keeps one NewsArticle author backwards-compatible and uses an array for co-bylines", () => {
    const singleAuthorPost = { ...publicEditorialPosts[0], contributors: undefined };
    const singleSchema = getNewsArticleSchema(singleAuthorPost);
    const multipleSchema = getNewsArticleSchema(publicEditorialPosts[0]);

    expect(Array.isArray(singleSchema.author)).toBe(false);
    expect(singleSchema.author).toMatchObject({ "@type": "Person", name: "Alex Rivera" });
    expect(multipleSchema.author).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Alex Rivera" }),
      expect.objectContaining({ name: "Jordan Guest" })
    ]));
  });

  it("projects only published stories and public fields from Coverage", () => {
    const coverage = normalizePublicCoverage(publicEditorialCoverage);

    expect(coverage).not.toBeNull();
    expect(coverage).not.toHaveProperty("staffIds");
    expect(coverage).not.toHaveProperty("storyIds");
    expect(coverage?.overview).not.toContain("script");
    expect(coverage?.stories).toHaveLength(1);
    expect(coverage?.stories[0].slug).toBe("public-records-guide");
  });

  it("renders a legacy correction once while adding distinct structured notices", () => {
    const corrections = getPublicCorrectionsForPost(publicEditorialPosts[0]);
    const markup = renderToStaticMarkup(<ArticleCorrectionNotices corrections={corrections} />);

    expect(corrections).toHaveLength(2);
    expect(corrections.filter((correction) => correction.text === "We corrected the meeting date.")).toHaveLength(1);
    expect(markup).toContain("Clarification");
    expect(markup).not.toContain("We corrected the meeting date.");
  });

  it("joins correction records only to visible published stories", () => {
    const entries = getPublicCorrectionLog(
      publicEditorialPosts,
      publicEditorialRemoteCorrections.flatMap((correction, index) => {
        const normalized = normalizePublicCorrection(correction, index);
        return normalized ? [normalized] : [];
      })
    );

    expect(entries.some((entry) => entry.text === "Private editorial note.")).toBe(false);
    expect(entries.some((entry) => entry.text === "Private correction.")).toBe(false);
    expect(entries.some((entry) => entry.text === "We added a source link.")).toBe(true);
    expect(entries.every((entry) => entry.post.status === "publish")).toBe(true);
  });

  it("keeps the feedback form usable when its persistence endpoint is optional", () => {
    const markup = renderToStaticMarkup(
      <ReaderFeedbackForm
        postId={101}
        articleTitle="Public records guide"
        articleUrl="https://news.example.test/2026/08/20/news/public-records-guide/"
        endpointCandidates={[]}
      />
    );

    expect(markup).toContain("Spot an error or have a note?");
    expect(markup).toContain("Send feedback");
    expect(markup).toContain('name="website"');
  });

  it("keeps the fixture shape assignable to the public post contract", () => {
    const post: WordPressPost = publicEditorialPosts[0];

    expect(post.status).toBe("publish");
  });
});
