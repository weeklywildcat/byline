import { StoryNotes } from "./collections/StoryNotes";
import { ContentHealth } from "./collections/ContentHealth";
import { VideoFacts } from "./collections/VideoFacts";
import { Notifications } from "./collections/Notifications";
import { deliverNotificationTask, sendDueDigestTask, withFailureNotice } from "./newsroom/notifications";
import { refreshVideoFactsTask } from "./newsroom/video-facts";
import { contentHealthTask } from "./newsroom/health/content-health";
import { StoryActivity } from "./collections/StoryActivity";
import { Redirects } from "./collections/Redirects";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describeRepositoryInteractives, describeRepositoryTrackers, describeStoryPresentations, repositoryInteractiveRegistry, repositoryTrackerRegistry, storyPresentationRegistry } from "@byline/story-presentations";
import siteConfig from "@byline/site/config";
import { assertSiteCompatible } from "@byline/site-contract";
import { postgresAdapter } from "@payloadcms/db-postgres";
import { nodemailerAdapter } from "@payloadcms/email-nodemailer";
import nodemailer from "nodemailer";
import { buildConfig, type CollectionConfig } from "payload";
import sharp from "sharp";
import { WEB_APP_ICON_BASE, WEB_APP_MANIFEST_PATH } from "./newsroom/web-app-manifest";
import { atLeast, newsroomUser } from "./access/user";
import { googleEndpoints } from "./auth/google-endpoints";
import { Media, MEDIA_UPLOAD_MAX_BYTES } from "./collections/Media";
import { REPORTING_LIMITS } from "./domain/reporting";
import { mediaFolders } from "./collections/MediaFolders";
import { People } from "./collections/People";
import { Polls } from "./collections/Polls";
import { CollectionInterviews, CollectionResources, Collections } from "./collections/Collections";
import { Corrections, LiveUpdates, Pages } from "./collections/Publishing";
import { Stories } from "./collections/Stories";
import { StoryPlans } from "./collections/StoryPlans";
import { Appointments, ProductionAssignments, Sources, Tasks } from "./collections/StoryWork";
import { Sections, Topics } from "./collections/Taxonomies";
import { Users } from "./collections/Users";
import { NewsroomRoles, RoleAssignments, SchoolYears, StaffMemberships } from "./collections/Newsroom";
import { ReviewComments, ReviewRuns, ReviewWorkflows } from "./collections/Review";
import { addPollVotesTable } from "./db/poll-votes";
import { addPresenceSessionsTable } from "./db/presence-sessions";
import { addPublicationStateTable } from "./db/publication-state";
import { Events } from "./collections/Events";
import { ReportingFiles, ReportingNotes, ReportingTranscripts, TranscriptSelections } from "./collections/Reporting";
import { reportingEndpoints } from "./reporting/endpoints";
import { fieldEndpoints } from "./field/endpoints";
import { frontPageEndpoints } from "./front-page/endpoints";
import { activateFrontPageTask } from "./front-page/server";
import { FrontPageRevisions } from "./collections/FrontPage";
import { DistributionItems, DistributionSettings } from "./collections/Distribution";
import { distributionEndpoints } from "./distribution/endpoints";
import { Publication } from "./globals/Publication";
import { withPublicTracking } from "./public/tracking";
import { preparePublicSnapshotTask } from "./public/snapshot/task";
import { deployPublicSiteTask } from "./public/deployment";
import { advancePublicRevisionTask } from "./public/scheduled";
import { proseEditor } from "./editor/prose";
import { dropClientIds } from "./hooks/imported-ids";
import { newsroomTimeZone } from "./domain/dates";
import { newsroomEndpoints } from "./newsroom/endpoints";
import { COLLECTIONS_VIEW_PATH, REVIEW_WORKFLOWS_PATH } from "./domain/navigation";
import { preparePublicationMediaTask } from "./publication-media/task";
import { DataDatasets, DataProjects, DataRecords } from "./data/collections";
import { dataEndpoints } from "./data/endpoints";
import { DATA_PATH } from "./domain/navigation";

const dirname = path.dirname(fileURLToPath(import.meta.url));

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required. See apps/newsroom/.env.example.`);
  return value;
}

/**
 * Every collection refuses client-chosen IDs; only the controlled import may keep WordPress IDs.
 * Collections that reach the public site also record public mutations (`public/tracking.ts`).
 */
function withImportIdGuard(collection: CollectionConfig): CollectionConfig {
  return { ...collection, hooks: { ...collection.hooks, beforeValidate: [dropClientIds, ...(collection.hooks?.beforeValidate ?? [])] } };
}

/**
 * Media uses Payload's local upload adapter on the newsroom's persistent volume.
 * BYLINE_MEDIA_LOCAL_DIR selects that mounted directory through Media.staticDir;
 * prepared publication files live on a second volume, BYLINE_PUBLICATION_MEDIA_DIR
 * (docs/publication-media.md). Object storage may be added later for
 * backup/replication; it is not a runtime or public-delivery dependency.
 */

// Phase 0 spike: the server loads only the site's plain-data entry.
assertSiteCompatible(siteConfig);
if (process.env.BYLINE_SITE_SPIKE_LOG === "1") console.log(`[byline] newsroom site: ${siteConfig.id}`);

const collections: CollectionConfig[] = [
  Stories,
  StoryPlans,
  StoryActivity,
  StoryNotes,
  ContentHealth,
  VideoFacts,
  Notifications,
  People,
  Media,
  Sections,
  Topics,
  Collections,
  CollectionInterviews,
  CollectionResources,
  Corrections,
  Redirects,
  Pages,
  Events,
  LiveUpdates,
  Tasks,
  Sources,
  Appointments,
  ProductionAssignments,
  ReportingNotes,
  ReportingFiles,
  ReportingTranscripts,
  TranscriptSelections,
  FrontPageRevisions,
  DistributionItems,
  Polls,
  SchoolYears,
  StaffMemberships,
  NewsroomRoles,
  RoleAssignments,
  ReviewWorkflows,
  ReviewRuns,
  ReviewComments,
  DataDatasets,
  DataRecords,
  DataProjects,
  Users
];

/** `BYLINE_EMAIL_FROM`: `Name <address>` or a bare address. */
function emailFrom() {
  const value = (process.env.BYLINE_EMAIL_FROM ?? "").trim();
  const match = /^(.*?)\s*<([^<>\s]+)>$/.exec(value);
  return { name: match ? match[1].replace(/^"|"$/g, "") : "The Weekly Wildcat", address: match ? match[2] : value || "newsroom@localhost" };
}

export default buildConfig({
  serverURL: process.env.BYLINE_NEWSROOM_URL ?? "",
  secret: required("PAYLOAD_SECRET"),
  editor: proseEditor,
  sharp,
  // Notification email. Without BYLINE_SMTP_URL no adapter is configured and notifications stay in the Byline inbox.
  ...(process.env.BYLINE_SMTP_URL?.trim()
    ? { email: nodemailerAdapter({ defaultFromAddress: emailFrom().address, defaultFromName: emailFrom().name, transport: nodemailer.createTransport(process.env.BYLINE_SMTP_URL.trim()) }) }
    : {}),
  collections: collections.map((collection) => withImportIdGuard(withPublicTracking(collection))),
  // The publication's public configuration (administrators; drafts stage changes, only the published Global is public).
  globals: [Publication, DistributionSettings],
  // Camera originals are larger than Payload's 20 MB multipart default, and interview recordings larger still.
  // The multipart limit is the larger of the two; Media refuses anything over its own limit (collections/Media.ts).
  upload: { limits: { fileSize: Math.max(MEDIA_UPLOAD_MAX_BYTES, REPORTING_LIMITS.fileBytes) } },
  // Payload's native folders, for Media (logical organization, never storage paths).
  folders: mediaFolders,
  db: postgresAdapter({
    pool: { connectionString: required("DATABASE_URL") },
    // Development may push schema changes; production applies committed migrations only.
    push: process.env.BYLINE_DB_PUSH === "1" && process.env.NODE_ENV !== "production",
    migrationDir: path.resolve(dirname, "migrations"),
    // The WordPress import keeps existing IDs; `dropClientIds` stops anyone else choosing one.
    allowIDOnCreate: true,
    beforeSchemaInit: [addPollVotesTable, addPublicationStateTable, addPresenceSessionsTable]
  }),
  graphQL: { disable: true },
  // The newsroom screens' API (/api/byline/...); every handler re-checks the account.
  endpoints: [...newsroomEndpoints, ...reportingEndpoints, ...fieldEndpoints, ...frontPageEndpoints, ...distributionEndpoints, ...dataEndpoints, ...googleEndpoints],
  admin: {
    user: Users.slug,
    // Payload's default asks gravatar.com for every signed-in staff member's picture, which sends a hash of their
    // email address to a third party on each admin page. Byline shows initials and People portraits instead.
    avatar: "default",
    meta: {
      titleSuffix: " · Byline",
      robots: "noindex, nofollow",
      // Add to Home Screen / Dock: the manifest, the Weekly Wildcat's existing icons and a stable app title.
      // Deliberately no apple-mobile-web-app-status-bar-style: the page's own background decides the chrome.
      manifest: WEB_APP_MANIFEST_PATH,
      appleWebApp: { capable: true, title: "Byline" },
      icons: [
        { rel: "icon", type: "image/png", sizes: "32x32", url: `${WEB_APP_ICON_BASE}/favicon-32.png` },
        { rel: "apple-touch-icon", type: "image/png", sizes: "180x180", url: `${WEB_APP_ICON_BASE}/apple-touch-icon.png` }
      ]
    },
    importMap: { baseDir: dirname },
    // Read by Byline's client screens: dates show in the newsroom's timezone, never the browser's.
    custom: {
      newsroomTimeZone: newsroomTimeZone(),
      // The repository's story presentations as plain identities, for the Story header's status (the
      // components themselves never enter the admin bundle). Fixtures (story IDs 6 and 10) are development only.
      storyPresentations: describeStoryPresentations(storyPresentationRegistry({ fixtures: process.env.BYLINE_STORY_PRESENTATION_FIXTURES === "1" && process.env.NODE_ENV !== "production" })),
      // The repository's registered interactives as plain data, for the Repository Interactive block's picker.
      repositoryInteractives: describeRepositoryInteractives(repositoryInteractiveRegistry({ fixtures: process.env.BYLINE_STORY_PRESENTATION_FIXTURES === "1" && process.env.NODE_ENV !== "production" })),
      // The registered repository trackers as plain data (key, name, description): never their components, styles or client code.
      repositoryTrackers: describeRepositoryTrackers(repositoryTrackerRegistry({ fixtures: process.env.BYLINE_STORY_PRESENTATION_FIXTURES === "1" && process.env.NODE_ENV !== "production" }))
    },
    // Byline's Nova surfaces are light; Payload's chrome follows so the two never clash.
    theme: "light",
    components: {
      // The Byline shell: shadcn Sidebar/Create/Search state above every view,
      // Byline's sidebar in place of Payload's navigation, and Byline's sticky
      // app header. Payload's template, document and form infrastructure stay.
      providers: ["/ui/shell/BylineShellProvider#BylineShellProvider"],
      Nav: "/ui/shell/BylineNav#BylineNav",
      header: ["/ui/shell/BylineAppHeader#BylineAppHeader"],
      views: {
        login: { Component: "/auth/BylineLogin#BylineLogin" },
        dashboard: { Component: "/components/BylineHome#BylineHome", meta: { title: "Home" } },
        // Byline Stories. Payload's raw Stories list stays at /collections/stories for administrators.
        stories: { Component: "/components/BylineStories#BylineStories", path: "/stories", meta: { title: "Stories" } },
        // Byline Calendar: the newsroom schedule (Schedule-X), a destination of its own.
        calendar: { Component: "/components/BylineCalendar#BylineCalendar", path: "/calendar", meta: { title: "Calendar" } },
        // Byline Media: the asset Library (Payload Media, folders) and production Work. Raw Media stays an administrator fallback.
        media: { Component: "/components/BylineMedia#BylineMedia", path: "/media", meta: { title: "Media" } },
        // Byline Collections: reporting projects, served at exactly /admin/collections by app/(payload)/admin/collections/page.tsx
        // (Payload refuses a custom view there); Payload's raw /collections/<slug> screens are untouched.
        collections: { Component: "/components/BylineCollections#BylineCollections", path: COLLECTIONS_VIEW_PATH, exact: true, meta: { title: "Collections" } },
        people: { Component: "/components/BylinePeople#BylinePeople", path: "/people", exact: true, meta: { title: "People" } },
        // Byline Data: Datasets (the facts) and Projects (what readers see). Raw Data collections stay administrator fallback.
        data: { Component: "/components/BylineData#BylineData", path: DATA_PATH, exact: true, meta: { title: "Data" } },
        reviewWorkflows: { Component: "/components/BylineWorkflows#BylineWorkflows", path: REVIEW_WORKFLOWS_PATH, exact: true, meta: { title: "Review workflows" } },
        profile: { Component: "/components/BylineProfile#BylineProfile", path: "/profile", exact: true, meta: { title: "My profile" } },
        contentHealth: { Component: "/components/BylineContentHealth#BylineContentHealth", path: "/content-health", exact: true, meta: { title: "Content Health" } },
        site: { Component: "/components/BylineSite#BylineSite", path: "/site", exact: true, meta: { title: "Site" } },
        // Field Mode: a phone-first capture shell, without the desktop template.
        field: { Component: "/components/BylineField#BylineField", path: "/field", exact: true, meta: { title: "Field" } },
        // Front Page Desk: editorial priority over the code-owned homepage (editors).
        frontPage: { Component: "/components/BylineFrontPage#BylineFrontPage", path: "/front-page", exact: true, meta: { title: "Front Page" } },
        distribution: { Component: "/components/BylineDistribution#BylineDistribution", path: "/distribution", exact: true, meta: { title: "Distribution" } },
        // Administrators only: the entry to Payload's raw collection screens.
        system: { Component: "/components/SystemAdministration#SystemAdministration", path: "/system", meta: { title: "System administration" } }
      }
    }
  },
  jobs: {
    // Per-asset exclusive keys with `supersedes` (prepare-publication-media): one preparation per asset at a time;
    // one exclusive, superseding key for the public snapshot (prepare-public-snapshot), and one for deploy-hook delivery (deploy-public-site).
    enableConcurrencyControl: true,
    // Job API access stays administrator-only; Byline queues its own work as the system.
    access: {
      run: ({ req }) => atLeast(newsroomUser(req.user), "administrator"),
      queue: ({ req }) => atLeast(newsroomUser(req.user), "administrator"),
      cancel: ({ req }) => atLeast(newsroomUser(req.user), "administrator")
    },
    jobsCollectionOverrides: ({ defaultJobsCollection }) => ({
      ...defaultJobsCollection,
      admin: { ...defaultJobsCollection.admin, group: "System", hidden: ({ user }) => !atLeast(newsroomUser(user), "administrator") }
    }),
    // Queue ownership: `media` → `jobs:media` (Phase 5), `publication` → `jobs:publication`
    // (public snapshots + deploy hook), and `default` → `jobs:scheduled` (Payload's scheduled publish).
    tasks: [
      withFailureNotice(preparePublicationMediaTask, "Media preparation"),
      withFailureNotice(preparePublicSnapshotTask, "Public snapshot preparation"),
      withFailureNotice(deployPublicSiteTask, "Public site deployment"),
      advancePublicRevisionTask, contentHealthTask, refreshVideoFactsTask, deliverNotificationTask, sendDueDigestTask,
      withFailureNotice(activateFrontPageTask, "Front Page activation")
    ]
  },
  typescript: { outputFile: path.resolve(dirname, "payload-types.ts") },
  telemetry: false
});
