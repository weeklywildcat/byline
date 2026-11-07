# People workspace

People is the Payload migration's public/editorial identity workspace. The public
newspaper remains the static Astro app, with WordPress as production authority.
Saving a Payload profile does not update weeklywildcat.com in this phase.

## Person and User

A Person is the permanent name on an ordered Story byline, with public profile
copy, portrait and optional directory/profile visibility. A User is a private
sign-in account with its own role, enabled state and authentication settings.
`users.linkedPerson` connects them. Account changes never write or delete People;
Stories continue to reference `people`, never Users. Guests are ordinary People
with `status=guest`, with no second contributor type or guest collection.

Editors manage People at `/admin/people`, after Collections in primary navigation.
Staff do not see or have API access to the management directory. An enabled
account whose linked Person exists gets **My profile** in its account menu at
`/admin/profile`. An unlinked account visiting that route gets an explanation;
Byline does not create or link a Person automatically. Only administrators reach
the raw Payload People screen in System administration.

## Screens and URL state

The index is a compact Nova ItemGroup of Item rows: portrait/initials Avatar,
name, newsroom role, status, directory/profile context and an edit disclosure.
It is not the public staff card gallery. Views are Current staff (default),
Guests, Alumni and All, with alphabetical sorting and local identity search over
name, newsroom role and slug. No bios, emails or account fields are searched.
Results are server-paged at 50. Portraits are batched; there are no per-row account
reads or story counts. The query (`view`, `search`, `page`) and selected
`?person=<id>` are the URL's state, including Back, Forward and refresh.

Opening a Person renders a full detail screen under the normal global sidebar,
with Back to People, a large circular portrait, role/status, Preview and Save.
At 1180px and above, the public-copy form and 240px publication rail sit beside
one another; narrower screens use the same composition in a vertical flow.
There is no contextual People sidebar or inspector Sheet.

**New person** belongs only on this screen, never global Create. Its small Dialog
asks for Name, Current staff / Guest contributor and an optional newsroom role.
Current staff starts active, in the directory and with a profile page. Guests
start outside the directory and without a profile page. Creation immediately
opens the full editor. It creates no account, invitation or account link.

## One editor, actual capabilities

`PersonEditor` is the same CMS-neutral component for management and self-service.
The server returns `editProfile`, `editEditorialIdentity`, `changeVisibility`,
`manageAccount` and `delete` capabilities; the UI follows them, while the server
independently rejects unauthorized writes. `delete` is always false here.

Staff may change only their own linked Person's name, pronouns, short/full bio,
portrait, public email and flexible social links. They see newsroom role and
visibility as read-only context with an editor-managed explanation. They never
see an account administration section or a wall of disabled controls. Editors
may also change slug, newsroom role, status and both visibility flags. Even an
editor or administrator cannot write authentication fields or account linkage
through the People endpoints.

Name is byline copy. Pronouns are free text. Short bio is limited to 400
characters; full bio to 4000. All public copy is together in one form. Contact
has a separate public email and up to eight ordered service-label/HTTPS-URL rows.
Combobox suggestions allow custom labels; arrow buttons preserve meaningful
public ordering without drag-and-drop. No WordPress handle parsing is retained.
The schema and endpoint reject non-HTTPS, malformed and credential-bearing URLs.

Publication concepts are independent:

- `status`: Current staff, Alumni or Guest contributor.
- `directoryVisible`: whether this Person appears on Staff.
- `hasProfilePage`: whether this Person has an `/author/<slug>/` page/link.

Status edits never rewrite existing visibility choices. A guest may have a
full profile; a Person outside the directory can still have a profile page;
a byline-only Person stays a valid historical contributor. Advanced slug
settings warn that URL changes need redirects; this slice creates none.

The account summary exposes only linked/not linked and account display names.
There is no email, role, enabled control, Google/Discord identity, break-glass or
notification data. Administrators get a guarded link to System administration;
editors see that account management is separate. Self-service does not enumerate
linked accounts, including any other accounts sharing that Person.

## Portrait, preview and byline usage

Choose/Change photo opens the existing Byline MediaPickerDialog, restricted to
images; its type filter cannot widen that relationship. The Person stores only
the Media relationship ID. The form uses the private library rendition for its
large circular preview, and reports an unavailable or failed image locally.
Remove photo clears the relationship. The server verifies image type again.

Preview is a roomy Dialog with Staff directory and Author profile tabs, rendered
from the current unsaved draft. Off-directory and byline-only identities get
explanations rather than invented public pages. `@byline/ui/contributor-profile`
provides ContributorAvatar, ContributorDirectoryCard, ContributorProfileHeader,
ContributorSocialLinks and ContributorBiography. Astro's real Staff/Author views
and this preview use those components and the same dedicated
`@byline/ui/contributor-profile.css`. The stable profile CSS moved out of web
globals; route layout, fetching, story lists, metadata and Person JSON-LD stayed
in Astro. The newsroom supplies the Weekly Wildcat theme tokens and bundles the
same public font files locally, without loading production pages.

Only the selected Person queries byline usage. It combines the current Story
relationship with accessible draft contributor plans, then uses the existing
`readableStories` boundary so only managers see a published story's unpublished
rewrite. It shows the accessible total and six recent story names/states with
normal guarded Open story links. Staff never gain Story access through People.

## Saves, conflicts and retirement

People has explicit Save / Cancel changes, no drafts, autosave, document locks
or version engine. Unsaved work is protected by the existing shell leave guard,
the shared history guard for Back/Forward, a local discard Dialog for within-
People moves/reload, and the browser's beforeunload prompt. Successful save
clears dirty state. Account-menu profile/system navigation and sign-out use the
same shell guard before navigating or changing session state.

PATCH requires `expectedUpdatedAt`. The server starts a Payload transaction,
locks the Person row, compares the revision, and updates through Payload using
the same request and `overrideAccess:false`. Two simultaneous edits from one
revision cannot both win. A stale write returns 409: “Someone else changed this
profile. Reload to see the newer version.” The draft stays available to copy;
reload/discard requires the normal dirty confirmation.

Retire current staff to Alumni instead of deleting historical identities. There
is no deletion action in the People UI. Only the administrator raw fallback
retains deletion; a beforeDelete guard rejects a Person referenced by any
current Story, trash, Story version or contributor plan, with a useful Alumni
message. Payload's relationship FKs use ON DELETE CASCADE, so the guard locks
the Person row first in Payload's deletion transaction. Concurrent contributor
FK inserts must settle before its checks or fail after deletion, closing the
check/delete race without changing Story schemas. Those integrity reads intentionally inspect all records internally,
without returning private Story contents. A truly unused identity can still be
deleted through Payload's administrator path and its native confirmation.

## API and package boundaries

Every screen endpoint authenticates an enabled account, uses normal collection
and field access with `overrideAccess:false`, and returns an allowlisted DTO:

| Method | Address | Access |
| --- | --- | --- |
| GET | `/api/byline/people` | editor+ |
| POST | `/api/byline/people` | editor+ |
| GET | `/api/byline/people/:id` | editor+, or own linked Person |
| PATCH | `/api/byline/people/:id` | editor+, or own allowed public fields |
| GET | `/api/byline/profile` | own linked Person only; null when unlinked |

`packages/newsroom-screens/src/people/` owns people-model/api/query, person-form,
PeoplePage, PersonEditor and PersonPreview. It imports no Payload types.
`apps/newsroom/src/newsroom/people.ts` is the Payload adapter;
`ui/people/` provides fetchers, URL state and shell/media integration;
`components/BylinePeople` and `BylineProfile` are authorized custom root views.
`packages/ui/src/contributor-profile.*` owns reader presentation only.

Components used are Nova/shadcn Item/ItemGroup/ItemMedia/ItemContent/ItemTitle/
ItemDescription/ItemActions, Avatar/Image/Fallback, Badge, Empty, Skeleton,
Separator, FieldSet/Legend/Description/Group/Field/Label/Error, Input, Textarea,
Select, Checkbox, InputGroup/Addon/Input, Combobox, Dialog, Tabs, RadioGroup,
Collapsible and Button. Existing Media controls and shell prompts retain their
native shadcn primitives. No component library or People Sheet was added.

## Public projection and deferred work

`newsroom/public-people.ts` projects an explicit public allowlist from People
and public portrait facts, partitioning future authors/guests inputs by editorial
status, never by whether an account exists. `publicEmail` is its only email
source. It has no Users query, account join, private media URL or account spread.
`href` is null for byline-only People; directory visibility remains explicit.
Portraits are public rendition inputs (ID/alt/dimensions), not private URLs.
The final WordPress-shaped Snapshot v1 adapter, media materialization, ID import
and v2 delivery remain later migration phases; nothing is wired to production.

Story picker quick-create is deliberately deferred until the concurrent editor
branch settles. Its seam is **Add contributor → New guest**, using this same
POST People API. No unused quick-create component or editor integration is added.
The global command palette currently couples Story search and recent Story
results to Home fetchers; editor-only People search is a small later extension
to its neutral search contract. Local People search is complete. Polls, Feedback,
authentication rebuilds, snapshots, imports and Story/Lexical changes are outside
this slice. Only shared package exports/config and shell navigation may need
ordinary rebasing against concurrent work; no editor files were changed.

## Validation

Run the unit/model suites with `npm run typecheck:packages`,
`npm run typecheck:newsroom`, `npm run test:newsroom` and
`npm run test:newsroom-screens`. `tests/integration/people.test.ts` covers actual
PostgreSQL access/field permissions, forged requests, safe DTOs, public projection,
creation defaults, concurrent saves, usage privacy and historical deletion/account
invariants. Set `BYLINE_TEST_DATABASE_URL` to a disposable database prefixed
`byline_newsroom_test`; the integration runner creates its own databases.

`npm run test:people:browser --workspace @byline/newsroom` starts a dedicated
throwaway fixture database and newsroom on :3012. Local installed Chrome can be
selected with `PLAYWRIGHT_CHROMIUM_CHANNEL=chrome`. The seed refuses database
names outside `byline_newsroom_test_people_browser*`. It uses five realistic
profiles: a fully populated editor with portrait, a sparse writer with initials,
a byline-only guest photographer, a guest with a full public profile, and an
alumni writer with historical stories; plus an unlinked account. Browser output
and screenshots go to `/private/tmp`, not the repository.

The public regressions use `npm run test:frontend`,
`npm run typecheck:frontend`, `npm run test:frontend:snapshot-build` and the public
Playwright suite. The public site remains static and snapshot-only. The focused
profile browser regression checks Staff/Author geometry at 1920, 1440, 1366,
1180, 820 and 390px, profile metadata/Person JSON-LD and fallback presentation.

Validation record for this slice:

| Check | Result |
| --- | --- |
| `npm run typecheck` | All monorepo typechecks passed |
| `npm test` | Full monorepo suite passed; 10 optional live MCP tests retain their default skip |
| Newsroom unit tests | 138 passed |
| Shared newsroom screens | 104 passed |
| Frontend unit tests | 531 passed, including no-story author noindex, social links, JSON-LD and contributor regressions |
| `BYLINE_TEST_DATABASE_URL=postgres://localhost:5432/byline_newsroom_test_people_slice npm run test:newsroom:integration` | 189 passed, including 35 People access/privacy/concurrency/integrity tests |
| `PLAYWRIGHT_CHROMIUM_CHANNEL=chrome npm run test:people:browser --workspace @byline/newsroom` | 13 browser tests passed; all six widths, realistic guest/alumni/profile fixtures, explicit save, dirty traversal, stale conflict and sign-out |
| `PLAYWRIGHT_CHROMIUM_CHANNEL=chrome BYLINE_BROWSER_VIDEO=0 npm run test:browser --workspace @byline/web -- tests/browser/contributor-profile.spec.ts tests/browser/public-site.spec.ts` | 15 passed: Staff/Author, article byline/end-of-story geometry and existing public-site regressions; all six profile widths |
| `npm run test:frontend:snapshot-build` | Static-export, public routes, media, SEO and two-request acquisition boundary passed |
| `BYLINE_CONTENT_MODE=weekly-wildcat-fixture BYLINE_COMPOSER_BIN=/private/tmp/byline-composer npm run build` | Full public/plugin/Discord build passed using the available local Composer wrapper |
| `PAYLOAD_SECRET=… DATABASE_URL=… BYLINE_DB_PUSH=0 npm run build --workspace @byline/newsroom` | Production newsroom build passed |
| `npm run verify:contracts` | Contracts, updater, shared CSS, editor canvas, release helpers and both MCP catalogs passed |
| `PAYLOAD_SECRET=… DATABASE_URL=… npm run migrate:check --workspace @byline/newsroom` | All committed migrations applied to an empty DB and match the config; no new migration required |
| `npm run generate:types --workspace @byline/newsroom` | Regenerated with no type-file diff |

Browser widths: 1920, 1440, 1366, 1180, 820 and 390px. Local Chrome was used
because managed Playwright browsers were absent; public video capture was disabled
because its FFmpeg binary was absent. Screenshots and traces were retained under
`/private/tmp`. WordPress E2E and unrelated public browser specs were intentionally
not run; no WordPress implementation or Story/editor implementation changed.
