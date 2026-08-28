# Newsletter admin UI integration

This directory contains reusable admin views and no WordPress mount point. The
host entrypoint should inject a protected request function, publication
branding, and navigation callbacks:

```ts
import apiFetch from "@wordpress/api-fetch";
import { NewsletterApp, createNewsletterFetchers } from "./newsletters";

const fetchers = createNewsletterFetchers((options) => apiFetch(options));

<NewsletterApp
  fetchers={fetchers}
  branding={{ publicationName, accentColor, logoUrl }}
/>
```

`createNewsletterFetchers` targets the protected routes under
`/byline/v1/admin/newsletters` and uses `/byline/v1/editorial/planning` for
story search. The host remains responsible for `apiFetch` nonce middleware and
capability handling; the UI never receives or renders provider secrets.

Individual views are also exported when the host already has navigation:

- `NewsletterList`: `fetchers`, optional `onOpen(id)`, `onCreate()`, and initial
  filters.
- `NewsletterEditor`: `fetchers`, `branding`, optional `newsletterId`,
  `initialNewsletter`, `onBack()`, and `onSaved(newsletter)`.
- `NewsletterSettings`: `fetchers` and optional `initialProviderId`.

Provider responses must include explicit capability booleans. Send, schedule,
test-send, and stats controls are omitted unless the selected provider is
configured and advertises that capability. A provider endpoint failure leaves
editing available and hides delivery actions. The server is authoritative for
status transitions and idempotent story insertion; the local model helpers
only prevent duplicate UI requests and keep the editor responsive.

The renderer exposes `createNewsletterSnapshot`, `renderNewsletterHtml`, and
`renderNewsletterPlaintext`. Call the snapshot helper at send time on the
protected server path so sent issues retain immutable HTML/plaintext even when
story headlines later change. The client preview uses the same deterministic
renderer and a sandboxed iframe.
