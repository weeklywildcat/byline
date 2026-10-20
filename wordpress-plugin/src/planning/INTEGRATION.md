# Planning admin UI

Planning is mounted by `src/planning-entry.tsx` (a private React 19 root; see
`docs/stories-planning-ui.md`). It does not use WordPress's React or components.

```tsx
const fetchers = { ...createPlanningFetchers(request), ...createStoryFetchers(request, capabilities) };
<PlanningApp fetchers={fetchers} tab="stories" view="board" currentUserId={id} storiesUrl={storiesUrl} />
```

`planning-api.ts`, `planning-model.ts`, `calendar-model.ts` and `media-desk-model.ts`
are React-free transport and domain logic; keep UI out of them. Every story
surface opens the shared Story Peek through `useStoryPeek().openStory(id)`.
The collection comes from `GET /byline/v1/editorial/planning`; moves use
`POST /byline/v1/editorial/stories/<id>`; optional destinations use the routes in
`PLANNING_REST_ROUTES` and show an unavailable state if a route fails.
Deadline, planned publication, WordPress schedule and published date are separate
fields and are never changed as a side effect of one another.
