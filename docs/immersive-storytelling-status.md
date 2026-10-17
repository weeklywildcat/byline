# Immersive storytelling draft status

Implementation was stopped at the author's request and prepared as one draft PR
from current main after #132. This is not ready to merge.

## Required comparison-control correction

The Before / After divider must be draggable **directly on the image**. Remove
the separate visible range slider beneath the image.

Acceptance criteria:

- The visible divider/handle sits on the comparison image and supports mouse
  and touch dragging with pointer capture.
- Retain an accessible native range input for keyboard arrows, an appropriate
  accessible label/value, visible focus, and a useful touch target. The input
  can be integrated into the image control rather than displayed underneath.
- Keep both labels visible and both complete images available without JS.
- Verify pointer dragging, touch, keyboard arrows, resize, reduced motion, and
  public/private-preview parity.

The draft currently has a visible divider plus a separate native range beneath
it. That implementation does not yet satisfy this correction.

## Implemented scope

1. **Core blocks reused:** Cover, Image, Video, Group, Table, native Footnotes,
   Details and Columns, extending the existing Story Presentation variations.
2. **Patterns added:** Q&A / Interview, What We Know / What We Don't Know,
   Pros / Cons, Three Things to Know, Source Highlight and Document Evidence.
   Existing Key Numbers is reused for Posts and Pages.
3. **Custom blocks added:** In This Story, Visualization/Map, Annotated Image,
   Before / After, Scrollytelling and its Story Step child.
4. **Shared rendering:** 760/1040/1440 width variables, centered breakouts,
   restrained asides/tables/disclosures, native Core structural support,
   viewport-limited portrait media and capped post-article sections.
5. **Enhancement architecture:** Framework-free, idempotent shared entry with
   cleanup, gallery refactor, allowlisted iframe creation/resize messages,
   annotation synchronization, comparison range and observer-based scrolly.
6. **WordPress compatibility:** Both 7.1 and 6.6 were exercised. TOC rendering
   handles real heading IDs saved without comment anchor attributes in 6.6.
7. **Public/private preview:** Conditional public imports; private iframe uses
   the shared enhancer with outgoing navigation blocked. The latest preview
   change contains visualization fallback images in a preset-height slot.
8. **Accessibility/no-JS:** Native disclosures/references/range, focus states,
   complete annotation lists and linear scrolly fallback; decorative sticky
   duplicates, reduced-motion and narrow-screen linear modes.

## Validation completed during implementation

These are completed runs, **not a claim that the final draft head has been fully
revalidated**. Later edits changed preview visualization geometry, TOC ID
handling, CSS and fixture dimensions.

| Command | Last completed result |
| --- | --- |
| `npm ci` | Passed; 2,359 packages installed |
| `npm run typecheck` | Passed across all workspaces; 13 existing Astro hints |
| `npm test` | Passed: 497 JS tests across the invoked suites, plus PHP syntax/regression checks |
| `npm run build` | Passed with fixture publication/content environment; existing webpack entry-size warning |
| `npm run test:frontend:browser` | 25 passed, including 320/390/768/1200/1440 and an additional 1600px width case |
| `npm run test:e2e:wp71` | 10 passed (58.9s) |
| `npm run test:e2e:legacy` | 10 passed (46.0s), after the 6.6 TOC correction |
| `npm run verify:contracts` | Passed; four release-helper tests also passed |
| `npm run package:plugin` | Passed archive/required-asset validation |
| `npm run build:plugin` | Latest completed build passed after the preview enhancement change; existing size warning |
| `git diff --check` | Passed before draft preparation |

## Remaining before merge

- Implement the on-image draggable comparison divider described above.
- Regenerate the canonical WordPress-rendered story fixture after the latest
  dimension/serialization changes, then rebuild the static fixture site.
- Re-run the complete validation matrix on the final head: install,
  typecheck, tests/PHP, full build, public browser tests, both WordPress suites,
  contracts and plugin packaging. The current release ZIP predates the final
  edits and should not be treated as a release artifact.
- Extend interaction/authoring coverage for annotation add/remove/reorder and
  duplication, pointer dragging, Cover video/focal/content-position controls,
  and Google Maps, in addition to the existing controlled Datawrapper,
  Flourish and OpenStreetMap cases.
- Finish zoom/touch/screen-reader and visual QA across public, editor and
  private preview. Existing automated keyboard/no-JS/reduced-motion checks are
  useful coverage but do not establish that entire acceptance matrix.
- Review CI results for this draft; no deployment or release has been made.

Intentional boundaries: four allowlisted embed providers; private visualization
preview uses a fallback instead of third-party frames; scrolly stages support
images and ordinary reporting blocks. Astro remains static, with no migration,
new article format, homepage editor or frontend server.
