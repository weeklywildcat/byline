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
  **Collections** group (reference/smart collections) has a slot between Work
  and Folders (`extraGroups`); it is deliberately not built yet.
- **Folders are logical.** A Media document's `folder` is a relationship.
  Filing or moving a file never changes its URL or moves its object in R2.
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
  original, and it is never part of `publicDelivery`. Phase 5's public
  materialization (`publicDelivery.renditions`) remains a separate pipeline;
  `publicDelivery` and `uploadedBy` are system-only fields, so neither an upload
  nor a metadata edit can change them.

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
assignment, coverage or profile can't be deleted (409).

## API (`/api/byline/media/*`, `apps/newsroom/src/newsroom/media-library.ts`)

| | |
| --- | --- |
| `GET /media` | one Library page: `folder` or `source`, `q` (+ `within=folder`), `type`, `uploader`, `metadata=needs`, `capturedFrom`/`capturedTo` (newsroom days), `delivery`, `sort`, `page`, `limit` (≤100, default 48). Never raw Payload query syntax. |
| `GET /media/navigator` | folders (flat, with file counts), Library counts, capabilities (incl. accepted MIME types and the upload size limit), uploaders |
| `GET /media/:id` | the inspector's detail: folder path, linked uses, hidden-use count |
| `PATCH /media/:id` | alt, creator, credit, copyright, licence, source URL, captured day, folder; `expectedUpdatedAt` compare-and-swap (409) |
| `POST /media/move` | file several assets into a folder (each checked on its own) |
| `POST /media/upload` | multipart (`file`, `_payload` JSON `{ folderId }`), Payload's own upload operation |
| `DELETE /media/:id` | editors; refused while linked |
| `POST/PATCH/DELETE /media/folders(/:id)` | folder management |
| `GET /media/work` | the shared desk's `MediaDeskResponse` from `production-assignments` read as the account |

The browse row (`MediaLibraryAsset`) carries id, filename, kind, size,
dimensions, the private preview URL, the protected original URL, metadata,
captured date, uploader, folder, delivery state, concrete gaps and the
account's `canUpdate`/`canDelete`. Usages are fetched only for the inspector.
No storage credentials, keys, hashes, renditions or art direction leave the
server.

**Linked uses** come from relationships: story `featuredMedia` (live or
draft), production-assignment `media`, coverage `artwork`, live-update
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
  (search, filters, sort, Grid/List, paged lazy thumbnails, context menu),
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

Coverage workspace, Content Health, Feedback, People, Polls, public media
materialization, smart collections or saved searches, AI tagging, face
recognition, automatic classification, video storage. A backfill of the
`library` preview for files imported before this migration (they show a
file-type tile until regenerated; small images use their original).
