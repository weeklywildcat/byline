import { createHmac, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { isSha256, publicationMediaReadiness } from "@byline/content";
import type { Endpoint, PayloadRequest } from "payload";
import { publicationStore } from "../publication-media/blob-store";
import { publicationMediaReport } from "../publication-media/readiness";
import { imageCardLists, MAX_POLL_IMAGES, usesImageCards } from "./engine/presentation";
import { isSelect, type ChoiceImages, type SurveyDefinition } from "./engine/types";
import type { ImportIssue } from "./engine/xlsform";
import { normalizeDefinition } from "./definition";

const MEDIA_PATH = "/byline/polls/media";
const IMAGE_WIDTH = 640;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

export type FrozenChoiceImage = {
  list: string;
  choice: string;
  sha256: string;
  bytes: number;
  mimeType: "image/webp" | "image/jpeg";
  width: number;
  height: number;
  alt: string;
};

export type PollMediaManifest = FrozenChoiceImage[];

type MediaProblem = ImportIssue & { mediaId?: number };

export async function resolvePollMedia(req: PayloadRequest, definition: SurveyDefinition, freeze: boolean) {
  const issues: MediaProblem[] = [];
  const picks: Array<{ list: string; choice: string; mediaId: number; describe: string }> = [];
  const issue = (message: string, mediaId?: number) => {
    issues.push({ sheet: "choices", column: "image", severity: "error", message, ...(mediaId ? { mediaId } : {}) });
  };
  for (const [list, { question, choices }] of imageCardLists(definition)) {
    for (const choice of choices) {
      const describe = `“${question.label}” · “${choice.label}”`;
      if (choice.image?.mediaId) picks.push({ list, choice: choice.name, mediaId: choice.image.mediaId, describe });
      else if (choice.image?.sourceName) issue(`${describe}: choose the matching image for ${choice.image.sourceName} from Media.`);
      else issue(`${describe}: choose an image from Media.`);
    }
  }
  const manifest: PollMediaManifest = [];
  if (picks.length > MAX_POLL_IMAGES) {
    issue(`A poll can publish at most ${MAX_POLL_IMAGES} choice images.`);
    return { manifest, issues };
  }
  if (!picks.length) return { manifest, issues };
  const ids = [...new Set(picks.map(({ mediaId }) => mediaId))].sort((a, b) => a - b);
  const store = publicationStore();
  const report = await publicationMediaReport(req.payload, ids.map((id) => ({ id, role: "image" })), { req, store });
  const { docs } = await req.payload.find({
    collection: "media", where: { id: { in: ids } }, depth: 0, pagination: false, overrideAccess: true, req,
    select: { publicationAssets: true, publicationRevision: true, alt: true }
  });
  const reports = new Map(report.items.map((item) => [item.mediaId, item]));
  const media = new Map(docs.map((doc) => [doc.id, doc]));
  const checked = new Map<number, Omit<FrozenChoiceImage, "list" | "choice"> | string>();
  for (const id of ids) {
    const doc = media.get(id);
    const item = reports.get(id);
    if (!doc || !item) {
      checked.set(id, "This image is missing from Media.");
      continue;
    }
    if (item.state !== "ready") {
      checked.set(id, item.issues.map(({ code, message }) => code === "wrong-type" ? "Choose a photo or graphic" : message).join(" · "));
      continue;
    }
    const alt = doc.alt?.trim();
    const ready = publicationMediaReadiness(doc.publicationAssets, doc.publicationRevision);
    if (!alt || alt.length > 1000) {
      checked.set(id, "Add meaningful alt text in Media (up to 1,000 characters).");
      continue;
    }
    if (!ready.ready || ready.manifest.kind !== "image") {
      checked.set(id, "The image needs ready publication files.");
      continue;
    }
    const naturals = ready.manifest.natural.filter(({ bytes }) => bytes <= MAX_IMAGE_BYTES);
    const rendition = naturals.find(({ width }) => width >= IMAGE_WIDTH) ?? naturals.at(-1);
    if (!rendition || (rendition.mimeType !== "image/webp" && rendition.mimeType !== "image/jpeg")
      || (freeze && !(await store.verify(rendition.sha256)))) {
      checked.set(id, "The prepared image is unavailable. Prepare the image again in Media.");
      continue;
    }
    const { sha256, bytes, mimeType, width, height } = rendition;
    checked.set(id, { sha256, bytes, mimeType, width, height, alt });
  }
  for (const { list, choice, mediaId, describe } of picks) {
    const result = checked.get(mediaId);
    if (!result || typeof result === "string") issue(`${describe}: ${result ?? "This image is missing from Media."}`, mediaId);
    else manifest.push({ list, choice, ...result });
  }
  return { manifest, issues };
}

function signature(secret: string, id: number, slot: number) {
  return createHmac("sha256", secret).update(`wildcat-polls-media:${id}:${slot}`).digest("base64url");
}

export function readPollMedia(input: unknown): PollMediaManifest {
  if (!Array.isArray(input) || input.length > MAX_POLL_IMAGES || !input.every(validImage)) return [];
  return input;
}

function validImage(value: unknown): value is FrozenChoiceImage {
  if (!value || typeof value !== "object") return false;
  const asset = value as Partial<FrozenChoiceImage>;
  return typeof asset.list === "string" && typeof asset.choice === "string" && typeof asset.alt === "string" && !!asset.alt.trim()
    && isSha256(asset.sha256) && Number.isSafeInteger(asset.bytes) && asset.bytes! > 0 && asset.bytes! <= MAX_IMAGE_BYTES
    && Number.isSafeInteger(asset.width) && asset.width! > 0 && Number.isSafeInteger(asset.height) && asset.height! > 0
    && (asset.mimeType === "image/webp" || asset.mimeType === "image/jpeg");
}

export function versionImages(req: Pick<PayloadRequest, "payload">, id: number, manifest: unknown): ChoiceImages {
  const images: ChoiceImages = Object.create(null);
  readPollMedia(manifest).forEach(({ list, choice, alt, width, height }, slot) => {
    images[list] ??= Object.create(null);
    images[list][choice] = {
      src: `${req.payload.config.routes.api}${MEDIA_PATH}/${id}/${slot}/${signature(req.payload.secret, id, slot)}`,
      alt, width, height
    };
  });
  return images;
}

/** Only normalized semantic fields and frozen renderer data may cross into public or kiosk clients. */
export function projectRespondent(req: Pick<PayloadRequest, "payload">, version: { id: number; definition: unknown; mediaManifest?: unknown }) {
  const definition = normalizeDefinition(version.definition);
  return {
    definition: {
      format: definition.format,
      settings: { ...definition.settings, formId: "", version: "", breakdowns: [] },
      groups: definition.groups.map(({ source: _source, ...group }) => group),
      questions: definition.questions.map(({ source: _source, ...question }) => isSelect(question) && usesImageCards(definition, question)
        ? { ...question, imageCards: true } : question),
      lists: definition.lists.map(({ name, choices }) => ({ name, choices: choices.map(({ name, label }) => ({ name, label })) }))
    },
    images: versionImages(req, version.id, version.mediaManifest)
  };
}

const missing = () => new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });

export async function servePollMedia(req: PayloadRequest): Promise<Response> {
  const { versionId, slot, key } = req.routeParams ?? {};
  if (!/^[1-9]\d{0,9}$/.test(String(versionId)) || !/^(0|[1-9]\d?)$/.test(String(slot)) || !/^[\w-]{43}$/.test(String(key))) return missing();
  const id = Number(versionId), index = Number(slot);
  if (id > 2_147_483_647 || index >= MAX_POLL_IMAGES
    || !timingSafeEqual(Buffer.from(String(key)), Buffer.from(signature(req.payload.secret, id, index)))) return missing();
  const version = await req.payload.findByID({
    collection: "poll-versions", id, overrideAccess: true, depth: 0, disableErrors: true, req, select: { mediaManifest: true }
  });
  const asset = readPollMedia(version?.mediaManifest)[index];
  if (!asset) return missing();
  const store = publicationStore();
  const file = store.objectPath(asset.sha256);
  if (!file || !(await store.has(asset.sha256, asset.bytes))) return missing();
  return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream<Uint8Array>, {
    headers: {
      "Content-Type": asset.mimeType,
      "Content-Length": String(asset.bytes),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

export const pollMediaEndpoint: Endpoint = { path: `${MEDIA_PATH}/:versionId/:slot/:key`, method: "get", handler: servePollMedia };
