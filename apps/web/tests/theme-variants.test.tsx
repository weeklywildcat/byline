import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  getLeadPackageRenderer,
  getSportsPackageRenderer,
  type ResolvedLeadPackage,
  type ResolvedSportsPackage
} from "@byline/ui";

const resolved: ResolvedLeadPackage = {
  packageId: "home-lead",
  lead: {
    id: 1, title: "Lead headline", href: "/a/", deck: "Deck", deckIsHtml: false,
    isoDate: "2026-08-20T00:00:00", displayDate: "August 20, 2026", readingTime: null,
    category: { name: "News", href: "/category/news/" }, author: { name: "Reporter", href: "/author/r/" },
    image: null
  },
  latest: { heading: "The Latest", showBylines: true, stories: [{
    id: 2, title: "Second story", href: "/b/", deck: "", deckIsHtml: false,
    isoDate: "2026-08-19T00:00:00", displayDate: "August 19, 2026", readingTime: null,
    category: null, author: null, image: null
  }] },
  utility: { poll: true, calendar: false },
  presentation: { showDeck: true },
  fallbackAuthorName: "Staff",
  emptyMessage: "none"
};

describe("theme variants render the same package differently", () => {
  it("produces different markup for weekly-wildcat and editorial", () => {
    const WW = getLeadPackageRenderer("weekly-wildcat");
    const Ed = getLeadPackageRenderer("editorial");

    const wwHtml = renderToStaticMarkup(<WW package={resolved} pollSlot={<div id="poll" />} />);
    const edHtml = renderToStaticMarkup(<Ed package={resolved} pollSlot={<div id="poll" />} />);

    expect(wwHtml).not.toBe(edHtml);
    // Weekly Wildcat keeps the production three-column front.
    expect(wwHtml).toContain("top-stories-layout");
    expect(wwHtml).toContain("top-stories-rail");
    // Editorial uses its own structure entirely.
    expect(edHtml).toContain("editorial-lead-strip");
    expect(edHtml).not.toContain("top-stories-layout");

    // Both render the same content: a theme changes presentation only.
    for (const html of [wwHtml, edHtml]) {
      expect(html).toContain("Lead headline");
      expect(html).toContain("Second story");
      expect(html).toContain("The Latest");
      expect(html).toContain('id="poll"');
    }
  });
});

const resolvedSports: ResolvedSportsPackage = {
  packageId: "home-sports",
  heading: "Sports",
  sectionLink: { label: "All Sports →", href: "/sports/" },
  lead: {
    id: 10, title: "Wildcats open the season", href: "/s/10/", deck: "A two sentence deck.", deckIsHtml: false,
    isoDate: "2026-08-20T00:00:00", displayDate: "August 20, 2026", readingTime: null,
    category: { name: "Sports", href: "/category/sports/" }, author: { name: "Reporter", href: "/author/r/" },
    image: null
  },
  rail: [{
    id: 11, title: "Soccer kicks off", href: "/s/11/", deck: "", deckIsHtml: false,
    isoDate: "2026-08-19T00:00:00", displayDate: "August 19, 2026", readingTime: null,
    category: null, author: null, image: null
  }],
  athleteSpotlight: {
    id: 12, name: "Jordan Reyes", href: "/s/12/", eyebrow: "Athlete of the Week",
    sport: "Soccer", blurb: "Scored twice in the opener.", image: null
  },
  schedule: {
    panelHeading: "SCORES & SCHEDULE",
    scoresHeading: "Finals",
    upcomingHeading: "Upcoming",
    fullScheduleLink: { label: "FULL SCHEDULE →", href: "/sports/schedule/" },
    results: [{
      id: 21, sportLabel: "Football · Varsity", iconName: "mdi:football", matchup: "Wildcats at Rivals",
      scoreLabel: "24-17", team: { label: "Wildcats", score: "24", isWinner: true },
      opponent: { label: "Rivals", score: "17", isWinner: false },
      verdict: "Wildcats win by 7", context: "Road final", recapHref: "/recap/21/"
    }],
    upcoming: [{
      id: 31, isoDate: "2026-09-04T19:00:00", displayDate: "Sep 4, 2026 7:00 PM", siteLabel: "Home",
      sportLabel: "Soccer · Varsity", matchup: "Wildcats vs Rivals", location: "Wildcat Field"
    }],
    emptyUpcomingMessage: "No upcoming games"
  },
  presentation: { showDeck: true, showBylines: true },
  fallbackAuthorName: "Staff"
};

describe("theme variants render the same sports package differently", () => {
  it("produces different markup for weekly-wildcat and editorial", () => {
    const WW = getSportsPackageRenderer("weekly-wildcat");
    const Ed = getSportsPackageRenderer("editorial");

    const wwHtml = renderToStaticMarkup(<WW package={resolvedSports} />);
    const edHtml = renderToStaticMarkup(<Ed package={resolvedSports} />);

    expect(wwHtml).not.toBe(edHtml);
    // Weekly Wildcat keeps the production sports front.
    expect(wwHtml).toContain('class="from-field"');
    expect(wwHtml).toContain("field-schedule-layout");
    expect(wwHtml).toContain("sports-athlete-feature");
    // Editorial uses its own structure entirely.
    expect(edHtml).toContain("editorial-sports-ticker");
    expect(edHtml).toContain("editorial-sports-fixtures");
    expect(edHtml).not.toContain("from-field");
    expect(edHtml).not.toContain("field-schedule");

    // Both render the same content: a theme changes presentation only.
    for (const html of [wwHtml, edHtml]) {
      expect(html).toContain("Wildcats open the season");
      expect(html).toContain("Soccer kicks off");
      expect(html).toContain("Jordan Reyes");
      expect(html).toContain("Wildcats win by 7");
      expect(html).toContain("Wildcats vs Rivals");
      expect(html).toContain("Sports");
    }
  });

  it("cannot re-enable a module the resolver switched off", () => {
    const withoutSchedule = { ...resolvedSports, schedule: null };

    for (const themeId of ["weekly-wildcat", "editorial"]) {
      const Renderer = getSportsPackageRenderer(themeId);
      const html = renderToStaticMarkup(<Renderer package={withoutSchedule} />);

      expect(html).not.toContain("Wildcats win by 7");
      expect(html).not.toContain("Sep 4, 2026");
      // The stories the package still has are unaffected.
      expect(html).toContain("Wildcats open the season");
    }
  });

  it("renders nothing at all when the package has no content", () => {
    const empty: ResolvedSportsPackage = {
      ...resolvedSports,
      lead: null,
      rail: [],
      athleteSpotlight: null,
      schedule: null
    };

    for (const themeId of ["weekly-wildcat", "editorial"]) {
      const Renderer = getSportsPackageRenderer(themeId);

      expect(renderToStaticMarkup(<Renderer package={empty} />)).toBe("");
    }
  });
});
