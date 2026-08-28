// The decoupling boundary between content and presentation.
//
// Renderers must not know what a WordPress post looks like. The resolver flattens
// whatever the CMS returned into this presentation-neutral view model, and the
// shared renderers consume only this. That is what lets the same renderer run
// inside the Next static export and inside Studio, where the data arrives from a
// different transport entirely.
export type StoryImageView = {
  src: string;
  alt: string;
  width: number | null;
  height: number | null;
};

export type StoryView = {
  id: number;
  title: string;
  href: string;
  // Decks are authored HTML in WordPress excerpts. `deckIsHtml` records whether
  // this string must be injected as markup or printed as text, so the renderer
  // never has to guess.
  deck: string;
  deckIsHtml: boolean;
  isoDate: string;
  displayDate: string;
  readingTime: string | null;
  category: { name: string; href: string } | null;
  author: { name: string; href: string | null } | null;
  image: StoryImageView | null;
};

// A school-calendar entry after the week-window filtering and the
// event/game merge have already happened. The renderer does no date maths.
export type CalendarEntryView = {
  id: string;
  kind: "event" | "game";
  label: string;
  title: string;
  date: string;
  location: string;
  href: string;
};

// --- deck text -------------------------------------------------------------
//
// These helpers are written without regular expressions on purpose.
//
// The excerpt text they receive is publication content, so its length and its
// whitespace are not under this code's control. The obvious patterns for
// "optional whitespace, an ellipsis, optional whitespace, end of string" are
// polynomial: on a long run of spaces the engine retries from every position,
// which is a denial-of-service vector at build time and in the editor. Plain
// string scanning is linear and exactly as readable here.

const SENTENCE_TERMINATORS = new Set([".", "!", "?"]);

// Ordered longest-first only for readability; none is a suffix of another, so
// at most one can match.
const TRAILING_ELLIPSES = ["&hellip;", "\u2026", "..."];

function isWhitespace(character: string) {
  // A single character is whitespace exactly when trimming removes it.
  return character.trim() === "";
}

function trimEnd(value: string) {
  let end = value.length;

  while (end > 0 && isWhitespace(value[end - 1])) end -= 1;

  return value.slice(0, end);
}

function stripSuffix(value: string, suffix: string) {
  const trimmed = trimEnd(value);

  if (trimmed.length < suffix.length) return null;
  if (trimmed.slice(trimmed.length - suffix.length).toLowerCase() !== suffix.toLowerCase()) return null;

  return trimEnd(trimmed.slice(0, trimmed.length - suffix.length));
}

/**
 * Removes WordPress's bracketed excerpt marker -- `[&hellip;]`, `[…]`, `[...]`
 * -- from the end of a deck, along with any whitespace around it.
 */
export function stripBracketedEllipsis(text: string) {
  const withoutBracket = stripSuffix(text, "]");

  if (withoutBracket === null) return text;

  for (const ellipsis of TRAILING_ELLIPSES) {
    const withoutEllipsis = stripSuffix(withoutBracket, ellipsis);

    if (withoutEllipsis === null) continue;

    const withoutOpen = stripSuffix(withoutEllipsis, "[");

    if (withoutOpen !== null) return withoutOpen;
  }

  return text;
}

/** Removes a bare trailing ellipsis, and any whitespace around it. */
export function stripTrailingEllipsis(text: string) {
  for (const ellipsis of TRAILING_ELLIPSES) {
    const stripped = stripSuffix(text, ellipsis);

    if (stripped !== null) return stripped;
  }

  return text;
}

/**
 * The leading sentences of a plain-text deck.
 *
 * A sentence is at least one non-terminating character, then a run of `.`, `!`
 * or `?`, then whitespace or the end of the text. Scanning resumes after each
 * terminator run whether or not the sentence was accepted: every start position
 * inside the body or the run produces the same outcome, so nothing is skipped
 * and nothing is re-examined.
 */
function leadingSentences(text: string, limit: number) {
  const sentences: string[] = [];
  let index = 0;

  while (index < text.length && sentences.length < limit) {
    const start = index;

    while (index < text.length && !SENTENCE_TERMINATORS.has(text[index])) index += 1;

    // Nothing terminates the tail, so it is not a sentence.
    if (index === text.length) break;

    const hasBody = index > start;

    while (index < text.length && SENTENCE_TERMINATORS.has(text[index])) index += 1;

    if (hasBody && (index === text.length || isWhitespace(text[index]))) {
      sentences.push(text.slice(start, index));
    }
  }

  return sentences;
}

/**
 * The "clean deck" treatment: at most two sentences of plain text.
 *
 * Packages configured with `cleanDeck` -- the More rail and the Sports lead --
 * render this instead of the raw excerpt HTML. It lives beside the view model
 * because it is part of what a `StoryView` *is*, and because both hosts have to
 * produce it identically: a Studio canvas showing the raw excerpt where the
 * published page shows two trimmed sentences makes a package look taller than
 * it really is.
 *
 * The input is already plain text; stripping markup is the host's job, since
 * only the host knows which field it came from.
 */
export function cleanDeckText(text: string, maxLength = 260) {
  const normalised = stripTrailingEllipsis(stripBracketedEllipsis(text)).trim();
  const sentences = leadingSentences(normalised, 2);

  if (sentences.length) return sentences.join(" ").trim();
  if (normalised.length <= maxLength) return normalised;

  const trimmed = normalised.slice(0, maxLength);
  const lastSpace = trimmed.lastIndexOf(" ");

  return `${trimmed.slice(0, lastSpace > 0 ? lastSpace : trimmed.length).trim()}...`;
}
