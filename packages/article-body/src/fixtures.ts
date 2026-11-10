import { ARTICLE_BODY_FORMAT, ARTICLE_BODY_VERSION, type ArticleBlock, type ArticleBlockType, type ArticleBody, type ArticleMediaAsset, type ArticleReferences } from "./types";

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
  "106": media({ id: 106, src: "newsroom-meeting-before.jpg", width: 1600, height: 1067, mimeType: "image/jpeg", filename: "newsroom-meeting-before.jpg", alt: "The empty serving line before the express station opened.", credit: "Jordan Lee" }),
  "107": media({ id: 107, src: "newsroom-meeting-after.jpg", width: 1600, height: 1067, mimeType: "image/jpeg", filename: "newsroom-meeting-after.jpg", alt: "The serving line with the express station window open.", credit: "Jordan Lee" }),
  "108": media({ id: 108, src: "embed.svg", width: 1200, height: 675, mimeType: "image/svg+xml", filename: "lunch-wait-times.svg", alt: "Bar chart of average lunch-line wait by period.", credit: "" }),
  "202": media({ id: 202, kind: "audio", src: "audio.wav", width: null, height: null, mimeType: "audio/wav", filename: "royal-interview.wav", alt: "", credit: "", filesize: 4096 }),
  "201": media({ id: 201, kind: "document", src: "document.pdf", width: null, height: null, mimeType: "application/pdf", filename: "district-nutrition-services-budget-2026.pdf", alt: "", credit: "", filesize: 328 })
};

const paragraph = (text: string) => ({ type: "paragraph" as const, children: [{ type: "text" as const, text }] });

/** The public facts a body names about other records, as a host resolves them. */
export const FIXTURE_REFERENCES: ArticleReferences = {
  stories: {
    "501": { id: 501, headline: "Greenwood adds a second lunch period", href: "/2025/09/12/news/second-lunch-period/", section: "News", publishedAt: "2025-09-12T14:00:00.000Z", thumbnail: 104 },
    "502": { id: 502, headline: "What the student council survey found", href: "/2025/10/02/news/lunch-survey/", section: "Opinion", publishedAt: "2025-10-02T14:00:00.000Z" }
  },
  events: {
    "701": { id: 701, title: "School board budget vote", eventType: "Meeting", startAt: "2026-01-14T23:00:00.000Z", endAt: "2026-01-15T01:00:00.000Z", allDay: false, location: "Greenwood High library", description: "The board votes on the Nutrition Services request, including the third serving window.", externalUrl: "https://example.org/board/2026-01-14", eventStatus: "scheduled" }
  },
  polls: {
    "601": { id: "lunch-line", question: "How long do you usually wait for lunch?", options: [{ id: "under-5", label: "Under 5 minutes" }, { id: "5-10", label: "5 to 10 minutes" }, { id: "over-10", label: "More than 10 minutes" }], votingOpen: true }
  }
};

/** The one repository interactive the fixture registry knows. */
export const FIXTURE_INTERACTIVE_KEY = "fixture-lunch-line";
/** The one repository tracker the fixture registry knows. */
export const FIXTURE_TRACKER_KEY = "fixture-sidewalk-project";

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
    layout: "grid",
    items: [
      { id: "g1", media: 103, caption: "Junior Amara Okafor eats on the courtyard steps after giving up on the line." },
      { id: "g2", media: 104, caption: "Cafeteria manager Denise Royal checks orders at the new express station, which opened Oct. 6." }
    ]
  },
  reportedQuote: {
    type: "reportedQuote",
    id: "blk-reported",
    text: "We are feeding 1,400 students in two lunch periods with a kitchen built for 900. Every minute we save at the register is a minute a kid gets to sit down.",
    attribution: "Denise Royal, Greenwood cafeteria manager",
    sourceUrl: "https://example.org/board/2025-10-21-minutes",
    sourceLabel: "School board minutes, Oct. 21"
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
    ],
    presentation: "standard"
  },
  context: {
    type: "context",
    id: "blk-context",
    heading: "Why it matters",
    body: [
      {
        type: "paragraph",
        children: [
          { type: "text", text: "Research on school meals has found that students with " },
          { type: "text", text: "less than 20 minutes", bold: true },
          { type: "text", text: " to eat throw away more food and eat fewer fruits and vegetables, according to a " },
          { type: "link", href: "https://example.org/school-meal-time-study", children: [{ type: "text", text: "Harvard study", italic: true }] },
          { type: "text", text: ". At Greenwood, students in the back half of the second-lunch line routinely have about 12." }
        ]
      },
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
      { id: "p1", page: 4, label: "Wait times by school and lunch period", excerpt: "Greenwood's second lunch has the longest average wait in the district, 14 minutes." },
      { id: "p2", page: 9, label: "Cost of a third serving window" }
    ]
  },
  timeline: {
    type: "timeline",
    id: "blk-timeline",
    items: [
      { id: "t1", label: "Aug. 2025", title: "Enrollment passes 1,400", body: "Greenwood opens the school year with its largest enrollment since the building opened.", current: false },
      { id: "t2", label: "Sept. 2025", title: "Student council surveys the lunch line", body: "More than 600 students answer; 71% say they regularly have less than 15 minutes to eat.", current: false, link: { url: "https://example.org/greenwood-lunch-survey", label: "Survey results" } },
      { id: "t3", label: "Oct. 6, 2025", title: "Express station opens", body: "Students can pre-order a wrap or salad on the school app and pick it up at a separate window.", current: false, image: { media: 104, caption: "The express station window on its first day." } },
      { id: "t4", label: "Jan. 2026", title: "School board votes on the budget", body: "The board is scheduled to vote on the Nutrition Services request at its Jan. 14 meeting.", current: true, document: { media: 201, page: 9 } }
    ]
  },
  portraitText: {
    type: "portraitText",
    id: "blk-portrait",
    media: 103,
    heading: "The student who stopped waiting",
    body: [
      paragraph("Amara Okafor is a junior who runs a bake sale on Fridays to pay for the debate team's bus."),
      paragraph("Since October she has eaten lunch on the courtyard steps, where she says the line is never an excuse to be late.")
    ],
    caption: "Okafor on the courtyard steps.",
    side: "left"
  },
  video: {
    type: "video",
    id: "blk-video",
    videoId: "dQw4w9WgXcQ",
    title: "Inside the second-lunch line",
    caption: "Filmed Oct. 14 at Greenwood High.",
    chapters: [{ id: "vc1", time: 0, label: "The bell" }, { id: "vc2", time: 84, label: "The express window" }],
    transcript: "Narrator: The bell for second lunch rings at 11:38.\n\nOkafor: You can tell who has a class on the far side of the building."
  },
  audio: {
    type: "audio",
    id: "blk-audio",
    media: 202,
    title: "Denise Royal on the express station",
    caption: "Recorded Oct. 20 in the cafeteria kitchen.",
    transcript: "Reporter: How long did the express station take to set up?\n\nRoyal: About two weeks. The hard part was finding space for a second window without losing a register.",
    chapters: [{ id: "ac1", time: 0, label: "Setting up the station" }, { id: "ac2", time: 42, label: "Finding a second window" }]
  },
  editorsNote: { type: "editorsNote", id: "blk-editors-note", body: [paragraph("This story was updated Oct. 22 to correct the date the express station opened.")] },
  marginNote: { type: "marginNote", id: "blk-margin", heading: "About the survey", body: [paragraph("The student council survey was open Sept. 8 to Sept. 19 and was not a random sample.")] },
  expandable: { type: "expandable", id: "blk-expandable", heading: "How we timed the line", body: [paragraph("Reporters timed 40 students in the second-lunch line on five school days in October, starting when each joined the queue and ending when each reached the register.")] },
  chartMap: {
    type: "chartMap",
    id: "blk-chart",
    mode: "interactive",
    url: "https://datawrapper.dwcdn.net/AbCdE/",
    provider: "datawrapper",
    image: 108,
    title: "Average wait by lunch period",
    dek: "Minutes from joining the line to the register, October 2025.",
    summary: "Second-lunch students wait an average of 14 minutes, almost twice as long as first-lunch students at 8 minutes.",
    source: "Weekly Wildcat timing study",
    notes: "40 students timed over five days.",
    credit: "Weekly Wildcat",
    height: "standard"
  },
  dataTable: {
    type: "dataTable",
    id: "blk-table",
    title: "Lunch wait times by period",
    description: "Average minutes in line, by lunch period.",
    columns: [{ id: "c1", label: "Period" }, { id: "c2", label: "Students" }, { id: "c3", label: "Average wait (min)" }],
    rows: [
      { id: "r1", cells: ["First lunch", "690", "8"] },
      { id: "r2", cells: ["Second lunch", "710", "14"] }
    ],
    presentation: "standard",
    rowHeaders: true,
    source: "Greenwood School District",
    notes: "Rounded to the nearest minute."
  },
  comparison: {
    type: "comparison",
    id: "blk-comparison",
    heading: "One window or two",
    left: { label: "Current", title: "One serving window", body: [paragraph("Every student queues at the main window, and each register serves about four students a minute.")] },
    right: { label: "Proposed", title: "A third window", body: [paragraph("The district's budget request adds a third window, which staff estimate would cut the longest waits roughly in half.")] }
  },
  keyNumbers: {
    type: "keyNumbers",
    id: "blk-numbers",
    heading: "The line in numbers",
    source: "District data and Weekly Wildcat reporting",
    items: [
      { id: "n1", value: "1,400", label: "students served in two periods", context: "The kitchen was built for 900." },
      { id: "n2", value: "14 min", label: "average second-lunch wait" },
      { id: "n3", value: "$48,000", label: "proposed cost of a third window" }
    ]
  },
  annotatedImage: {
    type: "annotatedImage",
    id: "blk-annotated",
    media: 101,
    caption: "The second-lunch line at 11:42 a.m.",
    placement: "wide",
    markers: [
      { id: "m1", x: 22, y: 48, title: "The back of the line", body: "Students here have about 12 minutes left to eat." },
      { id: "m2", x: 71, y: 40, title: "The trophy case", body: "The line wraps past it and around the corner toward the gym." }
    ]
  },
  beforeAfter: {
    type: "beforeAfter",
    id: "blk-before-after",
    before: 106,
    after: 107,
    beforeLabel: "Before",
    afterLabel: "After",
    fit: "cover",
    caption: "The serving area before and after the express station opened.",
    placement: "wide"
  },
  visualChapter: {
    type: "visualChapter",
    id: "blk-chapter",
    media: 105,
    eyebrow: "Part two",
    heading: "What the district can do",
    dek: "Money, space and who decides.",
    placement: "full",
    align: "bottom-left"
  },
  relatedCoverage: { type: "relatedCoverage", id: "blk-related", heading: "Related coverage", stories: [{ id: "s1", story: 501 }, { id: "s2", story: 502 }] },
  poll: { type: "poll", id: "blk-poll", poll: 601 },
  repositoryInteractive: { type: "repositoryInteractive", id: "blk-interactive", key: FIXTURE_INTERACTIVE_KEY, title: "Build your own lunch schedule", description: "A calculator that shows how a change in period length changes the longest wait." },
  repositoryTracker: { type: "repositoryTracker", id: "blk-tracker", key: FIXTURE_TRACKER_KEY, title: "Where the sidewalk project stands", description: "The Main Street sidewalk project has finished two of its five phases; the crossing at Greenwood High is next." },
  dataProject: { type: "dataProject", id: "blk-data-project", project: 1, title: "Where the sidewalk project stands", description: "Milestones, funding and the work still left to do on the Main Street sidewalk." },
  event: { type: "event", id: "blk-event", event: 701 },
  socialPost: { type: "socialPost", id: "blk-social", url: "https://www.instagram.com/p/C0ffEeLunch1/", provider: "instagram", postId: "C0ffEeLunch1", caption: "The student council posted its survey results on Instagram the morning they were released." },
  finalScore: { type: "finalScore", id: "blk-score", sport: "Football", teamA: "Greenwood", teamAScore: 42, teamB: "Abbeville", teamBScore: 14, status: "final", date: "2025-10-17", location: "Wildcat Stadium", note: "Region championship" }
};

/** Chart / Map in native mode: drawn by Byline from the reporter's table. */
export const FIXTURE_NATIVE_CHART: Extract<ArticleBlock, { type: "chartMap" }> = {
  type: "chartMap",
  id: "blk-native-chart",
  mode: "native",
  image: null,
  title: "Second lunch waits nearly twice as long",
  dek: "Average minutes from joining the line to reaching the register, by day, October 2025.",
  summary: "On every day reporters timed, second-lunch students waited longer than first-lunch students; the gap was widest on Friday, 16 minutes to 8.",
  source: "Weekly Wildcat timing study",
  notes: "40 students timed over five days.",
  height: "standard",
  chartType: "bar",
  data: {
    columns: [{ id: "nc0", label: "Day" }, { id: "nc1", label: "First lunch" }, { id: "nc2", label: "Second lunch" }],
    rows: [
      { id: "nr1", cells: ["Monday", "7", "13"] },
      { id: "nr2", cells: ["Tuesday", "8", "14"] },
      { id: "nr3", cells: ["Wednesday", "8", "12"] },
      { id: "nr4", cells: ["Thursday", "9", "15"] },
      { id: "nr5", cells: ["Friday", "8", "16"] }
    ]
  }
};

/** The whole fixture story, prose and every block, in reading order. */
export const FIXTURE_ARTICLE_BODY: ArticleBody = {
  format: ARTICLE_BODY_FORMAT,
  version: ARTICLE_BODY_VERSION,
  media: FIXTURE_MEDIA,
  references: FIXTURE_REFERENCES,
  nodes: [
    {
      type: "paragraph",
      children: [
        { type: "text", text: "The bell for second lunch rings at 11:38 a.m. By the time junior Amara Okafor reaches the cafeteria, the line already curls past the trophy case." },
        { type: "footnote", id: "fn-timing", text: "Timed by Weekly Wildcat reporters on Oct. 14; the bell rings at 11:38 a.m." }
      ]
    },
    {
      type: "paragraph",
      children: [
        { type: "text", text: "“You can tell who has a class on the far side of the building,” Okafor said. “They’re the ones at the back.” The wait has become " },
        { type: "text", text: "the", italic: true },
        { type: "text", text: " complaint at Greenwood this fall, and it surfaced in a " },
        { type: "link", href: "https://example.org/greenwood-lunch-survey", children: [{ type: "text", text: "student council survey" }] },
        { type: "text", text: " that drew more than 600 responses." },
        { type: "source", id: "src-survey", kind: "web", url: "https://example.org/greenwood-lunch-survey", label: "Student council lunch survey results", note: "Published Sept. 22 by the Greenwood student council." },
        { type: "footnote", id: "fn-survey", text: "The survey was open Sept. 8 to Sept. 19 and was not a random sample." }
      ]
    },
    FIXTURE_BLOCKS.photo,
    FIXTURE_BLOCKS.editorsNote,
    paragraph("Cafeteria staff say the problem is space, not effort. The serving line was built when the school enrolled about 900 students; this year it serves roughly 1,400 in two periods."),
    FIXTURE_BLOCKS.keyNumbers,
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
    FIXTURE_BLOCKS.portraitText,
    FIXTURE_BLOCKS.audio,
    FIXTURE_BLOCKS.keyFacts,
    paragraph("Not every student has the school app, and some said they did not know the express station existed."),
    FIXTURE_BLOCKS.pullQuote,
    FIXTURE_BLOCKS.marginNote,
    FIXTURE_BLOCKS.context,
    FIXTURE_BLOCKS.video,
    FIXTURE_BLOCKS.chartMap,
    FIXTURE_NATIVE_CHART,
    FIXTURE_BLOCKS.dataTable,
    FIXTURE_BLOCKS.socialPost,
    FIXTURE_BLOCKS.annotatedImage,
    FIXTURE_BLOCKS.beforeAfter,
    FIXTURE_BLOCKS.visualChapter,
    { type: "heading", level: 3, children: [{ type: "text", text: "What the district has proposed" }] },
    {
      type: "paragraph",
      children: [
        { type: "text", text: "The district's 2026 budget request, released Oct. 21, asks for money to add a third serving window at Greenwood." },
        { type: "source", id: "src-budget", kind: "document", media: 201, page: 9, label: "Nutrition Services budget request, 2026" },
        { type: "footnote", id: "fn-budget", text: "Nutrition Services budget request, 2026, page 9." }
      ]
    },
    FIXTURE_BLOCKS.comparison,
    FIXTURE_BLOCKS.expandable,
    FIXTURE_BLOCKS.document,
    FIXTURE_BLOCKS.timeline,
    FIXTURE_BLOCKS.relatedCoverage,
    FIXTURE_BLOCKS.event,
    FIXTURE_BLOCKS.poll,
    FIXTURE_BLOCKS.repositoryInteractive,
    FIXTURE_BLOCKS.repositoryTracker,
    paragraph("Greenwood's football team, meanwhile, eats after practice. The Wildcats closed the regular season with a win."),
    FIXTURE_BLOCKS.finalScore,
    paragraph("Until then, Okafor said, she will keep eating on the steps.")
  ]
};

/**
 * The first eight blocks and prose only, with no related stories, polls or
 * repository interactives: the story the snapshot v1 gates (which render
 * through the compatibility bridge and carry no references) seed from.
 */
const FIRST_PHASE = new Set(["photo", "gallery", "reportedQuote", "pullQuote", "keyFacts", "context", "document", "timeline"]);
export const FIXTURE_FIRST_PHASE_BODY: ArticleBody = {
  ...FIXTURE_ARTICLE_BODY,
  references: undefined,
  nodes: FIXTURE_ARTICLE_BODY.nodes
    .filter((node) => node.type === "paragraph" || node.type === "heading" || node.type === "list" || FIRST_PHASE.has(node.type))
    // Inline Source references (and the timeline's attached evidence) came later than the first phase.
    .map((node) => (node.type === "paragraph" ? { ...node, children: node.children.filter((child) => child.type !== "source") } : node.type === "timeline" ? { ...node, items: node.items.map(({ image: _image, link: _link, document: _document, ...event }) => event) } : node))
};
