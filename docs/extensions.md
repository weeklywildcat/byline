# Byline extension contract

Level 3 extensions are trusted, administrator-installed code. They are never
stored in publication settings or design documents as arbitrary HTML, CSS,
JavaScript, or PHP.

## Themes and blocks

Frontend packages use `defineBylineTheme()` and `defineBylineExtension()` from
`@byline/theme-contract`. Third-party block IDs must be vendor-namespaced, for
example `schoolpress/weather-card`. An extension package supplies the production
React renderer, Studio definition/default props, supported variants, and any
optional feature dependency. The same package must be installed in the web build
and the Studio admin build so preview and production rendering remain identical.

WordPress integrations expose these stable filters:

- `byline_theme_ids` adds installed theme IDs accepted by publication settings;
- `byline_design_templates` adds saved template IDs;
- `byline_design_block_ids` adds vendor block IDs accepted by design validation;
- `byline_design_block_feature` maps an extension block to an optional module.

Filters only expand the allowlists. They do not supply executable code to the
browser. The extension's normal build/install process must enqueue its trusted
Studio bundle and include its renderer package in the static frontend.

## Compatibility rules

- Theme and design API versions are checked through the Byline protocol manifest.
- Removing an extension must not silently rewrite published design documents.
- Unknown or disabled blocks are rejected on write and omitted with a warning by
  public rendering, never interpreted as raw markup.
- Secrets stay in protected WordPress options or service environments and may not
  enter extension props, publication responses, design exports, or diagnostics.
