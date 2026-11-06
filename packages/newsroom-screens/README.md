# @byline/newsroom-screens

Byline's newsroom screens and their models, independent of any CMS: Home, Story
Peek and hover cards, the New story / task dialogs, the command palette, and the
planning, workspace, editorial and collection models they render.

They never fetch on their own. Each host passes **fetchers** that satisfy the
contracts in `home/home-api.ts` (`HomeFetchers`) and `story/story-fetchers.ts`
(`StoryFetchers`):

- the WordPress plugin builds them over `wp-api-fetch` (`createHomeFetchers`);
- the Payload newsroom builds them over its access-controlled endpoints
  (`apps/newsroom/src/ui/home/payload-fetchers.ts`).

Styling is `@byline/newsroom-ui`. Each host's stylesheet must list this
package's `src` as a Tailwind `@source`.

Nothing here may import WordPress or Payload. Screens still in
`wordpress-plugin/src` (Planning, the Story Workspace page, the editor panels)
move here as they are ported.
