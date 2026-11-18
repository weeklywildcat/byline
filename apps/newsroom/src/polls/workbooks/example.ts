import type { WriteSheet } from "../engine/xlsx";

/**
 * The worked example, "AI at Ninety Six High School", as workbook rows.
 * `scripts/polls-workbooks.ts` writes it to `ai-at-ninety-six-high-school.xlsx`
 * in this folder; Poll Studio serves those same bytes, and the example is
 * installed by importing that workbook, exactly like any other.
 *
 * The wording is neutral on purpose: using AI is not treated as cheating, every
 * demographic question can be skipped or declined, and the written question
 * asks students not to name anyone.
 */

const SURVEY_HEADER = ["type", "name", "label", "hint", "required", "relevant", "constraint", "constraint_message", "appearance", "parameters"];

const survey: string[][] = [
  SURVEY_HEADER,
  ["begin group", "about_you", "About you"],
  ["select_one grade", "grade", "What grade are you in?", "", "yes"],
  ["select_one gender", "gender", "How do you describe your gender?", "Optional. Skip it if you would rather not say."],
  ["end group"],

  ["begin group", "posters", "Posters at school"],
  ["select_one yes_no_unsure", "ai_posters_seen", "Have you noticed the posters about AI around school this year?"],
  ["select_one agreement", "ai_posters_clear", "The posters made the school’s expectations about AI clearer to me.", "", "", "${ai_posters_seen} = 'yes'", "", "", "likert"],
  ["select_one yes_no_unsure", "protest_posters_seen", "Have you seen the posters students made in response to AI-generated artwork?"],
  ["end group"],

  ["begin group", "artwork", "Artwork"],
  ["select_one feeling", "ai_art_feeling", "How do you feel about artwork made with AI tools?"],
  ["select_one art_choice", "human_art_preference", "If you were choosing art for a school event, which would you prefer?"],
  ["select_one importance", "ai_labeling", "How important is it that images made with AI are labeled that way?"],
  ["range", "ai_comfort", "Overall, how comfortable are you with students using AI tools for schoolwork?", "1 is not at all comfortable; 5 is very comfortable.", "", "", "", "", "", "start=1 end=5 step=1 start_label='Not at all' end_label='Very'"],
  ["end group"],

  ["begin group", "book_reports", "Book reports"],
  ["select_one yes_no", "book_report", "Have you been assigned a book report this year?"],
  ["select_one yes_no_decline", "used_ai", "Did you use AI for any part of it?", "Any use counts, from brainstorming to checking spelling.", "", "${book_report} = 'yes'"],
  ["select_multiple ai_purpose", "ai_purpose", "What did you use it for?", "Choose all that apply.", "", "${used_ai} = 'yes'", "not(selected(., 'prefer_not') and count-selected(.) > 1)", "“Prefer not to say” can’t be combined with other answers."],
  ["select_one permission", "ai_permitted", "Was using AI allowed for that assignment?", "", "", "${used_ai} = 'yes'"],
  ["end group"],

  ["note", "closing_note", "Last question. It’s optional."],
  ["text", "anything_else", "Is there anything else you want the Weekly Wildcat to know about AI at school?", "Please don’t include anyone’s name.", "", "", "string-length(.) <= 1000", "Keep it under 1,000 characters.", "multiline"]
];

const choices: string[][] = [
  ["list_name", "name", "label"],
  ["grade", "9", "9th grade"],
  ["grade", "10", "10th grade"],
  ["grade", "11", "11th grade"],
  ["grade", "12", "12th grade"],
  ["grade", "prefer_not", "Prefer not to say"],
  ["gender", "girl", "Girl or woman"],
  ["gender", "boy", "Boy or man"],
  ["gender", "nonbinary", "Non-binary"],
  ["gender", "self_describe", "I describe myself another way"],
  ["gender", "prefer_not", "Prefer not to say"],
  ["yes_no", "yes", "Yes"],
  ["yes_no", "no", "No"],
  ["yes_no_unsure", "yes", "Yes"],
  ["yes_no_unsure", "no", "No"],
  ["yes_no_unsure", "unsure", "I’m not sure"],
  ["yes_no_decline", "yes", "Yes"],
  ["yes_no_decline", "no", "No"],
  ["yes_no_decline", "prefer_not", "Prefer not to say"],
  ["agreement", "strongly_agree", "Strongly agree"],
  ["agreement", "agree", "Agree"],
  ["agreement", "neutral", "Neither agree nor disagree"],
  ["agreement", "disagree", "Disagree"],
  ["agreement", "strongly_disagree", "Strongly disagree"],
  ["feeling", "positive", "Mostly positive"],
  ["feeling", "mixed", "Mixed"],
  ["feeling", "negative", "Mostly negative"],
  ["feeling", "no_opinion", "I don’t have an opinion"],
  ["art_choice", "human", "Art made by a person"],
  ["art_choice", "ai", "Art made with AI tools"],
  ["art_choice", "either", "No preference"],
  ["art_choice", "depends", "It depends"],
  ["importance", "very", "Very important"],
  ["importance", "somewhat", "Somewhat important"],
  ["importance", "not_very", "Not very important"],
  ["importance", "not_at_all", "Not important at all"],
  ["importance", "unsure", "I’m not sure"],
  ["ai_purpose", "understand", "Understanding the book or a chapter"],
  ["ai_purpose", "brainstorm", "Brainstorming ideas"],
  ["ai_purpose", "outline", "Organizing or outlining"],
  ["ai_purpose", "grammar", "Checking grammar or spelling"],
  ["ai_purpose", "feedback", "Getting feedback on a draft"],
  ["ai_purpose", "drafting", "Writing some of the text"],
  ["ai_purpose", "other", "Something else"],
  ["ai_purpose", "prefer_not", "Prefer not to say"],
  ["permission", "allowed", "Yes"],
  ["permission", "not_allowed", "No"],
  ["permission", "unclear", "The rules weren’t clear to me"],
  ["permission", "prefer_not", "Prefer not to say"]
];

const settings: string[][] = [
  ["form_title", "form_id", "version", "description", "welcome_message", "thank_you_message", "breakdowns"],
  [
    "AI at Ninety Six High School",
    "ai_at_nshs",
    "2026-11",
    "The Weekly Wildcat is asking students how they see AI at school: the posters around the building, artwork made with AI, and schoolwork.",
    "This poll takes about three minutes. It’s voluntary and anonymous: we never ask your name, every question lets you pass, and you can stop at any time. Your answers go to the Weekly Wildcat’s reporters, not to your teachers.",
    "Your answers are in. Please hand the iPad back to the reporter.",
    "grade"
  ]
];

export const EXAMPLE_WORKBOOK_FILE = "ai-at-ninety-six-high-school.xlsx";
export const TEMPLATE_WORKBOOK_FILE = "wildcat-polls-template.xlsx";
export const SPREADSHEET_GUIDE_FILE = "wildcat-polls-spreadsheet-guide.md";

export const EXAMPLE_SHEETS: WriteSheet[] = [
  { name: "survey", rows: survey, widths: [26, 22, 60, 36, 10, 30, 40, 36, 12, 44] },
  { name: "choices", rows: choices, widths: [18, 18, 44] },
  { name: "settings", rows: settings, widths: [32, 14, 10, 50, 60, 50, 14] }
];

export const TEMPLATE_SHEETS: WriteSheet[] = [
  { name: "survey", rows: [SURVEY_HEADER, ["select_one yes_no", "first_question", "Write your first question here", "", "yes"]], widths: [26, 22, 60, 36, 10, 30, 40, 36, 12, 44] },
  { name: "choices", rows: [["list_name", "name", "label", "image"], ["yes_no", "yes", "Yes"], ["yes_no", "no", "No"]], widths: [18, 18, 44, 28] },
  { name: "settings", rows: [["form_title", "form_id", "version", "description", "welcome_message", "thank_you_message", "breakdowns"], ["My poll", "my_poll", "1", "", "", "", ""]], widths: [32, 14, 10, 50, 60, 50, 14] }
];
