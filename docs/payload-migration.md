# Payload + PostgreSQL migration

Byline is the newsroom product. Payload is its application and database
framework. Astro remains the newspaper.

This is the working record for replacing WordPress as Byline's control plane. It
is a strangler migration: the WordPress production path stays authoritative and
fully functional until the parity and cutover gates at the end of this document
are met. Nothing here deletes WordPress data.

Status is tracked in [§11](#11-phases-gates-and-status). Branch:
`feature/payload-newsroom` (stacked on `feature/visual-stories`, PR #226, because
that PR reshapes the presentation registry Phase 4 extracts).

## 1. Invariants

These do not change at any phase.

- **Astro renders the public site statically on Cloudflare.** No SSR, no public
  runtime article fetches, no Next.js public renderer. The newspaper keeps
  serving if Payload or PostgreSQL is down; only newsroom editing and the live/
  poll runtime APIs degrade.
- **One small discovery pointer + one immutable snapshot artifact** per
  production build. The build blocks every CMS request and fails postbuild on a
  violation (`build-snapshots.md`).
- **SEO stays in Astro**: metadata, canonical URLs, Open Graph, NewsArticle,
  VideoObject, LiveBlogPosting, Person, NewsMediaOrganization, sitemaps (image,
  news, video), RSS, robots. Payload supplies editorial facts only.
- **One renderer.** Public pages and the newsroom Live Preview import the same
  `StoryArticle`, presentation resolver, custom presentations and `@byline/ui`
  pieces. There is no "preview version" of a component.
- **Presentation resolution order**: repository custom presentation (keyed by
  stable story ID) → Immersive when chosen and valid → Standard.
- **Editorial workflow is separate from publication state.** Workflow never
  advances on save; `published` is derived.
- **Private newsroom data never enters a public projection** (snapshot, live
  feed, poll API, manifests): briefs, tasks, sources, appointments, deadlines,
  resource links, notes, user accounts, unpublished versions, secrets.
- **Public compatibility contracts**: article URLs, story/media/person IDs where
  practical, `ww_voter_id` / `ww_poll_voted_<pollId>` cookies and their
  signature/voter-key derivation, `/api/polls/*` and `/api/live/<storyId>`.
- **Writers never get** arbitrary HTML/JS/CSS, colors, fonts, widths, layout
  columns, raw iframes or a page builder. The homepage stays code-defined.
- **No duplicate infrastructure**: Payload's Versions, Drafts, Autosave,
  scheduled publish, document locking, Jobs Queue and Access Control are used
  natively; no second revision engine, scheduler, lock or queue.

## 2. Where everything lives today

### 2.1 WordPress-owned domains

| Domain | WordPress storage today | Payload target |
| --- | --- | --- |
| Stories | `post`; Gutenberg HTML in `post_content`; settings in postmeta exposed as `byline`/`weeklyWildcat` REST fields | `stories` (Versions + Drafts + Autosave + schedulePublish + locking) |
| Publication state | `post_status` (`draft`, `pending`, `future`, `publish`, `private`) + `post_date` | Payload `_status` (`draft`/`published`), versions, scheduled publish jobs |
| Workflow | `_wwh_story_workflow_status`, editor, `_wwh_story_deadline`, `_byline_story_planned_publish_at` (`docs/editorial-workflow.md`) | `story-plans` (unversioned; see §4.3) |
| Presentation | postmeta `presentation`, `immersiveAlignment` (`includes/content/story-presentation.php`) | `stories.presentation`, `stories.immersiveAlignment` |
| Story format / video | `format` (`standard`/`video`), video URL + cached YouTube metadata (`includes/content/story-video.php`, `packages/core/src/story-video.ts`) | `stories.format` (`standard`/`video`/`audio`), `stories.video` group, filled by a job |
| Reporting note | postmeta (`includes/content/reporting-note.php`) | `stories.reportingNote` |
| Contributors | Byline contributor relationship (users + guests) and the WordPress post author | `stories.contributors` → `people` (ordered) |
| People | WordPress users + author profile meta (role, pronouns, photo, directory flag, socials, Discord/Google linkage); `byline_guest` posts | `users` (accounts) + `people` (public identities) |
| Sections / topics | `category` / `post_tag` | `sections` / `topics` |
| Coverages / series | `byline_coverage` (`includes/editorial/coverage.php`), ordered story list | `coverages` with ordered `stories` relationship |
| Corrections | `byline_correction` + legacy inline notices (`includes/editorial/corrections.php`) | `corrections` |
| Live coverage | `byline_live_update` child posts + coverage state meta (`includes/editorial/live-coverage.php`) | `live-updates` + `stories.liveCoverage` group |
| Pages | `page` + page blocks (`includes/content/pages.php`, `page-blocks.php`) | `pages` (Versions + Drafts) |
| Media | attachments + creator/credit/copyright/license/source meta, `bylineImage.artDirection` crops (`image-art-direction.php`, `photo-credits.php`) | `media` (uploads, private storage, materialization) |
| Tasks | `byline_task` | `tasks` |
| Brief | `_byline_story_brief` (4,000 chars) | `story-plans.brief` |
| Sources | `_byline_story_sources_v1` (30, serialized) | `sources` |
| Appointments | `_byline_story_appointments_v1` (40, serialized) | `appointments` |
| Production | `_byline_story_media_assignments_v2` (12) + legacy `_byline_story_visual_request_v1` projected as `legacy-v1` | `production-assignments` (import materializes `legacy-v1`) |
| Resource links | `_byline_story_resources` (24) | `story-plans.resources` bounded array |
| Activity | `includes/editorial/activity.php` | `story-activity` (later; human summaries + UUIDs only) |
| Presets | `includes/editorial/presets.php` (five, test-pinned) | code-defined presets: Blank, News, Sports recap, Photo story, Video story, Investigation, plus the existing Opinion and Breaking (Phase 3) |
| Feedback | `includes/editorial/feedback.php` | `feedback` (Phase 11) |
| Polls | `byline_poll` + `wp_*_byline_poll_votes` | `polls` + dedicated `byline_poll_votes` table |
| School events | `ww_school_event` | `events` (Phase 7, snapshot dataset `schoolEvents`) |
| Sports archive | native Pages + legacy `ww_sports_*` read-only records | imported as Pages; legacy source records archived, not modelled |
| Publication settings | options + `includes/publication/config.php` | `publication` global (admin) |
| Public revision / snapshots | options + `includes/publication/{public-revisions,build-snapshot}.php`, MySQL advisory lock | `publication-state` table + jobs (Phase 7/9) |
| Durable jobs | `includes/core/jobs.php` | Payload Jobs Queue |
| Deployment hooks | `includes/integrations/deployment.php` | jobs `request-cloudflare-build`, `verify-deployment` |
| Notifications / digests | `includes/editorial/notifications.php` | jobs |
| Discord | `includes/integrations/discord.php` + `apps/discord-bot` | Phase 12 adapter over Payload Local API |
| MCP | `includes/mcp/*` (PHP SDK + OAuth) + `packages/mcp-contracts` | Phase 12 adapter; contracts kept |
| Content health | `includes/content-health/*` | readiness layer (`src/domain/readiness.ts`) |
| Home / Planning / Workspace UI | React 19 roots in `wordpress-plugin/src/{home,planning,workspace,story,admin-ui}` | ported into Payload custom views (§7) |

### 2.2 Public snapshot v1: field → source

Snapshot v1 (`schemas/public-build-snapshot.schema.json`, consumer
`apps/web/lib/prepared-snapshot.ts`) carries **WordPress REST shapes**
(`title.rendered`, `_embedded["wp:featuredmedia"]`, `byline.*` settings). That
is why `apps/web/lib/article-presentation.ts` is typed around `WordPressPost`.

| Dataset | Fields used by the renderer | WordPress source | Payload source |
| --- | --- | --- | --- |
| `posts` | id, date(_gmt), modified(_gmt), slug, title/excerpt/content `.rendered`, author, featured_media, categories, tags, sticky, `byline.{presentation, immersiveAlignment, reportingNote, format, video, contributors, corrections, live, primaryGameId, gameScoreGameIds}`, `_embedded` author/media/terms | post + postmeta + embeds | published `stories` version + relations |
| `authors` | public profile: name, slug, role, pronouns, bios, photo, socials, directory flag, public contact | users + profile meta | `people` with a linked staff user, or `directoryVisible` |
| `guests` | name, slug, bio, role, hasProfilePage, profilePhoto, links | `byline_guest` | `people` without a user |
| `categories` / `tags` | id, name, slug, description, count | terms | `sections` / `topics` |
| `pages` | rendered page, slug, parent, template/noindex | `page` | published `pages` |
| `corrections` | id, type, text, date, storyId, story summary | `byline_correction` | `corrections` on published stories |
| `coverages` | slug, title, format, description, overview, start/end, status, artwork, ordered stories | `byline_coverage` | `coverages` |
| `schoolEvents` | canonical event records | `ww_school_event` | `events` |
| `attachments` | referenced public metadata, sizes, `bylineImage.artDirection` | attachments | materialized `media` (public URLs only) |

Phase 7 emits this **same v1 shape** from Payload (a compatibility projection,
so the unchanged Astro build can run shadow builds). Phase 9 adds v2 (§6).

### 2.3 Story tools (Gutenberg) → Lexical blocks

From `docs/newsroom-blocks.md` and `docs/visual-storytelling-audit.md`.
"Retire" means not offered for new content; historical content keeps rendering
through `legacy-html`.

| Today | Decision | Lexical block |
| --- | --- | --- |
| Core paragraph/heading/list/link/bold/italic | keep (H2/H3 only) | Lexical core features |
| Photo (Core image + crops), Wide/Full-bleed variations | combine; width is an editorial choice from a fixed set (`column`, `wide`, `full`) | `photo` |
| Photo Gallery, Photo Pair, Photo Essay pattern | combine | `gallery` |
| Portrait + Text | keep | `portraitText` |
| Visual Chapter (Cover) | keep | `visualChapter` |
| Story Video / Story Audio variations | combine into approved providers | `video`, `audio` |
| Reported Quote, Pull Quote | keep (one family) | `reportedQuote`, `pullQuote` |
| Key Facts | keep | `keyFacts` |
| Context / Why It Matters / What's Next / How We Know | combine: Context with a renamable heading | `context` |
| Editor's Note, Margin Note | keep | `editorsNote`, `marginNote` |
| Read More / Methodology / Full Statement | combine | `expandable` |
| Document Viewer | keep, improve for investigations | `document` |
| Footnotes (Core) | keep | `footnotes` |
| Chart / Map (Datawrapper, Flourish, Google Maps, OSM, static) | keep | `chartMap` |
| Data Table, Comparison Table | combine (`standard`/`comparison` style) | `dataTable` |
| Comparison, Three Key Numbers | keep; Main + Aside retired | `comparison`, `keyNumbers` |
| Annotated Image | keep (direct-manipulation markers) | `annotatedImage` |
| Before / After | keep (Before left) | `beforeAfter` |
| Timeline | keep | `timeline` |
| In This Story (table of contents) | derived from H2s; not a block | renderer |
| Related Coverage | keep | `relatedCoverage` |
| Poll | keep | `poll` |
| Game Score, Sports Schedule | legacy only; Game Score kept for compatibility | `gameScore` (hidden from the slash menu) |
| Correction Notice block | retire: corrections are records | `corrections` collection |
| Interactive (`byline/interactive`, sandboxed uploaded HTML) | **replaced** by Repository Interactive (stable key, code in repo) plus approved providers; uploaded HTML is never accepted | `repositoryInteractive` |
| Stories, People, Events (page blocks) | pages only | page blocks |
| Scrollytelling | **open decision**, see §10.1 | — |

### 2.4 Story Workspace permissions

`byline_story_context()` (`includes/editorial/story-context.php`) is ported as
`storyRelationship()` in `apps/newsroom/src/access/story-context.ts`:

| Relationship | Brief, sources, appointments | Production | Article copy / canonical fields |
| --- | --- | --- | --- |
| **Manager**: contributor (via linked person), assigned editor, creator, or editor/admin role | read/add/edit/delete any | add/edit; assign others only as editor/admin | contributors edit copy; workflow/editor/deadline fields need editor+ |
| **Participant**: holds a task, production assignment, source or appointment on it | read/update only records assigned to them; create appointments for themselves | status, notes and files of their own assignment | none (read limited context only) |
| **Unrelated staff** | none | none | none (may see public published stories only) |

Enforced with collection `access` (returning `Where` constraints so list queries
are filtered in SQL), field-level `access`, and `beforeChange` guards. React
visibility is a convenience, never the control. Unrelated staff may read
published stories but never a newer draft of one (`readVersions` is limited to
managers; integration-tested), and never a plan.

### 2.5 Runtime and integration dependencies

| Dependency | Today | After |
| --- | --- | --- |
| Polls | Worker `/api/polls/{active,vote}` → `wp-json/byline/v1/polls/*`; votes table with `UNIQUE(poll_id, voter_key)`; HMAC cookie | Worker → Payload endpoints `/api/byline/polls/*`; Postgres `byline_poll_votes` with the same unique key; same cookie format and secret |
| Live coverage | Worker `/api/live/<id>` → `wp-json/byline/v1/live/<id>`; static `/_byline/live/<id>.json` | Worker → Payload `/api/byline/live/<id>` (published-safe projection) |
| Build discovery | `wp-json/byline/v1/build-snapshot` pointer → uploads artifact | public R2 pointer + immutable artifact |
| Build trigger | WordPress durable job → deploy hook | Payload job → Cloudflare deploy hook |
| Media at build | Astro downloads WordPress uploads (`copy-wordpress-media-to-out.mjs`) | permanent public R2 URLs in the snapshot; mirroring kept only for `legacy` media during transition |
| Discord bot | calls `byline/v1` + `weekly-wildcat/v1` with signed requests | calls a Payload adapter; saves never wait on Discord |
| MCP | PHP SDK in the plugin, WordPress OAuth | Node adapter in `apps/newsroom` over Local API, `@byline/mcp-contracts` unchanged |

### 2.6 Renderer dependencies

- `@byline/ui` already owns the CMS-independent model (`ArticlePresentation` in
  `packages/ui/src/article-view.tsx`) and the Standard and Immersive views
  (`ArticleView`, `ImmersiveArticleView`, `PresentedArticleView`).
- `apps/web/story-presentations/` owns `StoryArticle`, `registry.ts`, `types.ts`,
  `client.ts` (Vite `import.meta.glob`), `StoryStyles` and the story folders.
  Importers: the article route (`src/pages/[segment]/.../[articleSlug].astro`,
  `views/.../page.tsx`), `lib/wordpress.ts`, three tests, and
  `scripts/story-presentation.mjs` (scaffold) plus
  `apps/web/scripts/{astro-with-publication,test-snapshot-build}.mjs`.
- `apps/web/lib/article-presentation.ts` mixes three things: WordPress field
  access (`lib/wordpress.ts`), Byline public rules (hidden categories, related
  scoring, series placement, update notice, reading time) and image projection
  (`lib/media.ts`).

## 3. What gets extracted, rewritten or removed

**Extract and share (no rewrite):**

- `apps/web/story-presentations/*` → `packages/story-presentations`
  (`@byline/story-presentations`). The registry, resolver, types and every story
  folder move; `apps/web` and `apps/newsroom` both import it. The visual-story
  client loader keeps its per-story chunking through a bundler-neutral
  `clients` map supplied by each host.
- The Byline rules in `article-presentation.ts` (related scoring, series
  placement, update threshold, reading time, correction labels, contributor
  coverage areas) → `@byline/content` `story-presentation/` operating on a
  canonical `PublicStory` model. WordPress becomes one adapter
  (`apps/web/lib/adapters/wordpress-story.ts`), Payload another.
- Pure Story Workspace models (`wordpress-plugin/src/workspace/schedule-model.ts`,
  `reporting-model.ts`, `appointment-form.ts`, `media-form.ts`,
  `planning/calendar-model.ts`, `home/newsroom-model.ts`) → reused in the
  newsroom views; they have no WordPress imports beyond fetch adapters.
- The Nova primitives, CMS-independent compositions, stylesheet and scope
  plugin → `packages/newsroom-ui` (**done**). `StoryPeek` and the domain
  components follow as each screen is ported.
- `packages/core` (`image-crops.ts`, `live-coverage.ts`, `story-video.ts`,
  `publication.ts`) is already CMS-neutral and is used as-is.

**Rewrite against Payload:** storage, REST routes, capabilities, PHP domain code,
Gutenberg blocks/editor plugins, media handling, jobs, snapshot generator,
notifications, Discord and MCP adapters.

**Disappears at retirement (Phase 16):** `wordpress-plugin/` runtime,
`weekly-wildcat-headless.php`, the updater bridge (kept until existing sites no
longer need it, `docs/updater-transition.md`), `scripts/{package-plugin.sh,
build-plugin-mcp.sh, test-plugin-php.sh, run-wordpress-e2e.sh}`,
`apps/web/lib/wordpress.ts` as a source (its types survive only inside the
legacy adapter), `copy-wordpress-media-to-out.mjs` for new media, and the
`/wp-json` Worker upstreams. `legacy-html` rendering stays forever.

## 4. Target architecture

```text
apps/newsroom  (Payload 3 + Next.js 16, private)
  ├── Payload admin with Byline custom views (Home, Stories, Planning, Calendar,
  │   Media, Coverage, Search; Polls/Feedback/People for editors;
  │   Pages/Publication/System for administrators)
  ├── collections + access control + hooks  (src/collections, src/access)
  ├── domain rules                           (src/domain: workflow, schedule, presets, readiness)
  ├── public projections                     (src/public: snapshot, live, polls)
  ├── Jobs Queue tasks                       (src/jobs)
  └── /preview/story/<id>  private Live Preview → @byline/story-presentations
PostgreSQL  (@payloadcms/db-postgres; byline_poll_votes via beforeSchemaInit)
R2 private  (originals, drafts)        R2 public (materialized media + snapshots)
apps/web    (Astro, unchanged contract) ← pointer + immutable snapshot
```

Production topology: one Payload/Next service, one dedicated `payload jobs:run`
worker (same image), PostgreSQL, two R2 buckets, the existing Cloudflare site.
No Redis, search service or extra microservices.

### 4.1 Accounts and people

- `users` (auth): `email`, `name`, `role` (`staff` | `editor` |
  `administrator`), `enabled`, `linkedPerson`, `preferences`, `breakGlass`,
  integration linkage (`googleSubject`, `discordUserId`). Payload's
  `local` password strategy stays enabled **only** so break-glass
  administrators can sign in; a `beforeLogin` hook refuses password login for
  everyone else once Google sign-in is configured (`BYLINE_GOOGLE_CLIENT_ID`).
  The first account ever created is forced to an enabled break-glass
  administrator (Payload's create-first-user form would otherwise make Staff),
  and the last enabled administrator cannot be demoted or disabled.
- Google Workspace sign-in (Phase 1b) is a Payload custom `auth.strategies`
  entry that verifies a Google ID token (issuer, audience, `hd`, `email_verified`)
  and then **looks up an existing enabled user** by email/subject. It never
  creates a user; being on the Workspace domain grants nothing.
- `people`: `name`, `slug`, `pronouns`, `newsroomRole`, `shortBio`, `bio`,
  `portrait`, `directoryVisible`, `publicEmail`, `socials`, `status`
  (`active`/`alumni`/`guest`). Disabling or deleting a user never touches
  people or bylines (`linkedPerson` is on the user, and a person is never
  deleted by a user hook).

### 4.2 Stories

One `stories` collection. Opinion, features, sports recaps, photo essays,
investigations and data stories are compositions of it, never separate
collections.

- Copy: `headline`, `slug`, `deck`, `kicker`, `section`, `topics`,
  `contributors` (people, ordered), `featuredMedia` + `featuredCaption`,
  `contentFormat` (`byline-v1` | `legacy-html`), `body` (Lexical, when
  `byline-v1`), `legacyHtml` + `legacySource` (read-only, when `legacy-html`),
  `format` (`standard`/`video`/`audio`), `video` (`url`; `metadata` written by
  a job), `presentation` (`standard`/`immersive`), `immersiveAlignment`
  (`bottom-left`/`center`), `reportingNote`, `publishedAt`, `legacy.wordpressId`.
- Newsroom state is **not** on the story; see §4.3.
- `live` is **not** a format. `liveCoverage` (`state`, `startedAt`, `endedAt`)
  plus `live-updates` records.
- Publication uses Payload `_status`; scheduled publish/unpublish uses Payload's
  `schedulePublish`. No custom publication-status field.

### 4.3 Story plans: newsroom state outside the versioned story

Payload writes a draft save **only to the versions table**
(`collections/operations/utilities/update.js`: `if (!isSavingDraft) updateOne`),
so the main `stories` row of an unpublished story keeps its create-time values.
Workflow, editor, deadline and planned publication on the story would therefore
go stale for every main-table query, travel with autosave, and be brought back
by a version restore.

They live instead on **`story-plans`**, one unversioned record per story,
created by the story's `afterChange` hook: `workflow`, `editor`, `deadline`
(date-only text), `plannedPublication`, `brief`, `resources[]` (24), plus
`contributors` (copied from the story's latest save, drafts included) and
`createdBy`. This is the WordPress behavior carried over: workflow already
saved on its own endpoint, immediately and independently of the post's draft.

- Access decisions read the team from the plan, so adding a co-writer in a
  draft grants access at once (integration-tested).
- Field rules: managers move workflow and edit brief/links; only editors set
  the editor, deadline and planned publication. Staff cannot create plans.
- `published` is derived from the story's `_status`; nothing writes it.

### 4.4 Story Workspace collections

`tasks`, `sources`, `appointments`, `production-assignments` with real
`story` relationships and indexes; limits from §2.1 enforced in `beforeValidate`.
Appointments keep `scheduleMode` (`unscheduled`/`window`/`exact`): the server
decides which timing fields survive; a window is date-only text and is never
converted to an instant. Sources keep **no contact fields**.

### 4.5 Media

Upload originals go to a private bucket (R2 via `@payloadcms/storage-s3`,
`signedDownloads`); the newsroom and Live Preview read them through Payload's
authenticated file route. Publishing a story enqueues `materialize-public-media`,
which writes content-hashed renditions (`/media/<sha256>/<width>.<ext>`) to the
public bucket and records them on the media document. Public objects are never
deleted because a media record changed. Credits belong to the asset; captions
belong to the story's use of it. Crop shapes and focal point reuse
`@byline/core` `image-crops.ts`. Candidate widths 320/640/960/1280/1600/2048,
never upscaled.

### 4.6 Polls

`polls` holds definitions with stable `pollKey` and answer `optionId`s (IDs
preserved from WordPress). Votes live in `byline_poll_votes`, added with the
Postgres adapter's `beforeSchemaInit` so Drizzle migrations own it, with
`UNIQUE(poll_id, voter_key)`. The table is not a Payload collection: no admin
screen, no REST/GraphQL exposure. Cookie names, `voterId.base64url(HMAC)` and
`base64url(SHA-256(secret:voterId))` are byte-compatible.

## 5. Live Preview and presentation parity

- Payload `admin.livePreview` on `stories` with a dynamic URL
  `/preview/story/<id>` and breakpoints Phone 390×844, Tablet 820×1180,
  Desktop 1440×900.
- The preview route is in `apps/newsroom/src/app/(preview)`: it requires an
  authenticated user with story context (`payload.auth({ headers })`), sends
  `X-Robots-Tag: noindex, nofollow` and `Cache-Control: private, no-store`, loads
  the initial story through the Local API with `draft: true` and the user's
  access, then a client island subscribes with `useLivePreview` and re-normalizes
  each unsaved state into `ArticlePresentation`.
- The SAME `StoryArticle` from `@byline/story-presentations` renders it, so a
  registered custom presentation wins over Immersive in preview exactly as it
  does publicly. The Story header shows "Custom presentation: <name>" when the
  registry has an entry.
- Administrators can preview an unregistered presentation against a draft via
  `?presentation=<name>` from `previewPresentations` (a separate dev-only map in
  the package). It never affects the public registry or a published page.
- Draft media in preview uses Payload's authenticated file URLs; the published
  projection switches to public R2 URLs. Dimensions, crops and object positions
  are identical.

Launch-blocking parity tests (§11 Phase 4 gate) cover every item in the brief:
Standard/Immersive/custom selection, alignment and featured media updating
unsaved, crops/focal point, the custom override, the same module identity in
both hosts, slots/footer/corrections parity, SEO only from the Astro route,
reduced motion and the three breakpoints.

## 6. Snapshot v2

```ts
type PublicArticleBody =
  | { format: "legacy-html"; html: string }
  | { format: "byline-v1"; root: StructuredArticleBody };
```

- Imported WordPress stories stay `legacy-html`; new stories are `byline-v1`.
- `StructuredArticleBody` is a public projection of the Lexical tree with only
  allowlisted node types and block fields (`@byline/content` schema +
  runtime validator). Private block fields (none today) are stripped.
- `ArticleBody` in `@byline/ui` renders both: legacy through the current HTML
  path, structured through Byline block components.
- Lifecycle (from the WordPress generator): commit → advance public revision in
  the same transaction → enqueue `prepare-snapshot` → generate against R →
  validate → verify R unchanged → bytes + SHA-256 → upload immutable artifact →
  promote pointer → `request-cloudflare-build` → `verify-deployment`. A stale R
  is never promoted; jobs coalesce to the newest revision. Autosaves, drafts and
  private collection writes never advance the revision.

## 7. Newsroom UI: Byline on top, Payload underneath

```text
Byline shadcn/Nova UI          (@byline/newsroom-ui + apps/newsroom/src/ui)
  → Payload admin/document/form contexts and APIs
  → Payload domain and storage
  → PostgreSQL
```

Payload is the application and data framework, **not** the visual design
system. Writers and editors use Byline. If replacing WordPress makes the
newsroom feel like somebody else's CMS, the migration is wrong.

**Payload supplies, natively:** authentication and sessions, access control,
document form state, validation, drafts, autosave, versions, document locking,
scheduled publishing, upload state, Live Preview plumbing, jobs, Local API and
REST.

**Byline supplies every staff-facing surface**, in the one Nova design system
(`packages/newsroom-ui`, moved out of the WordPress plugin so both admins use
the same components): Home, Stories, Planning, Calendar, Media Desk, Coverage,
the Story screen (Write / Plan / Production / History), the article editor's
interface, Preview, People, Polls, Feedback, search and the command palette.
Buttons, menus, Command, Dialog/AlertDialog, Popover, Tooltip, ContextMenu,
Tabs, Sheet, avatars, calendars, Cards/Items/Fields, Sonner and the existing
workflow/status components are Nova's. No second visual library is
introduced; Payload's UI components appear only where they carry document/form
integration, styled so they do not dictate how Byline looks.

**Extension points, in order of preference:**

1. **Dashboard** (`admin.components.views.dashboard`) → Byline Home.
2. **List views** (`collection.admin.components.views.list.Component`) →
   Byline Stories, Media Desk, People, Coverage, Polls, Feedback.
3. **Story screen.** Payload's `DefaultEditView` owns the `Form`, autosave, the
   lock/take-over/read-only handling, leave-without-saving, stale-data
   detection and the Live Preview window. Replacing it (or the document root)
   would mean re-implementing that infrastructure and risks a second copy of
   document state, so the default Edit view **stays as invisible
   infrastructure** and everything visible is Byline:
   - the story's fields sit inside one presentational `collapsible` whose
     custom `Field` component is the Byline Story screen. It reads and writes
     the real form through `useField`/`useForm`/`useDocumentInfo`, and renders
     Payload field components (the Lexical engine) through `RenderFields` only
     where Payload must own the input;
   - Payload's document header, tabs and controls are hidden on this screen;
     the Byline header presents the same actions (Publish, Unpublish, Preview,
     save state) by calling the same form/document APIs Payload's buttons do;
   - the story plan, sources, appointments, tasks and production are separate
     records (§4.3/§4.4) and are edited through access-controlled REST, never
     mirrored into the story form.
   A full document-root override is used only if these APIs prove
   insufficient, and that decision is recorded here first.
4. **The shell** (`admin.components.providers`, `Nav`, `header`) → the Byline
   application shell (§7.2). Nobody sees Payload's generic collection
   navigation. Administrators reach the raw collection screens from *System
   administration* in the account menu, never from the newsroom navigation.

Generic Payload list/edit screens remain reachable by administrators as a
fallback. They are not the product, and staff are never sent to them; until a
Byline view exists for a destination, it is absent from staff navigation.

**Every custom view and endpoint re-checks the user on the server**
(`requestUser`, Local API with `overrideAccess: false`). Being inside the admin
layout is not access control.

The port reuses the existing React 19 code: Home (`src/home`), Planning board,
list and calendar (`src/planning`, Schedule-X adapter, Pragmatic DnD), Story
Workspace sections (`src/workspace`), `StoryPeek` and the Nova primitives.
Their `*-api.ts` fetch adapters are swapped for Payload adapters; models and
components move with as little change as possible. The article editor keeps
Lexical as its state engine with a Byline interface (slash menu, block
toolbars, dialogs, media selectors, reorder controls) built from Nova. Live
Preview's chrome is Byline; Payload supplies the unsaved-document messages, and
`@byline/story-presentations` renders the page.

### 7.1 Where the UI stands

Built (Phase 1b, branch `feature/payload-newsroom`):

- `@byline/newsroom-ui`: the Nova system, shared by both admins (compiled plugin
  CSS byte-identical after the move).
- The Next app compiles it through `postcss/byline-ui.cjs`, which runs
  Tailwind and the `.byline-ui-root` scope **only** for `src/ui/*.css`;
  Payload's own CSS passes through untouched. Nova's `dark:` variant follows
  Payload's `html[data-theme]` (pinned light), never the OS.
- The Byline shell (§7.2): the shadcn Sidebar application shell replaces
  Payload's `Nav`, Byline's sticky app header replaces Payload's, and one global
  Create and ⌘K palette work on every screen.
- The Byline Story screen (`src/ui/story`), mounted as the custom `Field` of a
  presentational collapsible around every story field: header (headline,
  Workflow and Publication as separate states, save state, Publish only with
  publish permission), Write (kicker, headline, deck, byline, section, topics,
  lead image + caption, Lexical body, format/video, presentation, headline
  position, reporting note), Plan (workflow, editor and deadline for editors,
  brief, files & links on `story-plans`), Production (production, tasks,
  sources, appointments, read with the user's access) and History (version
  summary). Verified in the browser: typing in Byline fields triggers Payload's
  native autosave; workflow changes save to the plan without a story save.
- Publishing is an editor's decision, enforced in `stories` access (Payload
  derives `hasPublishPermission` from it), integration-tested.

Still Payload's own UI, each with its replacement planned:

| Surface | Interim | Replacement |
| --- | --- | --- |
| Calendar / Media Desk / Coverage | not in staff navigation | Schedule-X calendar, `MediaDesk` ported with Payload adapters (Stories is ported) |
| Lead image picker | Payload upload field | Byline media picker + drag-and-drop (Phase 5) |
| Body editing chrome | Payload Lexical toolbar/slash menu | `@byline/editor` Nova interface (Phase 3/6) |
| Lock / take-over / read-only modals | Payload modals | Byline treatment of the same `useDocumentInfo` lock state |
| History compare/restore | Payload versions view | Byline History view over the same versions |
| Unpublish, schedule | not offered on the Story screen yet | Byline controls over Payload's unpublish and `schedulePublish` |

**Home is ported (Phase 1c).** `HomeApp`, Story Peek, hover cards, the New
story / New task / task edit dialogs, the command palette and their models moved,
unchanged, to `packages/newsroom-screens` (the plugin imports them from there; its
Home and Planning CSS stayed byte-identical). The newsroom mounts the same
`HomeApp` as its dashboard with `createPayloadHomeFetchers`
(`src/ui/home/payload-fetchers.ts`) over `/api/byline/*`
(`src/newsroom/endpoints.ts`, read models in `src/newsroom/screen-models.ts`):

- reads run as the user (`overrideAccess: false`), so a participant's Story Peek
  holds only their own work and unrelated staff get 403;
- identity: a byline person with an enabled account is `{kind: "user", id: userId}`,
  otherwise a guest, which is what the screens compare against `currentUser.id`;
- the screens send newsroom-local, offset-free times; the server converts them in
  the newsroom timezone (`localToInstant`, DST-tested);
- presets (`src/domain/presets.ts`): News, Sports recap, Opinion, Photo story,
  Breaking, plus Video story and Investigation. They seed workflow, starter tasks
  and production, give a deadline only to editors, and never create sources or text;
- screen methods not ported yet (collections, corrections, distribution,
  sources/appointments/production editing in Peek, the calendar feed) reject with
  501 instead of pretending to succeed; Home's links to unported destinations
  are omitted;
- Nova renders at true size: Payload pins the root font to 13px, so the newsroom's
  Byline stylesheet compiles rem to px (WordPress-identical pixels).

Integration-tested (`tests/integration/screens.test.ts`, 17 tests) and exercised in
the browser: Home, Story Peek, New task, complete + Undo, New story from a template
landing on the Story screen.

Known gaps: Home's activity stream is empty until activity is ported;
scheduled publication is not shown (Payload's schedule lives in admin-only jobs).

**The Story Workspace is ported (Phase 1d).** The WordPress workspace page and its
sections moved to `packages/newsroom-screens` and split into
`StoryWorkspaceProvider` / `WorkspaceGate` / sections; WordPress rebuilds its page
from them unchanged. The Story screen's Plan tab is now those sections (brief,
reporting summary and plan, sources and appointments, tasks, details, files and
links, activity) and Production is `MediaSection`; the hand-built Plan and
Production tabs are gone. The header reads workflow, editor and deadline from the
same workspace data.

- `articleInForm`: inside the Story screen the workspace never writes article
  fields (writers, format, video). The form is the one copy of the article.
- Byline changes to a story's byline from outside the editor (Story Peek) pass
  `overrideLock: false`: while someone has the story open, Payload's lock
  answers 423 instead of letting their next autosave overwrite the change.
- Workspace writes go through `/api/byline/stories/:id/{brief,sources,appointments,
  media-assignments}`; each checks the record belongs to the story in the URL and
  compares `expectedUpdatedAt` (409 on a stale edit), as WordPress did.
- Choosing existing media is a host-supplied `MediaPicker`; the newsroom has none
  until the Byline media picker (Phase 5), so the button is not offered.
- Found in the browser and fixed: a Byline dialog's `<form>` portalled inside
  Payload's document form also submitted it, saving the story. The Story screen
  stops submit events at its root.

**Stories is ported (Phase 1e).** `/admin/stories` (`components/BylineStories`,
a custom root view in `DefaultTemplate`, account checked on the server) mounts
the shared `StoriesPage` with Board and List; Payload's raw list at
`/admin/collections/stories` stays the administrators' fallback, reached from
System administration.

- **Read model:** `GET /api/byline/planning` (`src/newsroom/planning.ts`) returns
  the shared `PlanningResponse`, never Payload documents. The collection is the
  stories whose plans the reader may read (editors: all; staff: managed and
  assigned work), read in full: Payload applies `limit` even with
  `pagination: false`, so complete reads give none. Every Planning filter runs on
  the server, dates in the newsroom timezone; coverage membership comes from
  `coverages.stories`.
- **Privacy:** reads are the user's (`overrideAccess: false`). A published
  story's unpublished rewrite is shown only to its managers; a participant reads
  the published story, and the rewrite never makes the story read as
  unpublished (`storiesWithExtras`, also behind Home and Peek).
- **Writes:** Board moves and the List's deadline / planned-publication edits use
  the existing `POST /api/byline/stories/:id/workflow`; there is no second
  planning write.
- **Saved views** are Payload Preferences (`usePreferences()`, key
  `byline:stories:saved-views:v1`, `src/ui/stories/saved-views.ts`): no field,
  collection, migration or endpoint, normalized on every read and written whole.
- **No Calendar yet:** the newsroom passes no `renderCalendar`, so Stories offers
  Board and List.

Tested: `tests/integration/planning.test.ts` (24 tests: response shape, a
124-story collection, staff/editor/participant scopes, drafts and rewrites,
every filter, coverage, moves and inline edits, Preferences per account),
`tests/stories-saved-views.test.ts`, the plugin's `stories-page-host.test.tsx`,
and in the browser at the six shell widths (rail/picker, Save, Edited, Delete +
Undo through Preferences, Story Peek, `?view=list`).

**Next slice: the rest of the screens.** Home's whole closure (44 files) touches
WordPress only through an injected request function, `@wordpress/i18n` in one
file and a wp-admin URL default. Planning (board, list, Schedule-X calendar), the Media Desk and
the full Story Workspace sections moved into `packages/newsroom-screens` the same
way, as closures of their entries, never whole folders (`editorial/` also holds
Gutenberg panels that stay in the plugin). Each host
then supplies its adapter: the plugin keeps its `wp-api-fetch` fetchers, and the
newsroom implements the same `HomeFetchers`/`StoryFetchers` contracts over
Payload REST with the plan and workspace collections. Each destination joins the
staff navigation only once its screen is ported (Home and Stories have).

### 7.2 The Byline shell

**Rule.** Payload owns infrastructure and the form/document lifecycle.
`@byline/newsroom-ui` owns the staff-facing component system. The canonical app
shell is shadcn/Base Nova. Raw Payload UI is administrator fallback only.

It is built from Payload's supported extension points; the template, the
document root and the Edit view are untouched, so forms, autosave, validation,
drafts, versions, locks and publishing are exactly Payload's:

| Extension point | Byline piece (`apps/newsroom/src/ui/shell`) | Role |
| --- | --- | --- |
| `admin.components.providers` | `BylineShellProvider` → `BylineShell` | One query cache; the shadcn `SidebarProvider` (`display: contents`, ⌘\ toggles, state in the `byline_sidebar` cookie read on the server); the Create controller; the command palette |
| `admin.components.Nav` | `BylineNav` → `BylineSidebar` | `Sidebar collapsible="icon"`: wordmark, Create, destinations, account footer; a Sheet on phones |
| `admin.components.header` | `BylineAppHeader` | Sticky header beside the sidebar: trigger, location, Search (⌘K) |
| `admin.components.views.stories` | `BylineStories` (`/admin/stories`) | Byline Stories (Board, List, story views), account checked on the server |
| `admin.components.views.system` | `SystemAdministration` (`/admin/system`) | Administrators' list of raw collection screens, role-checked on the server |

- **Navigation** (`domain/navigation.ts` `NAVIGATION`): only destinations whose
  Byline screen exists. Today that is Home and Stories. Planned order: Home, Stories,
  Planning, Calendar, Media, Coverage, then for editors People, Polls,
  Feedback. Never a generic Payload collection to fill the list.
- **Create** (`ui/shell/create.tsx`): `BylineCreateProvider` mounts the shared
  `HomeCreate` dialogs (StoryCreateDialog, TaskCreateDialog) once, beside the
  page and outside the Story screen's `<form>`. Anything calls
  `useBylineCreate().openCreate(kind, { storyId })`: the sidebar's Create
  (expanded: "Create" makes a story, the chevron lists every kind; collapsed:
  "+" opens the list), Home's My Work "Task", the palette. A task created on a
  Story screen starts linked to that story; a new story opens its Byline Story
  screen. **A future kind** (Coverage, Poll, Upload media) is added to
  `CREATE_ACTIONS` with its minimum role and gets its dialog in
  `create.tsx`, only when its Byline flow exists. No disabled "coming soon"
  entries.
- **Search** (`ui/shell/search.tsx`): the shared `HomeCommands` palette on
  every screen (⌘K / Ctrl-K or the header). A screen that can show a story in
  place registers `useBylineSearch().setStoryOpener` (Home's Story Peek);
  otherwise a chosen story opens its Story screen. People, Media and Coverage
  join its results with their screens.
- **Home in the shell**: the shared `HomeApp` takes an optional `shell`
  (`HomeShell`: query client, `openCreate`, `setStoryOpener`). With it, Home
  drops its own New story, Search, ⌘K listener, dialogs, toaster and wp-admin
  gutter; WordPress passes none and keeps all of them.
- **Account footer**: name, newsroom title (the linked person's
  `newsroomRole`, else the account role) and portrait or initials; *System
  administration* for administrators; Sign out. Profile and Preferences join
  when their Byline screens exist.
- **Shared primitive**: `@byline/newsroom-ui/ui/sidebar` is the current
  upstream base-nova Sidebar. Product behavior is opt-in props
  (`keyboardShortcut`, `persistCookie`, `mobileTitle`, `SidebarTrigger label`),
  so WordPress Settings keeps its embedded, shortcut-free sidebar. Never copy
  shadcn components into `apps/newsroom`.

**Sidebar patterns, one per job.** There is exactly one global sidebar. Other
shadcn sidebar blocks are references for specific surfaces, never extra global
navigation:

| Block | Byline use | When |
| --- | --- | --- |
| `dashboard-01` | Shell structure: sidebar + sticky header + content | Now |
| `sidebar-09` (nested) | A module's secondary pane beside the global sidebar: Stories (My Work, All, Ready for Review, Published, On Hold), Media (types, My uploads, Needs alt text, Recently used), Coverage (Active, Upcoming, Past, Archived). Stories has it (`StoryViewsRail`, shown by container width, with `StoryViewsPicker` as its compact form); Media and Coverage reuse that composition | Stories: done. Media / Coverage: with their screens |
| `sidebar-10` (popover) | Compact contextual actions; universal actions stay in the Command palette | As needed |
| `sidebar-11` (file tree) | Only for really hierarchical data (Media folders, an investigation's documents) | If such data exists |
| `sidebar-12` (calendar) | Calendar's left pane: mini calendar, My Schedule, Interviews, Reporting, Production, School events, completed/cancelled toggles | With the real Calendar adapter |
| `sidebar-14` / `sidebar-15` (right inspector) | The Story screen's inspector for workflow, deadline, editor, presentation, format, readiness and Preview controls not already edited inline; a Sheet on narrow screens | With the editor / Live Preview phase |

**Implementation notes.**

- Payload's root font is not 16px and the Sidebar's width variables are inline
  styles the rem→px compile never sees, so `BylineShell` sets them in px.
- Byline's scoped CSS has no Preflight: the `hidden` attribute alone does not
  hide an element with a display class (the primitive adds `hidden` too).
- Payload isolates `.template-default` as a stacking context; that would trap
  every view's overlay under the header, so `custom.scss` releases it. The
  header sits at z 25: above Payload's sticky chrome (20), below its modals
  and popups (30+) and Byline's overlays (50).
- ⌘\ toggles the sidebar, not shadcn's ⌘B, which is Bold in the editor.
- Shell dialogs mount their Byline root only while open (`ShellLayer`): a
  modal a screen already has open (Story Peek) hides everything outside it
  from assistive technology when it opens, which would include a root that
  was always there. The one toaster has its own persistent root.
- Payload renders custom root views bare; `SystemAdministration` wraps itself
  in `DefaultTemplate` to get the shell.

**Verified** (`tests/shell.test.ts`, `tests/domain.test.ts`, the plugin's
`settings-shadcn-sidebar.test.ts`, and in Chrome at 1920, 1440, 1366, 1180,
820 and 390 px wide): staff and editors see only Byline destinations and no
System administration, administrators reach it and the raw screens with a way
back; the sidebar collapses to named icons (tooltips) and restores from the
cookie; on a phone it is a Sheet that Escape closes, with Create and the
account menu reachable; no horizontal overflow; Create → Story lands on the
Byline Story screen; autosave from Write still saves; adding a source in Plan
and creating a task from Create on a Story screen leave the story's versions
unchanged (no form submit); Production renders; ⌘K works on Home and on the
Story screen; Sign out ends the session.

## 8. Editor

`packages/editor` (`@byline/editor`) owns the Lexical feature list, the Byline
block schemas (one schema per block shared by the editor, the public projection
and the renderer), the slash menu (grouped, fuzzy aliases: `/pdf`, `/doc` →
Document; `/quote`; `/photo`; `/timeline`; `/chart`, `/map` → Chart / Map;
`/facts` → Key Facts) and the block editor components. Allowed prose: paragraph,
H2, H3, bold, italic, link, bulleted and numbered lists, plus inline semantics
present in existing content (`sub`/`sup`, inline code are reviewed against the
legacy corpus before being enabled). No alignment, color, font, indent or
HTML features.

## 9. Import

Deterministic, idempotent `apps/newsroom/src/import/` reading the WordPress
database export or snapshot + private REST exports:

- explicit IDs through the adapter's `allowIDOnCreate` and the import-only
  context flag; normal requests cannot set `id` (a `beforeValidate` guard drops
  it unless `context.bylineImport === true` and the caller is the import script);
- after import, `setval` every serial sequence past `max(id)`;
- `legacy-html` bodies keep the rendered HTML and the Gutenberg source;
- `legacy-v1` production requests materialize as assignments;
- WordPress categories/tags map to sections/topics; aliases live only in the
  import and the v1 compatibility projection;
- a review report for anything unmappable, never a silent drop.

## 10. Decisions

### 10.1 Open: Scrollytelling

The migration brief lists a Scrollytelling block. PR #226 removed the WordPress
Scrollytelling blocks deliberately: scrollytelling belongs to repository visual
stories (`defineVisualStory`), with scroll logic in each story's `client.ts`, and
the guidance in `AGENTS.md` and `apps/web/story-presentations/AGENTS.md` says not
to reintroduce one. **No Scrollytelling block is built until this is decided.**
The torture-test story covers scrollytelling with a repository visual story.

### 10.2 Made here

- **Payload 3.92.1, Next.js 16.4.2, `graphql` 16.** 3.93.0 was released the day
  this branch started; the previous patch is pinned. Payload 3.92 requires
  **Node ^22.23.4 or ≥24.22.1**, so `apps/newsroom` declares `>=24.22.1` (the
  monorepo's `>=24` is unchanged for the other workspaces).
- Correction type canonical id: **`editors-note`** is rejected in favor of the
  existing **`editor-note`**, which every published WordPress record and the
  Astro renderer already use; no alias migration is needed.
- Story format is `standard | video | audio`; `audio` renders as Standard in
  Astro until Phase 6 adds the audio treatment (no public behavior change).
- Canonical public Story model lives in `@byline/content`, beside the snapshot
  and routing contracts it feeds; presentations in `@byline/story-presentations`;
  the editor in `@byline/editor`.
- GraphQL is disabled (`graphQL.disable`); the REST API is used only by the
  admin, Live Preview and the Worker endpoints.
- **Only editors publish.** Staff, including a story's own writers, save drafts;
  an editor publishes. If Weekly Wildcat writers held WordPress *Author*
  publishing rights, this is a deliberate tightening to revisit. Guarding
  *unpublish* the same way is still open: Payload's unpublish arrives as an
  ordinary update to `_status: "draft"`, which access cannot tell apart from a
  draft save without a hook.

## 11. Phases, gates and status

| Phase | Scope | Gate | Status |
| --- | --- | --- | --- |
| 0 | This inventory | reviewed | done |
| 1 | `apps/newsroom`, Postgres, migrations, auth skeleton, roles, storage skeleton, Byline nav/dashboard | boots; migration applies to an empty DB; access tests | **done** (see §13) |
| 1b | Google sign-in strategy | invited-only sign-in test | — |
| 2 | People, Stories, Sections, Topics, Coverages, Corrections, Pages, Workspace collections, canonical public model | access/privacy tests | collections + access **done**; canonical public model, `events`, YouTube metadata job pending |
| 3 | Story view (Write/Plan/Production/History), Lexical, first blocks, autosave, locking, history | writer acceptance steps 1–6 | — |
| 4 | Extract `@byline/story-presentations`, canonical normalization, exact Live Preview | §5 parity suite green | — |
| 5 | Media: private storage, metadata, crops, materialization, drag and drop | media privacy + public availability tests | — |
| 6 | Full block set | torture-test story authorable | — |
| 7 | Payload → snapshot v1 projection | shadow build passes Astro verification | — |
| 8 | WordPress → Payload import | counts/relations/IDs reconcile; custom presentation still resolves imported ID | — |
| 9 | Snapshot v2 + structured `ArticleBody` | v1 and v2 builds both verify | — |
| 10 | Shadow builds from both CMSs, diffed | route/URL/SEO/sitemap/RSS/media diffs explained | — |
| 11 | Live updates, polls + vote table, feedback | Worker parity tests, cookie compatibility | — |
| 12 | Discord, MCP | contract suites green | — |
| 13–14 | Rehearsal, cutover | §14 checklist of the brief | — |
| 15–16 | Observation, retirement | WordPress read-only, then archived | — |

## 12. Local development

```sh
docker compose -f apps/newsroom/docker-compose.yml up -d   # PostgreSQL 17 on :54329
cp apps/newsroom/.env.example apps/newsroom/.env
npm run dev --workspace @byline/newsroom                   # http://localhost:3010/admin
```

Development uses Drizzle push (`BYLINE_DB_PUSH=1`). Before any production
deploy, `npm run migrate:create --workspace @byline/newsroom` and commit the
migration; production runs `payload migrate` and never pushes.

## 13. Phase 1 record

What exists in `apps/newsroom` (branch `feature/payload-newsroom`):

- Payload 3.92.1 / Next.js 16.4.2 / `@payloadcms/db-postgres` with
  `allowIDOnCreate` (guarded by `dropClientIds`), GraphQL off, telemetry off,
  `noindex` on every response, jobs restricted to administrators.
- Collections: `users`, `people`, `stories` (Versions, Drafts, Autosave 1.2 s,
  schedulePublish, locking, trash), `story-plans`, `sections`, `topics`,
  `coverages`, `corrections`, `pages` (Versions/Drafts), `media` (private,
  focal point, no destructive crop, no synchronous renditions), `live-updates`,
  `tasks`, `sources` (no contact fields), `appointments` (timing normalized
  server-side), `production-assignments`, `polls`; `byline_poll_votes` table.
- `src/editor/prose.ts`: the restricted Lexical surface (paragraph, H2/H3,
  bold, italic, link, lists).
- Byline Home replaces Payload's dashboard; Byline navigation is role-aware and
  links only to destinations that exist. Both re-check the account server-side.
- `src/import/sequences.ts`: moves every serial sequence past imported IDs and
  never backwards (a deleted story's ID must not be reused by a new story,
  because presentations are keyed by ID).
- Migration `20261106_004007_initial` applies to an empty database;
  `npm run migrate:check` fails CI when the config changes without one.

Verified:

- `npm run typecheck:newsroom`; `npm run test:newsroom` (21 unit tests);
  `npm run test:newsroom:integration` (20 tests on PostgreSQL 18): story/plan
  creation, unrelated staff refused drafts, plans and edits; manager vs editor
  field rules; date-only deadlines; contributor sync from drafts; published
  story readable without its plan or newer draft; participant visibility and
  field limits; self-only appointments; disabled and anonymous access refused
  (media included); first-account and last-administrator rules; no
  self-promotion; ID guard, import IDs and sequence advancement; vote
  uniqueness and no vote collection.
- Browser: create-first-user → Byline Home; New Story autosaves natively
  (`PATCH …?autosave=true&draft=true`) and Home shows the draft's latest
  headline as "Workflow: Pitch · Publication: Draft".

Not done in Phase 1 (each listed in §11): Google sign-in, the Story document
view, Live Preview and presentation extraction, media materialization and R2
public delivery, snapshot projection, import, runtime polls/live, Discord, MCP.
Nothing in `apps/web` or `wordpress-plugin` changed; production still runs on
WordPress.
