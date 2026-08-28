# Planning admin UI integration

This directory contains a reusable, controlled Planning workspace. It does not
register an admin page or modify a central entrypoint. Mount it from the local
Planning screen with the authenticated WordPress `apiFetch` instance:

```tsx
import apiFetch from "@wordpress/api-fetch";
import { PlanningApp, createPlanningFetchers } from "./planning";

const fetchers = createPlanningFetchers((request) => apiFetch(request));

<PlanningApp
  fetchers={fetchers}
  currentUserId={authenticatedUserId}
  onOpenStory={(story) => openStoryQuickDetail(story)}
/>
```

The required collection is `GET /byline/v1/editorial/planning`; workflow moves
use `POST /byline/v1/editorial/stories/<id>`. Optional views use the grouped
protected routes in `PLANNING_REST_ROUTES` and render an unavailable state if a
route is missing or fails. WordPress/API nonce middleware and capability checks
remain owned by the host and server.

The collection response should include normalized story summaries, workflow
status definitions, capability booleans, the authenticated user, and (when
available) personal saved views. Saved views are filtered by `ownerId` before
display; the server remains the authorization boundary. Deadline, planned
publication, WordPress scheduled, and published dates are separate fields and
are never mutated by the UI as a side effect of another field.

Importing `./planning` also loads the local `style.css`. Hosts that import
individual components should import that stylesheet once at the same admin
bundle boundary.
