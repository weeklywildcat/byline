import { publicStoryPath } from "@byline/content";
import { APIError, ValidationError, type CollectionBeforeChangeHook, type PayloadRequest } from "payload";
import { relationId } from "../access/user";
import { editorialReadiness } from "../domain/story-readiness";
import { storyBodyProblems } from "../hooks/story-body";
import type { Story } from "../payload-types";
import { publicationMediaReport, storyMediaRequirements } from "../publication-media/readiness";
import { publicationConfigFromGlobal, readPublishedPublication } from "../public/publication-config";
import { readPublicPaths } from "../public/url-changes";
import type { ScreenContext } from "./screen-models";

function checks(story: Partial<Story>) {
  return editorialReadiness({ ...story, videoUrl: story.video?.url });
}

export const requireStoryFacts: CollectionBeforeChangeHook = ({ data, originalDoc, req }) => {
  if (data._status !== "published" || req.context?.bylineImport === true) return data;
  const errors = checks({ ...originalDoc, ...data }).filter((line) => line.level === "error");
  if (errors.length) throw new ValidationError({ collection: "stories", req, errors });
  return data;
};

async function bodyAndMediaChecks(req: PayloadRequest, story: Story) {
  return Promise.all([
    story.contentFormat === "legacy-html" ? [] : storyBodyProblems(req, story.body, story.id),
    publicationMediaReport(req.payload, storyMediaRequirements(story), { req })
  ]);
}

export async function storyReadiness(ctx: ScreenContext, storyId: number) {
  const { req } = ctx;
  const story = await req.payload.findByID({ collection: "stories", id: storyId, draft: true, depth: 0, overrideAccess: false, req });
  const [body, media] = await bodyAndMediaChecks(req, story);
  const items = [
    ...checks(story).map(({ path, message, level }) => ({ id: path, label: message, explanation: message, state: level })),
    ...body.map((message, index) => ({ id: `body-${index}`, label: "Story body", explanation: message, state: "error" as const })),
    ...media.items.flatMap((item) => item.state === "ready" ? [] : [{
      id: `media-${item.mediaId}`, label: item.filename ?? "Publication media",
      explanation: item.issues.map((issue) => issue.message).join(" "), state: "error" as const
    }])
  ];
  return { storyId, checks: items.length ? items : [{ id: "ready", label: "Ready", explanation: "The story passed the publication checks.", state: "pass" as const }] };
}

export async function assertStoryReadyToSchedule({ req }: ScreenContext, story: Story, confirmedPath: unknown) {
  const blocker = checks(story).find((line) => line.level === "error");
  if (blocker) throw new APIError(blocker.message, 400);
  const [body, media] = await bodyAndMediaChecks(req, story);
  if (!media.ready) throw new APIError("Resolve the story's publication media issues before scheduling.", 400);
  if (body[0]) throw new APIError(body[0], 400);
  const old = (await readPublicPaths(req, "stories", story.id)).get(story.id);
  if (!old) return;
  const next = await proposedStoryPath(req, story);
  if (next && next !== old && confirmedPath !== next) throw new APIError("Review the changed public URL before scheduling.", 409);
}

async function proposedStoryPath(req: PayloadRequest, story: Story) {
  const sectionId = relationId(story.section);
  if (sectionId === null) return "";
  const [section, publication] = await Promise.all([
    req.payload.findByID({ collection: "sections", id: sectionId, depth: 0, overrideAccess: false, req }),
    readPublishedPublication(req.payload, req)
  ]);
  return publicStoryPath({
    slug: story.slug, publishedAt: story.publishedAt, sectionSlug: section.hidden ? null : section.slug,
    timeZone: publicationConfigFromGlobal(publication, 0).timezone
  });
}
