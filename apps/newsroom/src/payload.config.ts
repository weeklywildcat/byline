import path from "node:path";
import { fileURLToPath } from "node:url";
import { describeStoryPresentations, storyPresentationRegistry } from "@byline/story-presentations";
import { postgresAdapter } from "@payloadcms/db-postgres";
import { buildConfig, type CollectionConfig } from "payload";
import sharp from "sharp";
import { atLeast, newsroomUser } from "./access/user";
import { googleEndpoints } from "./auth/google-endpoints";
import { Media, MEDIA_UPLOAD_MAX_BYTES } from "./collections/Media";
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
import { addPollVotesTable } from "./db/poll-votes";
import { proseEditor } from "./editor/prose";
import { dropClientIds } from "./hooks/imported-ids";
import { newsroomTimeZone } from "./domain/dates";
import { newsroomEndpoints } from "./newsroom/endpoints";
import { COLLECTIONS_VIEW_PATH } from "./domain/navigation";
import { preparePublicationMediaTask } from "./publication-media/task";

const dirname = path.dirname(fileURLToPath(import.meta.url));

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required. See apps/newsroom/.env.example.`);
  return value;
}

/** Every collection refuses client-chosen IDs; only the controlled import may keep WordPress IDs. */
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

const collections: CollectionConfig[] = [
  Stories,
  StoryPlans,
  People,
  Media,
  Sections,
  Topics,
  Collections,
  CollectionInterviews,
  CollectionResources,
  Corrections,
  Pages,
  LiveUpdates,
  Tasks,
  Sources,
  Appointments,
  ProductionAssignments,
  Polls,
  Users
];

export default buildConfig({
  serverURL: process.env.BYLINE_NEWSROOM_URL ?? "",
  secret: required("PAYLOAD_SECRET"),
  editor: proseEditor,
  sharp,
  collections: collections.map(withImportIdGuard),
  // Camera originals are larger than Payload's 20 MB multipart default.
  upload: { limits: { fileSize: MEDIA_UPLOAD_MAX_BYTES } },
  // Payload's native folders, for Media (logical organization, never storage paths).
  folders: mediaFolders,
  db: postgresAdapter({
    pool: { connectionString: required("DATABASE_URL") },
    // Development may push schema changes; production applies committed migrations only.
    push: process.env.BYLINE_DB_PUSH === "1" && process.env.NODE_ENV !== "production",
    migrationDir: path.resolve(dirname, "migrations"),
    // The WordPress import keeps existing IDs; `dropClientIds` stops anyone else choosing one.
    allowIDOnCreate: true,
    beforeSchemaInit: [addPollVotesTable]
  }),
  graphQL: { disable: true },
  // The newsroom screens' API (/api/byline/...); every handler re-checks the account.
  endpoints: [...newsroomEndpoints, ...googleEndpoints],
  admin: {
    user: Users.slug,
    meta: { titleSuffix: " · Byline", robots: "noindex, nofollow" },
    importMap: { baseDir: dirname },
    // Read by Byline's client screens: dates show in the newsroom's timezone, never the browser's.
    custom: {
      newsroomTimeZone: newsroomTimeZone(),
      // The repository's story presentations as plain identities, for the Story header's status (the
      // components themselves never enter the admin bundle). Fixtures (story IDs 6 and 10) are development only.
      storyPresentations: describeStoryPresentations(storyPresentationRegistry({ fixtures: process.env.BYLINE_STORY_PRESENTATION_FIXTURES === "1" && process.env.NODE_ENV !== "production" }))
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
        dashboard: { Component: "/components/BylineHome#BylineHome" },
        // Byline Stories. Payload's raw Stories list stays at /collections/stories for administrators.
        stories: { Component: "/components/BylineStories#BylineStories", path: "/stories" },
        // Byline Calendar: the newsroom schedule (Schedule-X), a destination of its own.
        calendar: { Component: "/components/BylineCalendar#BylineCalendar", path: "/calendar" },
        // Byline Media: the asset Library (Payload Media, folders) and production Work. Raw Media stays an administrator fallback.
        media: { Component: "/components/BylineMedia#BylineMedia", path: "/media", meta: { title: "Media" } },
        // Byline Collections: reporting projects, served at exactly /admin/collections by app/(payload)/admin/collections/page.tsx
        // (Payload refuses a custom view there); Payload's raw /collections/<slug> screens are untouched.
        collections: { Component: "/components/BylineCollections#BylineCollections", path: COLLECTIONS_VIEW_PATH, exact: true, meta: { title: "Collections" } },
        people: { Component: "/components/BylinePeople#BylinePeople", path: "/people", exact: true, meta: { title: "People" } },
        profile: { Component: "/components/BylineProfile#BylineProfile", path: "/profile", exact: true, meta: { title: "My profile" } },
        // Administrators only: the entry to Payload's raw collection screens.
        system: { Component: "/components/SystemAdministration#SystemAdministration", path: "/system" }
      }
    }
  },
  jobs: {
    // Per-asset exclusive keys with `supersedes` (prepare-publication-media): one preparation per asset at a time.
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
    tasks: [preparePublicationMediaTask]
  },
  typescript: { outputFile: path.resolve(dirname, "payload-types.ts") },
  telemetry: false
});
