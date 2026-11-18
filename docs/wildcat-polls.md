# Wildcat Polls

Wildcat Polls is the newsroom's survey app: reporters poll students in person on an iPad, and later through
public links. It lives inside the Byline newsroom (same deployment, database and sign-in) but never reaches the
public site on its own.

- **Poll Studio**, `/admin/polls`: editors build, import, preview and publish polls, collect answers, and read
  results. Staff see the polls they've been given. Each poll is **Overview → Build → Preview → Collect → Results →
  Settings**.
- **Pairing**, `/poll`: an iPad types a six-digit code from Poll Studio and becomes that session's kiosk, without
  anyone signing in to Byline on it.
- **Interviewer mode**, `/polls/kiosk`: the device a reporter hands to students, locked to one polling session.
- **Respondent mode**: one question or Matrix per screen, on the kiosk or at a web link (`/poll/<key>`; the first address,
  `/polls/s/<key>`, still works and renders the same app).

The respondent routes have their own root layout (`src/app/(polls)`), not Payload's admin, so no newsroom
navigation, account or data is ever rendered there. Their addresses are in `src/polls/links.ts`.

The spreadsheet format is documented separately in [wildcat-polls-xlsform.md](wildcat-polls-xlsform.md).

Article polls (the old reader poll block, the `polls` collection and `byline_poll_votes`) were retired when Wildcat
Polls arrived; the `retire_article_polls` migration removes them, including any Poll blocks left in story bodies.

## Data model

Definitions and fieldwork metadata are Payload documents. Answers are not.

| Where | What |
| --- | --- |
| `poll-surveys` (collection) | Title, status (draft, open, closed, archived), owner, the working **draft** definition and its revision, per-poll grants (`interviewers`, `analysts`, `openToAllStaff`), collection modes (kiosk, public link with key, window, optional access code, hourly limit), linked Story and Collection, methodology note, smallest reported group. |
| `poll-versions` (collection) | An immutable published definition: number, definition JSON, frozen choice-image manifest, source workbook name, note, who published it and when. Created only by Publish; updates are refused even with `overrideAccess`. |
| `poll-locations` (collection) | Places fieldwork happens. Editors keep the list; turning one off keeps it on old sessions. |
| `byline_poll_sessions` | One interviewer at one place: survey, version, location, period, sampling method, status, the kiosk state (hashed credential, scrypt PIN hash, mode, active ticket, PIN failures) and a pending pairing (the code's HMAC, its expiry, the PIN the paired device will use, and whether claiming may replace a running device). |
| `byline_poll_session_events` | `started`, `declined`, `completed`, `abandoned`. Nothing about the person. `event_key` is the client's idempotency key; one ending per ticket. |
| `byline_poll_responses` | Validated answers for **every** question of the version, each `answered`, `skipped`, `unanswered` or `not_applicable`. `submission_id` is unique (retries are no-ops); `ticket` is unique (one response per started survey). |
| `byline_poll_public_starts` | Hashed one-use start tokens for public links. Pruned. |
| `byline_poll_pairing_limits` | Failed pairing claims per 10-minute window, across the newsroom. Nothing about the device. Pruned after a day. |

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

## Collect

Collect has two parts, in person and web link, and both use the same respondent screen and server checks.

**In person.** Each session is one interviewer at one place: location, period, sampling method ("Every third
student in the lunch line") and a PIN. The periods offered (Before school, Lunch A…) come from one boundary,
`src/polls/periods.ts`, read through the server; making them editable by the newsroom is still to do. The sampling
method is shown large on the iPad's interviewer screen while the reporter chooses who to approach, and is reported
with the results.

**Web link.** Turned on, off and configured in Collect: copy, open, QR code, opening and closing times, an optional
access code, a new link (with a warning that the old one stops working) and the number of web responses.

## Pairing a device

The recommended setup. The iPad never signs in to Byline.

1. On their own phone or laptop, signed in, the interviewer starts fieldwork in **Collect** (or **Polls → Start
   fieldwork**): poll, location, period, sampling method, a 4–8 digit PIN, and how long the code lasts (15 minutes
   to 2 days, an hour by default), so an iPad can be set up ahead of time.
2. `POST /api/byline/polls/sessions/:id/pairing` returns a six-digit code (`482 913`) and its expiry. Poll Studio
   shows where to go (`<host>/poll`), the code, a copy button, a QR code of the pairing link, and watches for the
   iPad to arrive. The link carries the code after `#`, which a browser never sends to a server.
3. On the iPad, `/poll` takes the code. `POST /api/byline/polls/pair` (anonymous) spends it and sets the session's
   kiosk credential (`byline-poll-kiosk`, httpOnly, SameSite=Strict, 12 hours). Any Byline cookie on the device is
   expired in the same response.
4. The iPad opens `/polls/kiosk` **locked**, showing only the poll title and place. The interviewer's PIN opens the
   controls; they lock it again before handing it over.

The code (`src/polls/pairing.ts`) follows RFC 8628's user-code advice:

- Six random digits, kept only as an HMAC keyed with `PAYLOAD_SECRET`; a database copy can't be tested against
  the million possible codes.
- Spent by the first claim that finds it, whatever happens next; a new code for a session replaces the old one;
  ending the session or **Cancel code** withdraws it.
- Failed claims are throttled across the newsroom (20 per 10 minutes), because the claiming device is anonymous.
  A code left live for the full two days meets at most 5,760 guesses, under a 0.6% chance, and a lucky guess
  still only gets a locked kiosk behind the PIN (with its own lockout). The throttle keeps no IP address.
- The reply says nothing about the poll, its responses or anyone's account, and a refused code says only that it
  didn't work.
- If the session is already running on a device, preparing a code is refused unless the interviewer asks to
  replace it (`replaceDevice`); the old device keeps working until the new one claims the code. A code made without
  that permission is refused if a device started meanwhile.

**Use this device** is still offered, as the second choice: the signed-in device itself becomes the kiosk.
`POST /api/byline/polls/sessions/:id/kiosk` creates the credential, hashes the PIN, **ends the interviewer's Byline
session on the server** (Payload's `logoutOperation`) and, in the same response, expires the `payload-token` cookie
and sets the kiosk cookie. Other Byline tabs on the device are told to leave for the login screen.

## The kiosk

The kiosk is designed so that handing the iPad to a student cannot expose the newsroom. Every Byline API except
the kiosk's own sees an anonymous request.

The kiosk endpoints (`/api/byline/polls/kiosk/*`) accept only that credential and act only on its session. The server
decides the mode:

- **locked**: the PIN pad. Five wrong PINs lock it for a minute, doubling; twenty revoke the credential.
- **interviewer**: the sampling rule, counts (completed, declined, incomplete, waiting to upload), *Student agreed —
  begin survey*, *Student declined*, pause, change location, end. Connection and storage state is a quiet line when
  healthy and an alert when offline or uploading. Locks again after 10 idle minutes.
- **respondent**: the survey. A respondent can submit answers for their ticket and nothing else; every interviewer
  action answers 423.

Reloading always resumes where the server says. A respondent who stops, or an interviewer who unlocks mid-survey,
ends the survey as `abandoned` and its answers are not kept. If the cookie is lost, the interviewer pairs the iPad
again (**Pair a device** on the session, which asks before replacing a running device). Ending the session revokes
the credential, withdraws any code and clears the device's queue.

**Guided Access** (Settings → Accessibility → Guided Access, then triple-click the side or home button) keeps the iPad
in Safari on this page and disables the hardware buttons. It is a device control in addition to the kiosk credential,
never a substitute for it. The interviewer screen mentions it under *Before you hand the iPad over*.

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

## Web links

Off by default, and managed in Collect. The canonical address is `/poll/<key>`; `/polls/s/<key>` renders the same
`PublicPollApp`, renderer and server checks for links already shared. Turning one on gives the poll a random key. Opening the link issues a one-use start token; a submission
needs a token at least 3 seconds and at most 6 hours old. Each poll stops issuing tokens at its hourly limit. An
optional access code limits who can start. A hidden form field catches form-filling bots (they are told "saved" and
nothing is stored). No IP addresses, fingerprints or cookie identities are collected. The same definition, renderer and
validation serve both modes.

## Respondent experience

One question or Matrix per screen, in Byline's own Nova components (no separate palette or typeface; the welcome screen names
The Weekly Wildcat in a single muted line), with large answers (at least 56px), obvious selection, Back, Continue,
Submit on the last question and Skip (optional questions only). The kiosk's primary buttons are larger still. Progress
says *Question 4 of 9* only when nothing in the poll is conditional (`hasStableLength`); with branching it says
*Question 4*, never a total that moves, and the welcome screen says *Up to 12 questions*. A web link shows *Offline*
when the connection drops. On a
landscape iPad the question and answers sit side by side; in portrait they stack. The footer follows the on-screen
keyboard (`trackVisualViewport`) and every edge clears the safe areas. Reduced motion turns off transitions.

Ranking asks respondents to put all answers in order. They can drag, move an
answer up or down, or reorder by keyboard. **Use this order** records the
ranking, including when the starting order is right. A Confirmation asks
respondents to check **I understand**. A Matrix displays its visible rows
together, in a grid in wide landscape layouts and as individually labelled
radio groups on narrow screens. Progress counts a Matrix once. Each row has
its own answer, requirement, relevance and result.

When an earlier answer changes, questions that no longer apply disappear at once and their answers are discarded
(`pruneAnswers`). The server recomputes visibility from the submitted answers and refuses any answer to a hidden or
unknown question, any value of the wrong shape and any broken rule (`checkSubmission`).

### Choice images

Use **Image choice** or choose **Image cards** under Display. Add a text label
and choose a photo or graphic for each answer in the Media picker. The Media
details action opens the file's alt text, rights, credit and preparation status.
Build and Overview identify the choices that need attention.

On Publish, the newsroom selects a bounded natural WebP or JPEG from the
existing publication-media store and records its hash, dimensions and alt text
in the immutable version. Changing a Media file or its alt text can be published
as a new version. Versions in use continue to show the image they published.
Drafts and retained versions appear in Media's linked uses and protect their
referenced files from deletion.

The kiosk and public respondents receive version-specific, signed image URLs.
Each URL serves one rendition in that version's manifest. An access-code poll
issues these URLs after the respondent starts with the code. The kiosk warms
the browser cache for its active version, with at most 60 images. The answer is
still the choice identifier. See [Publication media](publication-media.md).

## Results

Each percentage's base is the respondents who **answered** that question, and every question says so:
*176 answered · 5 skipped · 3 not asked*. Skipped, left blank and not applicable (hidden by a condition) are never
folded in. Multiple-choice percentages are of answering respondents and can add to more than 100%.

The page opens with responses, in person, by web link, completion and decline rates (only above the minimum group),
then responses over time (per day in the newsroom timezone) and the methodology note. Charts are the shadcn Chart
component in `@byline/newsroom-ui` on Recharts, each with `accessibilityLayer`, and every chart can be read as a
table. Choice questions are horizontal bars; scales and small numeric questions show their distribution beside
average, median and range; written answers stay a readable list. Ranking sorts
by average position and shows first-place share, count and base for each option.
Open **Position distribution** for the count at each position. Confirmation
shows confirmed, skipped, unanswered, not applicable and its shown base.
Matrices show a 100% distribution and base for each row with a table view.
Compare by applies the suppression rules to Matrix rows and Ranking or
Confirmation groups.

**Compare by** offers the poll's configured breakdowns (single-choice questions such as grade, chosen in Build).
Groups smaller than the poll's minimum (5 by default) are withheld on the server, and so is a second group whenever
exactly one would otherwise be withheld, so the overall result minus the shown groups can't give a small group away.
A withheld group arrives with no base, counts or percentages, so nothing in the chart data, tooltips, exports or
datasets can recover it. Fieldwork shows approached → declined → started → completed → incomplete, with rates only
above the same minimum.

Filters: dates, collection mode, location, session (searchable), version. Wide screens get a toolbar; narrow ones a
Filters drawer. Active filters are removable badges with *Clear all*. Exports apply exactly the current filters and
say so:

- **Summary CSV**: counts, percentages and bases per choice. No written answers.
- **Responses CSV**: one row per response, one column per question plus 0/1 columns per multiple-choice option;
  `[skipped]`, `[unanswered]` and `[not applicable]` are explicit. Cells that a spreadsheet would read as formulas are
  prefixed with `'`. Exports are logged.

### Results to Byline Data

**Create dataset** (editors) puts the current results, with the current filters and comparison, into a **private
working dataset** through Data's own `createDataset` and `createRows` (`createResultsDataset`, built by
`aggregateHandoff` in `src/polls/engine/handoff.ts`). Each row is a question, an answer, an optional group, a count, a
percentage and its base. Ranking includes average position and first-place
counts and shares. A Matrix contributes one row per statement and answer
option. Confirmation contributes its confirmed count and base. Written answers never enter it, nor any response or respondent; questions answered by fewer
than the minimum group are left out (the description says how many) and withheld groups stay withheld. Nothing is
public until an editor reviews the dataset in Data and publishes it through Data's release step.

### Linked coverage

A poll can be linked to a Story and a Collection (Settings). The link is shown, read from Poll Studio and never
copied, in the Story's Reporting tab and on the Collection's Overview (`LinkedPolls`, through the Collection host's
`linkedWork` slot), only to people who can see the poll, with response counts only for those with results access.
Selecting it opens Poll Studio.

## Import, preview and editing

**Polls → Import spreadsheet** runs Upload → Validate → Review → Preview → Publish. The workbook is parsed on the server
by a small reader in `src/polls/engine/xlsx.ts` (no spreadsheet library, nothing executed, sizes bounded), then
`importWorkbook` checks names, references, expressions, choices, forward and circular conditions and reports each
problem with its sheet and row. Review writes every condition in words. Preview is the real respondent screen with a
path tracker. Publishing is refused while there are errors.

Use **Build → Questions** to edit wording, hints, required answers, choices, scales, sections, conditions, the
welcome and thank-you screens, and the questions to compare results by. Build saves a moment after each change (*Saving… / Saved*), one save at a time, each
carrying the draft revision: a stale editor is refused (409) and offered *Load latest* or an explicit *Save mine over
it*, never a silent merge. Questions and answers reorder by dragging their handles or from the keyboard (Space, arrows,
Space), and *Move up* / *Move down* stay in each question's menu. Identifiers are generated (from the wording, once,
when Build named them and nothing published or referenced uses them) and kept under *Advanced*; anything published
keeps its identifier. On narrow screens the question editor opens in a Drawer. **Download as spreadsheet** writes the
draft or any version in the same format, so a poll can round-trip.

Choice questions offer **List**, **Cards**, **Dropdown**, **Horizontal**,
**Likert** (single choice) and **Image cards**. Ranking and Confirmation are in
the Add question menu. A Matrix stays together when you move, duplicate or delete
it in Build. Edit its row labels and shared columns, and choose whether to require
every visible row. Imported tables with incompatible rows keep their workbook
structure and are shown as imported sections. **Preview question** uses the
same controls students see.

### Logic Map

**Build → Logic** shows the same draft as **Questions**. The order connectors run from Start through each question
to Thank you. A labeled logic connector means an earlier answer can make the destination appear through its
existing XLSForm `relevant` expression. Display logic has no skip-to, goto or branch routing. Section cards show
which questions they contain. A condition on a section applies to all its questions, including questions in
nested sections. A Matrix has one card. A connector from a Matrix row names
the row and its answer. Confirmation conditions read **is confirmed**.
Ranking can receive display logic, and supported imported expressions
referencing its ordered answer stay under Advanced.

Drag from a question's answer handle to a later question or section, or select a source and choose **Add logic**
to pick a destination by touch or keyboard. **Edit display logic** opens the selected question or section, and
selecting a logic connector opens its rule. Choose **Apply** to update the draft through Build's autosave. The
builder accepts a flat set of conditions joined by *When all are true* or *When any is true*. **Write it** opens the
raw expression. Advanced expressions that the builder cannot fully represent retain their original text until you
deliberately edit or replace them. Removing a builder connector offers **Undo**.

**Test path** starts with blank answers and highlights the questions that currently apply and the conditions that
show them. Select an applicable question to try an answer, and change an earlier answer to see subsequent questions
and their answers disappear when they stop applying. **Why is this shown?** explains the selected question's display
conditions. Test answers stay in the map for that session and are never saved as responses.

Moving cards saves their positions to your Byline preferences for this poll. Poll order and section membership
are edited in Questions. **Fit map** brings the map into view and **Reset layout** restores the automatic layout.

**Preview** runs the real respondent screen beside a path tracker: which questions apply, which were not asked, the
answers chosen, why each conditional question is asked, and *Start again* for the next branch.

## Settings

The things changed rarely, in sections: General (title, description, status), Access (all staff, interviewers,
results), Reporting and privacy (methodology, smallest reported group), Linked coverage, and a Danger zone
(administrators: delete the poll).

Poll Studio offers the blank template, the worked example *AI at Ninety Six High School* and the spreadsheet guide.
They are generated from `src/polls/workbooks/` by `apps/newsroom/scripts/polls-workbooks.ts`; a test fails if the
committed files drift. **Add the example poll** installs the example by importing that workbook.

## Deployment

- Run the migrations: `retire_article_polls` (removes article polls), `wildcat_polls` and `poll_device_pairing`.
- `/poll`, `/poll/*` and `/polls/*` are served by the newsroom with `Cache-Control: private, no-store`,
  `frame-ancestors 'none'` and `Referrer-Policy: no-referrer`. A separate hostname can point at the same deployment
  later.
- The kiosk's encrypted queue needs a secure context (HTTPS in production).
- No new environment variables or services.

## Tests

- `tests/polls-engine.test.ts`: expressions, branching, pruning, server validation, importer errors, results, CSV and
  the committed workbooks.
- `tests/polls-question-types.test.ts` covers the new answer types, Matrix
  structure and relevance, Workbook round trips, Ranking statistics, CSV and Data handoff.
- `tests/polls-logic-map.test.ts` covers builder round-tripping, advanced expressions, nested section gates,
  respondent path agreement and layout at the 300-question limit.
- `tests/polls-ux.test.ts`: pairing codes, links, periods, progress, the timeline, Compare by, secondary suppression
  and the Data handoff.
- `tests/integration/polls.test.ts`: access, versions, the kiosk, pairing (hashed at rest, expiry, one use,
  replacement, throttling, locked start, no newsroom access), web-link windows and limits, linked polls and the
  dataset handoff, against PostgreSQL. Image tests publish two versions of the
  same Media asset and verify frozen bytes and alt text, signed routes and deletion protection.
- `npm run test:polls:browser --workspace @byline/newsroom` runs against the throwaway database from
  `scripts/seed-polls-browser.ts`. Chromium covers the Poll Studio workflow, keyboard sorting and Logic Map
  editing by pointer and keyboard. It builds a poll with the new displays and tests
  Ranking, Matrix and Confirmation from Preview to Results. WebKit uses iPad
  landscape and portrait profiles for pairing, touch controls, offline images
  and queued submissions. A WebKit phone profile checks both web link addresses
  and narrow Matrix and Image Card layouts. Install WebKit once with
  `npx playwright install webkit`. Set `BYLINE_POLLS_BROWSER_DATABASE_URL` to use
  a different disposable PostgreSQL instance.
