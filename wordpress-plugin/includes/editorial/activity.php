<?php

/**
 * Private, bounded newsroom activity records.
 *
 * Activity is an audit trail for meaningful newsroom actions, not a change log
 * for post content. Records are stored as private child posts so WordPress
 * remains the only datastore and the same object-capability boundary used by
 * the editorial domains can protect reads.
 *
 * A record whose parent is a story is story-local. A record with no parent is a
 * newsroom-level event. Every record is deliberately small: an allowlisted
 * action, a generated/sanitized summary, safe identifiers or enums, an actor
 * ID, and a UTC timestamp. Request bodies, content, URLs, secrets, and
 * keystrokes are never accepted into the stored context.
 */

if (!defined('ABSPATH')) {
    exit;
}

const BYLINE_ACTIVITY_POST_TYPE = 'byline_activity';
const BYLINE_EDITORIAL_ACTIVITY_POST_TYPE = BYLINE_ACTIVITY_POST_TYPE;
const BYLINE_ACTIVITY_ACTION_META = '_byline_activity_action';
const BYLINE_ACTIVITY_SUMMARY_META = '_byline_activity_summary';
const BYLINE_ACTIVITY_CONTEXT_META = '_byline_activity_context';
const BYLINE_ACTIVITY_OCCURRED_AT_META = '_byline_activity_occurred_at';
const BYLINE_EDITORIAL_ACTIVITY_ACTION_META = BYLINE_ACTIVITY_ACTION_META;
const BYLINE_EDITORIAL_ACTIVITY_SUMMARY_META = BYLINE_ACTIVITY_SUMMARY_META;
const BYLINE_EDITORIAL_ACTIVITY_CONTEXT_META = BYLINE_ACTIVITY_CONTEXT_META;
const BYLINE_EDITORIAL_ACTIVITY_OCCURRED_AT_META = BYLINE_ACTIVITY_OCCURRED_AT_META;
const BYLINE_ACTIVITY_MAX_PER_STORY = 50;
const BYLINE_ACTIVITY_MAX_NEWSROOM = 200;
const BYLINE_ACTIVITY_RETENTION_DAYS = 180;
const BYLINE_ACTIVITY_LAST_LIVE_REVISION_OPTION = 'byline_activity_last_live_revision';

/**
 * Actions that are meaningful enough to enter the audit stream.
 *
 * The values are stable machine identifiers. Their summaries are intentionally
 * short UI labels rather than user-provided prose.
 *
 * @return array<string, array{summary:string}>
 */
function byline_activity_action_definitions(): array
{
    return [
        'story_created' => ['summary' => 'Story created'],
        'assignment_changed' => ['summary' => 'Assignment changed'],
        'workflow_changed' => ['summary' => 'Workflow changed'],
        'deadline_changed' => ['summary' => 'Deadline changed'],
        'task_created' => ['summary' => 'Task added'],
        'task_completed' => ['summary' => 'Task completed'],
        'task_deleted' => ['summary' => 'Task deleted'],
        'task_changed' => ['summary' => 'Task changed'],
        'contributor_changed' => ['summary' => 'Contributors changed'],
        'correction_created' => ['summary' => 'Correction recorded'],
        'correction_edited' => ['summary' => 'Correction updated'],
        'correction_deleted' => ['summary' => 'Correction removed'],
        'coverage_added' => ['summary' => 'Coverage linked'],
        'coverage_removed' => ['summary' => 'Coverage unlinked'],
        'coverage_changed' => ['summary' => 'Coverage updated'],
        'media_changed' => ['summary' => 'Media request changed'],
        'story_published' => ['summary' => 'Story published'],
        'build_started' => ['summary' => 'Website build started'],
        'build_failed' => ['summary' => 'Website build failed'],
        'build_live' => ['summary' => 'Website is live'],
        'homepage_published' => ['summary' => 'Homepage published'],
        'design_published' => ['summary' => 'Design published'],
        'newsletter_scheduled' => ['summary' => 'Newsletter scheduled'],
        'newsletter_sent' => ['summary' => 'Newsletter sent'],
    ];
}

/**
 * @return array<int, string>
 */
function byline_editorial_activity_types(): array
{
    return array_keys(byline_activity_action_definitions());
}

/**
 * Compatibility alias for callers that prefer the shorter domain name.
 *
 * @return array<int, string>
 */
function byline_activity_actions(): array
{
    return byline_editorial_activity_types();
}

function byline_activity_absint($value): int
{
    return function_exists('absint') ? absint($value) : abs((int) $value);
}

function byline_activity_key($value): string
{
    if (function_exists('sanitize_key')) {
        return sanitize_key((string) $value);
    }

    return strtolower((string) preg_replace('/[^a-z0-9_-]/i', '', (string) $value));
}

/**
 * Turn a scalar into short plain text and remove common credential-shaped
 * values. This is defense in depth; arbitrary request fields are not accepted
 * by the context allowlist below.
 */
function byline_activity_safe_text($value, int $maximum = 160): string
{
    if (!is_scalar($value)) {
        return '';
    }

    $text = function_exists('sanitize_text_field')
        ? sanitize_text_field((string) $value)
        : trim(strip_tags((string) $value));
    $text = (string) preg_replace('/[\x00-\x1F\x7F]+/', ' ', $text);
    $text = (string) preg_replace('/\s+/', ' ', trim($text));

    foreach ([
        '/\b(?:authorization|bearer|token|secret|password|passwd|api[_ -]?key|client[_ -]?secret|signature)\s*[:=]\s*[^\s,;]+/i',
        '/\beyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}(?:\.[a-zA-Z0-9_-]{10,})?\b/',
        '/\b[A-Za-z0-9+\/_-]{40,}\b/',
        '/\b[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}\b/i',
        '/\b(?:\d{1,3}\.){3}\d{1,3}\b/',
    ] as $pattern) {
        $text = (string) preg_replace($pattern, '[redacted]', $text);
    }

    if (function_exists('mb_substr')) {
        return mb_substr($text, 0, $maximum);
    }

    return substr($text, 0, $maximum);
}

/**
 * Normalize a timestamp to the storage format used by all activity records.
 */
function byline_activity_datetime($value): string
{
    if ($value instanceof DateTimeInterface) {
        return $value->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d\TH:i:s\Z');
    }

    if (!is_scalar($value) || trim((string) $value) === '') {
        return '';
    }

    try {
        return (new DateTimeImmutable((string) $value))
            ->setTimezone(new DateTimeZone('UTC'))
            ->format('Y-m-d\TH:i:s\Z');
    } catch (Exception $exception) {
        return '';
    }
}

function byline_activity_now(): string
{
    $now = gmdate('Y-m-d\TH:i:s\Z');

    if (function_exists('apply_filters')) {
        $filtered = apply_filters('byline_editorial_activity_now', $now);
        if (is_scalar($filtered) && byline_activity_datetime($filtered) !== '') {
            return byline_activity_datetime($filtered);
        }
    }

    return $now;
}

function byline_activity_epoch(string $datetime): int
{
    if ($datetime === '') {
        return 0;
    }

    try {
        return (new DateTimeImmutable($datetime))->getTimestamp();
    } catch (Exception $exception) {
        return 0;
    }
}

function byline_activity_cutoff_epoch(): int
{
    $day_seconds = defined('DAY_IN_SECONDS') ? DAY_IN_SECONDS : 86400;

    return byline_activity_epoch(byline_activity_now()) - (BYLINE_ACTIVITY_RETENTION_DAYS * $day_seconds);
}

/**
 * @param mixed $value
 */
function byline_activity_safe_date($value): string
{
    if (!is_scalar($value)) {
        return '';
    }

    $value = trim((string) $value);
    $date = DateTimeImmutable::createFromFormat('!Y-m-d', $value);

    return $date instanceof DateTimeImmutable && $date->format('Y-m-d') === $value ? $value : '';
}

/**
 * Return a safe enum value only when it is known for the supplied field.
 *
 * @param array<int, string> $allowed
 */
function byline_activity_safe_enum($value, array $allowed): string
{
    $value = byline_activity_key($value);

    return in_array($value, $allowed, true) ? $value : '';
}

/**
 * Sanitize the deliberately small context vocabulary.
 *
 * @param array<string, mixed> $context
 * @return array<string, mixed>
 */
function byline_activity_sanitize_context(array $context): array
{
    $result = [];
    $id_fields = [
        'objectId',
        'taskId',
        'coverageId',
        'correctionId',
        'mediaId',
        'contributorId',
        'gameId',
        'eventId',
        'designId',
        'newsletterId',
        'editorId',
        'assigneeId',
        'fromUserId',
        'toUserId',
        'userId',
        'revision',
        'attempt',
    ];

    foreach ($id_fields as $field) {
        if (!array_key_exists($field, $context) || !is_scalar($context[$field])) {
            continue;
        }

        $value = byline_activity_absint($context[$field]);
        if ($value > 0) {
            $result[$field] = $value;
        }
    }

    if (array_key_exists('count', $context) && is_scalar($context['count'])) {
        $result['count'] = min(10000, max(0, byline_activity_absint($context['count'])));
    }

    $enum_fields = [
        'from' => ['pitch', 'assigned', 'reporting', 'writing', 'editing', 'ready', 'on-hold', 'dropped', 'published', 'none', 'unassigned'],
        'to' => ['pitch', 'assigned', 'reporting', 'writing', 'editing', 'ready', 'on-hold', 'dropped', 'published', 'none', 'unassigned'],
        'status' => ['open', 'completed', 'needed', 'requested', 'selected', 'queued', 'building', 'failed', 'live', 'published', 'draft'],
        'state' => ['open', 'completed', 'reopened', 'deleted'],
        'operation' => ['added', 'removed', 'updated', 'created', 'deleted', 'linked', 'unlinked', 'completed', 'reopened'],
        'objectType' => ['story', 'task', 'coverage', 'correction', 'media', 'game', 'event', 'design', 'newsletter'],
        'kind' => ['photo', 'video', 'audio', 'document', 'news', 'sports', 'opinion', 'breaking', 'design', 'newsletter'],
        'source' => ['wordpress', 'worker', 'deploy', 'manual', 'system'],
    ];

    foreach ($enum_fields as $field => $allowed) {
        if (!array_key_exists($field, $context)) {
            continue;
        }

        $value = byline_activity_safe_enum($context[$field], $allowed);
        if ($value !== '') {
            $result[$field] = $value;
        }
    }

    foreach (['template', 'presetId'] as $field) {
        if (!array_key_exists($field, $context) || !is_scalar($context[$field])) {
            continue;
        }

        $value = byline_activity_key($context[$field]);
        if ($value !== '' && preg_match('/^[a-z0-9][a-z0-9:-]{0,60}$/', $value) === 1) {
            $result[$field] = $value;
        }
    }

    if (array_key_exists('deadline', $context)) {
        $deadline = byline_activity_safe_date($context['deadline']);
        if ($deadline !== '') {
            $result['deadline'] = $deadline;
        }
    }

    if (array_key_exists('label', $context)) {
        $label = byline_activity_safe_text($context['label'], 80);
        if ($label !== '') {
            $result['label'] = $label;
        }
    }

    foreach (['teamIds', 'attachmentIds'] as $field) {
        if (!isset($context[$field]) || !is_array($context[$field])) {
            continue;
        }

        $ids = [];
        foreach (array_slice($context[$field], 0, 20) as $value) {
            if (!is_scalar($value)) {
                continue;
            }
            $value = byline_activity_absint($value);
            if ($value > 0 && !in_array($value, $ids, true)) {
                $ids[] = $value;
            }
        }

        if ($ids !== []) {
            $result[$field] = $ids;
        }
    }

    return $result;
}

function byline_activity_normalize_action($value): string
{
    $action = byline_activity_key($value);
    $aliases = [
        'assignment' => 'assignment_changed',
        'workflow' => 'workflow_changed',
        'deadline' => 'deadline_changed',
        'task' => 'task_changed',
        'contributors' => 'contributor_changed',
        'correction' => 'correction_edited',
        'coverage' => 'coverage_changed',
        'media_request_changed' => 'media_changed',
        'published' => 'story_published',
    ];
    $action = $aliases[$action] ?? $action;

    return array_key_exists($action, byline_activity_action_definitions()) ? $action : '';
}

/**
 * @param array<string, mixed> $context
 */
function byline_activity_summary(string $action, array $context = []): string
{
    if (isset($context['summary'])) {
        $summary = byline_activity_safe_text($context['summary']);
        if ($summary !== '') {
            return $summary;
        }
    }

    $definitions = byline_activity_action_definitions();

    return (string) ($definitions[$action]['summary'] ?? 'Newsroom activity');
}

function byline_activity_current_user_id(?int $user_id = null): int
{
    if ($user_id !== null) {
        return byline_activity_absint($user_id);
    }

    return function_exists('get_current_user_id') ? byline_activity_absint(get_current_user_id()) : 0;
}

function byline_activity_user_can(int $user_id, string $capability, ...$args): bool
{
    if ($user_id <= 0) {
        return false;
    }

    if (function_exists('user_can')) {
        return (bool) user_can($user_id, $capability, ...$args);
    }

    return $user_id === byline_activity_current_user_id()
        && function_exists('current_user_can')
        && (bool) current_user_can($capability, ...$args);
}

function byline_activity_management_capability(): string
{
    return defined('BYLINE_MANAGE_CAPABILITY') ? BYLINE_MANAGE_CAPABILITY : 'manage_byline';
}

function byline_activity_is_story($post): bool
{
    return is_object($post) && (string) ($post->post_type ?? '') === 'post';
}

function byline_activity_can_view_story(int $story_id, ?int $user_id = null): bool
{
    $story_id = byline_activity_absint($story_id);
    $story = function_exists('get_post') ? get_post($story_id) : null;

    if ($story_id <= 0 || !byline_activity_is_story($story)) {
        return false;
    }

    return byline_activity_user_can(
        byline_activity_current_user_id($user_id),
        'edit_post',
        $story_id
    );
}

function byline_editorial_activity_can_view_story(int $story_id, ?int $user_id = null): bool
{
    return byline_activity_can_view_story($story_id, $user_id);
}

function byline_activity_can_view_newsroom(?int $user_id = null): bool
{
    $user_id = byline_activity_current_user_id($user_id);

    return byline_activity_user_can($user_id, 'edit_others_posts')
        || byline_activity_user_can($user_id, byline_activity_management_capability());
}

function byline_editorial_activity_can_view_newsroom(?int $user_id = null): bool
{
    return byline_activity_can_view_newsroom($user_id);
}

/**
 * @param object $post
 * @return array<string, mixed>
 */
function byline_activity_raw_record($post): array
{
    if (!is_object($post) || (string) ($post->post_type ?? '') !== BYLINE_ACTIVITY_POST_TYPE) {
        return [];
    }

    $action = byline_activity_normalize_action(
        function_exists('get_post_meta') ? get_post_meta((int) ($post->ID ?? 0), BYLINE_ACTIVITY_ACTION_META, true) : ''
    );
    if ($action === '') {
        return [];
    }

    $occurred_at = function_exists('get_post_meta')
        ? byline_activity_datetime(get_post_meta((int) $post->ID, BYLINE_ACTIVITY_OCCURRED_AT_META, true))
        : '';
    if ($occurred_at === '') {
        $occurred_at = byline_activity_datetime($post->post_date_gmt ?? ($post->post_date ?? ''));
    }

    $context = function_exists('get_post_meta')
        ? get_post_meta((int) $post->ID, BYLINE_ACTIVITY_CONTEXT_META, true)
        : [];

    return [
        'id' => byline_activity_absint($post->ID ?? 0),
        'action' => $action,
        'type' => $action,
        'storyId' => byline_activity_absint($post->post_parent ?? 0),
        'actorId' => byline_activity_absint($post->post_author ?? 0),
        'summary' => byline_activity_summary(
            $action,
            [
                'summary' => function_exists('get_post_meta')
                    ? get_post_meta((int) $post->ID, BYLINE_ACTIVITY_SUMMARY_META, true)
                    : '',
            ]
        ),
        'occurredAt' => $occurred_at,
        'context' => byline_activity_sanitize_context(is_array($context) ? $context : []),
    ];
}

/**
 * @return array<int, object>
 */
function byline_activity_query_posts(int $story_id = 0): array
{
    if (!function_exists('get_posts')) {
        return [];
    }

    $args = [
        'post_type' => BYLINE_ACTIVITY_POST_TYPE,
        'post_status' => 'private',
        'posts_per_page' => 1000,
        'numberposts' => 1000,
        'orderby' => 'date',
        'order' => 'DESC',
        'no_found_rows' => true,
    ];
    if ($story_id > 0) {
        $args['post_parent'] = $story_id;
    }

    $posts = get_posts($args);

    return is_array($posts) ? $posts : [];
}

/**
 * @return array<int, array<string, mixed>>
 */
function byline_activity_raw_records(int $story_id = 0): array
{
    $records = [];
    foreach (byline_activity_query_posts($story_id) as $post) {
        $record = byline_activity_raw_record($post);
        if ($record === []) {
            continue;
        }
        if ($story_id > 0 && (int) $record['storyId'] !== $story_id) {
            continue;
        }
        $records[] = $record;
    }

    usort($records, static function (array $left, array $right): int {
        $time_compare = byline_activity_epoch((string) $right['occurredAt'])
            <=> byline_activity_epoch((string) $left['occurredAt']);

        return $time_compare !== 0
            ? $time_compare
            : ((int) $right['id'] <=> (int) $left['id']);
    });

    return $records;
}

/**
 * Project only information appropriate for a protected newsroom surface.
 *
 * @param array<string, mixed> $record
 * @return array<string, mixed>
 */
function byline_activity_safe_projection(array $record): array
{
    $actor = null;
    $actor_id = byline_activity_absint($record['actorId'] ?? 0);
    if ($actor_id > 0 && function_exists('get_user_by')) {
        $user = get_user_by('id', $actor_id);
        if (is_object($user)) {
            $name = byline_activity_safe_text($user->display_name ?? '', 80);
            if ($name !== '') {
                $actor = ['id' => $actor_id, 'name' => $name];
            }
        }
    }

    $projected = [
        'id' => byline_activity_absint($record['id'] ?? 0),
        'action' => byline_activity_normalize_action($record['action'] ?? $record['type'] ?? ''),
        'type' => byline_activity_normalize_action($record['type'] ?? $record['action'] ?? ''),
        'storyId' => byline_activity_absint($record['storyId'] ?? 0),
        'summary' => byline_activity_safe_text($record['summary'] ?? ''),
        'occurredAt' => byline_activity_datetime($record['occurredAt'] ?? ''),
        'actor' => $actor,
        'context' => byline_activity_sanitize_context(
            is_array($record['context'] ?? null) ? $record['context'] : []
        ),
    ];

    if ($projected['storyId'] > 0 && function_exists('get_post')) {
        $story = get_post($projected['storyId']);
        if (byline_activity_is_story($story)) {
            $projected['story'] = [
                'id' => $projected['storyId'],
                'title' => byline_activity_safe_text($story->post_title ?? '', 240),
            ];
        }
    }

    return $projected;
}

/**
 * Project a record only after applying its object-capability boundary.
 *
 * @param array<string, mixed> $record
 * @return array<string, mixed>
 */
function byline_project_activity(array $record, ?int $user_id = null): array
{
    $story_id = byline_activity_absint($record['storyId'] ?? 0);
    $can_view = $story_id > 0
        ? byline_activity_can_view_story($story_id, $user_id)
        : byline_activity_can_view_newsroom($user_id);

    return $can_view ? byline_activity_safe_projection($record) : [];
}

function byline_activity_project_record(array $record, ?int $user_id = null): array
{
    return byline_project_activity($record, $user_id);
}

/**
 * Store one meaningful activity event. This helper intentionally returns an
 * empty array on invalid/unavailable input so audit recording can never block
 * the primary newsroom mutation.
 *
 * The canonical argument order is story ID, action, context, actor ID. The
 * action-first form is also accepted for integrations that adopted an earlier
 * draft helper shape.
 *
 * @param int|string $story_id
 * @param string|int $action
 * @param array<string, mixed> $context
 * @return array<string, mixed>
 */
function byline_record_activity($story_id, $action, array $context = [], ?int $actor_id = null): array
{
    if (is_string($story_id) && (is_int($action) || (is_string($action) && ctype_digit($action)))) {
        $swapped_story_id = $action;
        $action = $story_id;
        $story_id = $swapped_story_id;
    }

    $story_id = byline_activity_absint($story_id);
    $action = byline_activity_normalize_action($action);
    if ($action === '') {
        return [];
    }

    if ($story_id > 0) {
        $story = function_exists('get_post') ? get_post($story_id) : null;
        if (!byline_activity_is_story($story)) {
            return [];
        }
    }

    if (!function_exists('wp_insert_post') || !function_exists('update_post_meta')) {
        return [];
    }

    $occurred_at = byline_activity_datetime($context['occurredAt'] ?? '');
    if ($occurred_at === '') {
        $occurred_at = byline_activity_now();
    }
    $safe_context = byline_activity_sanitize_context($context);
    $summary = byline_activity_summary($action, $context);
    $actor_id = byline_activity_current_user_id($actor_id);
    $post_date = substr(str_replace('T', ' ', $occurred_at), 0, 19);

    $activity_id = wp_insert_post([
        'post_type' => BYLINE_ACTIVITY_POST_TYPE,
        'post_status' => 'private',
        'post_parent' => $story_id,
        'post_author' => $actor_id,
        'post_title' => $summary,
        'post_content' => '',
        'post_date' => $post_date,
        'post_date_gmt' => $post_date,
    ], true);

    if (function_exists('is_wp_error') && is_wp_error($activity_id)) {
        return [];
    }
    if (is_object($activity_id) && class_exists('WP_Error') && $activity_id instanceof WP_Error) {
        return [];
    }

    $activity_id = byline_activity_absint($activity_id);
    if ($activity_id <= 0) {
        return [];
    }

    update_post_meta($activity_id, BYLINE_ACTIVITY_ACTION_META, $action);
    update_post_meta($activity_id, BYLINE_ACTIVITY_SUMMARY_META, $summary);
    update_post_meta($activity_id, BYLINE_ACTIVITY_CONTEXT_META, $safe_context);
    update_post_meta($activity_id, BYLINE_ACTIVITY_OCCURRED_AT_META, $occurred_at);

    byline_prune_editorial_activity();

    $post = function_exists('get_post') ? get_post($activity_id) : null;
    $record = is_object($post) ? byline_activity_raw_record($post) : [];
    if ($record === []) {
        return [];
    }

    if (function_exists('do_action')) {
        do_action('byline_editorial_activity_recorded', $record);
    }

    return $record;
}

/**
 * Action-first compatibility wrapper.
 *
 * @param string|int $action_or_story
 * @param int|string $story_or_action
 * @param array<string, mixed> $context
 * @return array<string, mixed>
 */
function byline_record_editorial_activity($action_or_story, $story_or_action = 0, array $context = [], ?int $actor_id = null): array
{
    if (is_string($action_or_story) && (is_int($story_or_action) || (is_string($story_or_action) && ctype_digit($story_or_action)))) {
        return byline_record_activity($story_or_action, $action_or_story, $context, $actor_id);
    }

    return byline_record_activity($action_or_story, $story_or_action, $context, $actor_id);
}

/**
 * @return array<string, mixed>
 */
function byline_get_activity(int $activity_id, ?int $user_id = null): array
{
    $post = function_exists('get_post') ? get_post(byline_activity_absint($activity_id)) : null;
    $record = is_object($post) ? byline_activity_raw_record($post) : [];

    return $record === [] ? [] : byline_project_activity($record, $user_id);
}

/**
 * @param array<string, mixed> $args
 * @return array<int, array<string, mixed>>
 */
function byline_list_story_activity(int $story_id, array $args = [], ?int $user_id = null): array
{
    $story_id = byline_activity_absint($story_id);
    if (!byline_activity_can_view_story($story_id, $user_id)) {
        return [];
    }

    $limit = min(BYLINE_ACTIVITY_MAX_PER_STORY, max(1, byline_activity_absint($args['limit'] ?? 20)));
    $types = $args['types'] ?? ($args['actions'] ?? []);
    if (is_string($types)) {
        $types = [$types];
    }
    $types = is_array($types)
        ? array_values(array_filter(array_map('byline_activity_normalize_action', $types)))
        : [];
    $records = byline_activity_raw_records($story_id);
    $result = [];

    foreach ($records as $record) {
        if ($types !== [] && !in_array($record['action'], $types, true)) {
            continue;
        }
        $projected = byline_activity_safe_projection($record);
        if ($projected !== []) {
            $result[] = $projected;
        }
        if (count($result) >= $limit) {
            break;
        }
    }

    return $result;
}

function byline_get_story_activity(int $story_id, array $args = [], ?int $user_id = null): array
{
    return byline_list_story_activity($story_id, $args, $user_id);
}

/**
 * @param array<string, mixed> $args
 * @return array<int, array<string, mixed>>
 */
function byline_list_newsroom_activity(array $args = [], ?int $user_id = null): array
{
    if (!byline_activity_can_view_newsroom($user_id)) {
        return [];
    }

    $limit = min(BYLINE_ACTIVITY_MAX_NEWSROOM, max(1, byline_activity_absint($args['limit'] ?? 50)));
    $story_id = byline_activity_absint($args['storyId'] ?? 0);
    $types = $args['types'] ?? ($args['actions'] ?? []);
    if (is_string($types)) {
        $types = [$types];
    }
    $types = is_array($types)
        ? array_values(array_filter(array_map('byline_activity_normalize_action', $types)))
        : [];

    $result = [];
    foreach (byline_activity_raw_records($story_id) as $record) {
        if ($types !== [] && !in_array($record['action'], $types, true)) {
            continue;
        }

        $projected = byline_activity_safe_projection($record);
        if ($projected !== []) {
            $result[] = $projected;
        }
        if (count($result) >= $limit) {
            break;
        }
    }

    return $result;
}

function byline_get_recent_activity(array $args = [], ?int $user_id = null): array
{
    return byline_list_newsroom_activity($args, $user_id);
}

/**
 * Prune invalid/expired records and enforce both retention bounds.
 */
function byline_prune_editorial_activity(int $story_id = 0): int
{
    if (!function_exists('wp_delete_post')) {
        return 0;
    }

    $story_id = byline_activity_absint($story_id);
    $records = byline_activity_raw_records($story_id);
    $cutoff = byline_activity_cutoff_epoch();
    $delete_ids = [];
    $kept = [];

    foreach ($records as $record) {
        $id = byline_activity_absint($record['id'] ?? 0);
        $timestamp = byline_activity_epoch((string) ($record['occurredAt'] ?? ''));
        if ($id <= 0 || $timestamp <= 0 || $timestamp < $cutoff) {
            if ($id > 0) {
                $delete_ids[$id] = true;
            }
            continue;
        }
        $kept[] = $record;
    }

    if ($story_id > 0) {
        foreach (array_slice($kept, BYLINE_ACTIVITY_MAX_PER_STORY) as $record) {
            $delete_ids[byline_activity_absint($record['id'])] = true;
        }
    } else {
        $per_story = [];
        foreach ($kept as $record) {
            $key = (string) byline_activity_absint($record['storyId'] ?? 0);
            $per_story[$key][] = $record;
        }

        foreach ($per_story as $records_for_story) {
            foreach (array_slice($records_for_story, BYLINE_ACTIVITY_MAX_PER_STORY) as $record) {
                $delete_ids[byline_activity_absint($record['id'])] = true;
            }
        }

        $kept = array_values(array_filter($kept, static function (array $record) use ($delete_ids): bool {
            return !isset($delete_ids[byline_activity_absint($record['id'] ?? 0)]);
        }));
        foreach (array_slice($kept, BYLINE_ACTIVITY_MAX_NEWSROOM) as $record) {
            $delete_ids[byline_activity_absint($record['id'])] = true;
        }
    }

    $deleted = 0;
    foreach (array_keys($delete_ids) as $activity_id) {
        if (wp_delete_post((int) $activity_id, true)) {
            $deleted++;
        }
    }

    return $deleted;
}

function byline_prune_activity(int $story_id = 0): int
{
    return byline_prune_editorial_activity($story_id);
}

function byline_activity_register_post_type(): void
{
    if (!function_exists('register_post_type')) {
        return;
    }

    register_post_type(BYLINE_ACTIVITY_POST_TYPE, [
        'labels' => [
            'name' => 'Newsroom Activity',
            'singular_name' => 'Newsroom Activity',
        ],
        'public' => false,
        'publicly_queryable' => false,
        'exclude_from_search' => true,
        'show_ui' => false,
        'show_in_menu' => false,
        'show_in_rest' => false,
        'rewrite' => false,
        'query_var' => false,
        'supports' => ['title', 'author'],
        'capability_type' => 'post',
        'map_meta_cap' => true,
    ]);
}

function byline_activity_register_meta(): void
{
    if (!function_exists('register_post_meta')) {
        return;
    }

    foreach ([
        BYLINE_ACTIVITY_ACTION_META => 'string',
        BYLINE_ACTIVITY_SUMMARY_META => 'string',
        BYLINE_ACTIVITY_CONTEXT_META => 'array',
        BYLINE_ACTIVITY_OCCURRED_AT_META => 'string',
    ] as $key => $type) {
        register_post_meta(BYLINE_ACTIVITY_POST_TYPE, $key, [
            'single' => true,
            'type' => $type,
            'show_in_rest' => false,
            'auth_callback' => static function (): bool {
                return byline_activity_can_view_newsroom();
            },
        ]);
    }
}

function byline_editorial_activity_on_after_insert_post($post_id, $post, $update = false, $post_before = null): void
{
    if ($update || !byline_activity_is_story($post)) {
        return;
    }

    byline_record_activity(
        byline_activity_absint($post_id),
        'story_created',
        [],
        byline_activity_absint($post->post_author ?? 0)
    );
}

function byline_editorial_activity_on_transition_post_status($new_status, $old_status, $post): void
{
    if ((string) $new_status !== 'publish' || (string) $old_status === 'publish' || !byline_activity_is_story($post)) {
        return;
    }

    byline_record_activity(
        byline_activity_absint($post->ID ?? 0),
        'story_published',
        [],
        byline_activity_absint($post->post_author ?? 0)
    );
}

/**
 * Adapt the existing workflow hook without recording visual-note autosaves.
 */
function byline_editorial_activity_on_story_updated(int $post_id, array $state, array $changes): void
{
    if (array_key_exists('status', $changes)) {
        byline_record_activity($post_id, 'workflow_changed', [
            'to' => $state['storedStatus'] ?? ($state['status'] ?? ''),
        ]);
    }
    if (array_key_exists('editorId', $changes)) {
        byline_record_activity($post_id, 'assignment_changed', [
            'toUserId' => $state['editorId'] ?? $changes['editorId'],
        ]);
    }
    if (array_key_exists('deadline', $changes)) {
        byline_record_activity($post_id, 'deadline_changed', [
            'deadline' => $state['deadline'] ?? $changes['deadline'],
        ]);
    }
}

function byline_editorial_activity_on_media_request_updated(int $post_id, $request, ?int $user_id = null): void
{
    $context = [];
    if (is_array($request)) {
        if (isset($request['status'])) {
            $context['status'] = $request['status'];
        }
        if (isset($request['assigneeId'])) {
            $context['assigneeId'] = $request['assigneeId'];
        }
        if (isset($request['type'])) {
            $context['kind'] = $request['type'];
        }
    }

    byline_record_activity($post_id, 'media_changed', $context, $user_id);
}

function byline_editorial_activity_on_contributors_updated(int $post_id, array $contributors, ?int $user_id = null): void
{
    byline_record_activity($post_id, 'contributor_changed', [
        'count' => count($contributors),
    ], $user_id);
}

function byline_editorial_activity_on_task_changed($task_id, $task = [], $operation = 'changed'): void
{
    $task_id = byline_activity_absint($task_id);
    $task = is_array($task) ? $task : (function_exists('byline_get_task') ? byline_get_task($task_id) : []);
    $story_id = byline_activity_absint($task['storyId'] ?? 0);
    if ($story_id <= 0) {
        return;
    }

    $operation = byline_activity_key($operation);
    $action = $operation === 'created'
        ? 'task_created'
        : ($operation === 'completed'
            ? 'task_completed'
            : ($operation === 'deleted' ? 'task_deleted' : 'task_changed'));
    $context = [
        'objectType' => 'task',
        'taskId' => $task_id,
        'state' => $task['state'] ?? ($task['status'] ?? ''),
        'operation' => $operation,
    ];
    foreach (['assigneeId', 'coverageId'] as $field) {
        if (isset($task[$field])) {
            $context[$field] = $task[$field];
        }
    }

    byline_record_activity($story_id, $action, $context);
}

function byline_editorial_activity_on_correction_changed($correction_id, $correction = [], $operation = 'edited'): void
{
    $correction_id = byline_activity_absint($correction_id);
    $correction = is_array($correction) ? $correction : [];
    $story_id = byline_activity_absint($correction['storyId'] ?? 0);
    if ($story_id <= 0) {
        return;
    }

    $operation = byline_activity_key($operation);
    $action = $operation === 'created'
        ? 'correction_created'
        : ($operation === 'deleted' ? 'correction_deleted' : 'correction_edited');
    byline_record_activity($story_id, $action, [
        'objectType' => 'correction',
        'correctionId' => $correction_id,
        'operation' => $operation,
    ]);
}

function byline_editorial_activity_on_coverage_changed($story_id, $previous = [], $next = []): void
{
    $story_id = byline_activity_absint($story_id);
    $previous = is_array($previous) ? array_map('byline_activity_absint', $previous) : [];
    $next = is_array($next) ? array_map('byline_activity_absint', $next) : [];
    $added = array_values(array_diff($next, $previous));
    $removed = array_values(array_diff($previous, $next));

    foreach ($added as $coverage_id) {
        byline_record_activity($story_id, 'coverage_added', [
            'objectType' => 'coverage',
            'coverageId' => $coverage_id,
            'operation' => 'added',
        ]);
    }
    foreach ($removed as $coverage_id) {
        byline_record_activity($story_id, 'coverage_removed', [
            'objectType' => 'coverage',
            'coverageId' => $coverage_id,
            'operation' => 'removed',
        ]);
    }
}

function byline_editorial_activity_on_build_started($expected_revision = 0, $reason = 'content'): void
{
    byline_record_activity(0, 'build_started', [
        'objectType' => 'design',
        'revision' => $expected_revision,
        'source' => 'deploy',
        'label' => is_scalar($reason) ? $reason : 'content',
    ]);
}

function byline_editorial_activity_on_build_failed($reason = 'content', $error = null): void
{
    byline_record_activity(0, 'build_failed', [
        'objectType' => 'design',
        'source' => 'deploy',
        'label' => is_scalar($reason) ? $reason : 'content',
    ]);
}

/**
 * The public manifest is the only reliable proof that a static build is live.
 * Diagnostics/distribution emit this observation once per revision; the
 * option is a small idempotency guard so repeated admin refreshes do not turn
 * into duplicate newsroom activity entries.
 */
function byline_editorial_activity_on_build_live($expected_revision = 0, $manifest = []): void
{
    $expected_revision = byline_activity_absint($expected_revision);
    if ($expected_revision <= 0) {
        return;
    }

    $last_revision = function_exists('get_option')
        ? byline_activity_absint(get_option(BYLINE_ACTIVITY_LAST_LIVE_REVISION_OPTION, 0))
        : 0;
    if ($last_revision >= $expected_revision) {
        return;
    }

    $record = byline_record_activity(0, 'build_live', [
        'objectType' => 'design',
        'revision' => $expected_revision,
        'source' => 'deploy',
    ]);
    if ($record !== [] && function_exists('update_option')) {
        update_option(BYLINE_ACTIVITY_LAST_LIVE_REVISION_OPTION, $expected_revision, false);
    }
}

function byline_editorial_activity_on_design_published($template, $revision = 0, $source = ''): void
{
    byline_record_activity(0, 'design_published', [
        'objectType' => 'design',
        'template' => $template,
        'revision' => $revision,
        'source' => is_scalar($source) ? $source : 'system',
    ]);
}

function byline_editorial_activity_on_newsletter_requested($post_id, $payload = [], $request_id = ''): void
{
    byline_record_activity(byline_activity_absint($post_id), 'newsletter_scheduled', [
        'objectType' => 'newsletter',
    ]);
}

/**
 * Explicit hook registration keeps this file independently loadable while
 * allowing the plugin bootstrap to include it without editing this module.
 */
function byline_register_editorial_activity_hooks(): void
{
    static $registered = false;
    if ($registered || !function_exists('add_action')) {
        return;
    }
    $registered = true;

    add_action('init', 'byline_activity_register_post_type');
    add_action('init', 'byline_activity_register_meta');
    add_action('wp_after_insert_post', 'byline_editorial_activity_on_after_insert_post', 10, 4);
    add_action('transition_post_status', 'byline_editorial_activity_on_transition_post_status', 10, 3);
    add_action('byline_editorial_story_updated', 'byline_editorial_activity_on_story_updated', 10, 3);
    add_action('byline_editorial_media_request_updated', 'byline_editorial_activity_on_media_request_updated', 10, 3);
    add_action('byline_story_contributors_updated', 'byline_editorial_activity_on_contributors_updated', 10, 3);
    add_action('byline_editorial_task_changed', 'byline_editorial_activity_on_task_changed', 10, 3);
    add_action('byline_editorial_correction_changed', 'byline_editorial_activity_on_correction_changed', 10, 3);
    add_action('byline_editorial_coverage_changed', 'byline_editorial_activity_on_coverage_changed', 10, 3);
    add_action('byline_editorial_build_started', 'byline_editorial_activity_on_build_started', 10, 2);
    add_action('byline_editorial_build_failed', 'byline_editorial_activity_on_build_failed', 10, 2);
    add_action('byline_editorial_build_live', 'byline_editorial_activity_on_build_live', 10, 2);
    add_action('byline_design_published', 'byline_editorial_activity_on_design_published', 10, 3);
    add_action('byline_distribution_newsletter_requested', 'byline_editorial_activity_on_newsletter_requested', 10, 3);
}

byline_register_editorial_activity_hooks();
