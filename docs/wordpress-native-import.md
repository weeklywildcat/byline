# Native WordPress content import

The production WordPress site remains authoritative until cutover. This importer
is a one-time, idempotent migration path for the existing simple Weekly Wildcat
archive. It creates real Payload records and real Byline Lexical bodies; it does
not use `legacy-html`.

## 1. Export WordPress read-only

From the Docker host, with this repository checked out at `/opt/byline/src`:

```sh
cd /opt/byline/src
docker exec -i weeklywildcat-wordpress php \
  < migration/export-wordpress-native.php \
  > /opt/byline/wordpress-native.json
```

The PHP script loads WordPress, uses Core's Gutenberg parser and the installed
Byline helpers, and never writes WordPress. Its JSON contains posts, ordered
contributors, People profile facts, taxonomy, corrections and only the Media
attachments referenced by those records.

The converter accepts the audited archive vocabulary: paragraphs, H2/H3,
ordered/unordered lists, images, galleries, files/PDFs, Media & Text, YouTube
embeds, quotes, the old Byline correction-notice block, and the audited
Datawrapper `core/html` embed. Other raw HTML or unknown Gutenberg blocks are
export errors and make the importer refuse to run; it never silently drops them
or stores them as legacy HTML.
Non-YouTube embeds become normal links and are listed for review.

## 2. Dry run

Pass the export into the one-shot newsroom container with Compose's `-v`
flag; no permanent Compose edit is needed.

WordPress user 1 is Gibson. His Person already exists in Payload, so explicitly
map that identity instead of creating a duplicate. The target may be a Payload
Person ID or slug:

```sh
cd /opt/byline
docker compose run --rm \
  -v /opt/byline/wordpress-native.json:/migration/wordpress-native.json:ro \
  newsroom \
  npm run import:wordpress --workspace @byline/newsroom -- \
  --file /migration/wordpress-native.json \
  --map-person 1:gibson
```

Dry-run is the default. It checks existing legacy IDs and slug collisions,
verifies every Story's Media references, reports create/reuse/update counts and
lists records needing review. It does not download files or write PostgreSQL.

If Gibson's current Byline slug is not `gibson`, use the Person's numeric
Payload ID instead.

## 3. Apply

After reviewing the dry-run output:

```sh
cd /opt/byline
docker compose run --rm \
  -v /opt/byline/wordpress-native.json:/migration/wordpress-native.json:ro \
  newsroom \
  npm run import:wordpress --workspace @byline/newsroom -- \
  --file /migration/wordpress-native.json \
  --map-person 1:gibson \
  --apply
```

The importer:

- downloads only referenced HTTPS WordPress Media and creates private Payload
  Media with their metadata and `legacyWordPressId`;
- creates WordPress users and guest contributors as People only, never login
  accounts;
- reuses the explicitly mapped existing Person for Gibson;
- creates/reuses Sections and Topics by legacy ID or slug;
- converts every Story to `contentFormat: byline-v1` and stores native Lexical
  JSON;
- preserves published/draft state, original published timestamp, slug, deck,
  ordered byline, featured Media/caption, story format/video, reporting note
  and presentation;
- converts structured and old inline correction notices to first-class
  Corrections;
- suppresses per-record public revision churn during the controlled import and
  records one public mutation/snapshot request when the import finishes.

Reruns are idempotent: imported objects are found through `legacyWordPressId`
(`legacyGuestId` for old guest records), while Stories are updated from the
export rather than duplicated.

## 4. After apply

Let the Media worker finish preparing imported images/PDFs before relying on a
Payload snapshot for public builds:

```sh
docker compose run --rm newsroom npm run publication-media:requeue --workspace @byline/newsroom
docker compose up -d media-worker publication-worker
```

Then inspect several representative Stories in Byline (plain prose, gallery,
Datawrapper, PDF, YouTube, correction) and compare their public paths and
article rendering with WordPress. Do not retire or delete WordPress as part of
this import.
