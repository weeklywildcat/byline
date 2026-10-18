<?php
/** Versioned, public-only build inputs. Preparation belongs to the durable deploy job. */
if (!defined('ABSPATH')) { exit; }
const BYLINE_BUILD_SNAPSHOT_SCHEMA = 1;
const BYLINE_BUILD_SNAPSHOT_OPTION = 'byline_completed_build_snapshot_v1';
const BYLINE_BUILD_SNAPSHOT_SOURCE_OPTION = 'byline_build_snapshot_source_version';

function byline_snapshot_pick(array $value, array $fields): array
{
    return array_intersect_key($value, array_flip($fields));
}

function byline_snapshot_text($value): array
{
    return ['rendered' => (string) (is_array($value) ? ($value['rendered'] ?? '') : '')];
}

function byline_snapshot_photo($value): ?array
{
    return is_array($value) ? byline_snapshot_pick($value, ['id', 'url', 'alt', 'width', 'height']) : null;
}

function byline_snapshot_contributor(array $value): array
{
    $result = byline_snapshot_pick($value, ['type', 'id', 'name', 'displayName', 'slug', 'description', 'url', 'link', 'role', 'bio', 'imageId', 'hasProfilePage', 'status']);
    foreach (['links', 'socials', 'publicSocials'] as $field) {
        if (isset($value[$field]) && is_array($value[$field])) {
            // Guest domain links may be labelled records. They are already
            // sanitized by the canonical formatter; retain only public fields.
            $result[$field] = [];
            foreach ($value[$field] as $key => $link) {
                $result[$field][$key] = is_array($link) ? byline_snapshot_pick($link, ['label', 'service', 'url', 'href']) : (string) $link;
            }
        }
    }
    if (isset($value['profilePhoto'])) $result['profilePhoto'] = byline_snapshot_photo($value['profilePhoto']);
    foreach (['bylineProfile', 'weeklyWildcatProfile'] as $field) {
        if (!isset($value[$field]) || !is_array($value[$field])) continue;
        $profile = byline_snapshot_pick($value[$field], ['pronouns', 'role', 'shortBio', 'showInDirectory']);
        $profile['profilePhoto'] = byline_snapshot_photo($value[$field]['profilePhoto'] ?? null);
        // This explicitly public contact email is already rendered by author
        // pages. It is not the account's private user_email column.
        $profile['socials'] = byline_snapshot_pick((array) ($value[$field]['socials'] ?? []), ['website', 'email', 'instagram', 'tiktok', 'linkedin', 'x']);
        $result[$field] = $profile;
    }
    return $result;
}

function byline_snapshot_term($term): array
{
    $controller = new WP_REST_Terms_Controller($term->taxonomy);
    $request = new WP_REST_Request('GET');
    $request->set_param('context', 'view');
    $value = $controller->prepare_item_for_response($term, $request)->get_data();
    return byline_snapshot_pick($value, ['id', 'count', 'description', 'link', 'name', 'slug', 'taxonomy', 'parent']);
}

function byline_snapshot_media(int $id): ?array
{
    $post = get_post($id);
    if (!$post instanceof WP_Post || $post->post_type !== 'attachment' || $post->post_status !== 'inherit' || $post->post_password !== '') return null;
    // Only referenced media is passed here; do not export the media library.
    $controller = new WP_REST_Attachments_Controller('attachment');
    $request = new WP_REST_Request('GET');
    $request->set_param('context', 'view');
    $request->set_param('id', $id);
    $permission = $controller->get_item_permissions_check($request);
    if (is_wp_error($permission) || $permission !== true) return null;
    $data = $controller->prepare_item_for_response($post, $request)->get_data();
    $result = byline_snapshot_pick($data, ['id', 'date', 'slug', 'type', 'link', 'author', 'alt_text', 'media_type', 'mime_type', 'source_url']);
    foreach (['title', 'caption'] as $field) $result[$field] = byline_snapshot_text($data[$field] ?? []);
    $details = (array) ($data['media_details'] ?? []);
    $result['media_details'] = byline_snapshot_pick($details, ['width', 'height']);
    $result['media_details']['sizes'] = [];
    foreach ((array) ($details['sizes'] ?? []) as $name => $size) {
        $result['media_details']['sizes'][$name] = byline_snapshot_pick((array) $size, ['file', 'width', 'height', 'mime_type', 'source_url']);
    }
    $result['media_details']['image_meta'] = byline_snapshot_pick((array) ($details['image_meta'] ?? []), ['caption', 'copyright', 'credit']);
    foreach (['bylineImage', 'weeklyWildcatImage'] as $field) {
        $result[$field] = byline_snapshot_pick(wwh_rest_image_credit(['id' => $id]), ['creator', 'creditText', 'copyrightNotice', 'licenseUrl', 'acquireLicensePage']);
    }
    return $result;
}

function byline_snapshot_public_post($post): bool
{
    return $post instanceof WP_Post && $post->post_status === 'publish' && $post->post_password === '';
}

function byline_snapshot_post($post, array &$attachments): ?array
{
    if (!byline_snapshot_public_post($post)) return null;
    if ($post->post_type === 'page' && (byline_page_indexing_value(get_post_meta($post->ID, BYLINE_PAGE_INDEXING_META, true)) === 'internal'
        || $post->post_name === '78-2' || strtolower(trim(wp_strip_all_tags($post->post_title))) === 'cms notice')) return null;
    $controller = new WP_REST_Posts_Controller($post->post_type);
    $request = new WP_REST_Request('GET');
    $request->set_param('context', 'view');
    $data = $controller->prepare_item_for_response($post, $request)->get_data();
    $result = byline_snapshot_pick($data, ['id', 'date', 'date_gmt', 'modified', 'modified_gmt', 'slug', 'status', 'type', 'link', 'author', 'featured_media', 'categories', 'tags', 'sticky']);
    foreach (['title', 'excerpt', 'content'] as $field) $result[$field] = byline_snapshot_text($data[$field] ?? []);
    if ($post->post_type === 'page') {
        $result['bylinePage'] = byline_snapshot_pick((array) ($data['bylinePage'] ?? []), ['eyebrow', 'indexing', 'sportsArchive']);
    } else {
        $result['byline'] = $result['weeklyWildcat'] = byline_snapshot_pick(wwh_rest_post_settings(['id' => $post->ID]), ['primaryGameId', 'gameScoreGameIds', 'presentation', 'immersiveAlignment']);
        $result['contributors'] = array_map('byline_snapshot_contributor', byline_get_public_story_contributors($post->ID));
        $result['corrections'] = array_map(static fn($item) => byline_snapshot_pick($item, ['id', 'type', 'text', 'date']), byline_get_public_corrections($post->ID));
        // Core's canonical embed serializer, restricted to its public embed
        // context. No HTTP or REST dispatch back to this installation.
        $author = get_user_by('id', $post->post_author);
        $embedded_authors = [];
        if ($author instanceof WP_User) {
            $author_request = new WP_REST_Request('GET');
            $author_request->set_param('context', 'embed');
            $author_data = (new WP_REST_Users_Controller())->prepare_item_for_response($author, $author_request)->get_data();
            $embedded_author = byline_snapshot_contributor($author_data);
            if (isset($author_data['avatar_urls'])) $embedded_author['avatar_urls'] = $author_data['avatar_urls'];
            $embedded_authors[] = $embedded_author;
        }
        $terms = [];
        foreach (['category', 'post_tag'] as $taxonomy) {
            $items = wp_get_post_terms($post->ID, $taxonomy);
            if (is_wp_error($items)) throw new RuntimeException('Could not read public story terms.');
            $terms[] = array_map('byline_snapshot_term', $items);
        }
        $media_id = (int) ($result['featured_media'] ?? 0);
        $media = $media_id > 0 ? byline_snapshot_media($media_id) : null;
        if ($media) $attachments[$media_id] = $media;
        $result['_embedded'] = ['author' => $embedded_authors, 'wp:featuredmedia' => $media ? [$media] : [], 'wp:term' => $terms];
    }
    preg_match_all('/(?:wp-image-|"(?:id|mediaId)"\s*:\s*)(\d+)/', $post->post_content . $result['content']['rendered'], $matches);
    foreach (array_unique($matches[1]) as $id) {
        $media = byline_snapshot_media((int) $id);
        if ($media) $attachments[(int) $id] = $media;
    }
    return $result;
}

function byline_collect_public_build_snapshot(int $revision): array
{
    $actor = get_current_user_id();
    wp_set_current_user(0);
    try {
        // Initialize canonical registered REST fields for direct controller calls,
        // including cron/CLI execution where rest_api_init has not yet run.
        rest_get_server();
        $attachments = [];
        $datasets = ['posts' => [], 'authors' => [], 'guests' => [], 'categories' => [], 'tags' => [], 'pages' => [], 'corrections' => [], 'coverages' => [], 'schoolEvents' => [], 'attachments' => []];
        foreach (['post' => 'posts', 'page' => 'pages'] as $type => $key) {
            foreach (get_posts(['post_type' => $type, 'post_status' => 'publish', 'posts_per_page' => -1, 'orderby' => $type === 'page' ? 'menu_order' : 'date', 'order' => $type === 'page' ? 'ASC' : 'DESC']) as $post) {
                $value = byline_snapshot_post($post, $attachments);
                if ($value !== null) $datasets[$key][] = $value;
            }
        }
        $datasets['authors'] = array_map('byline_snapshot_contributor', wwh_rest_authors()->get_data());
        foreach (['category' => 'categories', 'post_tag' => 'tags'] as $taxonomy => $key) {
            $terms = get_terms(['taxonomy' => $taxonomy, 'hide_empty' => false, 'orderby' => 'name', 'order' => 'ASC']);
            if (is_wp_error($terms)) throw new RuntimeException('Could not read public terms.');
            $datasets[$key] = array_map('byline_snapshot_term', $terms);
        }
        foreach (get_posts(['post_type' => BYLINE_GUEST_POST_TYPE, 'post_status' => 'publish', 'posts_per_page' => -1, 'orderby' => 'title', 'order' => 'ASC']) as $post) {
            $guest = byline_get_public_guest_contributor($post->ID);
            if ($guest && !empty($guest['hasProfilePage'])) $datasets['guests'][] = byline_snapshot_contributor($guest);
        }
        // Iterate all published records, not the REST list endpoints' 50/100 limit.
        foreach (get_posts(['post_type' => BYLINE_COVERAGE_POST_TYPE, 'post_status' => 'publish', 'posts_per_page' => -1, 'orderby' => 'date', 'order' => 'DESC']) as $post) {
            $coverage = byline_get_public_coverage($post->ID);
            if ($coverage) {
                $safe = byline_snapshot_pick($coverage, ['id', 'slug', 'title', 'description', 'overview', 'startAt', 'endAt', 'status']);
                $safe['artwork'] = byline_snapshot_photo($coverage['artwork'] ?? null);
                $safe['stories'] = [];
                $public_ids = array_column($datasets['posts'], 'id');
                foreach ((array) ($coverage['stories'] ?? []) as $story) {
                    if (in_array((int) $story['id'], $public_ids, true)) $safe['stories'][] = byline_snapshot_pick($story, ['id', 'slug', 'title', 'url', 'excerpt', 'publishedAt', 'modifiedAt']);
                }
                $datasets['coverages'][] = $safe;
            }
        }
        foreach ($datasets['posts'] as $post) {
            foreach ($post['corrections'] as $correction) {
                $datasets['corrections'][] = array_merge($correction, ['storyId' => $post['id'], 'story' => ['id' => $post['id'], 'title' => wp_strip_all_tags($post['title']['rendered']), 'url' => $post['link'], 'slug' => $post['slug']]]);
            }
        }
        usort($datasets['corrections'], static fn($a, $b) => strcmp($b['date'], $a['date']));
        foreach (get_posts(['post_type' => WWH_SCHOOL_EVENT_POST_TYPE, 'post_status' => 'publish', 'posts_per_page' => -1, 'orderby' => 'meta_value', 'meta_key' => '_ww_event_start_datetime', 'order' => 'ASC']) as $post) {
            if (byline_snapshot_public_post($post)) {
                $event = wwh_format_school_event($post);
                $safe = byline_snapshot_pick($event, ['id', 'title', 'slug', 'eventType', 'startDate', 'endDate', 'allDay', 'location', 'description', 'externalUrl', 'status']);
                $safe['display'] = byline_snapshot_pick((array) ($event['display'] ?? []), ['date', 'time', 'status']);
                $datasets['schoolEvents'][] = $safe;
            }
        }
        foreach (array_merge($datasets['authors'], $datasets['guests']) as $person) {
            $id = (int) ($person['profilePhoto']['id'] ?? $person['bylineProfile']['profilePhoto']['id'] ?? 0);
            $media = $id > 0 ? byline_snapshot_media($id) : null;
            if ($media) $attachments[$id] = $media;
        }
        $datasets['attachments'] = array_values($attachments);
        $publication = byline_publication_response();
        $publication['revision'] = $revision;
        return ['schemaVersion' => BYLINE_BUILD_SNAPSHOT_SCHEMA, 'revision' => $revision, 'generatedAt' => gmdate(DATE_ATOM), 'sourceTimezone' => wp_timezone_string(), 'publication' => $publication, 'datasets' => $datasets, 'counts' => array_map('count', $datasets)];
    } finally {
        wp_set_current_user($actor);
    }
}

function byline_validate_public_build_snapshot(array $snapshot): void
{
    if (($snapshot['schemaVersion'] ?? 0) !== BYLINE_BUILD_SNAPSHOT_SCHEMA || !isset($snapshot['revision'], $snapshot['generatedAt'], $snapshot['sourceTimezone'], $snapshot['publication'], $snapshot['datasets'], $snapshot['counts'])
        || ($snapshot['publication']['revision'] ?? -1) !== $snapshot['revision']) throw new RuntimeException('Invalid public snapshot envelope.');
    foreach (['posts', 'authors', 'guests', 'categories', 'tags', 'pages', 'corrections', 'coverages', 'schoolEvents', 'attachments'] as $dataset) {
        if (!isset($snapshot['datasets'][$dataset]) || !is_array($snapshot['datasets'][$dataset]) || ($snapshot['counts'][$dataset] ?? -1) !== count($snapshot['datasets'][$dataset])) throw new RuntimeException('Missing or incomplete snapshot dataset: ' . $dataset);
    }
    foreach (array_merge($snapshot['datasets']['posts'], $snapshot['datasets']['pages']) as $post) {
        if (($post['status'] ?? '') !== 'publish' || !isset($post['id'], $post['slug'], $post['title']['rendered'], $post['content']['rendered'], $post['excerpt']['rendered'])) throw new RuntimeException('Invalid public snapshot content.');
    }
}

function byline_build_snapshot_location(): array
{
    $uploads = wp_upload_dir();
    if (!empty($uploads['error'])) throw new RuntimeException('Snapshot uploads directory is unavailable.');
    return ['path' => trailingslashit($uploads['basedir']) . 'byline-build-snapshots', 'url' => trailingslashit($uploads['baseurl']) . 'byline-build-snapshots'];
}

/** Testable atomic storage boundary; digest covers exact artifact bytes. */
function byline_store_build_snapshot(array $snapshot, string $directory, string $base_url, callable $revision_reader)
{
    $revision = (int) $snapshot['revision'];
    $json = wp_json_encode($snapshot, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if (!is_string($json) || json_decode($json, true) === null) throw new RuntimeException('Snapshot JSON encoding failed.');
    if (!is_dir($directory) && !wp_mkdir_p($directory)) throw new RuntimeException('Cannot create snapshot directory.');
    $digest = hash('sha256', $json);
    $filename = 'snapshot-v' . BYLINE_BUILD_SNAPSHOT_SCHEMA . '-r' . $revision . '-' . $digest . '.json';
    $temp = tempnam($directory, '.pending-');
    if ($temp === false) throw new RuntimeException('Cannot create snapshot temp file.');
    try {
        if (file_put_contents($temp, $json, LOCK_EX) !== strlen($json)) throw new RuntimeException('Incomplete snapshot write.');
        if ((int) $revision_reader() !== $revision) return new WP_Error('byline_snapshot_revision_race', 'Public content changed while preparing the snapshot; retry the latest revision.', ['retryable' => true]);
        if (!rename($temp, $directory . '/' . $filename)) throw new RuntimeException('Cannot atomically publish snapshot.');
        @chmod($directory . '/' . $filename, 0644);
        return ['schemaVersion' => BYLINE_BUILD_SNAPSHOT_SCHEMA, 'revision' => $revision, 'generatedAt' => $snapshot['generatedAt'], 'digest' => $digest, 'bytes' => strlen($json), 'url' => rtrim($base_url, '/') . '/' . $filename];
    } finally {
        if (is_file($temp)) unlink($temp);
    }
}

/** Both preparation and public pre-write hooks hold this database lock. */
function byline_snapshot_database_lock(bool $acquire, int $timeout = 0): bool
{
    global $wpdb;
    $name = 'byline-public-state-' . substr(hash('sha256', DB_NAME . ':' . $wpdb->options), 0, 32);
    return (int) $wpdb->get_var($wpdb->prepare($acquire ? 'SELECT GET_LOCK(%s, %d)' : 'SELECT RELEASE_LOCK(%s)', ...($acquire ? [$name, $timeout] : [$name]))) === 1;
}

/** Called only while the shared DB lock is held. No other writer can be active.
 * Leftover markers are interrupted requests, so give their settled DB state a
 * fresh revision before generation rather than labelling it with an older R. */
function byline_snapshot_stable_revision(): int
{
    if (isset($GLOBALS['byline_snapshot_writer'])) throw new RuntimeException('Public content is still being saved; retry snapshot preparation.');
    global $wpdb;
    $prefix = $wpdb->esc_like('byline_snapshot_writer_') . '%';
    $writers = $wpdb->get_results($wpdb->prepare("SELECT option_name FROM {$wpdb->options} WHERE option_name LIKE %s", $prefix));
    if ($writers) {
        foreach ($writers as $writer) delete_option($writer->option_name);
        $revision = byline_bump_public_content_revision();
        byline_deployment_record_expected_revision($revision);
    }
    return byline_public_content_revision();
}

function byline_build_snapshot_source_version(): string
{
    return BYLINE_BUILD_SNAPSHOT_SCHEMA . ':' . BYLINE_PLUGIN_VERSION . ':' . (string) ($GLOBALS['wp_version'] ?? '');
}

function byline_prepare_build_snapshot(int $required_revision = 0)
{
    try {
        $location = byline_build_snapshot_location();
        if (!is_dir($location['path']) && !wp_mkdir_p($location['path'])) throw new RuntimeException('Cannot create snapshot directory.');
        // One generator/pruner at a time. OS releases the lock after crashes.
        $lock = fopen($location['path'] . '/.prepare.lock', 'c');
        if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) {
            if (is_resource($lock)) fclose($lock);
            return new WP_Error('byline_snapshot_busy', 'Another build snapshot is being prepared.', ['retryable' => true]);
        }
        $database_locked = false;
        $preparation_started = microtime(true);
        try {
            if (isset($GLOBALS['byline_snapshot_writer']) || !byline_snapshot_database_lock(true)) throw new RuntimeException('A public writer is active; retry snapshot preparation.');
            $database_locked = true;
            $revision = byline_snapshot_stable_revision();
            $source_version = byline_build_snapshot_source_version();
            if (get_option(BYLINE_BUILD_SNAPSHOT_SOURCE_OPTION, '') !== $source_version) {
                // A renderer/Core upgrade can change canonical HTML without a
                // post save. It must not reuse the previous revision's body.
                $revision = byline_bump_public_content_revision();
                byline_deployment_record_expected_revision($revision);
                update_option(BYLINE_BUILD_SNAPSHOT_SOURCE_OPTION, $source_version, false);
                if (get_option(BYLINE_BUILD_SNAPSHOT_SOURCE_OPTION, '') !== $source_version) throw new RuntimeException('Could not record the snapshot producer version.');
            }
            if ($revision < $required_revision) throw new RuntimeException('Public revision is behind the deployment requirement.');
            $previous = get_option(BYLINE_BUILD_SNAPSHOT_OPTION, []);
            $previous_file = $location['path'] . '/' . basename((string) ($previous['url'] ?? ''));
            if (($previous['schemaVersion'] ?? 0) === BYLINE_BUILD_SNAPSHOT_SCHEMA && (int) ($previous['revision'] ?? -1) === $revision && is_file($previous_file)
                && filesize($previous_file) === (int) $previous['bytes'] && hash_file('sha256', $previous_file) === $previous['digest']) return $previous;
            // This PHP request may have primed content/options before another
            // writer advanced R. Drop runtime caches before canonical reads.
            $flushed = function_exists('wp_cache_flush_runtime') ? wp_cache_flush_runtime() : wp_cache_flush();
            if ($flushed === false) throw new RuntimeException('Could not refresh the WordPress runtime cache for snapshot generation.');
            $snapshot = byline_collect_public_build_snapshot($revision);
            byline_validate_public_build_snapshot($snapshot);
            $result = byline_store_build_snapshot($snapshot, $location['path'], $location['url'], 'byline_snapshot_stable_revision');
            if (is_wp_error($result)) return $result;
            // A mutation between rename and pointer promotion cannot advertise
            // mixed state; immutable file is harmless and pruned on a later run.
            if (byline_snapshot_stable_revision() !== $revision) return new WP_Error('byline_snapshot_revision_race', 'Public content changed before snapshot promotion.', ['retryable' => true]);
            $result['preparationMs'] = round((microtime(true) - $preparation_started) * 1000, 2);
            update_option(BYLINE_BUILD_SNAPSHOT_OPTION, $result, false);
            $saved = get_option(BYLINE_BUILD_SNAPSHOT_OPTION, []);
            if (($saved['digest'] ?? '') !== $result['digest'] || ($saved['revision'] ?? -1) !== $revision || ($saved['bytes'] ?? -1) !== $result['bytes']) throw new RuntimeException('Could not promote the completed snapshot pointer.');
            // Serving hosts that honor .htaccess get immutable artifact caching.
            // The REST pointer always has no-store independently of this file.
            file_put_contents($location['path'] . '/.htaccess', "<IfModule mod_headers.c>\n<FilesMatch \"^snapshot-v[0-9]+-r[0-9]+-[a-f0-9]+\\.json$\">\nHeader set Cache-Control \"public, max-age=31536000, immutable\"\n</FilesMatch>\n</IfModule>\n");
            $files = glob($location['path'] . '/snapshot-v*-r*-*.json') ?: [];
            usort($files, static fn($a, $b) => filemtime($b) <=> filemtime($a));
            // Retain four artifacts and a one-day reader grace period. A hard
            // bound also prevents rapid revision storms growing storage forever.
            foreach (glob($location['path'] . '/.pending-*') ?: [] as $pending) {
                if (filemtime($pending) < time() - 3600) unlink($pending);
            }
            foreach (array_slice($files, 4) as $index => $file) {
                if ($file !== $location['path'] . '/' . basename($result['url']) && (filemtime($file) < time() - DAY_IN_SECONDS || $index >= 16)) unlink($file);
            }
            return $result;
        } finally {
            if ($database_locked) byline_snapshot_database_lock(false);
            flock($lock, LOCK_UN);
            fclose($lock);
        }
    } catch (Throwable $error) {
        return new WP_Error('byline_snapshot_preparation_failed', 'Public build snapshot preparation failed: ' . $error->getMessage(), ['retryable' => true]);
    }
}

function byline_rest_build_snapshot()
{
    $pointer = get_option(BYLINE_BUILD_SNAPSHOT_OPTION, []);
    if (get_option(BYLINE_BUILD_SNAPSHOT_SOURCE_OPTION, '') !== byline_build_snapshot_source_version() || ($pointer['schemaVersion'] ?? 0) !== BYLINE_BUILD_SNAPSHOT_SCHEMA || (int) ($pointer['revision'] ?? -1) !== byline_public_content_revision()) {
        $response = new WP_REST_Response(['code' => 'byline_snapshot_not_ready', 'message' => 'No completed snapshot for the current public revision. Retry the deployment job.'], 503);
    } else {
        $response = new WP_REST_Response($pointer);
    }
    $response->header('Cache-Control', 'no-store, max-age=0');
    return $response;
}
add_action('rest_api_init', static function (): void {
    register_rest_route(BYLINE_REST_NAMESPACE, '/build-snapshot', ['methods' => 'GET', 'callback' => 'byline_rest_build_snapshot', 'permission_callback' => '__return_true']);
});

if (defined('WP_CLI') && WP_CLI && class_exists('WP_CLI')) {
    class Byline_Build_Snapshot_CLI_Command
    {
        /** Prepare a completed snapshot without sending a deploy hook. */
        public function prepare(array $args, array $assoc_args): void
        {
            $result = byline_prepare_build_snapshot(isset($assoc_args['revision']) ? (int) $assoc_args['revision'] : 0);
            if (is_wp_error($result)) { WP_CLI::error($result->get_error_message()); return; }
            WP_CLI::line((string) wp_json_encode($result));
        }
        public function status(): void
        {
            WP_CLI::line((string) wp_json_encode(['publicRevision' => byline_public_content_revision(), 'snapshot' => get_option(BYLINE_BUILD_SNAPSHOT_OPTION, null)]));
        }
    }
    WP_CLI::add_command('byline build-snapshot', 'Byline_Build_Snapshot_CLI_Command');
}
