# Byline architecture

Payload and PostgreSQL are the source of truth for the private newsroom. Astro renders the public Weekly Wildcat site as static files. The two apps exchange a validated public snapshot.

```text
Payload + PostgreSQL
  → publication revision and snapshot job
  → immutable Snapshot v2 and prepared media
  → Astro prerender and export verification
  → static hosting
```

## Private newsroom

Payload owns authentication, access checks, drafts, versions, locking, scheduled publication, and jobs. Byline supplies the reporting, planning, editing, and publishing interfaces. Story plans are stored separately from versioned story copy so assignments and deadlines survive restores. Media originals are private; media workers prepare content-addressed public renditions on a separate volume.

A committed public change advances the publication revision. The publication worker collects only allowed public fields, validates them, and promotes a snapshot if the revision is still current. If a deploy hook is configured, the worker requests a fresh build after promotion. See [snapshot operations](payload-build-snapshots.md).

## Public site

Astro acquires the snapshot over a build-only API and renders from a local file. After rendering, the build materializes the exact media named by the snapshot and verifies its routes, assets, redirects, sitemaps, and metadata. The site serves static files, including live coverage feeds updated on deployment. Poll blocks can show choices and released results; public vote submission is unavailable.

`@byline/content` defines the public data contract; `@byline/article-body` defines the semantic article body. [Byline Data](byline-data.md) adds datasets the newsroom keeps and reader-facing projects: an editor's Publish makes an immutable release, the snapshot names the releases published projects use, and the build verifies and materializes them before rendering `/data/<slug>/`. The newsroom preview and Astro share the article renderer and story presentation registry. The Weekly Wildcat theme defines the homepage layout in code; editors can place published stories into its existing slots in the [Front Page desk](front-page.md).

The public site never receives planning, source material, staff accounts, private media, deploy hooks, or build credentials.
