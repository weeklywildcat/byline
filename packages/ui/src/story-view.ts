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
