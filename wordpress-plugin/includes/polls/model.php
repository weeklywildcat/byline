<?php

/**
 * Byline poll domain model: identifiers, answer options, lifecycle, schedule,
 * active-poll selection, and the shapes the REST layer publishes.
 */

if (!defined('ABSPATH')) {
    exit;
}

const BYLINE_POLL_MAX_OPTIONS = 20;
const BYLINE_POLL_MAX_OPTION_LABEL = 200;
const BYLINE_POLL_MAX_QUESTION = 300;
const BYLINE_POLL_ID_MAX_LENGTH = 64;

/**
 * Opaque identifiers. Poll and option ids are generated, never derived from a
 * label, so editing or reordering wording can never move a vote.
 */
function byline_poll_generate_id(string $prefix): string
{
    return $prefix . bin2hex(random_bytes(4));
}

function byline_poll_generate_option_id(array $taken = []): string
{
    do {
        $id = byline_poll_generate_id('opt_');
    } while (in_array($id, $taken, true));

    return $id;
}

/**
 * The stable public poll id, minted on first use and then immutable.
 */
function byline_poll_public_id(int $post_id): string
{
    $existing = (string) get_post_meta($post_id, BYLINE_POLL_ID_META, true);
    if ($existing !== '') {
        return $existing;
    }

    do {
        $candidate = byline_poll_generate_id('poll_');
    } while (byline_poll_find_post_by_public_id($candidate) instanceof WP_Post);

    update_post_meta($post_id, BYLINE_POLL_ID_META, $candidate);

    return $candidate;
}

function byline_poll_sanitize_public_id($value): string
{
    if (!is_string($value)) {
        return '';
    }

    $value = trim($value);
    if ($value === '' || strlen($value) > BYLINE_POLL_ID_MAX_LENGTH) {
        return '';
    }

    return preg_match('/^[A-Za-z0-9_-]+$/', $value) === 1 ? $value : '';
}

function byline_poll_find_post_by_public_id(string $poll_id): ?WP_Post
{
    $poll_id = byline_poll_sanitize_public_id($poll_id);
    if ($poll_id === '') {
        return null;
    }

    $posts = get_posts([
        'post_type' => BYLINE_POLL_POST_TYPE,
        'post_status' => 'any',
        'numberposts' => 1,
        'meta_key' => BYLINE_POLL_ID_META,
        'meta_value' => $poll_id,
        'orderby' => 'ID',
        'order' => 'ASC',
        'suppress_filters' => false,
    ]);

    return isset($posts[0]) && $posts[0] instanceof WP_Post ? $posts[0] : null;
}

/**
 * Normalise an answer set.
 *
 * Ids are preserved verbatim when supplied, generated when absent, and never
 * recomputed from labels. Positions are re-numbered from the submitted order so
 * reordering is a pure position change.
 *
 * @param mixed $raw
 * @return array<int,array<string,mixed>>
 */
function byline_poll_normalize_options($raw): array
{
    if (!is_array($raw)) {
        return [];
    }

    $rows = [];
    $index = 0;
    foreach ($raw as $entry) {
        if (!is_array($entry)) {
            continue;
        }

        $label = sanitize_text_field((string) ($entry['label'] ?? ''));
        if ($label === '') {
            continue;
        }

        $rows[] = [
            'id' => byline_poll_sanitize_public_id($entry['id'] ?? ''),
            'label' => byline_poll_truncate($label, BYLINE_POLL_MAX_OPTION_LABEL),
            'position' => isset($entry['position']) && is_numeric($entry['position']) ? (float) $entry['position'] : (float) $index,
            'sequence' => $index,
        ];
        $index++;
    }

    usort($rows, static function (array $left, array $right): int {
        if ($left['position'] === $right['position']) {
            return $left['sequence'] <=> $right['sequence'];
        }

        return $left['position'] <=> $right['position'];
    });

    $options = [];
    $taken = [];
    foreach (array_slice($rows, 0, BYLINE_POLL_MAX_OPTIONS) as $position => $row) {
        $id = $row['id'] !== '' && !in_array($row['id'], $taken, true) ? $row['id'] : byline_poll_generate_option_id($taken);
        $taken[] = $id;
        $options[] = [
            'id' => $id,
            'label' => $row['label'],
            'position' => (int) $position,
        ];
    }

    return $options;
}

function byline_poll_truncate(string $value, int $limit): string
{
    return strlen($value) > $limit ? rtrim(substr($value, 0, $limit)) : $value;
}

/**
 * @return array<int,array<string,mixed>>
 */
function byline_poll_options(int $post_id): array
{
    return byline_poll_normalize_options(get_post_meta($post_id, BYLINE_POLL_OPTIONS_META, true));
}

/**
 * @param array<int,array<string,mixed>> $options
 * @return array<int,array<string,mixed>>
 */
function byline_poll_set_options(int $post_id, array $options): array
{
    $normalized = byline_poll_normalize_options($options);
    update_post_meta($post_id, BYLINE_POLL_OPTIONS_META, $normalized);

    return $normalized;
}

/**
 * Reconcile a submitted answer set against the stored one.
 *
 * Removing an answer that already has votes is refused rather than silently
 * destroying history or remapping those votes onto a different answer. Labels
 * and order may always change.
 *
 * @param array<int,array<string,mixed>> $existing
 * @param array<int,array<string,mixed>> $submitted
 * @return array{options:array<int,array<string,mixed>>,blocked:array<int,string>}
 */
function byline_poll_merge_options(string $poll_id, array $existing, array $submitted): array
{
    $submitted = byline_poll_normalize_options($submitted);
    $submitted_ids = array_column($submitted, 'id');
    $blocked = [];

    foreach ($existing as $option) {
        $id = (string) ($option['id'] ?? '');
        if ($id === '' || in_array($id, $submitted_ids, true)) {
            continue;
        }

        if (byline_poll_votes_table_exists() && byline_poll_option_vote_count($poll_id, $id) > 0) {
            $submitted[] = ['id' => $id, 'label' => (string) ($option['label'] ?? $id), 'position' => count($submitted)];
            $blocked[] = (string) ($option['label'] ?? $id);
        }
    }

    return ['options' => byline_poll_normalize_options($submitted), 'blocked' => $blocked];
}

/**
 * Domain status.
 *
 * WordPress's own lifecycle is used where it helps -- an unpublished or trashed
 * poll can never be open -- but the voting state is its own value so a poll can
 * be published while still scheduled, closed, or drafted.
 */
function byline_poll_status(int $post_id): string
{
    $post = get_post($post_id);
    if (!$post instanceof WP_Post || $post->post_status !== 'publish') {
        return BYLINE_POLL_STATUS_DRAFT;
    }

    return byline_poll_sanitize_status(get_post_meta($post_id, BYLINE_POLL_STATUS_META, true));
}

function byline_poll_sanitize_status($value): string
{
    $value = is_string($value) ? $value : '';

    return in_array($value, [BYLINE_POLL_STATUS_OPEN, BYLINE_POLL_STATUS_CLOSED], true)
        ? $value
        : BYLINE_POLL_STATUS_DRAFT;
}

function byline_poll_set_status(int $post_id, string $status): string
{
    $status = byline_poll_sanitize_status($status);
    update_post_meta($post_id, BYLINE_POLL_STATUS_META, $status);

    return byline_poll_status($post_id);
}

/**
 * Schedules are stored as UTC 'Y-m-d H:i:s', matching WordPress's own *_gmt
 * columns, so every comparison in this plugin is UTC against UTC and never
 * mixes a local wall clock into the check.
 */
function byline_poll_normalize_utc_datetime($value): string
{
    if (!is_string($value)) {
        return '';
    }

    $value = trim($value);
    if ($value === '' || $value === '0000-00-00 00:00:00') {
        return '';
    }

    try {
        $date = new DateTimeImmutable($value, new DateTimeZone('UTC'));
    } catch (Exception $exception) {
        return '';
    }

    return $date->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s');
}

function byline_poll_local_input_to_utc($value): string
{
    if (!is_string($value) || trim($value) === '') {
        return '';
    }

    try {
        $date = new DateTimeImmutable(trim($value), byline_poll_site_timezone());
    } catch (Exception $exception) {
        return '';
    }

    return $date->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s');
}

function byline_poll_utc_to_local_input(string $utc): string
{
    $utc = byline_poll_normalize_utc_datetime($utc);
    if ($utc === '') {
        return '';
    }

    try {
        $date = new DateTimeImmutable($utc, new DateTimeZone('UTC'));
    } catch (Exception $exception) {
        return '';
    }

    return $date->setTimezone(byline_poll_site_timezone())->format('Y-m-d\TH:i');
}

function byline_poll_site_timezone(): DateTimeZone
{
    if (function_exists('wp_timezone')) {
        $timezone = wp_timezone();
        if ($timezone instanceof DateTimeZone) {
            return $timezone;
        }
    }

    return new DateTimeZone('UTC');
}

/**
 * @return array{opensAt:string,closesAt:string}
 */
function byline_poll_schedule(int $post_id): array
{
    return [
        'opensAt' => byline_poll_normalize_utc_datetime(get_post_meta($post_id, BYLINE_POLL_OPENS_AT_META, true)),
        'closesAt' => byline_poll_normalize_utc_datetime(get_post_meta($post_id, BYLINE_POLL_CLOSES_AT_META, true)),
    ];
}

function byline_poll_set_schedule(int $post_id, $opens_at, $closes_at): array
{
    update_post_meta($post_id, BYLINE_POLL_OPENS_AT_META, byline_poll_normalize_utc_datetime($opens_at));
    update_post_meta($post_id, BYLINE_POLL_CLOSES_AT_META, byline_poll_normalize_utc_datetime($closes_at));

    return byline_poll_schedule($post_id);
}

/**
 * @return array<string,mixed>
 */
function byline_poll_record(WP_Post $post): array
{
    $schedule = byline_poll_schedule((int) $post->ID);

    return [
        'postId' => (int) $post->ID,
        'id' => byline_poll_public_id((int) $post->ID),
        'question' => byline_poll_truncate((string) $post->post_title, BYLINE_POLL_MAX_QUESTION),
        'status' => byline_poll_status((int) $post->ID),
        'postStatus' => (string) $post->post_status,
        'opensAt' => $schedule['opensAt'],
        'closesAt' => $schedule['closesAt'],
        'options' => byline_poll_options((int) $post->ID),
        'createdAt' => byline_poll_normalize_utc_datetime((string) $post->post_date_gmt),
        'modifiedAt' => byline_poll_normalize_utc_datetime((string) $post->post_modified_gmt),
        'authorId' => (int) $post->post_author,
    ];
}

/**
 * Voting window, evaluated server-side. Mirrors the retired SQL exactly:
 * opens_at is inclusive and closes_at is exclusive.
 *
 * @param array<string,mixed> $record
 */
function byline_poll_record_is_open(array $record, ?string $now = null): bool
{
    if (($record['status'] ?? '') !== BYLINE_POLL_STATUS_OPEN) {
        return false;
    }

    $now = $now !== null && $now !== '' ? byline_poll_normalize_utc_datetime($now) : byline_poll_now_utc();
    $opens_at = (string) ($record['opensAt'] ?? '');
    $closes_at = (string) ($record['closesAt'] ?? '');

    if ($opens_at !== '' && $opens_at > $now) {
        return false;
    }

    return $closes_at === '' || $closes_at > $now;
}

/**
 * @param array<string,mixed> $record
 */
function byline_poll_effective_open_time(array $record): string
{
    $opens_at = (string) ($record['opensAt'] ?? '');

    return $opens_at !== '' ? $opens_at : (string) ($record['createdAt'] ?? '');
}

/**
 * The single poll the publication is currently showing.
 *
 * Preserved behavior: only polls whose domain status is open and whose window
 * currently contains "now" qualify, and the newest qualifying poll wins.
 *
 * @return array<string,mixed>|null
 */
function byline_poll_active_record(?string $now = null): ?array
{
    if (!byline_poll_feature_enabled()) {
        return null;
    }

    $posts = get_posts([
        'post_type' => BYLINE_POLL_POST_TYPE,
        'post_status' => 'publish',
        'numberposts' => 50,
        'orderby' => 'date',
        'order' => 'DESC',
        'meta_key' => BYLINE_POLL_STATUS_META,
        'meta_value' => BYLINE_POLL_STATUS_OPEN,
        'suppress_filters' => false,
    ]);

    $records = [];
    foreach (is_array($posts) ? $posts : [] as $post) {
        if (!$post instanceof WP_Post) {
            continue;
        }

        $record = byline_poll_record($post);
        if (byline_poll_record_is_open($record, $now) && $record['options'] !== []) {
            $records[] = $record;
        }
    }

    usort($records, static function (array $left, array $right): int {
        $comparison = strcmp(byline_poll_effective_open_time($right), byline_poll_effective_open_time($left));
        if ($comparison !== 0) {
            return $comparison;
        }

        return strcmp((string) $right['createdAt'], (string) $left['createdAt']);
    });

    return $records[0] ?? null;
}

/**
 * Public poll payload.
 *
 * Results are withheld entirely until the response threshold is met: not just
 * the per-answer counts but the running total, which would otherwise let anyone
 * watch a small poll fill up one vote at a time. Below the threshold the
 * response is `resultsAvailable: false` with every count, including the total,
 * reported as 0.
 *
 * The suppression lives here rather than in the widget, so an unauthenticated
 * caller cannot skip the UI and read low-count results straight from the API.
 * `resultsAvailable` is the authoritative signal for clients; the counts carry
 * no information while it is false.
 *
 * @param array<string,mixed> $record
 * @return array<string,mixed>
 */
function byline_poll_public_payload(array $record): array
{
    $poll_id = (string) $record['id'];
    $total = byline_poll_vote_total($poll_id);
    $available = $total >= BYLINE_POLL_MIN_RESULTS_VOTES;
    $counts = $available ? byline_poll_option_vote_counts($poll_id) : [];

    $options = [];
    foreach ($record['options'] as $option) {
        $options[] = [
            'id' => (string) $option['id'],
            'label' => (string) $option['label'],
            'votes' => $available ? (int) ($counts[(string) $option['id']] ?? 0) : 0,
        ];
    }

    return [
        'id' => $poll_id,
        'question' => (string) $record['question'],
        'options' => $options,
        'totalVotes' => $available ? $total : 0,
        'resultsAvailable' => $available,
    ];
}

/**
 * Full results for an authenticated editor. Never suppressed, and never
 * includes voter keys.
 *
 * @param array<string,mixed> $record
 * @return array<string,mixed>
 */
function byline_poll_admin_results(array $record): array
{
    $poll_id = (string) $record['id'];
    $total = byline_poll_vote_total($poll_id);
    $counts = byline_poll_option_vote_counts($poll_id);

    $options = [];
    foreach ($record['options'] as $option) {
        $votes = (int) ($counts[(string) $option['id']] ?? 0);
        $options[] = [
            'id' => (string) $option['id'],
            'label' => (string) $option['label'],
            'votes' => $votes,
            'percentage' => $total > 0 ? round(($votes / $total) * 100, 1) : 0.0,
        ];
    }

    return [
        'id' => $poll_id,
        'postId' => (int) $record['postId'],
        'question' => (string) $record['question'],
        'status' => (string) $record['status'],
        'opensAt' => (string) $record['opensAt'],
        'closesAt' => (string) $record['closesAt'],
        'authorId' => (int) $record['authorId'],
        'totalVotes' => $total,
        'options' => $options,
    ];
}
