import { createGoogleFake } from "./google-fake.mjs";

/**
 * Preloaded into the newsroom's dev server for the Analytics browser tests (`node --import`): every Google
 * request the server makes is answered by the shared fake, with report rows that map to the seeded Stories by
 * their public paths. The browser never reaches Google; neither does this process.
 */
const google = createGoogleFake();
const { state } = google;
state.siteHtml = '<html><script id="byline-analytics-config" type="application/json">{"measurementId":"G-MAIN12345"}</script></html>';
const A = "/2026/11/10/news/where-the-sidewalk-stands/";
const B = "/2026/11/10/news/how-the-bands-ranked/";
state.fixtures = {
  "": [
    { dims: [], metrics: [4200, 1800, 2100, 108000], range: "current" }, { dims: [], metrics: [3000, 1500, 1700, 81000], range: "previous" }
  ],
  date: Array.from({ length: 7 }, (_, index) => ({ dims: [`202611${String(12 + index).padStart(2, "0")}`], metrics: [400 + index * 60, 200 + index * 20] })),
  "contentId,pagePath,pageTitle": [
    { dims: ["(not set)", A, "Where the sidewalk stands | Weekly Wildcat"], metrics: [1500, 700, 42000, 300], range: "current" },
    { dims: ["(not set)", A, "Where the sidewalk stands | Weekly Wildcat"], metrics: [900, 500, 20000, 100], range: "previous" },
    { dims: ["(not set)", B, "How the bands ranked | Weekly Wildcat"], metrics: [800, 400, 12000, 50], range: "current" },
    { dims: ["(not set)", "/", "Weekly Wildcat"], metrics: [1200, 900, 20000, 0], range: "current" }
  ],
  sessionDefaultChannelGroup: [{ dims: ["Organic Search"], metrics: [1200, 800, 900, 0.75] }, { dims: ["Direct"], metrics: [600, 400, 300, 0.5] }, { dims: ["Organic Social"], metrics: [300, 200, 150, 0.5] }],
  deviceCategory: [{ dims: ["mobile"], metrics: [1100] }, { dims: ["desktop"], metrics: [600] }, { dims: ["tablet"], metrics: [100] }],
  browser: [{ dims: ["Chrome"], metrics: [900] }, { dims: ["Safari"], metrics: [700] }],
  operatingSystem: [{ dims: ["iOS"], metrics: [800] }, { dims: ["Windows"], metrics: [500] }],
  country: [{ dims: ["United States"], metrics: [1700] }],
  region: [{ dims: ["South Carolina"], metrics: [900] }],
  newVsReturning: [{ dims: ["new"], metrics: [900, 900] }, { dims: ["returning"], metrics: [900, 0] }],
  sessionSourceMedium: [{ dims: ["google / organic"], metrics: [1200, 800, 0.75] }],
  "landingPage,sessionSourceMedium": [{ dims: [A, "google / organic"], metrics: [600, 0.8] }],
  eventName: [{ dims: ["page_view"], metrics: [5000, 1800, 0] }, { dims: ["byline_read_50"], metrics: [700, 400, 0] }, { dims: ["scroll"], metrics: [900, 500, 0] }],
  minutesAgo: [{ dims: ["00"], metrics: [6] }, { dims: ["01"], metrics: [4] }],
  unifiedScreenName: [{ dims: ["Where the sidewalk stands | Weekly Wildcat"], metrics: [7] }, { dims: ["Weekly Wildcat"], metrics: [2] }],
  "contentId,pagePath": [{ dims: ["(not set)", A], metrics: [1500, 700, 42000, 300] }],
  "date,contentId,pagePath": Array.from({ length: 7 }, (_, index) => ({ dims: [`202611${String(12 + index).padStart(2, "0")}`, "(not set)", A], metrics: [150 + index * 20, 80] })),
  "sessionDefaultChannelGroup,contentId,pagePath": [{ dims: ["Organic Search", "(not set)", A], metrics: [900] }],
  "pageReferrer,contentId,pagePath": [{ dims: ["https://www.google.com/", "(not set)", A], metrics: [800] }],
  "deviceCategory,contentId,pagePath": [{ dims: ["mobile", "(not set)", A], metrics: [500] }],
  "eventName,contentId,pagePath": [{ dims: ["byline_read_25", "(not set)", A], metrics: [400] }, { dims: ["byline_read_50", "(not set)", A], metrics: [260] }]
};
// The realtime total shares the "no dimensions" key with the overview totals; one more row would double it, so give it its own answer.
const original = state.fixtures[""];
const handle = google.handle;
google.handle = async (input, init) => {
  const body = typeof init?.body === "string" && String(input).includes(":runRealtimeReport") ? JSON.parse(init.body) : null;
  if (body && !(body.dimensions ?? []).length) {
    state.fixtures[""] = [{ dims: [], metrics: [9] }];
    try { return await handle(input, init); } finally { state.fixtures[""] = original; }
  }
  return handle(input, init);
};
google.install();
