/**
 * The spreadsheet guide: written for people and for AI assistants alike.
 * `scripts/polls-workbooks.ts` writes it to docs/wildcat-polls-xlsform.md, and
 * Poll Studio offers it as a download beside the template.
 */
export const SPREADSHEET_GUIDE = `# Wildcat Polls spreadsheet format

Wildcat Polls reads a survey from an Excel workbook (\`.xlsx\`) in a supported
subset of [XLSForm](https://xlsform.org). Give this whole document to an AI
assistant and ask it to "write a Wildcat Polls workbook" for your questions;
then upload the file in Poll Studio (Polls → Import spreadsheet). Byline checks
every row before anything is published and tells you the sheet and row of each
problem.

Nothing in the workbook is ever run. Formulas, macros and links are ignored:
type every value as plain text.

## Sheets

A workbook has three sheets, named exactly \`survey\`, \`choices\` and
\`settings\`. The first row of each sheet is its column headers. Empty rows
are ignored.

### survey

One row per question, in the order respondents see them. A Matrix groups
several rows on one screen.

| column | required | meaning |
| --- | --- | --- |
| type | yes | the question type (below) |
| name | yes | a permanent identifier: letters, numbers and underscores, starting with a letter, at most 64 characters, unique in the survey. Results and conditions use it. Never reuse or rename it once people have answered. |
| label | yes | the question as respondents read it |
| hint | no | a short line under the question |
| required | no | \`yes\` when the question must be answered. Leave empty for optional questions: respondents get a **Skip** button |
| required_message | no | what to say when a required question is left blank |
| relevant | no | a condition (below): the question is shown only when it is true |
| constraint | no | a condition the answer must meet; \`.\` is the answer itself |
| constraint_message | no | what to say when the constraint fails |
| appearance | no | How a question or group is displayed. See Displays below. |
| parameters | no | for \`range\` only: \`start=1 end=5 step=1\`, optionally \`start_label='Not at all' end_label='Very'\` |

A \`label::English (en)\` column is accepted in place of \`label\` (the first
language column is used; Wildcat Polls has one language per poll).

#### Question types

| type | what respondents do | value in conditions |
| --- | --- | --- |
| \`select_one LIST\` | choose one answer from choice list LIST | the chosen choice name |
| \`select_multiple LIST\` | choose one or more answers | the chosen names separated by spaces; test with \`selected()\` |
| \`rank LIST\` | put every choice in order and confirm the order | the chosen names in ranking order, separated by spaces |
| \`acknowledge\` | confirm a statement | \`OK\` when confirmed. Byline also imports \`trigger\`. |
| \`text\` | write an answer (up to 2,000 characters) | the text |
| \`integer\` | enter a whole number | the number |
| \`decimal\` | enter a number | the number |
| \`range\` | choose a point on a scale (set \`parameters\`) | the number |
| \`note\` | read information; no answer | — |
| \`begin group\` / \`end group\` | start and end a section. Give the group a name and a label (the section heading). A \`relevant\` on \`begin group\` shows or hides every question inside. Groups may nest four deep. | — |

Not supported (Byline refuses the workbook and says which row):
\`calculate\`, \`date\`, \`time\`, \`datetime\`, location, media and file
questions, \`hidden\`, repeats, \`or_other\`,
choice filters and choices from a file. Metadata rows such as \`start\`, \`end\`
and \`deviceid\` are skipped with a warning: Byline records times itself and
never identifies devices or respondents.

### choices

| column | meaning |
| --- | --- |
| list_name | the list a choice belongs to (the LIST in \`select_one LIST\`) |
| name | a permanent identifier for the answer: no spaces or quotes, unique in its list |
| label | what respondents read |
| image | optional image filename, such as \`wildcat.png\`. Keep a text label too. |

Every list used by a question needs at least two choices. Choices appear in
sheet order.

### Displays

| Byline display | XLSForm appearance | Use |
| --- | --- | --- |
| List | empty | Radio buttons or checkboxes |
| Cards | \`compact\` | Larger selectable cards |
| Dropdown | \`minimal\` | A single- or multiple-choice menu |
| Horizontal | \`horizontal\` | Answers wrap onto the next line as needed. Byline also reads \`horizontal-compact\`. |
| Likert | \`likert\` | One answer on an ordered scale |
| Image cards | \`columns\` with \`choices.image\` | Text and images on ordinary choice answers |
| Matrix | \`table-list\` on \`begin group\` | Single-choice rows from one list, shown together |
| Long written answer | \`multiline\` | A larger text box |

Byline preserves other appearance text in the workbook. A table with mixed
lists, nested sections or incompatible rows retains its original structure in
Build under the imported section.

#### Rank, Confirmation and Matrix

| type | name | label | required | appearance | relevant |
| --- | --- | --- | --- | --- | --- |
| rank topics | rank_topics | Rank the topics for our next edition | yes | | |
| acknowledge | read_rules | I have read the activity rules | yes | | |
| begin group | school_experience | How much do you agree? | | table-list | \${read_rules} = 'OK' |
| select_one agreement | support | I know where to find support | yes | | |
| select_one agreement | clubs | I can find a club I want to join | yes | | |
| end group | | | | | |

Add the \`topics\` choices and the shared \`agreement\` choices to the
choices sheet. Each Matrix row is exported as its own answer column.

#### Image Choice

Use \`select_one logos\` or \`select_multiple logos\` with appearance
\`columns\`, and add image filenames on the choices sheet:

| list_name | name | label | image |
| --- | --- | --- | --- |
| logos | wildcat | Wildcats | wildcat.png |
| logos | tiger | Tigers | tiger.png |

The workbook references separate files. Save an import as a draft and match
each filename to an image in Byline's Media picker. The image needs alt
text and prepared publication files before you can publish. XLSForm exports
include filenames. Media files are managed separately. Image Choice asks
respondents to choose a pictured answer. A respondent photo upload is a
different XLSForm question type and remains unsupported.

### settings

One header row and one value row.

| column | meaning |
| --- | --- |
| form_title | the poll's title (required) |
| form_id | an identifier for your own records |
| version | your version label, e.g. \`2026-11\` |
| description | one or two sentences about the poll, shown on the welcome screen |
| welcome_message | what respondents read before they start: that it is voluntary and anonymous, how long it takes |
| thank_you_message | the last screen |
| breakdowns | single-choice questions results may be broken down by, separated by spaces, e.g. \`grade\` |

## Conditions (relevant and constraint)

Refer to an earlier question as \`\${name}\`. Quote choice names and text with
single quotes. Supported:

- comparisons: \`=\` \`!=\` \`<\` \`<=\` \`>\` \`>=\`
- logic: \`and\`, \`or\`, \`not(...)\`, parentheses
- arithmetic: \`+\` \`-\` \`*\` \`div\` \`mod\`
- \`selected(\${name}, 'choice')\`: a multiple-choice answer includes a choice
- \`count-selected(\${name})\`: how many choices were picked
- \`string-length(.)\`: the length of a written answer
- \`number(...)\`, \`true()\`, \`false()\`
- \`.\` (constraints only): the answer being checked

An unanswered, skipped or hidden question is the empty string \`''\`, so
\`\${q} != ''\` means "q was answered".

Rules Byline enforces:

- a condition may only refer to questions asked **earlier** (a question cannot
  depend on itself or on a later one, and conditions cannot form a circle);
- every \`\${name}\` must be a question (not a group or a note);
- every quoted choice compared with a choice question must exist in its list;
- \`.\` is only for constraints.

When a respondent changes an earlier answer, questions that no longer apply
disappear at once and their answers are discarded.

### Examples

\`\`\`
relevant    \${book_report} = 'yes'
relevant    \${used_ai} = 'yes' and \${grade} != 'prefer_not'
relevant    selected(\${devices}, 'phone') or selected(\${devices}, 'laptop')
constraint  . >= 13 and . <= 19
constraint  not(selected(., 'none') and count-selected(.) > 1)
\`\`\`

## A complete small example

survey

| type | name | label | hint | required | relevant |
| --- | --- | --- | --- | --- | --- |
| begin group | about_you | About you | | | |
| select_one grade | grade | What grade are you in? | | yes | |
| end group | | | | | |
| select_one yes_no | book_report | Have you been assigned a book report this year? | | yes | |
| select_one yes_no | used_ai | Did you use AI for any part of it? | | | \${book_report} = 'yes' |
| select_multiple ai_purpose | ai_purpose | What did you use it for? | Choose all that apply. | | \${used_ai} = 'yes' |
| text | anything_else | Anything else? | Please don't include names. | | |

choices

| list_name | name | label |
| --- | --- | --- |
| grade | 9 | 9th grade |
| grade | 10 | 10th grade |
| grade | 11 | 11th grade |
| grade | 12 | 12th grade |
| grade | prefer_not | Prefer not to say |
| yes_no | yes | Yes |
| yes_no | no | No |
| ai_purpose | brainstorm | Brainstorming ideas |
| ai_purpose | grammar | Checking grammar or spelling |
| ai_purpose | other | Something else |

settings

| form_title | form_id | version | breakdowns |
| --- | --- | --- | --- |
| Book reports and AI | book_reports_ai | 1 | grade |

## Writing good student polls

- Keep wording neutral. Ask what people did and think; do not assume a use of
  AI is wrong.
- Let respondents describe themselves. Never ask an interviewer to guess
  anyone's grade or gender; give every demographic question a
  "Prefer not to say" choice and leave it optional unless you need it.
- Do not ask for names, emails, phone numbers or anything that identifies a
  student, and say so in written questions.
- Use \`breakdowns\` only for the groups you plan to report. Byline withholds
  any breakdown group with fewer respondents than the poll's minimum.
`;
