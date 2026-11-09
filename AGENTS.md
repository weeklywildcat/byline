# AGENTS.md

Read the nearest scoped guide before editing. Find the owning layer and its existing implementation and tests, make the smallest coherent change, then run the narrowest checks that prove it. Keep unrelated changes out of the diff.

## Repository map

- `apps/newsroom/`: private Payload, Next.js, and PostgreSQL newsroom. See [its guide](apps/newsroom/AGENTS.md).
- `apps/web/`: static Astro rendering, public routes, SEO, feeds, redirects, and build verification. See [its guide](apps/web/AGENTS.md).
- `packages/content/` and `packages/article-body/`: public snapshot and semantic article contracts.
- `packages/story-presentations/`: article presentation resolver, shared article host, and bespoke layouts. Read [its guide](packages/story-presentations/AGENTS.md) before custom story work.
- `packages/newsroom-ui/` and `packages/newsroom-screens/`: private UI components and screens.
- `packages/ui/`, `packages/design/`, and `packages/theme-weekly-wildcat/`: public UI, layout contracts, and the Weekly Wildcat theme.

## Architecture rules

- Payload owns editorial content, access, drafts, jobs, and publishing. Keep planning state on the unversioned story plan. Project public content through explicit allowlists.
- Astro consumes a local, validated Snapshot v2 and produces `apps/web/out/`. Keep static output and the compatibility guard in `apps/web/next.config.ts`. Rendering makes no newsroom requests. No SSR, public authentication, or public database.
- Keep credentials, private newsroom facts, and media originals out of public snapshots and artifacts.
- Keep one shared article renderer and one presentation resolver. Standard and Immersive are the built-in modes; bespoke layouts and repository interactives live in the presentation package.
- Keep the homepage layout in code. Front Page placements choose stories for existing slots; they do not change the design.
- Sports records are an archive. Keep historical routes and redirects; do not add live game, team, or roster management.
- Keep poll votes in the newsroom's dedicated table. The public static site does not accept votes.

## Development

Use Node.js 24.22.1 or newer. Run `npm ci` for a fresh checkout or after a dependency change.

- Web: `npm run typecheck:frontend` and `npm run test:frontend`. For routing, SEO, build, or snapshot changes, run a fixture build: `BYLINE_CONTENT_MODE=weekly-wildcat-fixture npm run build:frontend`. For browser checks, build with `BYLINE_CONTENT_MODE=weekly-wildcat-browser-fixture` before running `npm run test:frontend:browser`.
- Newsroom: `npm run typecheck:newsroom` and `npm run test:newsroom`. Access, hook, or schema changes also need `npm run test:newsroom:integration`; schema changes need a committed migration.
- Shared packages: `npm run typecheck:packages`, `npm run test:packages`, and checks for the consumers affected.
- Cross-boundary changes: run `npm run typecheck`, `npm test`, a public build, and `npm run verify:contracts`. For the Payload publishing path, use the [snapshot parity gate](docs/payload-build-snapshots.md#operations-and-verification).

Use nearby fixtures and test helpers. Verify real public routes, media, and permissions when those contracts change. Do not commit generated builds, dependencies, private media, or snapshots from production. Inspect the final diff and report exactly what passed and what was not run. CI lives in `.github/workflows/ci.yml`. Preserve Git history and existing release tags.
