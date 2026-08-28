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
  const normalised = text
    .replace(/\s*\[\s*(?:&hellip;|…|\.\.\.)\s*\]\s*$/i, "")
    .replace(/\s*(?:&hellip;|…|\.\.\.)\s*$/i, "")
    .trim();
  const sentences = normalised.match(/[^.!?]+[.!?]+(?=\s|$)/g);

  if (sentences?.length) return sentences.slice(0, 2).join(" ").trim();
  if (normalised.length <= maxLength) return normalised;

  const trimmed = normalised.slice(0, maxLength);
  const lastSpace = trimmed.lastIndexOf(" ");

  return `${trimmed.slice(0, lastSpace > 0 ? lastSpace : trimmed.length).trim()}...`;
}
