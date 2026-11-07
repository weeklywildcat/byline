import { ARTICLE_BODY_FORMAT, ARTICLE_BODY_VERSION, type ArticleBlock, type ArticleBlockType, type ArticleBody, type ArticleMediaAsset } from "./types";

/**
 * A realistic Weekly Wildcat story in `byline-v1`, using every first-phase
 * block with real lengths: the renderer tests, the editor/public parity
 * harness and the newsroom acceptance story all read this one fixture.
 *
 * Media `src` values are paths under `tests/fixtures/story-media/`; each host
 * maps them to a URL it can serve (`fixtureMediaSrc`).
 */

const media = (asset: Omit<ArticleMediaAsset, "kind" | "filesize"> & Partial<Pick<ArticleMediaAsset, "kind" | "filesize">>): ArticleMediaAsset => ({ kind: "image", filesize: null, ...asset });

export const FIXTURE_MEDIA: Record<string, ArticleMediaAsset> = {
  "101": media({ id: 101, src: "newsroom-panorama.jpg", width: 1600, height: 615, mimeType: "image/jpeg", filename: "newsroom-panorama.jpg", alt: "Students wait in a long line that wraps past the trophy case outside the Greenwood High cafeteria.", credit: "Maya Torres" }),
  "102": media({ id: 102, src: "newsroom-meeting.jpg", width: 1600, height: 1067, mimeType: "image/jpeg", filename: "newsroom-meeting.jpg", alt: "Members of the student council review cafeteria survey results around a table.", credit: "Jordan Lee" }),
  "103": media({ id: 103, src: "newsroom-laughing.jpg", width: 1600, height: 2000, mimeType: "image/jpeg", filename: "newsroom-laughing.jpg", alt: "A junior laughs with friends while eating lunch on the courtyard steps.", credit: "Maya Torres" }),
  "104": media({ id: 104, src: "newsroom-tablet.jpg", width: 1600, height: 2000, mimeType: "image/jpeg", filename: "newsroom-tablet.jpg", alt: "A cafeteria worker checks orders on a tablet at the new express station.", credit: "Jordan Lee" }),
  "105": media({ id: 105, src: "newsroom-square.jpg", width: 1600, height: 1600, mimeType: "image/jpeg", filename: "newsroom-square.jpg", alt: "Trays of chicken wraps and fruit cups wait under heat lamps.", credit: "" }),
  "201": media({ id: 201, kind: "document", src: "document.pdf", width: null, height: null, mimeType: "application/pdf", filename: "district-nutrition-services-budget-2026.pdf", alt: "", credit: "", filesize: 328 })
};

const paragraph = (text: string) => ({ type: "paragraph" as const, children: [{ type: "text" as const, text }] });

export const FIXTURE_BLOCKS: { [K in ArticleBlockType]: Extract<ArticleBlock, { type: K }> } = {
  photo: {
    type: "photo",
    id: "blk-photo",
    media: 101,
    caption: "By 11:42 a.m. on a Tuesday in October, the second-lunch line at Greenwood High stretched from the serving windows past the trophy case and around the corner toward the gym, leaving some students fewer than 12 minutes to eat.",
    placement: "wide"
  },
  gallery: {
    type: "gallery",
    id: "blk-gallery",
    fit: "natural",
    items: [
      { id: "g1", media: 103, caption: "Junior Amara Okafor eats on the courtyard steps after giving up on the line." },
      { id: "g2", media: 104, caption: "Cafeteria manager Denise Royal checks orders at the new express station, which opened Oct. 6." }
    ]
  },
  reportedQuote: {
    type: "reportedQuote",
    id: "blk-reported",
    text: "We are feeding 1,400 students in two lunch periods with a kitchen built for 900. Every minute we save at the register is a minute a kid gets to sit down.",
    attribution: "Denise Royal, Greenwood cafeteria manager"
  },
  pullQuote: {
    type: "pullQuote",
    id: "blk-pull",
    text: "Some days I just buy chips from the vending machine because I know I won't make it to the front.",
    attribution: "Theo Martinez, sophomore"
  },
  keyFacts: {
    type: "keyFacts",
    id: "blk-facts",
    heading: "Key facts",
    facts: [
      { id: "f1", text: "Greenwood serves about 1,400 students in two 30-minute lunch periods." },
      { id: "f2", text: "The kitchen and serving line were built in 1998 for a school of 900." },
      { id: "f3", text: "An express station for pre-ordered meals opened Oct. 6 and served 212 students in its first week." },
      { id: "f4", text: "The district's proposed 2026 budget adds $48,000 for a third serving window." }
    ]
  },
  context: {
    type: "context",
    id: "blk-context",
    heading: "Why it matters",
    body: [
      paragraph("Research on school meals has found that students with less than 20 minutes to eat throw away more food and eat fewer fruits and vegetables. At Greenwood, students in the back half of the second-lunch line routinely have about 12."),
      paragraph("Lunch is also the only meal of the day for some students: 38% of Greenwood students qualify for free or reduced-price meals, according to state data.")
    ]
  },
  document: {
    type: "document",
    id: "blk-document",
    media: 201,
    title: "Nutrition Services budget request, 2026",
    context: "The request asks for a third serving window and two part-time cashiers, and lists Greenwood's average wait times by period.",
    source: "Greenwood School District, released Oct. 21",
    pages: [
      { id: "p1", page: 4, label: "Wait times by school and lunch period" },
      { id: "p2", page: 9, label: "Cost of a third serving window" }
    ]
  },
  timeline: {
    type: "timeline",
    id: "blk-timeline",
    items: [
      { id: "t1", label: "Aug. 2025", title: "Enrollment passes 1,400", body: "Greenwood opens the school year with its largest enrollment since the building opened.", current: false },
      { id: "t2", label: "Sept. 2025", title: "Student council surveys the lunch line", body: "More than 600 students answer; 71% say they regularly have less than 15 minutes to eat.", current: false },
      { id: "t3", label: "Oct. 6, 2025", title: "Express station opens", body: "Students can pre-order a wrap or salad on the school app and pick it up at a separate window.", current: false },
      { id: "t4", label: "Jan. 2026", title: "School board votes on the budget", body: "The board is scheduled to vote on the Nutrition Services request at its Jan. 14 meeting.", current: true }
    ]
  }
};

/** The whole fixture story, prose and blocks, in reading order. */
export const FIXTURE_ARTICLE_BODY: ArticleBody = {
  format: ARTICLE_BODY_FORMAT,
  version: ARTICLE_BODY_VERSION,
  media: FIXTURE_MEDIA,
  nodes: [
    paragraph("The bell for second lunch rings at 11:38 a.m. By the time junior Amara Okafor reaches the cafeteria, the line already curls past the trophy case."),
    {
      type: "paragraph",
      children: [
        { type: "text", text: "“You can tell who has a class on the far side of the building,” Okafor said. “They’re the ones at the back.” The wait has become " },
        { type: "text", text: "the", italic: true },
        { type: "text", text: " complaint at Greenwood this fall, and it surfaced in a " },
        { type: "link", href: "https://example.org/greenwood-lunch-survey", children: [{ type: "text", text: "student council survey" }] },
        { type: "text", text: " that drew more than 600 responses." }
      ]
    },
    FIXTURE_BLOCKS.photo,
    paragraph("Cafeteria staff say the problem is space, not effort. The serving line was built when the school enrolled about 900 students; this year it serves roughly 1,400 in two periods."),
    FIXTURE_BLOCKS.reportedQuote,
    { type: "heading", level: 2, children: [{ type: "text", text: "A kitchen built for a smaller school" }] },
    paragraph("Royal said her team has already made the changes it can make without construction:"),
    {
      type: "list",
      ordered: false,
      items: [
        { children: [{ type: "text", text: "a second register at the main window;" }] },
        { children: [{ type: "text", text: "pre-wrapped " }, { type: "text", text: "grab-and-go", bold: true }, { type: "text", text: " meals at the end of the line;" }] },
        { children: [{ type: "text", text: "and the express station for students who order ahead." }] }
      ]
    },
    FIXTURE_BLOCKS.gallery,
    FIXTURE_BLOCKS.keyFacts,
    paragraph("Not every student has the school app, and some said they did not know the express station existed."),
    FIXTURE_BLOCKS.pullQuote,
    FIXTURE_BLOCKS.context,
    { type: "heading", level: 3, children: [{ type: "text", text: "What the district has proposed" }] },
    paragraph("The district's 2026 budget request, released Oct. 21, asks for money to add a third serving window at Greenwood."),
    FIXTURE_BLOCKS.document,
    FIXTURE_BLOCKS.timeline,
    paragraph("Until then, Okafor said, she will keep eating on the steps.")
  ]
};
