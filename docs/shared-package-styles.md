# Shared package style contract

Byline's production homepage and WordPress Studio render the same resolved
package models with the same React renderers. Their presentation is canonical
only when both hosts also load
`@byline/theme-weekly-wildcat/styles.css` inside an explicit
`.byline-publication-preview` surface.

## Selector inventory

| Renderer | Emitted selector contract | Canonical dependencies |
| --- | --- | --- |
| `LeadPackage` | `byline-package-empty-state`, `top-stories`, `top-stories-single`, `top-stories-layout`, `live-lead`, `top-stories-rail`, `top-stories-left-rail`, `right-now-list` | Empty-result treatment, three-column desktop grid, lead/rail ordering, rail height/overflow behavior, and 1040/900/640px collapse rules. The package-specific empty-state class intentionally remains distinct from app-page `.empty-state` UI. |
| `StoryCard` | `home-story`, `home-story-{lead,briefing,brief-lead,row,focus,opinion,opinion-lead,field,grid,more-lead,more-compact,special,athlete}`, `home-story-homepage-opinion`, `home-story-no-image`, `home-story-image`, `home-story-body`, `home-story-meta`, `home-story-category`, `home-story-deck`, `home-story-author`, `home-story-read-link` | Shared image sizing/object-fit, metadata separators, headline/deck/byline typography, variant grids and responsive reductions. `home-story-grid` intentionally inherits the base card contract and has no separate legacy rule. |
| `PollCard` and its host-supplied body | `homepage-poll-card`, `homepage-poll-heading`, `homepage-poll-question`, `homepage-poll-options`, `homepage-poll-results`, `homepage-poll-result`, `homepage-poll-bar`, `homepage-poll-bar-fill`, `homepage-poll-bar-fill-leading`, `homepage-poll-total`, `homepage-poll-note`, `homepage-poll-loading` | Card surface, form controls, result bars, compact UI typography and accent colors. |
| `ThisWeekCard` | `this-week-card`, `this-week-header`, `this-week-list`, `this-week-item`, `this-week-type`, `this-week-type-{event,game}`, `this-week-empty`, `this-week-links` | Rail sizing/overflow, event rows, type labels and responsive behavior. |
| `SportsPackage` | `from-field`, `section-header-row`, `field-layout`, `field-rail` | Section heading treatment, lead/rail grid and 900px collapse. |
| Athlete spotlight | `sports-athlete-feature`, `sports-athlete-image`, `sports-athlete-body`, `sports-athlete-eyebrow`, `sports-athlete-team`, `sports-athlete-blurb`, `sports-athlete-link` | Spotlight image crop, display headline, labels, body copy and link treatment. |
| Scores | `field-schedule`, `field-schedule-header`, `field-schedule-layout`, `field-schedule-layout-{1,2}`, `field-schedule-result`, `field-result-list`, `field-result-card`, `field-result-summary`, `field-card-label`, `field-sport-icon`, `field-scoreboard`, `field-score-team`, `field-score-team-winner`, `field-result-footer`, `field-game-link` | Schedule rules, result grids, score typography, winner color and mobile stacking. |
| Upcoming games | `field-schedule-upcoming`, `field-game-list`, `field-upcoming-game`, `field-upcoming-date`, `field-upcoming-main`, `field-upcoming-empty` | Fixture row grid, date divider, empty state and 640px single-column layout. |

The shared file also owns the legacy homepage containers required by the other
`StoryCard` variants (`the-brief`, `in-focus`, `special-coverage`,
`athlete-spotlight`, `opinion-package`, and `more-weekly`). This keeps each
shared card selector canonical while those packages finish moving into the
shared renderer layer.

## Base contract and tokens

The publication scope owns a local box-sizing reset, inherited link treatment,
responsive images, page/text colors and body font. These rules are deliberately
scoped; they do not target `body`, bare `a`, bare `img`, headings, WordPress
admin, or Puck controls.

Theme variants key off the same surface's `data-theme` attribute. They do not
depend on an attribute on the outer `html` element, which would be absent from
Puck's isolated preview document.

Presentation consumes the variables produced by
`themeTokensToCssVariables`: `--page`, `--paper`, `--ink`, `--muted`,
`--soft-muted`, `--accent`, `--accent-dark`, `--link`, `--rule`,
`--rule-strong`, `--max-width`, and the display/headline/body/UI/serif font
families. Weekly Wildcat's Adobe font stylesheet comes from the theme
definition's `stylesheets` list and is loaded by both hosts.

Responsive package behavior remains at the established 1040px, 900px, and
640px breakpoints.

## Puck iframe loading

Studio intentionally keeps `syncHostStyles: false`; mirroring the WordPress
host document would bring admin CSS into the canvas. Puck's supported
`overrides.iframe` callback provides the iframe `document`. Studio uses a React
portal to place the built shared stylesheet and theme font links in that
document's head, while the rendered root supplies the publication scope,
selected `data-theme`, and token variables.
