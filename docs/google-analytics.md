# Google Analytics

Google Analytics (GA4) is the analytics data source. Byline owns everything around it: connecting it
safely, saying what the numbers mean for a newsroom, joining them to Stories, sections, authors and
topics, installing the public tag when asked, and keeping every credential private. Three surfaces,
no more:

| Surface | Where | Who |
| --- | --- | --- |
| Site → Analytics | `/admin/site?tab=analytics` | administrators: connection and measurement setup |
| Analytics | `/admin/analytics` (Publish group) | editors and administrators: publication-wide reporting |
| Story → Performance | a Story's `?view=performance` | whoever can open the Story |

Performance is a focused view (like Review and History), never a third Story workspace. Plan and
Write remain the only workspaces, and opening Performance leaves the Write editor mounted.

Out of scope: an Explore/report builder, saved reports, BigQuery, funnels, Ask Advisor, audience
exports, Measurement Protocol, property or Tag Manager administration, and anything that writes to
Google Analytics. The Analytics scope is read-only; `analytics.edit` is never requested.

## Architecture

```
Google OAuth (read-only)            apps/newsroom/src/analytics/
        │                              config · crypto · oauth · connection
        ▼                              google-client (auth, timeout, retry, limiter)
AnalyticsIntegration (private)         admin-client · data-client · reports · realtime
        │ encrypted refresh token      content-map · catalog · cache · endpoints
        ▼
/api/byline/analytics/*  ──► normalized editorial DTOs ──► React Query screens
        │
Publication.analytics (public) ──► snapshot v4 ──► apps/web GoogleAnalytics.astro
```

- The browser never calls Google and never sends a report definition. The server owns an allowlisted
  set of reports (`reports.ts`), so the UI cannot become an Analytics API tunnel and quota use stays
  predictable.
- One vocabulary: `analytics/model.ts` is the only place that spells a dimension or metric.
  "Average engagement" is defined once (`dates.ts`): user engagement duration ÷ active users.
- Google API names were checked against the Data API v1beta Core and Realtime schemas, including
  `contentId`, `contentType`, `contentGroup` (built in; no custom dimensions to register),
  `keyEvents` (the successor of conversions) and Realtime's `unifiedScreenName`.

## Setting it up

1. **Google Cloud.** In the project that owns the newsroom's OAuth client, enable the *Google
   Analytics Admin API* and the *Google Analytics Data API*.
2. **OAuth client.** Reuse `BYLINE_GOOGLE_CLIENT_ID` and `BYLINE_GOOGLE_CLIENT_SECRET`. Add this
   authorized redirect URI to the same client (Site → Analytics shows the exact value):
   `<BYLINE_NEWSROOM_URL>/api/byline/analytics/callback`.
3. **Consent screen in production.** A Google OAuth project left in *Testing* is unsuitable: Google
   expires refresh tokens after seven days, so Analytics would need reconnecting weekly. Publish the
   consent screen. `analytics.readonly` is a sensitive scope; when Byline is used by publications
   that are not your own Google Cloud organization, plan for Google's OAuth app verification (the
   app only ever asks for read-only access, a consent screen and a privacy policy are needed).
4. **Secret.** Set `BYLINE_INTEGRATIONS_SECRET` (at least 32 characters, e.g. `openssl rand -base64 48`).
   It is a dedicated key, never `PAYLOAD_SECRET`. Changing it makes the saved connection unreadable;
   reconnect Google afterwards.
5. **Connect.** An administrator opens Site → Analytics → *Connect Google Analytics*, authorizes
   read-only access, chooses a property and web stream, chooses how measurement works and presses
   *Save & publish analytics setup*.

Newsroom sign-in is unaffected: Analytics is its own OAuth grant, bound to the administrator who
starts it, and it does **not** inherit `BYLINE_GOOGLE_HOSTED_DOMAIN`, because the property may belong to
an unrelated Google account. Nobody uploads a service-account file or pastes an API secret.

## The OAuth grant

- Authorization-code flow with PKCE S256, a random state and nonce, `access_type=offline`,
  `include_granted_scopes=true` and `prompt=consent` (an explicit Connect or Reconnect must end with a
  usable refresh token). Scopes: `openid`, `email`, `https://www.googleapis.com/auth/analytics.readonly`.
- A signed, HttpOnly, SameSite=Lax round-trip cookie (`__Host-` prefixed and Secure over HTTPS), with
  its own signing domain so a sign-in transaction can never complete an Analytics one or the reverse.
  The transaction records the signed-in Byline administrator; a callback under any other account is
  refused.
- Authorization codes, access and refresh tokens, the client secret and Google's raw error payloads are
  never logged and never reach a response.
- Revoked or expired access (`invalid_grant` and friends) is a recoverable state: the connection
  becomes **Needs reconnect**, reports say "Google access needs to be renewed", and nothing 500s.
  Reconnecting the same Google account keeps the chosen property and stream; a different account
  chooses again.
- A rotated refresh token from Google is stored (encrypted) before it is used.

## Private state

`AnalyticsIntegration` is a private Payload Global (`access` denies everyone; hidden from the admin;
GraphQL is disabled anyway). Only `src/analytics/connection.ts` reads and writes it, with
`overrideAccess`, after an endpoint has checked the account's role. It holds the status
(`disconnected`, `pending-selection`, `connected`, `needs-reconnect`), the Google account, the
selected account, property (with its timezone) and web stream, the Measurement ID, tracking and consent
choices, timestamps, a last error *code*, and the refresh token as a versioned **AES-256-GCM envelope**
`{ version, iv, ciphertext, authTag }` under a key derived (HKDF-SHA256) from
`BYLINE_INTEGRATIONS_SECRET`. Tampering, a wrong key or an unknown version fail closed.

## Measurement: external or Byline-managed

| Choice | What Byline does |
| --- | --- |
| **Already installed** (default) | Reads Analytics only. Injects *nothing* into the public site: no `gtag.js`, no Measurement ID, no consent UI, no events. For a site already measured by Tag Manager or an existing Google tag. |
| **Install with Byline** | Adds the Google tag to the generated site and sends Story-aware pageviews and a few reader events. |

"Install with Byline" is never chosen automatically. When it is chosen, the administrator picks a
privacy behavior (a technical choice, not a legal claim):

- **Ask readers first** (recommended): Google's script is not loaded and nothing is sent until the
  reader presses *Allow analytics*.
- **Always collect analytics**: analytics storage is granted without a Byline prompt.

In both, `ad_storage`, `ad_user_data` and `ad_personalization` are always `denied`.

## Public contract

Only non-secret measurement is public, through the publication contract (version 2) and snapshot v4:

```json
"analytics": { "provider": "google", "measurementId": "G-…", "installTag": true, "consentMode": "ask" }
```

or `null` (also what "Already installed" publishes: not even the ID). Never public: property or
account IDs, the connected Google identity, scopes, tokens, errors and timestamps. The privacy sentinel
(`public/snapshot/privacy.ts`) rejects those key names, and the integration secret and OAuth client
secret values, anywhere in a snapshot.

- Snapshot v4 is a wire change, so it is a new version. v2 and v3 snapshots still load and upgrade with
  `analytics: null`; a v3 snapshot cannot smuggle `analytics` (its publication stays strict). Older
  builds that only accept v2/v3 are refused with 406 by version negotiation instead of misreading v4.
- The public setting lives in the Publication Global's hidden `analytics` group. Credentials save
  immediately (they are private); a tracking or Measurement ID change goes public only through
  *Save & publish analytics setup*, which changes the **published** Publication row, advances the
  public revision and queues the snapshot in one transaction. It never publishes other pending
  Publication edits, and publishing an older Publication draft can never change or re-enable the tag
  (the Global keeps the published `analytics`).
- Disconnecting publishes a configuration with no tag, so the next deployment removes it.

## Reports and caching

Google stays the source of truth; nothing is synchronized into PostgreSQL. Reports are fetched on
demand through a server cache behind an `AnalyticsCache` interface (a bounded in-process LRU today; a
shared store can replace it without touching report logic). Simultaneous identical requests share one
Google call.

| Report | Reuse |
| --- | --- |
| Realtime | 25 seconds |
| Today | 3 minutes |
| A range including today | 12 minutes |
| A closed range | 60 minutes |

The Overview's related reports go out as one `batchRunReports` request (Google allows at most five
per batch; a failed batch is retried report by report so one failure doesn't blank the rest).
Concurrency is limited to 5 requests, well under Google's 10-per-property ceiling. Only 429, 500 and
503 retry, with truncated exponential backoff and jitter; authorization failures never retry. Property
quota from `returnPropertyQuota` is kept server-side (`quotaDiagnostics()`).

Date ranges use the **property's** timezone, with the previous equal period computed in the same
request. A range including today is labeled "Today · processing": Google keeps updating it. Realtime is
a separate report ("Last 30 minutes") and is never called "live" for processed reports.

If the property's timezone differs from the publication's, Site → Analytics warns (non-blocking):
*Analytics uses America/Chicago while Byline uses America/New_York.*

## Story identity

When Byline manages the tag, every Story pageview sends `content_id = story:<id>`,
`content_type = story` and `content_group = <section slug>`, GA's built-in content dimensions. The
Content report maps each Google row to exactly one Byline record:

1. `contentId` is `story:<id>` and that published Story exists;
2. the page path is a Story's current canonical path;
3. the path is a known redirect into a Story's current path;
4. otherwise it is a page that isn't a Story (listed separately).

One report is mapped row by row, never a content-ID report plus a path report, so nothing counts
twice. Views are exact; active users are summed per Story and can slightly over-count a reader who
arrived at one Story by two addresses. Old data and externally managed tags fall back to paths. Section,
author and topic filters use Byline's own data; none of it is sent to Google.

**Realtime** reports a page by its *title* (`unifiedScreenName`), with no path or source. A title is
matched to a Story only when exactly one published Story's `<headline> | <short name>` equals it
(the title `BaseLayout.astro` writes); ambiguous titles stay generic pages. There is no live
traffic-sources card because Realtime can't provide one.

## Reader events (Byline-managed tag only)

- **One pageview.** `send_page_view` is off and Byline sends exactly one `page_view` (with the Story
  context). Never any account, reader, author, contact or unpublished data.
- **Reading progress.** The article's existing reading-progress calculation dispatches
  `byline:read-progress`; each of `byline_read_25/50/75/100` is sent at most once. Byline's own scroll
  observer is not added, and GA's built-in 90% `scroll` event is untouched.
- **Share** (`share`) after a share really goes through or a link is copied; **Sign-up** (`sign_up`)
  only when the newsletter form shows its own success message.
- **Search** is left to GA's Enhanced Measurement; Byline doesn't send a second event.
- Every event respects the same ownership and consent as the pageview. *Privacy settings* in the
  footer (Ask mode only) reopens the choice; revoking stops collection immediately and on later pages.

The tag loads asynchronously and only when permitted; the consent card is fixed-position, so it cannot
shift the layout.

## Health

*Check connection* tests, independently: Google access, the property, the web stream (and that it still
has the expected Measurement ID), a tiny report, and (Byline-installed tags) that the public site's HTML
carries the Measurement ID. It reports **Connected**, **Connected · no recent traffic** (zero readers
is not a failure), **Site update pending** (published, not deployed yet) or **Needs reconnect**.

*Disconnect* revokes at Google's endpoint when it can and always clears the credential and selection
locally, even if revocation fails.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| "Google access needs to be renewed" | The grant was revoked or expired. A consent screen left in *Testing* expires refresh tokens after 7 days: publish it. Reconnect Google. |
| "A Google Analytics API is turned off" | Enable the Analytics Admin API and Analytics Data API in the OAuth client's Cloud project. |
| "redirect_uri_mismatch" | Add `<BYLINE_NEWSROOM_URL>/api/byline/analytics/callback` to the OAuth client. |
| "This property is no longer available" | The connected Google account lost access. Choose another property. |
| Reconnect needed after a deploy | `BYLINE_INTEGRATIONS_SECRET` changed. |
| Numbers differ from analytics.google.com | Different date boundaries (the property's timezone) or today's data still processing. |
| A page isn't a Story in Content | Its path isn't a Story's canonical address or a known redirect (e.g. an archived path with no redirect). |

## Testing without polluting production data

Use a separate GA4 property and web stream for development and staging (create it in Google
Analytics; use its Measurement ID), connect that, and choose *Install with Byline* on a staging site.
Never point a staging build at the production Measurement ID. In Ask mode a test browser that hasn't
pressed *Allow analytics* sends nothing. Automated tests run against mocked Google HTTP
(`apps/newsroom/tests/integration/analytics.test.ts`) and a stubbed `gtag` (`apps/web/tests/`), and
never contact Google.
