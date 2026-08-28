# Editorial panels integration

This tree is intentionally a reusable, controlled UI slice. A parent admin or
editor entrypoint owns nonce setup, loading, optimistic-update policy, and
error persistence; it passes the returned models and callbacks into the panels.

Use the protected REST adapter with the existing WordPress `apiFetch` instance:

```ts
import apiFetch from "@wordpress/api-fetch";
import {
  createEditorialRestClient,
  WorkflowPanel,
  type ProtectedEditorialRequest
} from "./editorial";

const editorial = createEditorialRestClient((request: ProtectedEditorialRequest) =>
  apiFetch(request)
);
```

The adapter targets `/byline/v1/editorial/...` routes and never makes a public
request. Hosts should load data through `editorial.getWorkflow`,
`getReadiness`, `listTasks`, `getContributors`, `getCorrections`, and
`getDistribution`, then pass the response models into the controlled panels.
Writes map to the corresponding `update*`, `create*`, `delete*`, and
`distributionAction` methods. REST permissions remain authoritative; a panel
disabled by its capability props is only a UX affordance, not an authorization
boundary.

The workflow panel keeps `story.status`/`storedStatus` separate from
WordPress `postStatus`. Published is derived and cannot be selected. Deadline,
planned publication, and actual WordPress scheduling are separate fields. The
styles in `editorial.css` are local to the `byline-editorial-*` namespace.

Optional Notes, provider, and newsletter APIs should be represented by absent
or unavailable capability fields. Panels show a useful warning/empty state and
retain local editorial actions rather than assuming the optional integration
is installed.
