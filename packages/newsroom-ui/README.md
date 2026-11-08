# @byline/newsroom-ui

The one Byline newsroom design system (shadcn **base-nova**, neutral, Tailwind 4),
shared by every staff-facing surface: the WordPress admin screens while they
exist, and the Payload newsroom (`apps/newsroom`).

- `ui/*` — generated shadcn primitives. Regenerate with the shadcn CLI
  (`wordpress-plugin/components.json` points here); do not restyle by hand.
- `components/*` — Byline compositions with no CMS knowledge (avatars, status
  badges, inline alerts, the `AdminRoot` portal/tooltip/toast boundary).
- `styles.css` — the theme. Consumers import it and compile it with
  `@tailwindcss/postcss` followed by `@byline/newsroom-ui/postcss-scope`, which
  prefixes every selector with `.byline-ui-root` so nothing leaks into WordPress
  or Payload chrome. There is no Preflight.

Anything that knows about WordPress or Payload data belongs in its app, not here.
