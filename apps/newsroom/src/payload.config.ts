import path from "node:path";
import { fileURLToPath } from "node:url";
import { postgresAdapter } from "@payloadcms/db-postgres";
import { s3Storage } from "@payloadcms/storage-s3";
import { buildConfig, type CollectionConfig, type Plugin } from "payload";
import sharp from "sharp";
import { atLeast, newsroomUser } from "./access/user";
import { Media } from "./collections/Media";
import { People } from "./collections/People";
import { Polls } from "./collections/Polls";
import { Coverages, Corrections, LiveUpdates, Pages } from "./collections/Publishing";
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

/** Private originals in R2 when configured; local disk in development. Downloads always pass Payload access control. */
function mediaStorage(): Plugin[] {
  const bucket = process.env.BYLINE_MEDIA_PRIVATE_BUCKET;
  if (!bucket) return [];
  return [
    s3Storage({
      bucket,
      acl: "private",
      collections: { media: true },
      config: {
        endpoint: required("BYLINE_R2_ENDPOINT"),
        region: "auto",
        forcePathStyle: true,
        credentials: { accessKeyId: required("BYLINE_R2_ACCESS_KEY_ID"), secretAccessKey: required("BYLINE_R2_SECRET_ACCESS_KEY") }
      }
    })
  ];
}

const collections: CollectionConfig[] = [
  Stories,
  StoryPlans,
  People,
  Media,
  Sections,
  Topics,
  Coverages,
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
  endpoints: newsroomEndpoints,
  admin: {
    user: Users.slug,
    meta: { titleSuffix: " · Byline", robots: "noindex, nofollow" },
    importMap: { baseDir: dirname },
    // Read by Byline's client screens: dates show in the newsroom's timezone, never the browser's.
    custom: { newsroomTimeZone: newsroomTimeZone() },
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
        dashboard: { Component: "/components/BylineHome#BylineHome" },
        // Administrators only: the entry to Payload's raw collection screens.
        system: { Component: "/components/SystemAdministration#SystemAdministration", path: "/system" }
      }
    }
  },
  jobs: {
    access: {
      run: ({ req }) => atLeast(newsroomUser(req.user), "administrator"),
      queue: ({ req }) => atLeast(newsroomUser(req.user), "administrator"),
      cancel: ({ req }) => atLeast(newsroomUser(req.user), "administrator")
    },
    jobsCollectionOverrides: ({ defaultJobsCollection }) => ({
      ...defaultJobsCollection,
      admin: { ...defaultJobsCollection.admin, group: "System", hidden: ({ user }) => !atLeast(newsroomUser(user), "administrator") }
    }),
    tasks: []
  },
  plugins: mediaStorage(),
  typescript: { outputFile: path.resolve(dirname, "payload-types.ts") },
  telemetry: false
});
