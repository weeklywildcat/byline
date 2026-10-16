# About page

`/about/` is rendered by code, not from the CMS page with the slug `about`. The route is
`apps/web/src/pages/about.astro`; the CMS page of the same slug is skipped in
`apps/web/src/pages/[segment].astro` (`codeRoutedSlugs`) so only one page is generated.
Editing "About Us" in WordPress no longer changes the public page.

| File | What it holds |
| --- | --- |
| `apps/web/views/about/page.tsx` | Layout and the long-form prose |
| `apps/web/views/about/content.ts` | Timeline, standards, coverage sections, links, and the stories and photographs the page names by slug |
| `apps/web/views/about/data.ts` | Build-time data: story counts, the editors, latest story per section, sports archive figures, photographs |
| `apps/web/public/newsroom/` | Staff photographs for "Who we are" (three widths each, metadata stripped; credits follow the files' own metadata) |
| `apps/web/views/about/icons.ts` | Phosphor icons bundled for the cards. The site's `SiteIcon` loads icons after hydration, which leaves them blank in static HTML |
| `apps/web/tests/about-page.test.tsx` | Heading outline, links, alt text, computed figures, banned phrases |

The "newsroom today" band (figures and editors) is switched off with `SHOW_NEWSROOM_TODAY` in `content.ts`.

## What is computed and what is written

Computed at build time, so it cannot drift: stories published and the date of the first one, contributors in the
directory, the editors shown in "The newsroom today", the latest story in each section, and the sports archive
figures (game records, sports, earliest season, counted from the archive Pages).

Written by hand: everything else. When a story or photograph named in `content.ts` is unpublished or renamed, the
page drops that link or figure instead of failing. Update the slug.

Leadership is not duplicated here. Only people whose directory role contains "Editor" appear, and the page links to
`/leadership/` and `/authors/` for the rest.

## Where each claim comes from

| Claim | Source |
| --- | --- |
| TV Communications class, weekly 5 to 7 minute broadcast, rotating anchor | "A New Era For Student Journalism @ NSHS," January 22, 2026 |
| Newspaper not regularly produced for 20+ years; restart attempt about four years earlier with Mrs. Blackwell and Mr. Sprowl | Same story |
| Dan Mackin as adviser | Same story, which lists him as adviser for 2025-26 |
| Discord, Google Meet, shared drive, @weeklywildcat.com accounts, loaner laptops, no personal laptop needed | Staff Device & Technology Policy (PDF in the media library) |
| Roles, "you do not need to be an expert" | `/join/` and `/diversity-inclusion/` |
| Editors assign, review drafts, check details; students lead | `/leadership/` |
| Fair, accurate, chance to respond, opinion labeled, corrections | The previous About text; `/diversity-inclusion/`; `/leadership/` |
| Public corrections log, notes on stories, feedback form, anonymous concerns | `/corrections/`, `ArticleCorrectionNotices`, `ReaderFeedbackForm`, `/diversity-inclusion/` |
| Photograph credits, CC BY 4.0 | `/image-license/` |
| Advertising supports reporting, photography, design tools, web costs | `/advertise/` |
| $0 budget, no school funding, sponsors and donations welcome | The newsroom. There is no donation page yet: `DONATE_URL` in `SiteHeader.tsx` points to `/contact/` as a placeholder |
| WordPress behind a separate static site, code on GitHub | "Weekly Wildcat Begins Website Upgrade," June 29, 2026; `/open-source/` |

## Needs newsroom confirmation

These are written as the newsroom's working standards or as statements about its current structure. No policy
document in the repository or the CMS establishes them. Confirm or reword before treating them as policy.

- **Verification** and **Responsible reporting** in "Standards and corrections" (rumors, unconfirmed claims, extra
  care with health, safety and discipline).
- **Independence**, and "Support does not buy coverage" under "Money and independence."
- The statement that editors check names, titles, scores and dates before a story runs.
- The September 2025 date and the "approved" milestone, which come from the newsroom, not a published source.
- Dan Mackin as the current adviser, and the adviser's role. The page says only that an adviser "works with the
  staff."
- The sentence admitting there is no published policy on adviser or administrator review. Replace it with a link
  once a policy exists.

## Not on the page because nothing verifies it

Grants, sponsorships, an anonymous-source policy, a conflict-of-interest policy, photo consent for minors, awards,
readership figures and circulation.

## Join page

`/join/` is also rendered by code (`apps/web/src/pages/join.astro`, `apps/web/views/join/`), and the CMS page with the
slug `join` is skipped the same way. Copy and the FAQ live in `views/join/content.ts`; the FAQ answers are repeated
in the page's FAQPage structured data, so edit them there only. The page reuses the About page's masthead, section,
roles and photo styles (the `about-*` classes in `globals.css`).

FAQ answers that come from the newsroom, not a published page: anyone at Ninety Six High School can join, Mr. Mackin
or gibson@weeklywildcat.com as the way to start, any time of year, hybrid and flexible meetings, pitching from day one,
and clips but no course credit. Service hours are deliberately not mentioned.
