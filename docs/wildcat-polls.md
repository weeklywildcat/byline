# Wildcat Polls

Wildcat Polls is the newsroom's survey app: reporters poll students in person on an iPad, and later through
public links. It lives inside the Byline newsroom (same deployment, database and sign-in) but never reaches the
public site on its own.

- **Poll Studio**, `/admin/polls`: editors write, import, preview and publish polls, manage locations and
  per-poll access, and read results. Staff see the polls they've been given.
- **Interviewer mode**, `/polls/kiosk`: the device a reporter hands to students, locked to one polling session.
- **Respondent mode**: one question per screen, on the kiosk or at a public link (`/polls/s/<key>`).

The respondent routes have their own root layout (`src/app/(polls)`), not Payload's admin, so no newsroom
navigation, account or data is ever rendered there.

The spreadsheet format is documented separately in [wildcat-polls-xlsform.md](wildcat-polls-xlsform.md).

Article polls (the old reader poll block, the `polls` collection and `byline_poll_votes`) were retired when Wildcat
Polls arrived; the `retire_article_polls` migration removes them, including any Poll blocks left in story bodies.

## Data model

Definitions and fieldwork metadata are Payload documents. Answers are not.

| Where | What |
| --- | --- |
| `poll-surveys` (collection) | Title, status (draft, open, closed, archived), owner, the working **draft** definition and its revision, per-poll grants (`interviewers`, `analysts`, `openToAllStaff`), collection modes (kiosk, public link with key, window, optional access code, hourly limit), linked Story and Collection, methodology note, smallest reported group. |
| `poll-versions` (collection) | An immutable published definition: number, definition JSON, source workbook name, note, who published it and when. Created only by Publish; updates are refused even with `overrideAccess`. |
| `poll-locations` (collection) | Places fieldwork happens. Editors keep the list; turning one off keeps it on old sessions. |
| `byline_poll_sessions` | One interviewer at one place: survey, version, location, period, collection method, status, and the kiosk state (hashed credential, scrypt PIN hash, mode, active ticket, PIN failures). |
| `byline_poll_session_events` | `started`, `declined`, `completed`, `abandoned`. Nothing about the person. `event_key` is the client's idempotency key; one ending per ticket. |
| `byline_poll_responses` | Validated answers for **every** question of the version, each `answered`, `skipped`, `unanswered` or `not_applicable`. `submission_id` is unique (retries are no-ops); `ticket` is unique (one response per started survey). |
| `byline_poll_public_starts` | Hashed one-use start tokens for public links. Pruned. |

The tables are in Payload's Drizzle schema (`src/polls/db.ts`) so migrations create them, but no admin screen, REST or
GraphQL route can list them. None of this is in `public/tracking.ts` or the snapshot: a submission never advances the
public revision or starts a build.

A published version is never changed. Publishing copies the draft into a new version; every response points at the
version its respondent saw. Question and choice **names** are permanent: the editor locks the name of anything already
published, and results across versions are matched by name.

## Permissions

All decisions are in `src/polls/access.ts` and checked by every endpoint.

| | Staff | Editor | Administrator |
| --- | --- | --- | --- |
| See a poll | when granted (interviewer, results, or open to all staff) | all | all |
| Run fieldwork | when granted | yes | yes |
| Read results, export | when in **Results** | yes | yes |
| Create, edit, import, publish, close; locations; grants | no | yes | yes |
| Delete a poll and all its responses | no | no | yes (type the title) |

Grants never promote anyone. Raw collections are administrator-only fallbacks in System administration.

## The kiosk

The kiosk is designed so that handing the iPad to a student cannot expose the newsroom.

1. The interviewer signs in to Byline (Google or password) on the iPad, opens **Polls → Start fieldwork**, picks the
   poll, location, period and (optionally) the sampling rule, and chooses a 4–8 digit PIN.
2. `POST /api/byline/polls/sessions/:id/kiosk` creates a random 256-bit credential (only its SHA-256 is stored), hashes
   the PIN with scrypt, **ends the interviewer's Byline session on the server** (Payload's `logoutOperation`) and, in
   the same response, expires the `payload-token` cookie and sets `byline-poll-kiosk` (httpOnly, SameSite=Strict,
   12 hours). Other Byline tabs on the device are told to leave for the login screen.
3. The browser replaces the page with `/polls/kiosk`. Every other Byline API now sees an anonymous request.

The kiosk endpoints (`/api/byline/polls/kiosk/*`) accept only that credential and act only on its session. The server
decides the mode:

- **locked**: the PIN pad. Five wrong PINs lock it for a minute, doubling; twenty revoke the credential.
- **interviewer**: counts, *Student agreed — begin survey*, *Student declined*, pause, change location, end. Locks
  again after 10 idle minutes.
- **respondent**: the survey. A respondent can submit answers for their ticket and nothing else; every interviewer
  action answers 423.

Reloading always resumes where the server says. A respondent who stops, or an interviewer who unlocks mid-survey,
ends the survey as `abandoned` and its answers are not kept. If the cookie is lost, the interviewer signs in again and
uses **Use this iPad** on the session, which re-issues the credential (the old device stops). Ending the session revokes
the credential and clears the device's queue.

**Guided Access** (Settings → Accessibility → Guided Access, then triple-click the side or home button) keeps the iPad
in Safari on this page and disables the hardware buttons. It is a device control in addition to the kiosk credential,
never a substitute for it.

Refusals are recorded with a time and place only. Interviewers never record a student's grade or gender; respondents
answer those themselves, with *Prefer not to say*.

## Offline

A finished survey goes into a queue before it is sent and leaves it only when the server says it is saved (or refuses
it for good). Students are told "saved on this iPad, will upload" when that is the truth, never "saved".

Queued answers are encrypted with AES-GCM in IndexedDB, under a key the server derives per session
(`HMAC(PAYLOAD_SECRET, session)`) and hands only to that session's kiosk. The key lives in memory. After a reload the
queue is unreadable until the kiosk is online and fetches the key again; after the session ends nobody can read the
leftovers, and they are deleted the next time a kiosk starts. Uploads retry with backoff and are idempotent on the
submission ID and the ticket. Without IndexedDB or Web Crypto (an insecure context) the queue is memory-only and the
interviewer screen says *Online only*. Ending a session with uploads still waiting asks first.

Public links are online only: nothing is stored on a respondent's device except a "done" flag.

## Public links

Off by default. Turning one on gives the poll a random key. Opening the link issues a one-use start token; a submission
needs a token at least 3 seconds and at most 6 hours old. Each poll stops issuing tokens at its hourly limit. An
optional access code limits who can start. A hidden form field catches form-filling bots (they are told "saved" and
nothing is stored). No IP addresses, fingerprints or cookie identities are collected. The same definition, renderer and
validation serve both modes.

## Respondent experience

One question per screen, in Byline's own Nova components (no separate palette or typeface; the welcome screen names
The Weekly Wildcat in a single muted line), with large answers (at least 56px), obvious selection,
Back, Next and Skip (optional questions only), and progress counted over the questions that apply right now. On a
landscape iPad the question and answers sit side by side; in portrait they stack. The footer follows the on-screen
keyboard (`trackVisualViewport`) and every edge clears the safe areas. Reduced motion turns off transitions.

When an earlier answer changes, questions that no longer apply disappear at once and their answers are discarded
(`pruneAnswers`). The server recomputes visibility from the submitted answers and refuses any answer to a hidden or
unknown question, any value of the wrong shape and any broken rule (`checkSubmission`).

## Results

Each percentage's base is the respondents who **answered** that question. Skipped, left blank and not applicable
(hidden by a condition) are reported beside it and never folded in. Multiple-choice percentages are of answering
respondents and can add to more than 100. Breakdowns (the `breakdowns` setting, e.g. grade) withhold any group smaller
than the poll's minimum (5 by default). Approach rates (declined ÷ approached, completed ÷ started) exist only for
interviewer-led sessions and only above the same minimum. The methodology note is shown beside the results.

Filters: dates, location, session, version, collection mode. Exports:

- **Summary CSV**: counts, percentages and bases per choice. No written answers.
- **Responses CSV**: one row per response, one column per question plus 0/1 columns per multiple-choice option;
  `[skipped]`, `[unanswered]` and `[not applicable]` are explicit. Cells that a spreadsheet would read as formulas are
  prefixed with `'`. Exports are logged.

### Publishing results

Nothing is published automatically. A poll can be linked to a Story or Collection now. To publish results, an editor
exports the summary, reviews exactly which aggregates are public (small groups are already withheld), and builds a Byline
Data dataset from it, which then follows Data's own Publish step. Raw responses and written answers never leave the
newsroom.

## Import, preview and editing

**Polls → Import spreadsheet** runs Upload → Validate → Review → Preview → Publish. The workbook is parsed on the server
by a small reader in `src/polls/engine/xlsx.ts` (no spreadsheet library, nothing executed, sizes bounded), then
`importWorkbook` checks names, references, expressions, choices, forward and circular conditions and reports each
problem with its sheet and row. Review writes every condition in words. Preview is the real respondent screen with a
path tracker. Publishing is refused while there are errors.

The **Questions** tab edits the draft without a spreadsheet: wording, hints, required, choices, scales, sections and
conditions (a builder for common conditions, or the expression itself). **Download as spreadsheet** writes the draft or
any version in the same format, so a poll can round-trip.

Poll Studio offers the blank template, the worked example *AI at Ninety Six High School* and the spreadsheet guide.
They are generated from `src/polls/workbooks/` by `apps/newsroom/scripts/polls-workbooks.ts`; a test fails if the
committed files drift. **Add the example poll** installs the example by importing that workbook.

## Deployment

- Run the migrations: `retire_article_polls` (removes article polls) and `wildcat_polls`.
- `/polls/*` is served by the newsroom with `Cache-Control: private, no-store`, `frame-ancestors 'none'` and
  `Referrer-Policy: no-referrer`. A separate hostname can point at the same deployment later.
- The kiosk's encrypted queue needs a secure context (HTTPS in production).
- No new environment variables or services.

## Tests

- `tests/polls-engine.test.ts`: expressions, branching, pruning, server validation, importer errors, results, CSV and
  the committed workbooks.
- `npm run test:polls:browser --workspace @byline/newsroom`: the whole workflow against a throwaway database
  (`scripts/seed-polls-browser.ts`).
