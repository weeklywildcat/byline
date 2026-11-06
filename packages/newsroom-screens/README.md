# @byline/newsroom-screens

Byline's newsroom screens and their models, independent of any CMS: Home,
Stories (Board and List), Story Peek and hover cards, the Story Workspace, the
New story / task dialogs, the command palette, and the planning, workspace,
editorial and collection models they render.

They never fetch on their own. Each host passes **fetchers** that satisfy the
contracts in `home/home-api.ts` (`HomeFetchers`) and `story/story-fetchers.ts`
(`StoryFetchers`):

- the WordPress plugin builds them over `wp-api-fetch` (`createHomeFetchers`);
- the Payload newsroom builds them over its access-controlled endpoints
  (`apps/newsroom/src/ui/home/payload-fetchers.ts`).

Anything only one host has arrives as an optional **capability**, never an
import. `StoriesPage` takes `renderCalendar` (WordPress passes its Schedule-X
`StoryCalendar`; without one Stories offers only Board and List and never shows
a Calendar tab) and `viewHref` (WordPress keeps its wp-admin addresses in
`planning-routing.ts`; the default sets a generic `view=` on the current
address).

Styling is `@byline/newsroom-ui`. Each host's stylesheet must list this
package's `src` as a Tailwind `@source`.

Nothing here may import WordPress or Payload. Screens still in
`wordpress-plugin/src` (the Calendar, Collections, Media Desk, Content Health,
Feedback, the editor panels) move here as they are ported. Every module is a
package export; a moved module never leaves a duplicate implementation behind.
