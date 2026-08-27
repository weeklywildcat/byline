# Byline editorial workflow

Editorial workflow is a first-class Byline domain. It lives in
`wordpress-plugin/includes/editorial/` and is owned by no integration.

## Two different questions

A newsroom answers two questions about a story, and they are not the same
question:

| | Owned by | Examples |
| --- | --- | --- |
| **Publication state** | WordPress | Draft, Pending Review, Scheduled, Published, Private, Trash |
| **Editorial workflow** | Byline | Pitch, Assigned, Reporting, Writing, Editing, Ready for Review, On Hold, Dropped |

A story is routinely a WordPress **draft** while it is editorially **Reporting**,
and a WordPress **scheduled** post whose editorial work is already finished.
Collapsing the two into `post_status` would lose that distinction, so Byline
stores workflow as post metadata and shows both states side by side.

The editor makes the separation explicit:

```
Status:    Draft        <- WordPress
Workflow:  Writing      <- Byline
```

## Statuses

| ID | Label | Group |
| --- | --- | --- |
| `pitch` | Pitch | main |
| `assigned` | Assigned | main |
| `reporting` | Reporting | main |
| `writing` | Writing | main |
| `editing` | Editing | main |
| `ready` | Ready for Review | main |
| `on-hold` | On Hold | sidelined |
| `dropped` | Dropped | sidelined |
| `published` | Published | derived |

`published` is **derived**, never selected. A story whose `post_status` is
`publish` reports Published; the stage it was on beforehand stays stored, so
unpublishing recovers it instead of inventing a new one.

A story with no workflow metadata reads as `pitch`. That default is applied on
read only — nothing writes it into the database just because a story was
displayed.

Workflow stages never advance on their own. Saving a post, typing more words, or
scheduling it does not move the story: a workflow change is an explicit editorial
decision.

## Fields

| Field | Meaning |
| --- | --- |
| Status | The workflow stage above. |
| Editor | The newsroom editor assigned to the story. Distinct from the WordPress post author, who is the writer. |
| Deadline | An internal `YYYY-MM-DD` date. It does not schedule publication and never touches `post_date`. |
| Visual needs | Internal notes about the pictures the story still needs. Never shown to readers. |

## Storage

The metadata keys predate the domain and are unchanged, so existing installations
keep their data:

| Constant | Key |
| --- | --- |
| `BYLINE_EDITORIAL_STATUS_META` | `_wwh_story_status` |
| `BYLINE_EDITORIAL_EDITOR_META` | `_wwh_story_editor_user_id` |
| `BYLINE_EDITORIAL_DEADLINE_META` | `_wwh_story_deadline` |
| `BYLINE_EDITORIAL_VISUALS_META` | `_wwh_story_visuals` |

The Byline constants point at the legacy identifiers deliberately. There is one
value and one source of truth per field; nothing is duplicated under a second
name.

## Capabilities

| Change | Required capability |
| --- | --- |
| Workflow status | `edit_post` on the story |
| Visual needs | `edit_post` on the story |
| Assigned editor | `edit_others_posts` |
| Deadline | `edit_others_posts` |
| Published | none — it follows WordPress |

An Author can move their own story through the workflow and record what pictures
it needs. They cannot assign an editor or set a newsroom deadline. Capabilities,
not role names, are what is checked.

## Privacy

Assignments, deadlines, and visual needs are internal. Every workflow meta key is
registered with `show_in_rest => false`, so none of it appears in a public REST
response.

The block editor reads and writes workflow through a dedicated endpoint that
requires `edit_post` on the story:

```
GET  /byline/v1/editorial/stories/<id>
POST /byline/v1/editorial/stories/<id>
```

`POST` applies only the keys the request actually sends, so a client that knows
about the status can never clear an assignment it did not mention. Only a user
who can assign receives the list of assignable editors.

Because workflow travels over its own endpoint, a workflow change saves
immediately and independently of the post's own draft. The sidebar says so
rather than leaving that to be discovered.

## Surfaces

- **Block editor** — a `Workflow: <status>` row in the document Summary panel
  next to the WordPress publication status, and a plugin sidebar with the full
  controls. Built from `src/editorial-workflow.tsx` into its own small bundle,
  loaded only on the post editor for a story.
- **Classic editor** — a compact `Byline Workflow` metabox, registered only when
  the block editor is not in use so the two controls never both appear.
- **Posts list** — a `Workflow` column and a workflow filter. The column shows
  the effective status, including `Published`.

The controls are named for the platform. A publication's name never renames
them.

## Discord

Discord is a **consumer** of this domain, not its owner:

```
Byline editorial workflow
          ^
          |
   Discord integration
```

`includes/discord-integration.php` reads and writes editorial state through the
domain helpers and owns only its own identifiers — account links, thread and
message IDs, and synchronisation bookkeeping. The status identifiers Discord
sends and receives are the canonical Byline identifiers, so `/story status`,
`/editing`, `/stories mine`, `/stories due`, reconciliation, and the Forum
workflow tags are unaffected.

The domain never calls Discord. After a workflow write it fires:

```php
do_action('byline_editorial_story_updated', $post_id, $state, $changes);
```

Discord subscribes to that and queues a background sync. An unreachable bot can
never block saving a draft, changing a workflow status, or publishing.

## Extending it

The domain is deliberately generic so a configurable workflow can be built on it
later. That configuration does not exist yet: there is no workflow builder, no
arbitrary status creation, and no per-role workflow screen. The proven newsroom
workflow is simply first-class and publication-neutral.
