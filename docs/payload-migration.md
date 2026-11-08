# Payload + PostgreSQL migration

Byline is the newsroom product. Payload is its application and database
framework. Astro remains the newspaper.

This is the working record for replacing WordPress as Byline's control plane. It
is a strangler migration: the WordPress production path stays authoritative and
fully functional until the parity and cutover gates at the end of this document
are met. Nothing here deletes WordPress data.

Current editorial field ownership and operating instructions are in [Payload newsroom workflows](newsroom-ux.md).

Status is tracked in [§11](#11-phases-gates-and-status). Branch:
`feature/payload-newsroom` (stacked on `feature/visual-stories`, PR #226, because
that PR reshapes the presentation registry Phase 4 extracts). The semantic article
editor and People workspace are now folded into this migration branch; their
remaining gates are tracked below rather than as separate migration branches.

## 1. Invariants

These do not change at any phase.

- **Astro renders the public site statically on Cloudflare.** No SSR, no public
  runtime article fetches, no Next.js public renderer. The newspaper keeps
  serving if Payload or PostgreSQL is down; only newsroom editing and the live/
  poll runtime APIs degrade.
- **A completed immutable snapshot is the preferred production build input, not
  a single point of failure.** Normally the build reads one small discovery
  pointer and one immutable snapshot artifact, then blocks further CMS data
  requests. If Payload has no completed snapshot for the current public
  revision, the build may use the explicit direct-source recovery path: read the
  same canonical public projection from Payload, verify the public revision is
  unchanged before accepting it, and write the result into the same local
  snapshot contract before Astro renders. A missing snapshot may fall back;
  a corrupt, invalid or digest-mismatched snapshot never silently does.
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
| Collections (reporting projects) and their optional public coverage / series | `byline_collection` + relationship edges (`includes/editorial/collection-workspaces.php`, `collection-public.php`); legacy `byline_coverage` already migrated into Collections | `collections` (ordered `stories` membership, nested `publicPresentation`), `collection-interviews`, `collection-resources`, `tasks.collection` ([collections-workspace.md](collections-workspace.md)) |
| Corrections | `byline_correction` + legacy inline notices (`includes/editorial/corrections.php`) | `corrections` |
| Live coverage | `byline_live_update` child posts + coverage state meta (`includes/editorial/live-coverage.php`) | `live-updates` + `stories.liveCoverage` group |
| Pages | `page` + page blocks (`includes/content/pages.php`, `page-blocks.php`) | `pages` (Versions + Drafts) |
| Media | attachments + creator/credit/copyright/license/source meta, `bylineImage.artDirection` crops (`image-art-direction.php`, `photo-credits.php`) | `media` (private source files, Library previews, prepared publication renditions; public delivery through the static build) |
| Tasks | `byline_task` | `tasks` |
| Brief | `_byline_story_brief` (4,000 chars) | `story-plans.brief` |
| Sources | `_byline_story_sources_v1` (30, serialized) | `sources` |
| Appointments | `_byline_story_appointments_v1` (40, serialized) | `appointments` |
| Production | `_byline_story_media_assignments_v2` (12) + legacy `_byline_story_visual_request_v1` projected as `legacy-v1` | `production-assignments` (import materializes `legacy-v1`) |
| Resource links | `_byline_story_resources` (24) | `story-plans.resources` bounded array |
| Activity | `includes/editorial/activity.php` | `story-activity` (private actions, IDs, actors and times) |
| Presets | `includes/editorial/presets.php` (five, test-pinned) | code-defined presets: Blank, News, Sports recap, Photo story, Video story, Investigation, plus the existing Opinion and Breaking (Phase 3) |
| Feedback | `includes/editorial/feedback.php` | `feedback` (Phase 11) |
| Polls | `byline_poll` + `wp_*_byline_poll_votes` | `polls` + dedicated `byline_poll_votes` table |
| School events | `ww_school_event` | `events` (Phase 7, **done**, snapshot dataset `schoolEvents`) |
| Sports archive | native Pages + legacy `ww_sports_*` read-only records | imported as Pages; legacy source records archived, not modelled |
| Publication settings | options + `includes/publication/config.php` | `publication` global (admin) |
| Public revision / snapshots | options + `includes/publication/{public-revisions,build-snapshot}.php`, MySQL advisory lock | `byline_publication_state` table + `prepare-public-snapshot` job (Phase 7, **done**; [payload-build-snapshots.md](payload-build-snapshots.md)); structured v2 in Phase 9 |
| Durable jobs | `includes/core/jobs.php` | Payload Jobs Queue |
| Deployment hooks | `includes/integrations/deployment.php` | jobs `request-cloudflare-build`, `verify-deployment` |
| Notifications / digests | `includes/editorial/notifications.php` | jobs |
| Discord | `includes/integrations/discord.php` + `apps/discord-bot` | Phase 12 adapter over Payload Local API |
| MCP | `includes/mcp/*` (PHP SDK + OAuth) + `packages/mcp-contracts` | Phase 12 adapter; contracts kept |
| Content health | `includes/content-health/*` | readiness layer (`src/domain/readiness.ts`) |
| Home / Planning / Workspace UI | React 19 roots in `wordpress-plugin/src/{home,planning,workspace,story,admin-ui}` | ported into Payload custom views (§7) |

### 2.2 Public Snapshot v2

Payload projects its published records into the native contract in
`@byline/content` (§6). Stories, People, taxonomy, Pages, Corrections,
Collections, Events, Polls, prepared Media and Redirects are separate public
datasets. The article route uses the canonical Story and keeps its ArticleBody
structured through rendering. Legacy WordPress build inputs remain on the
WordPress build path until cutover.

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
| Build discovery | `wp-json/byline/v1/build-snapshot` pointer → uploads artifact | Payload completed-snapshot pointer → immutable artifact on the newsroom volume; if no completed snapshot exists, explicit direct-source recovery produces the same local snapshot contract after a revision-stability check |
| Build trigger | WordPress durable job → deploy hook | Payload job → Cloudflare deploy hook |
| Media at build | Astro downloads WordPress uploads (`copy-wordpress-media-to-out.mjs`) | Astro downloads only referenced prepared Payload renditions, validates them, and materializes a closed set under `out/_byline/media`; legacy WordPress media keeps the current mirror during transition |
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
legacy adapter), the WordPress-specific `copy-wordpress-media-to-out.mjs`
implementation (replaced by the provider-neutral Payload static-media
materializer), and the `/wp-json` Worker upstreams. `legacy-html` rendering
stays forever.

## 4. Target architecture

```text
apps/newsroom  (Payload 3 + Next.js 16, private)
  ├── Payload admin with Byline custom views (Home, Stories, Calendar,
  │   Media, Collections, Search; Polls/Feedback/People for editors;
  │   Pages/Publication/System for administrators)
  ├── collections + access control + hooks  (src/collections, src/access)
  ├── domain rules                           (src/domain: workflow, schedule, presets, readiness)
  ├── public projections                     (src/public: snapshot, live, polls)
  ├── Jobs Queue tasks                       (src/jobs)
  └── /preview/story        private Live Preview page → @byline/story-presentations
PostgreSQL  (@payloadcms/db-postgres; byline_poll_votes via beforeSchemaInit)
Persistent newsroom volume
  ├── private media originals + Library previews   (BYLINE_MEDIA_LOCAL_DIR)
  ├── prepared publication files, content-addressed (BYLINE_PUBLICATION_MEDIA_DIR)
  └── immutable snapshot artifacts
apps/web    (Astro, unchanged public contract)
  ← preferred snapshot pointer + artifact
  ← direct canonical Payload projection only when no completed snapshot exists
  → materializes referenced media into out/_byline/media
Cloudflare Worker Static Assets serves the deployed Astro output + media
```

Production topology: one Payload/Next service, one dedicated media worker
(`npm run jobs:media`, same image and volumes; see
[publication-media.md](publication-media.md#deployment)), PostgreSQL, the
persistent newsroom volumes, and the existing
Cloudflare site. R2/S3 is not required for runtime or public delivery. Object
storage may be added later for off-site backup, archival replication or disaster
recovery without changing public media URLs. No Redis, search service or extra
media microservice is required.

### 4.1 Accounts and people

- `users` (auth): `email`, `name`, `role` (`staff` | `editor` |
  `administrator`), `enabled`, `linkedPerson`, `preferences`, and integration
  linkage (`googleSubject`, `discordUserId`). Google Workspace is the preferred
  sign-in, and every enabled invited account can also use Payload's native
  email/password sign-in. Some school-managed devices cannot use the Weekly
  Wildcat Google Workspace identity. Preserve both paths. Payload owns password
  hashing, lockout, sessions and cookies; disabled accounts cannot sign in.
  The first account ever created is forced to an enabled
  administrator (Payload's create-first-user form would otherwise make Staff),
  and the last enabled administrator cannot be demoted or disabled.
- Google Workspace sign-in (Phase 1b) uses Google's rendered button with FedCM
  where supported. Google may personalize it for a returning account. The
  button's callback posts an ID token from the newsroom origin and binds it to
  a short-lived, signed browser challenge with state and nonce. When the button
  cannot load, the redirect link starts an OpenID Connect code exchange with
  state, nonce and S256 PKCE and requests only `openid email profile`.
  Both paths use Payload custom endpoints and native session helpers.
  Google's Node library verifies signature, issuer and audience. Byline also
  requires a current expiry, matching nonce and hosted domain, verified email
  and a valid subject. An existing subject binding takes precedence. Otherwise
  exactly one existing enabled account must match the normalized email and
  have a null binding. Binding and session creation commit together, and a
  subject is never replaced on login. Disabled accounts cannot use either
  method. Google never provisions users or changes roles. After initial
  bootstrap, only administrators create accounts. Login redirects stay inside
  the newsroom.
- `people`: `name`, `slug`, `pronouns`, `newsroomRole`, `shortBio`, `bio`,
  `portrait`, `directoryVisible`, `publicEmail`, `socials`, `status`
  (`active`/`alumni`/`guest`). Disabling or deleting a user never touches
  people or bylines (`linkedPerson` is on the user, and a person is never
  deleted by a user hook).

Configure Phase 1b on the newsroom server:

- Set `BYLINE_NEWSROOM_URL` to the newsroom's canonical HTTPS origin, and
  `BYLINE_GOOGLE_CLIENT_ID`, `BYLINE_GOOGLE_CLIENT_SECRET` and
  `BYLINE_GOOGLE_HOSTED_DOMAIN=weeklywildcat.com` for the Weekly Wildcat
  Workspace. In Google Cloud, create a **Web application** OAuth client and
  register `https://<newsroom-host>` as an authorized JavaScript origin for
  Google's button and `https://<newsroom-host>/api/byline/auth/google/callback`
  as an authorized redirect URI for the redirect fallback. For development at
  the default port, register `http://localhost` and `http://localhost:3010` as origins and
  `http://localhost:3010/api/byline/auth/google/callback` as a redirect URI. Configure
  the consent screen and Workspace app access for staff. Confirm a real
  Workspace account can sign in after configuration.
- Set `BYLINE_UNSPLASH_ACCESS_KEY` to enable landscape login photos. The server
  caches a pool, fetches updates off the login request path and renders
  attributed Unsplash image URLs. An absent key, cold cache or failed fetch
  uses the dark background.
- Outbound email is not configured. Staff should ask a newsroom administrator
  for a password reset. The native Payload forgot/reset routes stay available
  for a future real transport; verify delivery before relying on them.

The login browser suite uses a dedicated PostgreSQL test database and signed
Google fixtures; it does not need Google or Unsplash credentials. Run
`npm run test:login:browser --workspace @byline/newsroom`, then repeat with
`BYLINE_LOGIN_GOOGLE_DISABLED=1` for password-only and photo failure coverage.
Set `BYLINE_LOGIN_TEST_DATABASE_URL` to override the local test database.

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

Payload stores originals on the newsroom service's persistent volume. They are
private editorial source files: the newsroom and Live Preview read them through
Payload's authenticated file route, and a public page never points at an
original just because it was uploaded. The existing local upload boundary stays
replaceable so off-site backup/object storage can be added later without
changing the Media or public-rendering contracts.

The newsroom's **Media** destination (Library + Work) is built
([media-workspace.md](media-workspace.md)): Payload-native folders on Media are
logical only (moving a Media record never moves or renames the source file), the
private `library` image size (≤640px WebP) keeps browsing fast, and the shared
production desk uses the same Media records as Story authoring. Credits belong
to the asset; captions belong to the story's use of it.

Publication assets are **prepared, not uploaded to a public bucket**
([publication-media.md](publication-media.md) is the detailed contract):

- **Art direction is intent.** `Media.artDirection` is `ImageArtDirectionIntent`
  (`@byline/core`): a focal point plus only the custom crops (Wide, Card,
  Standard, Square, Portrait, Social) that differ from the automatic
  focal-point crop. No URLs or renditions. Payload's native focal point is
  off (it reprocesses uploads synchronously); the dedicated art-direction API
  is the only normal write path. WordPress `ImageArtDirection` stays for the
  production path; its generated renditions are never imported as intent.
- **Publication revision.** `publicationRevision` moves only when the
  prepared bytes can change (source, focal point, custom crops), never for
  metadata. The same write invalidates the prepared generation and queues
  `prepare-publication-media` on the Jobs Queue's `media` queue (per-asset
  exclusive key, `supersedes`). Stale work never promotes.
- **Recipe.** `PUBLICATION_MEDIA_RECIPE_VERSION` versions how files are made:
  an oriented, metadata-free natural WebP ladder 320/640/960/1440/1920/2560
  (never upscaled), physical files only for explicit crops, 16:9/4:3/1:1 SEO
  candidates, a 1200×630 JPEG social image, bounded animated WebP, exact-copy
  PDF/audio, every output ≤ 25 MiB.
- **Store.** Prepared files are content-addressed objects on a second volume,
  `BYLINE_PUBLICATION_MEDIA_DIR`, never inside the private upload directory,
  never overwritten and not deleted until snapshot retention allows garbage
  collection.
- **Readiness.** One rule (`publicationMediaReadiness`): status ready, prepared
  revision = current revision, current recipe, valid manifest; the newsroom
  readiness service also checks kind, metadata gaps and stored objects. Story
  publication (not drafts or autosaves) is refused server-side until every
  directly referenced Media is ready.
- **Build.** The static build acquires exactly the descriptors it needs from
  the build-only `GET /api/byline/build/media/:sha256` (`BYLINE_BUILD_TOKEN`),
  verifies hash, size and type, and writes fingerprinted files under
  `out/_byline/media/`, cached `public, max-age=31556952, immutable`. It never
  copies the Library and never falls back to an original. Wiring it to the
  canonical Payload dataset is Phase 7; production still uses the WordPress
  media materializers until cutover.

Large camera originals stay private. Video remains externally hosted until a
separate delivery architecture is deliberately introduced. `uploadedBy` and
every `publicationAssets` field are system-controlled; “Ready” means suitable
files exist for a static build, not that the asset is already live on
Cloudflare.

### 4.6 Polls

`polls` holds definitions with stable `pollKey` and answer `optionId`s (IDs
preserved from WordPress). Votes live in `byline_poll_votes`, added with the
Postgres adapter's `beforeSchemaInit` so Drizzle migrations own it, with
`UNIQUE(poll_id, voter_key)`. The table is not a Payload collection: no admin
screen, no REST/GraphQL exposure. Cookie names, `voterId.base64url(HMAC)` and
`base64url(SHA-256(secret:voterId))` are byte-compatible.

## 5. Live Preview and presentation parity

**Ownership.** Payload owns Live Preview: the document form state, drafts,
autosave, locks, the open/closed state and its saved preference, the pane and
iframe, device sizing, zoom, the pop-out window, the postMessage transport and
the relationship/upload population protocol. Byline owns the page being
previewed: the canonical Story, the Payload and WordPress adapters, the
presentation rules, `StoryArticle`, the registry, the article-body renderer,
and the preview status and error states. There is no second iframe, device
emulator, popup, message listener, editable Story copy, preview-only renderer
or autosave clock.

```text
unsaved Payload Story form
  → Payload's LivePreviewWindow (the only pane/iframe/popup)
  → /preview/story  (static, same-origin)
  → @payloadcms/live-preview-react useLivePreview()
  → Payload relationship/upload population (requestHandler below)
  → payloadPublicStory()  (apps/newsroom/src/preview/payload-story.ts)
  → PublicStory + PublicArticleBody  (byline-v1 via normalizePayloadStoryBody, or legacy-html)
  → buildArticlePresentation()  (@byline/content/story, shared with the WordPress adapter)
  → StoryArticle  (@byline/story-presentations: custom → Immersive when valid → Standard)
```

- **Configuration:** `stories.admin.livePreview` is `{ url: "/preview/story",
  breakpoints: Phone 390×844, Tablet 820×1180, Desktop 1440×900,
  openByDefault: false }` (`src/preview/config.ts`). The URL is deliberately a
  static string: Payload 3.92.1 recomputes function URLs during form-state
  requests, and with frequent autosave an overlapping request can drop the URL
  and close Live Preview. One `STORY_LIVE_PREVIEW_DEPTH` (2: story → media,
  story → person → portrait, section, topics, and the body's Photo/Gallery/
  Document Media) is used for every population request.
- **Static route, no Story ID in the URL.** `useLivePreview`'s default
  population request is `stories/<initialData.id>`; this route has no initial
  document. The official `requestHandler` option fixes only the target: it
  reads the Story ID Payload's own LivePreviewWindow puts in every form-state
  message (`data.id`) and sends Payload's request (method override, body,
  credentials, depth, locale) to `/api/stories/<id>`, so normal collection and
  relationship access control apply. It also keeps responses in order and
  answers a failed request with the last good result plus a failure status
  (`src/preview/population.ts`). `initialData` and `requestHandler` are
  referentially stable because the hook resubscribes and resets when they change.
- **Private on its own.** `/preview/story` needs a newsroom session (a
  signed-out visitor gets a message and no content), every population request
  runs as that user, and it is `Cache-Control: private, no-store`, `noindex`,
  `frame-ancestors 'self'`. No secret, no token, a Story ID is not
  authorization.
- **Presentation context** (`GET /api/byline/stories/:id/preview-context`):
  corrections, Related/More by candidates and series placement, read with the
  signed-in user's access, canonical data only, refreshed when section, topics
  or contributors change; never per keystroke.
- **Shell, not SEO.** The page imports the same publication stylesheets as
  the public site's layout (theme, fonts, article CSS) and renders no JSON-LD,
  canonical, Open Graph, analytics or site header; SEO stays in Astro. Slots
  are the shared visual views (`ArticleShareActionsView`, `ReaderFeedbackView`,
  `NewsletterSignupView`) rendered inert; ordinary article links open
  separately instead of navigating the frame.
- **Media** in Preview uses Payload's authenticated file URLs; the public
  site uses its static media. Dimensions, alt, credit and the focal point
  (from the `artDirection` intent) come from the same Media record, so
  geometry matches. Preview never uses prepared publication files, so a
  custom crop still preparing is framed by the focal point, never by an older
  generation.
- **Custom and visual stories** come from the one registry in
  `@byline/story-presentations` (`storyPresentationRegistry({ fixtures })`).
  A story's stylesheet and `client.ts` load per bundler: Vite in
  `apps/web/lib/story-presentation-{host,client}`, a dynamic import in
  `apps/newsroom/src/preview/story-assets.ts`, so a flagship's CSS and JS load
  only for that story in either host. There is no preview-only presentation
  override; to exercise a repository presentation in development, set
  `BYLINE_STORY_PRESENTATION_FIXTURES=1` (story IDs 6 and 10) or register the
  test Story's ID.
- **Not built:** click-to-edit overlays (no DOM ↔ field maps).

## 6. Snapshot v2

[Payload public build snapshots](payload-build-snapshots.md) defines the
native v2 artifact, its datasets and its lifecycle. The committed public
revision is separate from the schema, producer and Media recipe versions.
The worker validates published main records under the revision fence,
writes the exact immutable artifact, and conditionally promotes the one
pointer. Direct recovery uses the same builder and validates the same local
handoff.

New Stories carry the semantic ArticleBody from the existing normalizer.
Imported historical Stories can carry the explicit legacy HTML variant.
Related Coverage, Polls, footnotes and Repository Interactives remain
semantic through the shared static and preview renderer. Only declared
prepared Media blobs are fetched after Astro renders. The completed/direct
parity gate compares the static site and checks the privacy sentinels.

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
the same components): Home, Stories, Calendar, Media Desk, Collections,
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
   Byline Stories, Media Desk, People, Collections, Polls, Feedback.
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
toolbars, dialogs, media selectors, reorder controls) built from Nova. Byline
owns the Story-level Preview entry control and the preview status; Payload
owns the Live Preview pane, iframe, toolbar, device sizing, zoom, pop-out,
synchronization and transport, and `@byline/story-presentations` renders the
page.

### 7.1 Where the UI stands

Built in the newsroom Admin:

- The Byline sign-in view uses the Weekly Wildcat logo, makes Google primary
  when configured, and offers email and password from the same screen. An
  optional, attributed Unsplash photo sits behind the login card (see §4.1).
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
  sources, appointments, read with the user's access) and History (versions,
  restore, corrections and distribution copy tools). Verified in the browser: typing in Byline fields triggers Payload's
  native autosave; workflow changes save to the plan without a story save.
- Publishing is an editor's decision, enforced in `stories` access (Payload
  derives `hasPublishPermission` from it), integration-tested.

Byline manages public URLs, native publication actions and History on the Story
screen. The native Payload document lock still handles takeover. Site and the People screen provide the normal administrator workflows, including
per-Person newsroom access. See
[Payload newsroom workflows](newsroom-ux.md) for the remaining fallback surfaces.

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
- Home shows recent editorial activity and, for editors, Content Health
  attention. Distribution copy tools use the published facts; provider actions
  are unavailable until a provider is configured;
- Nova renders at true size: Payload pins the root font to 13px, so the newsroom's
  Byline stylesheet compiles rem to px (WordPress-identical pixels).

Integration-tested (`tests/integration/screens.test.ts`, 17 tests) and exercised in
the browser: Home, Story Peek, New task, complete + Undo, New story from a template
landing on the Story screen.

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
- Choosing existing media is a host-supplied `MediaPicker`: the newsroom's is
  Byline's `MediaPickerDialog` (the Media Library browser in selection mode),
  shared with Media Work.
- Found in the browser and fixed: a Byline dialog's `<form>` portalled inside
  Payload's document form also submitted it, saving the story. The Story screen
  stops submit events at its root.

**Stories is ported (Phase 1e).** `/admin/stories` (`components/BylineStories`,
a custom root view in `DefaultTemplate`, account checked on the server) mounts
the shared `StoriesPage` with Board and List; Payload's raw list at
`/admin/collections/stories` stays the fallback linked from administrators'
System administration. Editors can still access that raw Story route directly;
the Collections workspace route does not intercept it.

- **Read model:** `GET /api/byline/planning` (`src/newsroom/planning.ts`) returns
  the shared `PlanningResponse`, never Payload documents. The collection is the
  stories whose plans the reader may read (editors: all; staff: managed and
  assigned work), read in full: Payload applies `limit` even with
  `pagination: false`, so complete reads give none. Every Planning filter runs on
  the server, dates in the newsroom timezone; Collection membership
  (`collectionId`) comes from `collections.stories`.
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
- **No Calendar tab on Stories:** the newsroom passes no `renderCalendar`, so
  Stories offers Board and List. The Calendar is its own destination
  (`/admin/calendar`, §7.2), not a Stories view.
- **One column, no page-level New story:** the earlier `StoryViewsRail` beside
  the collection was removed (collection views did not justify a second
  permanent navigation column; the views picker does the job), and the
  newsroom passes no `onNewStory`, since the shell's Create sits beside it.
  Switching stories while writing is the Story workspace's (§7.2).

Tested: `tests/integration/planning.test.ts` (24 tests: response shape, a
124-story collection, staff/editor/participant scopes, drafts and rewrites,
every filter, Collection membership, moves and inline edits, Preferences per account),
`tests/stories-saved-views.test.ts`, the plugin's `stories-page-host.test.tsx`,
and in the browser at the six shell widths (rail/picker, Save, Edited, Delete +
Undo through Preferences, Story Peek, `?view=list`).

**Calendar (done): `/admin/calendar`.** The Schedule-X Calendar moved out of
`wordpress-plugin/src/planning` into `@byline/newsroom-screens/calendar`, so
WordPress and Payload consume one implementation (WordPress keeps its Calendar
tab through `planning/calendar-host.tsx`: its wp-admin links, its localStorage
view, the Stories mount). The shared vocabulary is CMS-neutral: filters are
appointments, deadlines, production, plannedPublication, publication (scheduled
and published) and tasks, plus My schedule; labels read Publication, Scheduled
publication, Published. Schedule-X, `temporal-polyfill` and `react-day-picker`
are declared by `@byline/newsroom-screens` and `@byline/newsroom-ui`, not by the
plugin.

- **Read model:** `GET /api/byline/schedule?from&to[&tasks=1][&collectionId=]`
  (`coverage=` and `collection=` are still accepted at the boundary)
  (`src/newsroom/schedule.ts`) returns the shared `ScheduleResponse`, built from
  Appointments, Production assignments and Tasks; story dates still come from
  Stories. There is no calendar collection. `from`/`to` are newsroom days, a
  range is at most 124 days, malformed or backwards ranges are 400s, and day
  edges are newsroom midnights (correct across DST). Exact appointments that
  overlap the range come back unless cancelled (completed and tentative stay,
  the screens mark them); open window or unscheduled appointments are
  `needsScheduling` whatever the range and are never given a day or time; open
  production with a deadline in range; open tasks due in range only when asked.
  Every read is `overrideAccess: false`, so Story Work access decides: managers
  see their stories' work, participants only what is assigned to them, and
  nobody sees a story's unpublished rewrite headline (`readableStories`).
  Private notes are never selected.
- **Needs scheduling → Story:** a link opens `…/collections/stories/:id?appointment=:id`
  and the Story screen opens Plan at that appointment.
- **Caches:** the Calendar uses the shell's query client (`scheduleKey`,
  `planningKey`). Story screen edits go through the Story Workspace's own
  client, so arriving at the Calendar re-reads the stories and the schedule
  feed is refetched on mount (30s stale time).
- **Schedule-X in the Nova scope:** Schedule-X sets `--sx-week-grid-height` and
  `--sx-week-grid-hour-height` on `<html>`, but its theme also declares them as
  `0` on `:root`, which the scoping turns into `.byline-ui-root { … 0 }`: Week
  and Day grids were blank (hour rows 1px tall). `calendar/calendar.css` makes
  them `inherit`. (This also fixes WordPress.)
- **Scheduled publication (Stories, Home, Workspace, Calendar):** Payload
  schedules publishing as jobs, so Byline adds no `scheduledAt` field and no
  table. `scheduledPublicationsForStories` (`src/newsroom/scheduled-publication.ts`)
  reads the upcoming `schedulePublish` jobs for *only the Story IDs the
  access-controlled read returned; scheduled rewrites are visible to managers*, in one query (the same
  `taskSlug`, `waitUntil > now`, `input.doc.relationTo`/`value` conditions as
  Payload's Schedule drawer, through the database adapter because no newsroom
  role may read `payload-jobs`). A future `publish` makes the story
  `scheduled` at the earliest `waitUntil`; a future `unpublish` does not (the
  story stays `published` until it runs); jobs for other collections, past
  jobs and jobs for stories the reader cannot see are ignored, and only
  `story id → instant` leaves the helper. `planningStory` then orders
  published, scheduled, draft, independent of workflow, so a published story
  with a pending rewrite stays published. The shared Calendar needed no change:
  it already emits *Scheduled publication* from `publicationState`.

Tested: `packages/newsroom-screens/tests` (model, adapter, controller, workspace
store, and the real Schedule-X mounted in jsdom: mini calendar ↔ calendar sync,
filters, My schedule, Story Peek, Needs scheduling),
`apps/newsroom/tests/integration/schedule.test.ts` (range validation, the
124-day limit, DST edges, per-role scopes, notes never returned, Preferences),
`apps/newsroom/tests/integration/publication.test.ts` (real `schedulePublish` jobs:
scheduled/draft/published, unpublish, past, other collection, access, earliest of
several, one read, the Stories filter and the Calendar event),
`apps/newsroom/tests/calendar-workspace-shell.test.ts`, and the plugin's
`calendar-host.test.ts`; in the browser at 1920/1440/1366/1300/1180/820/390.

**Collections (done): `/admin/collections`.** The canonical newsroom object is
`collections`, with ordered story membership, a private reporting brief/team,
`collection-interviews`, `collection-resources` and the existing `tasks` engine.
Coverage/Series is optional `publicPresentation`, not another record or staff
destination. The shared workspace exposes Overview / Stories / Reporting /
Tasks / Resources / Public; Payload does not offer Activity. Editors can duplicate
a Planning shell without copying reporting, membership, work or public settings.
The list uses the normal sidebar. At ≥1280px an open workspace uses the rail
plus flat Collection switcher (340px); below that, Switch collection opens a
Sheet. Query state keeps the Collection, section and interview; explicit-save
edits are guarded on section/shell/history navigation. Creation uses the shell's
one dialog and requires name and type. Calendar, Home and Media integrations,
permissions and raw Payload fallback routes are specified in
[collections-workspace.md](collections-workspace.md).

The old thin Payload `coverages` collection is removed. Migration
`20261106_233140_collections` preserves IDs, public slugs/settings and membership
in the new Collections model. `src/newsroom/public-coverage.ts` projects enabled
public Collections into the existing `coverages` shape, with published stories
only and complete reading order. It is tested build-input logic; wiring the
snapshot/public renditions and importing WordPress remain later phases. It does
not publish Payload-only settings to the production site.

**Remaining screens.** Home's whole closure (44 files) touches
WordPress only through an injected request function, `@wordpress/i18n` in one
file and a wp-admin URL default. Planning (board, list, Schedule-X calendar), the Media Desk and
the full Story Workspace sections moved into `packages/newsroom-screens` the same
way, as closures of their entries, never whole folders (`editorial/` also holds
Gutenberg panels that stay in the plugin). Each host
then supplies its adapter: the plugin keeps its `wp-api-fetch` fetchers, and the
newsroom implements the same `HomeFetchers`/`StoryFetchers` contracts over
Payload REST with the plan and workspace collections. Each destination joins the
staff navigation only once its screen is ported (Home, Stories, Calendar, Media
and Collections have).

### 7.2 The Byline shell

**Rule.** Payload owns infrastructure and the form/document lifecycle.
`@byline/newsroom-ui` owns the staff-facing component system. The canonical app
shell is shadcn/Base Nova. Raw Payload navigation is administrator fallback;
Story routes also host the native form lifecycle and remain accessible to editors.

It is built from Payload's supported extension points; the template, the
document root and the Edit view are untouched, so forms, autosave, validation,
drafts, versions, locks and publishing are exactly Payload's:

| Extension point | Byline piece (`apps/newsroom/src/ui/shell`) | Role |
| --- | --- | --- |
| `admin.components.providers` | `BylineShellProvider` → `BylineShell` | One query cache; the one shadcn `SidebarProvider` (`display: contents`, ⌘\ toggles, state in the `byline_sidebar` cookie read on the server, width by layout); guarded navigation; Create/Search; Story, Calendar, Media and Collections controllers |
| `admin.components.Nav` | `BylineNav` → `BylineSidebar` | One `Sidebar collapsible="icon"` with global or contextual contents: the icon rail plus Story list, Calendar controls, Media navigator or Collection switcher; exact nav matching preserved |
| `admin.components.header` | `BylineAppHeader` | Sticky header beside the sidebar: trigger, location, Search (⌘K), Newsroom Presence |
| `admin.components.views.stories` | `BylineStories` (`/admin/stories`) | Byline Stories (Board, List, story views), account checked on the server |
| `admin.components.views.calendar` | `BylineCalendar` (`/admin/calendar`) | Byline Calendar (Schedule-X over `GET /api/byline/schedule`), account checked on the server |
| `admin.components.views.collections` + exact Next page | `BylineCollections` (`/admin/collections`; internal view `/byline-collections`) | Byline Collections; raw `/admin/collections/<slug>` routes keep Payload's catch-all |
| `admin.components.views.system` | `SystemAdministration` (`/admin/system`) | Administrators' list of raw collection screens, role-checked on the server |

- **[Newsroom Presence](newsroom-presence.md)** is ported from WordPress. It
  replaces the old single user-meta value with private, per-tab PostgreSQL
  sessions, and resolves workspace locations with each viewer's Payload access.
  Presence does not change Payload document locking.
- **Navigation** (`domain/navigation.ts` `NAVIGATION`): only destinations whose
  Byline screen exists: Home, Stories, Calendar, Media, Collections, then the
  editor tools (People, Polls, Feedback) as they are ported. A Collection is
  the private newsroom project; public coverage or a series is only an
  optional presentation of one, so there is no Coverage destination (the
  public site keeps `/coverage/`). Never a generic Payload collection to fill the
  list. **There is no generic Planning destination.** WordPress's Planning page
  is an umbrella (tabs for Stories, Calendar, Media Desk, Collections, Content
  Health and Feedback); in Payload each of those is a first-class Byline
  destination, and the old tab container is not recreated. A Planning
  destination would be added only for a real standalone planning or agenda
  product that is meaningfully different from Home, Stories and Calendar.
- **Create** (`ui/shell/create.tsx`): `BylineCreateProvider` mounts the shared
  `HomeCreate` dialogs (StoryCreateDialog, TaskCreateDialog) once, beside the
  page and outside the Story screen's `<form>`. Anything calls
  `useBylineCreate().openCreate(kind, { storyId })`: the sidebar's Create
  (expanded: "Create" makes a story, the chevron lists every kind; collapsed:
  "+" opens the list), Home's My Work "Task", the palette. A task created on a
  Story screen starts linked to that story; a new story opens its Byline Story
  screen. Collection (editors) is one of them, after Story and Task: global
  Create and the Collections screen's New collection open the same dialog.
  **A future kind** (Poll) is added to
  `CREATE_ACTIONS` with its minimum role and gets its dialog in
  `create.tsx`, only when its Byline flow exists. No disabled "coming soon"
  entries.
- **Search** (`ui/shell/search.tsx`): the shared `HomeCommands` palette on
  every screen (⌘K / Ctrl-K or the header). A screen that can show a story in
  place registers `useBylineSearch().setStoryOpener` (Home's Story Peek);
  otherwise a chosen story opens its Story screen. Collections are in its
  results by name only (never a brief, contact or resource address). People
  and Media join with their screens.
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

**One SidebarProvider, contextual composition.** Byline has one
`SidebarProvider` and one outer `Sidebar`; what it contains is the shell's
**composition** (`ShellComposition`: `default`, `story-workspace`,
`calendar-workspace`, `media-workspace` or `collection-workspace`,
`ui/shell/layout.tsx`). It is chosen from the route
(`ShellRoute`: `storyIdFromPath`, a saved story's `/collections/stories/:id`,
never `/create` or a list; Calendar/Media paths; or an open Collection query)
and from which workspaces the
viewport is wide enough for (`ShellViewport`). Each workspace has its own
breakpoint, measured for its own content:

| Screen | Sidebar |
| --- | --- |
| Normal screens | Global app sidebar (`DefaultSidebar`), 256px |
| Wide Story workspace (≥1300px) | Global icon rail + contextual Story list, 350px |
| Wide Calendar workspace (≥1320px) | Global icon rail + the Calendar's controls, 350px |
| Wide Media workspace (≥1024px) | Global icon rail + Media navigator, 320px |
| Wide open Collection (≥1280px) | Global icon rail + Collection switcher, 340px |
| Collapsed workspace | Global icon rail, 48px |
| Narrow Story workspace (<1300px) | Normal global sidebar + a temporary Story switcher sheet |
| Narrow Calendar (<1320px) | Normal global sidebar + the same Calendar controls in a temporary right-hand sheet |
| Narrow open Collection (<1280px) | Normal global sidebar + Switch collection Sheet |

- The wide Story workspace follows shadcn **`sidebar-09`** closely: the outer
  `Sidebar collapsible="icon" className="overflow-hidden
  *:data-[sidebar=sidebar]:flex-row"`, then `BylineIconRail` (`Sidebar
  collapsible="none" className="w-[calc(var(--sidebar-width-icon)+1px)]!
  border-r"`) and the Story pane (`Sidebar collapsible="none" className="hidden
  flex-1 md:flex"`). `--sidebar-width` is 350px on that route only. ⌘\ or the
  header's trigger collapses the one sidebar to the icon width, leaving only
  the rail, and that is still the `byline_sidebar` cookie; there is no second
  cookie or state. Entering a story with the sidebar collapsed shows the rail
  alone.
- **The icon rail** has the global destinations, Create and the account,
  icons only (`CreateMenu compact`, `NavUser compact`), each with an
  always-on tooltip (`tooltip={{ children, hidden: false }}`, as upstream)
  and an accessible name. The Stories icon is current inside a story. The
  compact "+" always opens the Create menu.
- **The Story switcher** (`StorySwitcher.tsx`) is a navigation list, not a
  second Stories screen: *Stories · All stories →*, a queue (My stories,
  Ready for review for editors and administrators, All stories: the built-in
  presets from `story-views.ts`), `SidebarInput` search (Planning's `query`,
  scoped to the queue; ⌘K stays global), then compact rows (headline, then
  stage · deadline, or who has it). Data is `GET /api/byline/planning` through
  `usePlanningStories` and the shell's query cache. The open story is
  `aria-current="page"`; when the queue leaves it out it is pinned under
  *Current story* from the workspace the Story screen already loaded (the
  shared `workspaceQueryClient` cache, so no new request; nothing that the
  account cannot read). The queue is remembered in Payload Preferences
  (`byline:story-switcher:queue:v1`). One controller, mounted in the shell,
  renders `StorySwitcherContent` in the workspace pane and in the narrow
  screens' Sheet (opened by *Switch story* in `StoryHeader`, from the right;
  the global menu keeps its own trigger and Sheet).
- **The Calendar workspace** (`CalendarWorkspaceSidebar.tsx`) is the same
  sidebar-09 composition: the one `BylineIconRail` (no second navigation list;
  the Calendar icon comes from `NAVIGATION`) and a non-collapsible inner pane,
  inert when the sidebar is collapsed, holding shadcn **`sidebar-12`**'s calendar
  controls (`CalendarControls`, shared with WordPress): a mini month
  (`Calendar` with `captionLayout="dropdown"` and `timeZone` set to the
  newsroom's) and, instead of sidebar-12's fake named calendars, the newsroom's
  real categories as whole-row checkboxes with their event colour dot: *My
  schedule*, then *Show*: Appointments, Story deadlines, Production, Planned
  publication, Publication, Task due dates. Needs scheduling stays a card on
  the Calendar; the pane header only shows a count.
  **One state, two presentations.** A `CalendarWorkspace` store
  (`calendar-workspace.ts`) is the only owner of the selected date, the filters
  and the view; the shell holds it (`CalendarWorkspaceShell`, as it holds the
  Story switcher), so the pane, the Calendar and the sheet never keep their own
  copy. Picking a day in the mini calendar calls the controller's `setDate`
  and Schedule-X jumps there; navigating Schedule-X moves the mini calendar's
  selected day and month. The pane and the sheet render the same
  `CalendarControls` (sidebar-13's idea: contextual controls shown temporarily
  where there is no room to reserve sidebar width). The toolbar offers the
  *Filters* sheet whenever the pane is not showing (narrow screens, or the
  sidebar collapsed) and omits it when the pane is.
  Preferences (the view, the category toggles and My schedule) are Payload
  Preferences, key `byline:calendar:preferences:v1`; the date is navigation
  and is not stored. Saves are serialized and always end on the latest state
  (quick toggles otherwise race). Dates are the newsroom timezone's
  (`admin.custom.newsroomTimeZone`), never the browser's.
- **Why 1320px for the Calendar** (not the Story workspace's 1300): Schedule-X's
  grids need their own room. Measured in the browser (1180, 1300, 1366, 1440):
  the Calendar frame is the viewport − 350 (sidebar) − 48 (the screen's
  `lg:px-6`) = viewport − 398. The week grid spends 82px on its time axis and
  gives each of 7 columns (frame − 82) / 7; the month grid gives each cell
  frame / 7. At 1180: week column 100px, month cell 111px, and an all-day chip
  read "Robotics t…". At 1300: 117 / 128, borderline. At 1366: 126 / 138,
  comfortable. A chip with an icon, a time and a title needs about 120px in
  the week grid and 130px in a month cell, so the limit is the stricter one:
  398 + 82 + 7 × 120 = **1320px** (`CALENDAR_WORKSPACE_MIN_WIDTH`, with the
  arithmetic in `CALENDAR_GEOMETRY` and pinned by a test). Below it Schedule-X
  keeps the full width beside the ordinary 256px sidebar (frame 996px at
  1300) rather than being squeezed.
- **Why 1300px:** the Write tab's article measure is 760px. Beside the 350px
  workspace, Payload's Edit view gutters take 120px and the Story screen's
  padding 64px: 350 + 120 + 64 + 760 = 1294. Measured: at 1200 the article
  shrank to 666px; at 1300, 1366, 1440 and 1920 it is 760px. Below 1300 (1280
  laptops included) the ordinary sidebar stays.
- **Leaving a story never loses an edit.** Payload turns off its own
  leave-without-saving prompt for autosaving documents, and its autosave does
  not run once the document unmounts. Every shell link (sidebar, rail, Story
  list, Search, Create) goes through `ShellNavigationProvider`
  (`navigation.tsx`). The Story screen reports Payload's own `modified` and
  saving state (`useLeaveGuard`); with nothing pending the link navigates at
  once (Next client navigation, so Payload's lock release runs). Otherwise it
  waits for Payload's autosave ("Saving your changes…"). If the edit is still
  unsaved and nothing is saving after 3s (a failed or skipped save), it asks:
  *Leave without saving?* (Stay / Leave anyway). It never saves on its own.
- **Payload remounts the Nav on every navigation** (it lives in each page,
  not a layout). So the shell keeps the switcher's queue, search and scroll
  position, and applies a width change only once the new sidebar has mounted
  (`useSidebarWidthLayout`), so 256 ↔ 350 animates like collapsing does.
- The viewport is a layout capability, never a preference: a narrow window
  does not write `byline_sidebar`. Until hydration the server renders the
  ordinary layout; a hard load of a story on a wide screen then slides to the
  workspace.

**Sidebar patterns, one per job.** There is exactly one global sidebar. Other
shadcn sidebar blocks are references for specific surfaces, never extra global
navigation:

| Block | Byline use | When |
| --- | --- | --- |
| `dashboard-01` | Shell structure: sidebar + sticky header + content | Now |
| `sidebar-09` (nested) | A contextual pane inside the one sidebar, beside the global icon rail. The Story workspace (Story switcher), the Calendar workspace (Calendar controls), the Media workspace (Media navigator) and the Collection workspace (Collection switcher) have it | Story, Calendar, Media, Collections: done. Others: with their screens |
| `sidebar-13` (sidebar in a dialog) | The narrow-screen Story switcher, Calendar controls and Collection switcher Sheets (same content as the workspace pane, no second provider) | Done |
| `sidebar-10` (popover) | Compact contextual actions; universal actions stay in the Command palette | As needed |
| `sidebar-11` (file tree) | Only for really hierarchical data: Payload's Media folders (folders only; files stay in the content browser). Library scopes and Work views are plain menu items, never fake folders. Never Collections: they are a flat set of projects | Media: done |
| `sidebar-12` (calendar) | Calendar's contextual pane: mini calendar plus the newsroom's real categories (above) | Done |
| `sidebar-14` / `sidebar-15` (right inspector) | Visual reference only for Media's asset inspector, which is a page-level `ResizablePanelGroup` panel (or a Sheet), not a second sidebar. The Story screen's inspector for workflow, deadline, editor, presentation, format, readiness and Preview controls not already edited inline; a Sheet on narrow screens | With the editor / Live Preview phase |

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

### 7.3 People and My profile

[People workspace](people-workspace.md) is the parallel People slice on
`feature/payload-people`, stacked on the verified `ad1ad5e` foundation. Editors
get `/admin/people` after Collections; linked accounts get `/admin/profile` from
the account menu. One CMS-neutral explicit-save Person editor powers both,
with server-derived capabilities, own-profile field access, image-only Byline
Media picking, guarded URL navigation and transactional 409 conflicts.
Person and User stay separate underneath; administrators manage each Person's
optional newsroom access from that same Person screen. Raw Accounts are only a
System-administration fallback.

Guests are People with guest status and sensible byline-only creation defaults.
Status, staff-directory visibility and profile-page visibility are independent.
Retirement preserves bylines, and referenced People cannot be deleted through
the raw fallback. `public-people.ts` is an allowlisted future public input,
including authors/guests partitions; it has no account data. Stable profile
presentation/CSS is shared in `@byline/ui` between Astro and the unsaved-draft
preview. Astro retains routes, metadata, Person JSON-LD and story queries.
The Story byline picker can create a byline-only guest in place. Manual WordPress
URL parity uses the live pathname and the original publication instant.

## 8. Editor

The editor is built; its architecture, block schemas, insertion model and
component mapping are in [article-editor.md](article-editor.md). In short:

- `@byline/article-body` is the provider-neutral `byline-v1` contract (types,
  block registry, readiness rules). Nothing in it knows Payload, Lexical, React
  or CSS.
- `@byline/ui` renders it (`@byline/ui/article-body`) with shared primitives and
  the same `article-body.css` the editor canvas loads. There is no
  editor-only copy of the article's look.
- `@byline/editor` owns the Payload block configs, the Lexical feature setup, the
  block editors and the Payload Lexical → `byline-v1` normalizer. The body is
  Payload's native Lexical field with `BlocksFeature`; Lexical remains the one
  document state, so autosave, drafts, versions and locking are Payload's.
- Slash insertion is Payload's native menu (labels and slugs only; `/doc` and
  `/pdf` find Document (PDF) through its label). The explicit Add menu is a
  shadcn `Command` over the registry.
- Allowed prose: paragraph, H2, H3, bold, italic, web links, bulleted and
  numbered lists. Subscript, superscript and inline code stay off until
  reviewed against the legacy corpus. No alignment, colour, font, indent,
  column, table or HTML features.
- Payload Views are experimental in 3.92.1 and are not part of the contract.
  Scrollytelling is not a block.

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

### 10.1 Decided: no Scrollytelling block

PR #226 removed the WordPress Scrollytelling blocks deliberately: scrollytelling
belongs to repository visual stories (`defineVisualStory`), with scroll logic in
each story's `client.ts`. That stands under Payload: there is no Scrollytelling
block, and the normalizer reports an unknown block type rather than dropping it.
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
| 1b | Preferred Google Workspace login, password fallback for every enabled invited account, branded login with optional Unsplash photos | invited-only OAuth and native password browser tests | Implemented; Google Workspace and optional Unsplash deployment setup in §4.1 |
| 2 | People, Stories, Sections, Topics, Collections and optional public presentations, Corrections, Pages, Workspace records, canonical public model | access/privacy tests | collections + access **done**; People workspace, My profile and public-safe projection done in the parallel People slice; Collections workspace and public compatibility projection done; full snapshot integration, `events`, YouTube metadata job pending |
| 3 | Story view (Write/Plan/Production/History), Lexical, first blocks, autosave, locking, history | writer acceptance steps 1–6 | Story screen (Write/Plan/Production/History) done. Semantic editor and the first eight blocks built ([article-editor.md](article-editor.md), part of this PR); the full-story autosave check, the lock/undo/width browser specs and editor/public geometry parity are not yet green |
| 4 | Extract `@byline/story-presentations`, canonical normalization, exact Live Preview | §5 parity suite green | Built and browser-verified (§14), except the pop-out window (this environment cannot open pop-ups) and automated Playwright coverage of the torture flow. Verified in Chromium on the real Story screen: live typing before autosave, 12 overlapping autosaves with Preview staying open, Standard/Immersive/alignment/lead-image fallback, section, contributors, topics, body prose, all eight block types edited and reordered, lead/Photo/Gallery media swaps, reporting note, repository custom and visual stories, Phone/Tablet/Desktop/Responsive, widths 1920/1440/1366/1180/820/390, reload parity |
| 5 | Media: private source storage, metadata, crops, prepared publication renditions, static-build materialization, drag and drop | media privacy + static public availability tests | **Done** ([publication-media.md](publication-media.md)): art-direction intent + editor (Media inspector, Story lead image, Photo block), publication revision, Jobs Queue preparation with stale-safe promotion, content-addressed store, recipe v1, Story publish gate, build-only endpoint, verified build materializer, immutable `_headers`, migration `20261107_060841_publication_media_pipeline`. Verified by unit, real-PostgreSQL/Jobs/Sharp integration, Playwright and a live end-to-end acquisition. The materializer is fed from the Payload snapshot in Phase 7. Recipe quality is a conservative default until a representative R7/iPhone fixture set is benchmarked |
| 6 | Full block set | torture-test story authorable | **Subsumed by Phase 9; blocks built, gate not yet complete.** All 24 tools and inline footnotes are built exhaustively across the contract, Payload configs, readiness, renderer and editors, with server-side privileged-block enforcement and a strict publish gate ([newsroom-blocks.md](newsroom-blocks.md)). The torture-test fixture opens in the real Story editor with all 24 blocks and numbered footnotes. Remaining for the gate: the full browser suite (Add menu, undo, autosave, reload, Live Preview, touch widths) |
| 7 | Payload publication revision, artifact and direct recovery | snapshot build and deliberate no-snapshot fallback both pass Astro verification and produce the same canonical routes/content/media set | **Done** ([payload-build-snapshots.md](payload-build-snapshots.md)): monotonic public revision advanced in the same PostgreSQL transaction as every public mutation (Stories, Pages, Events, People, Sections, Topics, public Collections, Corrections, public Media fields, the `publication` Global), `prepare-public-snapshot` job on its own `publication` queue with a revision fence and conditional promotion, immutable content-addressed artifacts with retention, build-only discovery/artifact/direct endpoints, the Astro acquisition state machine (completed snapshot; direct recovery only for the recognized not-ready answer; everything else fails), post-render prepared-media acquisition, publication-timezone article dates shared with Live Preview, `publication` Global, `events` collection, migration `20261107_073047_public_snapshot_v1`. Verified by real-PostgreSQL integration tests, acquisition unit tests, the snapshot-vs-direct parity gate (identical output, full postbuild verification), a WordPress snapshot-build regression and a live run against a running newsroom |
| 8 | WordPress → Payload import | counts/relations/IDs reconcile; custom presentation still resolves imported ID | **Not built, by decision.** Weekly Wildcat has only a small number of existing stories and will migrate them manually; no generalized importer was necessary |
| 9 | Snapshot v2 + structured `ArticleBody` | completed v2 and direct recovery pass the same native static-build, privacy and interactive gate | **Done.** Native v2 replaces the temporary Payload projection. The parity fixture covers all 24 blocks, three inline footnotes, prepared Media, public references and interactive enhancement. |
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
  `coverages` (since replaced by `collections`, `collection-interviews` and
  `collection-resources`; see the Collections record above), `corrections`,
  `pages` (Versions/Drafts), `media` (private,
  no destructive crop, no synchronous renditions; the Phase 1 native focal
  point was replaced by Byline art-direction intent in Phase 5), `live-updates`,
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
view, Live Preview and presentation extraction, publication-rendition/static
media materialization, snapshot + direct-source build projection, import,
runtime polls/live, Discord, MCP.
Nothing in `apps/web` or `wordpress-plugin` changed; production still runs on
WordPress.

## 14. Phase 4 record

Packages: `@byline/content` is provider-neutral (no UI, React, CMS or Astro) and
owns `@byline/content/story` (`ArticlePresentation`, `PublicStory`,
`buildArticlePresentation`, `resolveBuiltInPresentation`). The homepage
resolver, the one module that needed UI view types, moved to
`@byline/ui/homepage`. `@byline/story-presentations` owns `StoryArticle`, the
resolver, registry, types and the stories. `ArticlePresentation.body` is a
`PublicArticleBody` (replacing `contentHtml`); the WordPress adapter
(`apps/web/lib/adapters/wordpress-story.ts`) emits `legacy-html` and its output
was compared with the previous builder for every fixture post (identical apart
from `contentHtml` → `body`).

Layout: side by side from 1281px up (Payload's own split); at 1280px and below the preview stacks above the editor (`custom.scss`) so the Story header's Preview button is always reachable. The Story header resolves the presentation with `@byline/story-presentations/resolve` and server-supplied identities (`admin.custom.storyPresentations`), never the full package, to keep story components out of the admin bundle. Dev only: React logs a warning when `HeroReveal`'s inline fit script is client-rendered in Preview; the script is unnecessary there (no site header).

Baseline at the start: the dedicated newsroom CI job was green; the package
suite failed on a stale Media Library `delivery` expectation (fixed, separate
commit); WordPress E2E had existing Planning/Collections/Story-list failures,
not touched here.
