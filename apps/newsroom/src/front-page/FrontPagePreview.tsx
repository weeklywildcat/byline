import { homepageSlots, type HomepagePlacements } from "@byline/design";
import { weeklyWildcatTheme } from "@byline/theme-weekly-wildcat";
import { HomepagePackages } from "@byline/ui";
import { resolveHomepageDocument, type HomepagePublicationInput } from "@byline/ui/homepage";
import type { Payload } from "payload";
import { publicationConfigFromGlobal, readPublishedPublication } from "../public/publication-config";
import { cleanPlacements, homeDesign } from "./server";
import { FrontPageSlotOverlays } from "./SlotOverlays";
import { publishedHomepageStories } from "./stories";

/**
 * Server-rendered: the same resolver and components as the static build, over
 * published Stories and the desk's pending (or live) placements. Utility
 * modules (poll, calendar, newsletter form) are shown as quiet placeholders:
 * they are not editorial slots.
 */
export async function FrontPagePreview({ payload, view }: { payload: Payload; view: "pending" | "live" }) {
  const publication = publicationConfigFromGlobal(await readPublishedPublication(payload), 0);
  const stories = await publishedHomepageStories(payload, publication);
  const revisions = await payload.find({ collection: "front-page-revisions", where: { state: { in: view === "live" ? ["active"] : ["draft", "active"] } }, depth: 0, pagination: false, overrideAccess: true });
  const pick = (state: string) => revisions.docs.find((row) => row.state === state);
  const placements: HomepagePlacements = cleanPlacements((view === "pending" ? pick("draft") ?? pick("active") : pick("active"))?.placements);
  const input: HomepagePublicationInput = {
    shortName: publication.identity.shortName, name: publication.identity.name, organizationName: publication.identity.organizationName,
    contactHref: publication.urls.contact, social: publication.social.map(({ label, url, service }) => ({ label, url, service })),
    features: { polls: publication.features.polls === true, events: publication.features.events === true, sports: publication.features.sports === true, newsletter: publication.features.newsletter === true },
    calendarHeading: publication.appearance?.theme === "weekly-wildcat" ? "At NSHS" : `At ${publication.identity.organizationName}`
  };
  const resolved = resolveHomepageDocument({ document: homeDesign(), stories: stories.map((story) => story.input), publication: input, sportsSchedule: { recentScores: [], upcomingGames: [] }, placements });
  const hrefs = Object.fromEntries(stories.map((story) => [story.input.id, story.input.view.href]));
  const labels = Object.fromEntries(homepageSlots(homeDesign()).map((slot) => [slot.id, slot.label]));
  const placeholder = (label: string) => <div data-utility-placeholder="" style={{ border: "1px dashed #bbb", padding: 12, fontSize: 12, color: "#666" }}>{label} (not an editorial slot)</div>;
  return (
    <main className="byline-publication-preview live-home-shell" data-theme={weeklyWildcatTheme.id} data-front-page-preview={view}>
      <HomepagePackages
        packages={resolved.packages}
        theme={weeklyWildcatTheme.id}
        slots={{ poll: () => placeholder("Poll"), calendar: () => placeholder("This week"), newsletter: () => placeholder("Newsletter sign-up") }}
      />
      <FrontPageSlotOverlays slots={resolved.slots.map((slot) => ({ ...slot, label: labels[slot.id] ?? slot.id, href: slot.storyId ? hrefs[slot.storyId] ?? null : null }))} issues={resolved.placementIssues.length} />
    </main>
  );
}
