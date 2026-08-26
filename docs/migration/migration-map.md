# Byline migration map

The migration is additive until an equivalent path is exercised. Weekly
Wildcat remains the reference installation throughout.

## Repository transition

`weeklywildcat/byline` becomes the canonical source monorepo. During the
transition, the current web app can remain at the repository root while shared
packages are introduced; moving it to `apps/web` is a mechanical step only
after build/release paths are covered.

The WordPress source will move into `wordpress-plugin/` in the canonical repo.
`weeklywildcat/byline-plugin` remains the installed-plugin release/update source
until a controlled mirror or release-forwarding workflow is proven. A sync
manifest and CI equality check must make the temporary duplicate explicit.
Existing folders, main file, updater slug, repository URL, and ZIP name are not
renamed during this stage. Discord remains a separate buildable app and stays
out of the plugin archive.

## Phase gates

1. **Baseline and contracts** — inventory hard-coding, record routes/storage,
   define protocol constants, add regression tests, and capture visual/export
   baselines. No visible change.
2. **Source foundation** — introduce workspaces/shared packages and the plugin
   admin build, then establish deterministic source mirroring without changing
   the installed update path.
3. **Publication model** — add a versioned public configuration with strict
   sanitization, private-secret separation, Weekly Wildcat upgrade seeds,
   `/byline/v1`, and legacy REST aliases. Change frontend identity/header/footer
   and SEO consumers only after the seeded response matches current output.
4. **Theme foundation** — define the React 18/19-compatible theme contract,
   stable block IDs, semantic tokens, normalized props, and the
   `weekly-wildcat` theme. Compare visual baselines before switching the live
   render path.
5. **Content resolution** — define StoryQuery and one ordered resolver with
   global de-duplication. Studio and production import the same implementation.
6. **Design documents** — add the internal `byline_design` entity, Byline
   wrapper schema/migrations, draft/autosave/published separation, revisions,
   optimistic locking, validation, and public/admin REST surfaces.
7. **Admin and Studio** — mount one React app on a stable `add_menu_page` page,
   use WordPress-provided React, and bundle Puck/styles. Keep native content
   screens where useful. Studio uses cookie/nonce REST and an isolated preview
   iframe with shared theme renderers.
8. **Themes and modules** — add Editorial, Magazine, and Modern; compatibility
   reports for theme switching; configurable sports teams; generic pages,
   navigation, deployment, Discord language, diagnostics, and accessibility
   checks.
9. **Cleanup** — remove source-coded publication prose and obsolete adapters
   only after migration/readback tests. Legacy identifiers remain where their
   removal has no concrete compatibility benefit.

## Highest compatibility risks

- updater source or ZIP layout changes can strand installed plugins;
- renaming CPT/meta/team keys can orphan production sports and newsroom data;
- publishing an autosave or revision can unintentionally deploy a draft;
- independent Studio/build resolvers can select different stories;
- theme switching can lose unsupported blocks/variants;
- exposing a full option object can leak deploy/Discord/API secrets;
- replacing the homepage can regress its deliberate story de-duplication;
- forcing current polls into core can violate static-hosting requirements;
- moving static pages without URL/content equivalence can regress SEO;
- bundling React in wp-admin can create a second incompatible runtime.

## Verification policy

Each phase must pass frontend typecheck/static build, plugin-wide PHP syntax and
regression tests, relevant JavaScript tests, archive inspection, and a focused
Weekly Wildcat compatibility check. Visual structure is compared before and
after theme extraction. A deliberately different fixture publication is the
acceptance gate for claims that configuration and themes are generic.

