# Newsroom Presence

Presence shows who is in the signed-in Byline newsroom, who is on the same
Story or Collection, and where other staff are working when you can see that
location. Open **Newsroom** at the right of the app header. Active colleagues
on the same record come first; away staff have their own section, and offline
staff are collapsed by default. The footer shows how you appear. Payload's
document lock still controls who can edit.

- **Active:** a visible tab checks in about every 30 seconds and becomes idle
  after five minutes without keyboard, pointer, touch, or scroll activity.
  An active heartbeat stays fresh for 90 seconds.
- **Away:** a tab sends an away heartbeat when it becomes hidden or idle.
  An active heartbeat that stops arriving also ages into Away. A tab counts
  as recent for five minutes after its last check-in; its location stops
  appearing after 90 seconds.
- **Offline:** no tab has checked in during the last five minutes. Offline
  rows have no location. They show the last active time if retained, or
  “Not seen yet” if no retained heartbeat exists.

Each tab has a random ID in `sessionStorage`. Where Web Locks are available,
a duplicated tab with copied storage takes a new ID. Any fresh active tab
makes the account Active, and the newest active tab supplies the location.
Otherwise the newest recent tab determines Away. One tab going into the
background cannot overwrite another tab's active workspace.

`GET /api/byline/presence` returns a snapshot for the signed-in, enabled
viewer. `POST /api/byline/presence` accepts a tab ID, write revision, state,
and allowlisted location, then returns the same snapshot. Both are private and
uncacheable. A location is a screen kind and, for a Story or Collection, a
numeric record ID. Byline builds links from known routes and resolves record
names through Payload as the viewer (`overrideAccess: false`). An inaccessible
record is shown as “Working in Byline,” without its name, ID or link. The
API includes only names, authenticated portrait URLs when available, and the
fields the panel needs for presence.

`byline_presence_sessions` is a PostgreSQL table outside Payload collections
and document history. An atomic upsert keeps one row per account and tab,
including server timestamps for last seen and last active. No headline,
free-form URL, search query, or editing activity is stored. Rows stop
contributing to snapshots after 30 days; a throttled check at most once an hour
per process removes expired rows when Presence is in use.

The shell uses one cache and one polling loop. A hidden tab sends its final
away heartbeat using a same-origin keepalive request and pauses polling. It
checks in immediately on return; visible idle tabs refresh the snapshot
without extending their own presence. Failures keep the last available
snapshot and retry on a bounded interval. With a small staff and a short
acceptable delay, PostgreSQL and polling are sufficient; Presence needs no
WebSockets, Redis, or scheduled jobs.

To run the browser acceptance test, point
`BYLINE_PRESENCE_BROWSER_DATABASE_URL` at a local PostgreSQL server with
permission to recreate the disposable `byline_newsroom_test_presence_browser`
database, then run
`npm run test:presence:browser --workspace @byline/newsroom`.
