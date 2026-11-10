# AGENTS.md — Data presentations

These instructions apply to `packages/data-presentations/`. Read
[Byline Data](../../docs/byline-data.md) first.

This package is shared by the public site (Astro/Vite) and the newsroom
preview (Next.js). Never import Payload, Next, Astro, `import.meta.glob`,
`?inline` CSS or any other bundler-specific syntax here. A presentation's
`styles.css` and `client.ts` stay in its folder; each host loads them on that
presentation's page alone (`apps/web/lib/data-presentation-{host,client}`,
`apps/newsroom/src/preview/data-assets.tsx`).

## When someone asks for a data page

Decide which path fits before writing code:

1. **A built-in template is enough** (a table, a ranking, a timeline). Do not
   write code: the editor makes a dataset and a project in the newsroom.
2. **A reusable template is warranted** when the same kind of page will recur
   (election results, a bracket, school board votes):
   `npm run data-presentation -- create <key> --template`.
3. **A custom presentation is warranted** for one project's bespoke
   experience: `npm run data-presentation -- create <key>`.

Add `--client` only when the interaction genuinely needs script.

## Rules

- **Never hard-code the facts.** They live in newsroom datasets and reach the
  component through published releases. There is no `data.ts`. Code-owned
  auxiliary data (a boundary map, a color key) may be an ordinary import.
- **Read roles, not labels or field keys.** Declare slots and roles with
  `slot()` and `field.*`; the project binds them. Read choice *tones*
  (positive, caution, negative, info) for meaning, never a choice's label or
  value.
- **`prepare` is deterministic and build-time only.** No network, clock,
  randomness, secrets or environment. Return plain JSON under 2 MB; it is run
  twice and compared.
- **Server-rendered HTML is the experience.** It must be complete and
  accessible with JavaScript off. `client.ts` only enhances `[data-data-root]`
  and returns a cleanup. Respect `prefers-reduced-motion`. No scroll-jacking.
- **Scope every selector** under `.data-presentation-<key>`. Hairlines and
  type, not boxes; follow the Weekly Wildcat tokens (`--ink`, `--muted`,
  `--rule`, `--accent`, `--font-ui`, `--font-serif`, `--font-headline`).
- **One `<h1>`.** `DataProjectView` renders the project's title; a
  presentation starts at `<h2>`.
- **Keys are permanent** once a project uses them. `fixture-` keys are
  reserved for test fixtures, which hosts refuse outside fixture builds.
- **No SEO, routing or metadata** in a presentation: the route owns them.

## Tests

Add a case to `tests/sdk.test.tsx` (build a release with `projectRelease`,
resolve it, render `DataProjectView` with `renderToStaticMarkup`, drive
`client.ts` in jsdom), then run:

```sh
npm run test:data
npm run typecheck:packages
BYLINE_CONTENT_MODE=weekly-wildcat-fixture npm run build:frontend
```

Browser checks: build with `BYLINE_CONTENT_MODE=weekly-wildcat-browser-fixture`,
then `npm run test:frontend:browser` (`tests/browser/data-projects.spec.ts`).
