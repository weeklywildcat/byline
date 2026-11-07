import { formatEditorialDate } from "@byline/content/story";
const entities: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: "\""
};

export function decodeHtml(value: string) {
  return value.replace(/&(#\d+|#x[\da-f]+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const isHex = entity[1]?.toLowerCase() === "x";
      const codePoint = Number.parseInt(entity.slice(isHex ? 2 : 1), isHex ? 16 : 10);

      return Number.isNaN(codePoint) ? match : String.fromCodePoint(codePoint);
    }

    return entities[entity.toLowerCase()] ?? match;
  });
}

export function stripHtml(html: string) {
  return decodeHtml(html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
}

export function formatDisplayDate(value: string) {
  return formatEditorialDate(value, publication.locale);
}
import { getPublicationConfig } from "@/lib/publication";

const publication = getPublicationConfig();
