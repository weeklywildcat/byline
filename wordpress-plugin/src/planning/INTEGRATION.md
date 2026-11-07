# Planning admin UI

Planning is mounted by `src/planning-entry.tsx` (a private React 19 root; see
`docs/stories-planning-ui.md`). It does not use WordPress's React or components.

```tsx
const fetchers = { ...createPlanningFetchers(request), ...createStoryFetchers(request, capabilities) };
<PlanningApp fetchers={fetchers} tab="stories" view="board" currentUserId={id} storiesUrl={storiesUrl} />
```

`planning-rest.ts` (with the shared `planning-model` and `@byline/newsroom-screens/media/media-desk-model`
and `calendar-model` in `@byline/newsroom-screens`) are React-free transport and
domain logic; keep UI out of them. The Calendar is the shared one
(`@byline/newsroom-screens/calendar`); `calendar-host.tsx` supplies only its
wp-admin links, the localStorage view preference and the Stories mount. Every story
surface opens the shared Story Peek through `useStoryPeek().openStory(id)`.
The collection comes from `GET /byline/v1/editorial/planning`; moves use
`POST /byline/v1/editorial/stories/<id>`; optional destinations use the routes in
`PLANNING_REST_ROUTES` (`planning-rest.ts`) and show an unavailable state if a route fails.
Deadline, planned publication, scheduled publication and published date are separate
fields and are never changed as a side effect of one another.
