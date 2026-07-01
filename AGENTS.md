# AGENTS.md

Guidance for future agents working on the Weekly Wildcat Byline project.

## Project Overview

- This is a Next.js static-export frontend for the Weekly Wildcat WordPress CMS.
- The live CMS API is `https://cms.weeklywildcat.com/wp-json/wp/v2`.
- The public site URL is `https://weeklywildcat.com`.
- The app is designed for static generation and static hosting only.
- Do not add a database, auth, Next API routes, server actions, or SSR.
- Keep WordPress and Twenty Twenty-Five theme styling out of the frontend.
- Use normal `<img>` tags for WordPress media and brand assets. Do not use Next image optimization.

## Commands

- `npm run dev` starts local Next development.
- `npm run typecheck` runs TypeScript checks.
- `npm run build` builds the static export into `out/`.
- `next.config.ts` must keep:
  - `output: "export"`
  - `trailingSlash: true`
  - `images.unoptimized: true`

Run `npm run typecheck` and `npm run build` before handing off substantial changes.

## Environment

`.env.example` contains the intended defaults:

```txt
NEXT_PUBLIC_WP_API_URL=https://cms.weeklywildcat.com/wp-json/wp/v2
NEXT_PUBLIC_SITE_URL=https://weeklywildcat.com
```

The frontend intentionally uses the live WordPress API for local development and static generation.

## Key Architecture

- `lib/wordpress.ts` is the typed WordPress REST client.
  - Fetch published posts with `_embed=1`.
  - Article URLs use the WordPress post date directly.
  - Article route format is `/[year]/[month]/[day]/[category]/[slug]/`.
  - `generateStaticParams` is used for article, category, author, and static pages.
- `lib/content.ts` owns public-content filtering.
  - Never render `Uncategorized` publicly.
  - Exclude setup/test posts such as `hello-world` and `Hey there!`.
  - Use tags for editorial flags:
    - `special-coverage`
    - `athlete-of-the-week`
    - `athlete-of-the-month`
- `lib/headless.ts` is the typed client for custom plugin endpoints.
- `lib/seo.ts`, `app/sitemap.ts`, and `app/robots.ts` own SEO infrastructure.
  - Keep NewsArticle JSON-LD on article pages.
  - Keep Organization schema for Weekly Wildcat.
  - Organization logo asset is `public/OrganizationLogo.png`.

## Public Routes

- Homepage: `/`
- Article pages: `/[year]/[month]/[day]/[category]/[slug]/`
- Category pages: `/category/[slug]/`
- Author directory: `/authors/`
- Author profiles: `/author/[slug]/`
- Static pages: configured through `lib/static-pages.ts` and rendered by `app/[slug]/page.tsx`.

## Design System

- Overall direction: modern, serious, photography-led student/local newsroom.
- Avoid generic WordPress theme patterns, excessive cards, gradients, glass effects, or decorative clutter.
- Use warm off-white background, near-black typography, thin warm-gray rules, and restrained maroon/red accents.
- Header:
  - Compact utility bar with current date, `Ninety Six, S.C.`, and search.
  - Centered wide masthead logo: `public/brand/weekly-wildcat-wide-logo.svg`.
  - Main nav must be exactly: News, Sports, Opinion, Features.
  - Do not show `Uncategorized` or count-driven categories in the header.
- Footer:
  - Dark background `#171A21`.
  - Keep the thin rainbow gradient divider above the footer.
  - Use the regular logo asset masked in white: `public/brand/weekly-wildcat-logo.svg`.
  - Footer includes the school newspaper line, address, contact link, and grouped links.
- Fonts:
  - Adobe Fonts kit is loaded in `app/layout.tsx`.
  - `aktiv-grotesk` for article headlines, decks, body-related copy, and standard modules.
  - `news-gothic-std` for nav, categories, dates, labels, metadata, buttons, and small UI.
  - `alternate-gothic-condensed-a` only for major package titles and section-page mastheads where already used.
  - No serif fonts in active homepage/header styling.
- Icons:
  - Use `components/SiteIcon.tsx` for Iconify icons.
  - Current usage includes the header search icon and Founder badge star.
  - Keep brand logos as local assets, not Iconify.

## Homepage Rules

The homepage is CMS-driven and should not use placeholder articles.

Current module order:

1. The Lead
2. Right Now
3. The Brief
4. In Focus
5. Special Coverage
6. Opinion
7. Sports
8. More From Weekly Wildcat

Selection rules:

- The Lead uses the newest sticky public post, falling back to the newest public post.
- Reserve Athlete of the Month/Week posts before other modules so they only appear in the sports athlete feature.
- Do not duplicate article URLs across homepage modules.
- Collapse empty modules gracefully.
- Use featured images prominently when present, and handle missing images without empty holes.

Module design notes:

- The Lead is a black editorial hero with text on the left and image on the right.
- Right Now is the rail beside the hero; use black story headlines, muted metadata, and bylines.
- The Brief is a news digest, not a plain vertical list:
  - first item is a stronger brief lead;
  - remaining items are compact supporting stories;
  - the lead fills the height of the support rail on desktop.
- In Focus is a slower visual feature package.
- Special Coverage is driven by the `special-coverage` tag.
- Opinion is text-forward.
- Sports includes:
  - main sports story;
  - exactly two compact sports rail stories when available;
  - Athlete of the Month feature driven by `athlete-of-the-month` or `athlete-of-the-week`;
  - Scores & Schedule utility panel from the plugin endpoints.

## Article, Category, and Author Pages

- Article pages render title, excerpt/dek, author, category, date, featured image, caption, and article HTML.
- Article body styling must be scoped to the site article body rules, not inherited from WordPress theme styling.
- Category pages use section mastheads and rule-separated story lists.
- Author pages and the author directory use custom CMS profile data when available:
  - uploaded profile photo;
  - pronouns;
  - role;
  - WordPress bio/description;
  - social links;
  - Founder badge with star and tooltip;
  - story count and words written.
- Do not depend on Gravatar for author images.

## Headless WordPress Plugin

The companion plugin lives at `wordpress/weekly-wildcat-headless/`.

Plugin facts:

- Plugin name: `Weekly Wildcat Headless`.
- Main file: `weekly-wildcat-headless.php`.
- Current release line: `0.1.x`.
- GitHub repo for releases: `weeklywildcat/byline-plugin`.
- The plugin is data/admin only; it does not render WordPress frontend UI.
- It uses Plugin Update Checker and GitHub Releases for WordPress update notices.

Custom post types:

- `ww_sports_game`
- `ww_school_event`

REST endpoints:

- `/wp-json/weekly-wildcat/v1/sports-games`
- `/wp-json/weekly-wildcat/v1/sports-games/upcoming`
- `/wp-json/weekly-wildcat/v1/sports-games/recent`
- `/wp-json/weekly-wildcat/v1/school-events`

Sports Games:

- One record represents both scheduled games and final scores.
- Uses a controlled sport/team dropdown for stable frontend filtering.
- Includes sport key/label, level, team label, opponent, site, location fields, date/time, status, scores, recap URL, and notes.
- Location fields include location name, address, latitude, longitude, and optional Apple Maps place ID.
- Scores are exposed publicly only when status is `final`.

School Events:

- Include event type, date/time, all-day flag, location, description, external URL, and status.

Author profile fields:

- Role, pronouns, Media Library profile photo, Founder checkbox, and social links.
- Public user REST responses expose `weeklyWildcatProfile`.

Plugin release process:

1. Bump the `Version:` header in `weekly-wildcat-headless.php`.
2. Commit and push to the plugin repository.
3. Create and push a matching tag such as `v0.1.5`.
4. GitHub Actions publishes `weekly-wildcat-headless.zip`.
5. WordPress detects updates through Plugin Update Checker.

For plugin code changes, run:

```sh
php -l wordpress/weekly-wildcat-headless/weekly-wildcat-headless.php
```

## SEO Requirements

- Keep generated static sitemap behavior.
- Keep `robots.txt`.
- Keep article NewsArticle JSON-LD.
- Keep Organization schema:
  - name: `Weekly Wildcat`
  - URL: `https://weeklywildcat.com`
  - logo: `/OrganizationLogo.png`

## Implementation Preferences

- Keep changes scoped and follow existing patterns before creating new abstractions.
- Reuse `HomepageStory`, `StoryTeaser`, `SectionHeader`, `FeaturedImage`, `SiteHeader`, `SiteFooter`, and `SportsSchedulePanel` where practical.
- Add new variants/components only when the existing component would become awkward or unclear.
- Keep CSS in `app/globals.css` consistent with the existing token system.
- Use `apply_patch` for manual edits.
- Do not rewrite unrelated files or generated output.
- This workspace may not be a Git repository at the root; check before assuming commit/push is available.

## Verification Checklist

For frontend work:

- `npm run typecheck`
- `npm run build`
- Confirm the static export writes to `out/`.
- Browser-check desktop and mobile when layout changes.
- Check no `Uncategorized`, `hello-world`, or `Hey there!` appears publicly.
- Check no duplicate homepage articles when changing module selection.
- Check WordPress media and logos use normal `<img>` tags.

For plugin work:

- `php -l wordpress/weekly-wildcat-headless/weekly-wildcat-headless.php`
- Confirm REST response shapes remain frontend-friendly and stable.
- Confirm public GET endpoints do not require auth.
- Confirm editing remains WordPress-admin only.
- If releasing, confirm the release zip contains `weekly-wildcat-headless/weekly-wildcat-headless.php`.
