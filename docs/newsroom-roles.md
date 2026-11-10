# Newsroom Roles, workflows and school years

## Two kinds of role

**Security roles** (staff, editor, administrator) decide what an account may do in Payload. **Newsroom Roles** are operational: "Section Editor routes Sports review", "Copy Desk checks copy". A Newsroom Role never grants access and a security role never routes a review. The Roles screen says so, and nothing in it changes a person's access.

Code: `apps/newsroom/src/domain/newsroom-roles.ts` (pure routing), `newsroom/newsroom-roles.ts` (editing and the preview), `newsroom/school-years.ts`, `newsroom/workload.ts`, and `ui/roles/`.

## Roles and scopes

A role has a name, a description and a **scope kind**: *everything*, *by Section* or *by media type*. A person holds it for a school year, either **everywhere** or scoped to Sections or media types. A scoped member is chosen before people who cover everything, and global members are the fallback for a Section nobody covers. A role can't change what it is scoped to while scoped members exist.

Roles live at **People → Roles** (`/admin/people?view=roles`). Roles are Items; opening one shows a right Sheet with its description, members (this year only) and which workflows route to it; adding or editing a member is a Dialog. A role used by an active workflow can't be archived. Editors only; every write checks the revision the editor saw.

## Workflows {#workflows}

`/admin/review-workflows`. A workflow is an ordered sequence of steps: label, review target (whole story, copy, visuals), resolver (the story's editor, a role, or a person), which members of a role match (the story's Section, its media, or anyone), optional conditions (Sections, formats, only with visuals, media types), a self-review policy and a fallback to the editors' queue. Steps can be reordered by dragging or with Move up and Move down; drag is never required.

A story uses the most specific active workflow whose Sections and formats match it (ties go to the lower id), then the default. Exactly one active workflow is the default.

### Routing {#routing}

**Preview with story…** asks the server's real resolver (`routeStory`, the function submission uses) who each step would go to for a chosen story, including unsaved edits. Failures show with where to fix them, for example **Fix roles**. The client contains no routing logic.

## Workload {#workload}

`/admin/people?view=workload`: factual counts per person: active Stories, due this week, overdue, reviews waiting on them, open media assignments. Overdue counts are tinted red and work due this week amber.

Each person also gets a **Load** level (`loadLevel` in `domain/workload.ts`): every active Story, review, media assignment and Story due this week is a point, and overdue Stories count twice. 0–1 is Light (green), 2–4 Steady (blue), 5–7 Busy (amber) and 8+ Stretched (red). Each badge shows its word as well as its colour, and the screen explains the levels. Load describes what is on someone's plate, never their output: the list stays alphabetical, nothing is ranked or ordered by load, and there is no time tracking.

The same counts appear as a quiet, secondary line when choosing someone for a role or on a Story ("2 active Stories · 1 review · 1 due this week"): the role-member dialog, and the writers and editor pickers in Story Peek, the Story Details and New story (editors only; one cached read of `/byline/workload` serves every picker). Those pickers show no Load level or colour. Workload is advisory: it never disables, hides or orders anyone, and never blocks an assignment.

## School years {#school-years}

A school year runs 1 August to 31 July. Exactly one is active. Starting a new one (`/admin/people?view=rollover`) is a seven-step plan: the new year, returning staff and their titles, which responsibilities carry over, departing staff (with an optional sign-in turn-off), unfinished work they leave behind, a **routing check** and a single confirmation. The routing check runs the real resolver against the year as it will be, for a story in each Section and for each media type.

Planning changes nothing. Starting the year archives the old one and activates the new one in one transaction. The old year's memberships, role assignments, authorship and review history are kept: leaving is recorded on the old year, never by deleting it. Routing problems don't block starting the year but must be acknowledged.
