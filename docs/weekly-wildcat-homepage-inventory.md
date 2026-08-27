# Weekly Wildcat homepage inventory

The compatibility target for the design-driven homepage. Captured from the
pre-Studio `apps/web/app/page.tsx` and verified against a production static
export on 2026-08-26 (11 packages, 17 unique stories, zero cross-package
duplicates).

Nothing here may be approximated. A package renderer is only finished when it
reproduces the behaviour in this document, including the conditional cases that
do not appear in the current render.

## Resolution order and de-duplication

`resolveWeeklyWildcatHomepage()` (`apps/web/lib/homepage-selection.ts`) already
implements the ordered, single-pass model the package system needs. It walks a
`usedPostIds` set and assigns each post to the first package that claims it:

| # | Selection | Rule |
|---|-----------|------|
| 1 | `athleteSpotlightPost` | first athlete-spotlight post; reserved before anything else |
| 2 | `leadPost` | first unused sticky post, else first unused post |
| 3 | `inFocusPost` | first unused post with a featured image |
| 4 | `specialCoveragePosts` | up to 3 unused special-coverage posts |
| 5 | `opinionPosts` | up to 3 unused posts in `opinion` |
| 6 | `fieldPosts` | up to 3 unused posts in `sports` |
| 7 | `morePosts` | 4 unused posts, spread across news/features/culture/opinion/sports |
| 8 | `rightNowPosts` | remaining unused posts for The Latest rail |
| 9 | `briefPosts` | remaining unused posts for The Brief |

The invariant to preserve: **a story appears at most once on the homepage**, and
packages claim stories in layout order. The package model must resolve through
one shared resolver, not per-package queries.

## Packages

### 1. Lead package — `.top-stories`
The most structurally complex package; it is three columns, not one block.

- **Left utility rail** (`.top-stories-left-rail`): poll widget (when `features.polls`),
  then This Week calendar (`maxVisibleItems={3}`) when `features.events` or
  `features.sports`.
- **Centre lead** (`.live-lead`): `HomepageStory variant="lead"`, `showDeck`, `priority`.
- **Right rail** (`.top-stories-rail`): heading "The Latest", `rightNowPosts` as
  `variant="briefing"` with `showAuthor`.
- `HomepageHeroRailLimiter` trims the rail to the lead's height at runtime.
- Modifier: `.top-stories-single` when the rail is empty.
- Modifier: `.live-home-shell-opinion-lead` on the shell, and
  `homepageTreatment="opinion"` on the story, when the lead post carries the
  `homepageOpinionTreatment` post setting.
- Empty state: `<p class="empty-state">No published posts are available yet.</p>`

### 2. The Brief — `.the-brief`
Heading "The Brief". Lead is `variant="brief-lead"` with `showAuthor showDeck`;
the remainder render as `variant="row"` with `showAuthor` inside
`.brief-support-list`. Modifier `.brief-digest-layout-single` when there is no
support list.

### 3. In Focus — `.in-focus`
Label "In Focus" (`.live-package-label`, not an `<h2>`). Single story,
`variant="focus"`, `showAuthor showDeck`.

### 4. Special Coverage — `.special-coverage`
Label "Special Coverage". First story `variant="special"` with `showAuthor showDeck`;
subsequent stories `variant="briefing"` with both flags off. Modifier
`.special-coverage-layout-single` for one story. *Not present in the current
render — no special-coverage posts exist today. Still required.*

### 5. Opinion — `.opinion-package`
Header block with `<h2>Opinion</h2>`, a standing description
("Student perspectives, columns, and commentary from {shortName} writers."), and
an "All Opinion →" link to `/category/opinion/`. Lead is `variant="opinion-lead"`;
up to 2 rail stories are `variant="opinion"`. All with `showAuthor showDeck`.
Modifier `.opinion-package-layout-single`.

### 6. Sports — `.from-field`
A composite package, not a story list. Renders when `features.sports` **and** any
of: field posts, an athlete spotlight, recent scores, or upcoming games.

- Header row: `<h2>Sports</h2>` + "All Sports →" to `/sports/`.
- Lead: `variant="field"` with `showDeck cleanDeck showAuthor showReadLink`.
- Rail: up to 2 `variant="briefing"` stories with `showAuthor`, then
  `SportsAthleteFeature` for the athlete spotlight post.
- `SportsSchedulePanel` renders at the foot of the package, emitting
  `.field-schedule-result` and `.field-schedule-upcoming`.

**Corrected while extracting (2026-08-26):** an earlier revision of this document
said the panel's limits were 3 and 8. Those are the *fetch* sizes
(`getRecentSportsGames(3)` / `getUpcomingSportsGames(8)`); the panel itself
sliced to **2 finals and 3 fixtures**, and that is what readers saw. The
`sports-package` defaults persist the rendered counts.

Conditional behaviour that has to survive, none of which appears in a single
live render:

- The whole `<section>` is suppressed unless `features.sports` **and** one of
  field posts / an athlete spotlight / recent scores / upcoming games exists.
- The panel returns `null` when both lists are empty.
- `.field-layout` opens for an athlete spotlight even with no lead story.
- The Upcoming column still renders, carrying `No upcoming games`, whenever
  there are finals — so `field-schedule-layout-2` is the shape at the end of a
  season, and `-1` is the shape when there are fixtures but no finals.
- The athlete spotlight is absent from the current live content, so the
  `.sports-athlete-feature` path is covered by fixtures rather than by the
  captured baseline.

### 7. More From Weekly Wildcat — `.more-weekly`
Header "More From {shortName}" + "View All Stories →" to `/stories/`.

- Lead `variant="more-lead"` with `showDeck cleanDeck`.
- Up to 3 `variant="more-compact"` with `showDeck cleanDeck`.
- **Newsroom utility rail** (`.more-utility-rail`), a fixed editorial fixture:
  - "Join the Staff" block with links to `/join/` and `/authors/`.
  - "Stay Connected" block listing `publication.social` entries, a contact link,
    and a newsletter anchor when `features.newsletter`.

### 8. Newsletter — `.home-newsletter-section`
`id="home-newsletter"`, renders `NewsletterSignupForm` when `features.newsletter`.
The utility rail's newsletter link targets this anchor.

## Feature-flag behaviour

| Flag | Effect |
|------|--------|
| `polls` | poll widget in the lead package's left rail |
| `events` | This Week calendar (also shown when `sports` is on) |
| `sports` | entire Sports package, plus calendar game entries |
| `newsletter` | newsletter package and the rail's newsletter link |

## Story presentation variants

`HomepageStory` variants that must survive as package-level treatments:
`lead`, `briefing`, `brief-lead`, `row`, `focus`, `special`, `opinion-lead`,
`opinion`, `field`, `more-lead`, `more-compact`.

Independent flags: `showDeck`, `cleanDeck`, `showAuthor`, `showReadLink`,
`priority`, `homepageTreatment`.

## Special post settings

`getPostSettings(post)`:
- `homepageOpinionTreatment` — restyles the lead package and its story.
- athlete-spotlight posts are detected by `isAthleteSpotlightPost` and are
  claimed before the lead, so the spotlight never competes with the lead story.

## Regression harness

`apps/web/scripts/capture-homepage-baseline.mjs` writes
`apps/web/tests/baseline/homepage-structure.json`: package order and class names,
per-package story sets, heading text, and a cross-package duplicate check. The
committed baseline is the pre-Studio output and is the acceptance target for the
design-driven homepage.
