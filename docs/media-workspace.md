# Byline Media

The newsroom's Media destination (`/admin/media` in the Payload newsroom). One
destination, two concepts that never mix:

- **Library**: the files. Payload's `media` upload collection and its native
  folders.
- **Work**: production assignments (photo, gallery, graphic, video, audio),
  the shared desk WordPress called *Media Desk*.

```
Media workspace
= Byline app rail
+ source/folder navigator
+ content browser
+ optional asset inspector
```

It combines three patterns: shadcn `sidebar-09` (the persistent Byline icon
rail plus a contextual pane in the one sidebar), `sidebar-11` (a real
collapsible tree, for real folders only), and a DAM workspace (sources on the
left, the grid in the middle, the selected asset's preview and metadata on the
right).

## Principles

- **Folders are Payload's, and only folders are in the tree.** `folders: true`
  on Media (Payload 3.92 native folders, `payload-folders`). Byline adds no
  folder schema of its own (no `media-folders`, no relation table, no
  `folderPath`/`parentFolder`). The tree stops at folders; files appear in the
  content browser, so the navigator stays usable with thousands of files.
- **Library scopes are filters, not folders.** All media, Recent (14 days),
  Uploaded by me, Needs metadata and Unfiled are plain menu items, never folder
  icons or tree nodes. Work views (My assignments, All, Due soon, Needs files,
  Unassigned for editors) are query presets over the assignments the account
  may already see. Nothing is a persisted "smart folder". A future
  Media reference/smart-group slot exists between Work and Folders
  (`extraGroups`); it is not built yet and does not implement reporting
  [Collections](collections-workspace.md) in the Media navigator.
- **Folders are logical.** A Media document's `folder` is a relationship.
  Filing or moving a file never changes its URL or moves or renames the source
  file on the newsroom's persistent media volume.
- **Search and folders are complementary.** Search covers filename, alt text,
  creator, credit, copyright, licence and source URL. From a folder, a search
  looks across all media by default; a visible toggle keeps it in the folder.
  All media is always one click away.
- **The address is the state.** `/media` is Library → All media;
  `?source=unfiled`, `?folder=12`, `?view=work&scope=due`, `?asset=456`. Moves
  within Media use the browser's history (Next follows native `pushState`, so
  no server round trip and no shell remount): Back/Forward work, a refresh
  keeps the folder and the selected asset, Library ↔ Work never reloads. Search
  text, filters and the inspector's width are never in the address.
- **Private previews are not publication renditions.** Media has one image
  size, `library` (≤640px WebP, made by Payload on upload). It is Payload's
  admin thumbnail too, so no raw Payload list loads camera originals either.
  It is served by the same file route under Media's `read` access as the
  original, and it is never part of `publicationAssets`. Publication files are
  prepared separately by the media worker
  ([publication-media.md](publication-media.md)). `publicationAssets`,
  `publicationRevision` and `uploadedBy` are system-only fields, so neither an
  upload nor a metadata edit can claim that an asset is ready. “Ready” means
  suitable files exist for a future static build; it does not mean the file is
  currently live on Cloudflare.
- **Crops and focal point** open from the inspector (“Crops & focal point”)
  in the shared `MediaArtDirectionDialog`, owned by the Media shell
  (`editArtDirection(id)`); the Story lead image and the Photo block open the
  same dialog through the editor host. A save moves the asset's publication
  revision and re-queues preparation; unsaved file details in the inspector
  are kept and compared against the reader's own crop save, never refused by
  it.
- **Publication files** in the inspector: Ready (with the version it was
  prepared for and any low-resolution warnings), Preparing (re-read every few
  seconds until it finishes), Not prepared or Failed (with the reason), and
  Retry for the uploader and editors. Hashes, storage paths and manifests are
  never shown; Payload's raw reads hide the manifest and source hash from
  everyone but administrators.

## Permissions

| | Read | Upload | Edit metadata / move | Delete | Folders |
| --- | --- | --- | --- | --- | --- |
| Staff | every file and the folder tree | yes, into any folder | files they uploaded | no | browse only |
| Editor, administrator | yes | yes | any file | yes, unless something links to it | create, rename, move, delete when empty |

Everything is enforced by the collections (Media access, the folder
collection's override in `apps/newsroom/src/collections/MediaFolders.ts`);
the endpoints read and write as the account (`overrideAccess: false`).

**Folder deletion is conservative.** Payload's own delete removes subfolders
recursively and unfiles their files. Byline refuses to delete a folder that
holds files or subfolders (409, with what it holds). Moving a folder into its
own subtree is refused (Payload would silently re-parent). Sibling names are
distinct, ignoring case.

**File deletion is conservative.** A file still linked from a story,
assignment, Collection artwork/resource or profile can't be deleted (409).

## API (`/api/byline/media/*`, `apps/newsroom/src/newsroom/media-library.ts`)

| | |
| --- | --- |
| `GET /media` | one Library page: `folder` or `source`, `q` (+ `within=folder`), `type`, `uploader`, `metadata=needs`, `capturedFrom`/`capturedTo` (newsroom days), `publication`, `sort`, `page`, `limit` (≤100, default 48). Never raw Payload query syntax. |
| `GET /media/navigator` | folders (flat, with file counts), Library counts, capabilities (incl. accepted MIME types and the upload size limit), uploaders |
| `GET /media/:id` | the inspector's detail: folder path, linked uses, hidden-use count |
| `PATCH /media/:id` | alt, creator, credit, copyright, licence, source URL, captured day, folder; `expectedUpdatedAt` compare-and-swap (409) |
| `POST /media/:id/rename` | `{ name, expectedUpdatedAt }`: renames the stored file (see *Renaming*); uploader or editor; row-locked compare-and-swap (409) |
| `POST /media/move` | file several assets into a folder (each checked on its own) |
| `POST /media/bulk-update` | `{ ids, patch }`: the same creator, credit, copyright, licence or source URL on several files (≤200), each as the account; empty fields are skipped, never used to clear; returns `{ done, failed }` |
| `POST /media/bulk-delete` | `{ ids }`: editors; each file still linked anywhere is refused and kept; returns `{ done, failed }` |
| `POST /media/upload` | multipart (`file`, `_payload` JSON `{ folderId }`), Payload's own upload operation |
| `DELETE /media/:id` | editors; refused while linked |
| `POST/PATCH/DELETE /media/folders(/:id)` | folder management |
| `GET /media/work` | the shared desk's `MediaDeskResponse` from `production-assignments` read as the account |
| `GET /media/:id/art-direction` | the crop editor's data: oriented size, private original and preview URLs, `animated`, the intent, `updatedAt`, `canUpdate`, publication detail |
| `PUT /media/:id/art-direction` | `{ focalPoint, crops, expectedUpdatedAt }`; uploader or editor; validated and canonicalized server-side; row-locked compare-and-swap (409) |
| `POST /media/:id/publication/retry` | requeue preparation (Media update permission; queued as the system) |
| `GET /media/publication-readiness` | `?lead=&ids=`: the Story header's readiness report (the same rule Publish enforces) |

The browse row (`MediaLibraryAsset`) carries id, filename, kind, size,
dimensions, the private preview URL, the protected original URL, metadata,
captured date, uploader, folder, effective publication status (a stale
generation reads as not prepared), concrete gaps and the account's
`canUpdate`/`canDelete`. Usages and the publication detail are fetched only
for the inspector. No storage credentials, keys, hashes, renditions or
manifests leave the server; art direction is read and written only through
its own endpoints.

**Linked uses** come from relationships: story `featuredMedia` (live or
draft), production-assignment `media`, Collection `publicPresentation.artwork`
and resource `media`, live-update
`photo`, person `portrait`. Images inside rich text are not scanned yet, so the
inspector says *Linked uses*, never "every use", and counts records the account
can't open.

**Metadata gaps** reuse WordPress's media readiness checks on Payload fields:
an image needs alt text and a credit (or creator); every file needs copyright,
a licence or a source URL. The UI names each gap (*Missing alt text*, *Missing
credit*, *Missing rights/source information*); it does not decide a rights
policy.

## Code

Shared, CMS-independent (`packages/newsroom-screens/src/media/`):

- `media-library-model.ts`: the contract, the folder tree, the address, query
  serialization, gaps. `media-library-api.ts`: `MediaLibraryFetchers` and the
  query keys (`mediaLibraryKey`, `mediaAssetKey`, `mediaFoldersKey`,
  `mediaWorkKey`). `media-query.ts`: TanStack hooks (paged Library, cached
  detail) and narrow invalidation (a file change refreshes Library pages and
  the navigator, never Stories or Home). `media-preferences.ts`: Grid/List,
  sort, inspector width; serialized, coalesced writes.
- `MediaNavigatorContent` (pane, sheet and picker), `MediaLibraryBrowser`
  (search, filters, sort, Grid/List, paged lazy thumbnails, context menu,
  multi-select), `MediaBulkActions` (selection bar, bulk edit and delete),
  `MediaRename` (the rename dialog, name field and mutation),
  `MediaInspectorContent` (panel and sheet, explicit Save/Cancel, a guard the
  screen asks before leaving unsaved edits), `MediaUploadDialog`,
  `MediaPickerDialog`, `MediaFolderDialogs`.
- `MediaWork`, `media-desk-model.ts`, `media-desk-errors.ts`: the production
  desk, moved from `wordpress-plugin/src/planning`. WordPress renders it under
  its old *Media Desk* header with its Media Library picker; Payload renders it
  as Work.

Payload host (`apps/newsroom/src/ui/media/`): `payload-media-fetchers.ts`
(including XHR upload progress), `MediaWorkspaceShell` (in `BylineShell`: the
preferences store, open folders, the navigator sheet, folder dialogs, the
picker and the in-Media navigation guard), `MediaNavigator`, `media-route.ts`,
`NewsroomMediaScreen`. The shell's `media-workspace` composition is
`ui/shell/MediaWorkspaceSidebar.tsx`; Upload media is a Create kind
(`ui/shell/create.tsx`).

The picker is the existing `MediaPicker` host capability: the Story screen's
Production tab and Work both link files through `MediaPickerDialog`, never
Payload's raw Media list.

## Selecting several files

Every file in Grid and List has a checkbox (shown on hover, and on every file
once anything is checked). ⌘/Ctrl-click toggles, Shift-click selects the range
from the last file checked, ⌘A checks every loaded file and Escape clears.
While anything is checked a plain click toggles too, so a selection is never
lost to a stray click; the details open from the context menu. A selection
belongs to the view: changing place, search or filters clears it, and files
that leave the view drop out of it.

The floating selection bar (and the context menu on a checked file) acts on
the selection: **Edit details** (creator, credit and rights in one go; alt
text describes one picture and is never applied in bulk), **Move** (the folder
dialog), **Download** (one download per file) and **Delete** (editors). Each
file is checked on its own on the server, so the result names what was
refused (someone else's upload for staff, a file still linked) and leaves the
rest done.

## Renaming

Payload has no rename and drops a submitted `filename` on update, so Byline
renames the stored file itself (`renameMedia` in `media-library.ts`): under
the Media row lock, the original and its private preview get hard links under
the new name, the row is pointed at them (a direct row write, after the
account's Media update access is checked), and only after the commit are the
old names unlinked. Nothing ever points at a missing file. The extension (the
file's type) is not editable, the name is cleaned (no paths, reserved or
control characters), and a name another file has gets Payload's numbered
suffix (`-1`). Everything links to Media by ID, so stories, assignments and
portraits keep the file; its private URL changes. The bytes are the same, so
the publication revision doesn't move and prepared files stay valid; a
preparation that read the old name just before the rename retries under the
new one (`publication-media/task.ts`). Rename in place from the inspector's
header (Enter saves, Escape cancels) or from the context menu.

## The inspector

A DAM details pane: the header holds the name (rename in place), the type and
facts, and a menu of file actions (open, download, copy link, delete). Below
it, the preview with the picture's own actions (*Crops & focal point*, larger
preview, open, download) and the publication files' status row (with Retry).
Then three tabs: **Details** (alt text; *Credit*; *Rights & source*;
*Filing*: captured day and folder; each publishing gap is marked on its own
field and the marker clears as the reader types), **Uses** and **Info**
(read-only facts). Save and Cancel sit in a bar pinned to the bottom of the
panel while there are unsaved changes.

## Layout and breakpoints

Measured in the browser (`ui/shell/shell-config.ts`, pinned by
`tests/media-workspace-shell.test.ts`). Thumbnails are at least 168px.

| Viewport | Sidebar | Grid | Inspector |
| --- | --- | --- | --- |
| 1920 | rail + navigator (320) | 5 columns × 201px beside a 496px inspector | resizable panel |
| 1440 | rail + navigator | 4 × 173px beside the 343px inspector | resizable panel |
| 1366 | rail + navigator | 5 × 190px | sheet |
| 1300 | rail + navigator | 5 × 177px | sheet |
| 1180 | rail + navigator | 4 × 194px | sheet |
| 1024 | rail + navigator | 3 × 211px | sheet |
| 1000 | ordinary sidebar; navigator in a sheet | 4 × 169px | sheet |
| 820 | ordinary sidebar; navigator in a sheet | 3 × 169px | sheet (448px) |
| 375–390 | global sheet; navigator in its own sheet | 2 × 168px | full-width sheet |

- **Navigator ≥1024px.** It earns its place while three comfortable thumbnails
  fit beside it: 320 + 48 + 3 × 168 + 2 × 12 = 896px, with margin so a
  sidebar transition never drops the third column.
- **Persistent inspector ≥1440px.** At 1366 a 340px inspector fits
  mathematically but leaves three cramped columns that reflow on every drag;
  from 1440 the default width keeps four. Below, the same inspector opens in a
  sheet from the right (focus moves in; closing returns it to the file).
- On wide screens the grid and the inspector scroll independently inside one
  `ResizablePanelGroup` (page-level inspection, not a second sidebar). The
  inspector's width is the reader's preference.
- ⌘\ collapses the one sidebar to the rail; the pane is inert and *Browse*
  opens the navigator in its sheet.

## Uploads

Several files at once, two in flight, each with its own progress and result,
overall progress, retry for failures that can be retried, and the destination
folder: the folder being browsed, or **Unfiled** from global Create (a
predictable home rather than a remembered folder). Wrong types and files over
the server's limit are refused before sending. Metadata is never required
first. Uploads continue in the background if the dialog closes.

The upload size limit is 50 MB per file (`MEDIA_UPLOAD_MAX_BYTES`, set as
Payload's own multipart limit; Payload's default of 20 MB is below a typical
camera original). Larger files are refused before sending, and by the server
with a 413. The accepted MIME types are unchanged (no video, no HEIC).

## Measured

Locally, a 6000 × 4000 camera JPEG of 17.9 MB uploads with a 640 × 427 WebP
preview of 13 KB. A Library page of 48 tiles requested 48 previews, about
340 KB in all, and no originals.

## Not in this slice

The Collections workspace is documented in [collections-workspace.md](collections-workspace.md).
Content Health, Feedback, People, Polls (publication-file preparation and
build materialization are in [publication-media.md](publication-media.md)), smart collections or saved searches, AI tagging, face
recognition, automatic classification, video storage. A backfill of the
`library` preview for files imported before this migration (they show a
file-type tile until regenerated; small images use their original).
