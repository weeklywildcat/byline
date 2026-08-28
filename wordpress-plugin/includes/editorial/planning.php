<?php

/**
 * Planning-domain storage and query helpers.
 *
 * Planning is an authenticated newsroom view over normal WordPress stories.
 * The helpers in this file intentionally keep the collection payload separate
 * from the public post REST response: deadlines, assignments, planned dates,
 * workflow state, and task/media summaries are private editorial data.
 */

if (!defined('ABSPATH')) {
    exit;
}

if (!defined('BYLINE_EDITORIAL_PLANNED_PUBLISH_META')) {
    define('BYLINE_EDITORIAL_PLANNED_PUBLISH_META', '_byline_story_planned_publish_at');
}

if (!defined('BYLINE_EDITORIAL_SAVED_VIEWS_META')) {
    define('BYLINE_EDITORIAL_SAVED_VIEWS_META', '_byline_editorial_saved_views_v1');
}

if (!defined('BYLINE_EDITORIAL_PLANNING_MAX_RESULTS')) {
    define('BYLINE_EDITORIAL_PLANNING_MAX_RESULTS', 200);
}

/**
 * Return the site's editorial timezone without making WordPress 6.6 a hard
 * requirement for standalone domain tests.
 */
function byline_editorial_planning_timezone(): DateTimeZone
{
    if (function_exists('wp_timezone')) {
        $timezone = wp_timezone();
        if ($timezone instanceof DateTimeZone) {
            return $timezone;
        }
    }

    if (function_exists('wp_timezone_string')) {
        $timezone_string = (string) wp_timezone_string();
        if ($timezone_string !== '') {
            try {
                return new DateTimeZone($timezone_string);
            } catch (Exception $exception) {
                // Fall through to UTC for malformed legacy settings.
            }
        }
    }

    return new DateTimeZone('UTC');
}

/**
 * Normalise a date/time to an unambiguous UTC representation.
 *
 * Inputs without an offset are interpreted in the configured WordPress
 * timezone. Only the small set of formats accepted by editorial controls is
 * admitted; DateTime's permissive natural-language parser is deliberately not
 * used for user input.
 */
function byline_editorial_normalize_datetime($value, bool $date_only = false): string
{
    if ($value instanceof DateTimeInterface) {
        return (new DateTimeImmutable('@' . $value->getTimestamp()))->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d\TH:i:s\Z');
    }

    if (!is_scalar($value)) {
        return '';
    }

    $source = trim((string) $value);

    if ($source === '') {
        return '';
    }

    $timezone = byline_editorial_planning_timezone();
    $date = null;

    if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $source) === 1) {
        $date = DateTimeImmutable::createFromFormat('!Y-m-d', $source, $timezone);
    } elseif (preg_match('/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2})?$/', $source) === 1) {
        $format = strpos($source, 'T') !== false ? 'Y-m-d\TH:i' : 'Y-m-d H:i';
        if (substr_count($source, ':') === 2) {
            $format .= ':s';
        }
        $date = DateTimeImmutable::createFromFormat($format, $source, $timezone);
    } elseif (preg_match('/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:?\d{2})$/', $source) === 1) {
        try {
            $date = new DateTimeImmutable($source);
        } catch (Exception $exception) {
            $date = null;
        }
    }

    if (!$date instanceof DateTimeImmutable) {
        return '';
    }

    $errors = DateTimeImmutable::getLastErrors();
    if (is_array($errors) && ($errors['warning_count'] > 0 || $errors['error_count'] > 0)) {
        return '';
    }

    if ($date_only) {
        $date = $date->setTime(0, 0, 0);
    }

    return $date->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d\TH:i:s\Z');
}

function byline_editorial_format_datetime_for_site($value, string $format = 'Y-m-d\TH:i'): string
{
    $canonical = byline_editorial_normalize_datetime($value);

    if ($canonical === '') {
        return '';
    }

    try {
        return (new DateTimeImmutable($canonical))->setTimezone(byline_editorial_planning_timezone())->format($format);
    } catch (Exception $exception) {
        return '';
    }
}

function byline_editorial_sanitize_planned_publish_at($value): string
{
    return byline_editorial_normalize_datetime($value);
}

function byline_get_editorial_planned_publish_at(int $post_id): string
{
    return byline_editorial_sanitize_planned_publish_at(get_post_meta($post_id, BYLINE_EDITORIAL_PLANNED_PUBLISH_META, true));
}

/**
 * Set only the editorial target. This helper never writes post_date or changes
 * WordPress's publication status/schedule.
 */
function byline_set_editorial_planned_publish_at(int $post_id, $value): bool
{
    $canonical = byline_editorial_sanitize_planned_publish_at($value);

    if ($canonical === '') {
        delete_post_meta($post_id, BYLINE_EDITORIAL_PLANNED_PUBLISH_META);
        return true;
    }

    update_post_meta($post_id, BYLINE_EDITORIAL_PLANNED_PUBLISH_META, $canonical);
    return true;
}

function byline_editorial_planning_current_user_id(?int $user_id = null): int
{
    if ($user_id !== null) {
        return absint($user_id);
    }

    return function_exists('get_current_user_id') ? absint(get_current_user_id()) : 0;
}

function byline_editorial_user_can(int $user_id, string $capability, ...$args): bool
{
    if ($user_id > 0 && function_exists('user_can')) {
        return (bool) user_can($user_id, $capability, ...$args);
    }

    return function_exists('current_user_can') && (bool) current_user_can($capability, ...$args);
}

function byline_editorial_can_view_planning_story(int $post_id, ?int $user_id = null): bool
{
    $post = get_post(absint($post_id));

    if (!$post instanceof WP_Post || $post->post_type !== 'post') {
        return false;
    }

    $user_id = byline_editorial_planning_current_user_id($user_id);

    return $user_id > 0
        ? byline_editorial_user_can($user_id, 'edit_post', $post->ID)
        : (function_exists('current_user_can') && (bool) current_user_can('edit_post', $post->ID));
}

function byline_editorial_planning_bool($value): bool
{
    if (is_bool($value)) {
        return $value;
    }

    return in_array(strtolower(trim((string) $value)), ['1', 'true', 'yes', 'on'], true);
}

/**
 * Keep collection filters bounded and predictable before they reach WP_Query.
 * Unknown keys are intentionally discarded so a saved view cannot smuggle an
 * arbitrary query var into the admin collection.
 *
 * @param array<string,mixed> $filters
 * @return array<string,mixed>
 */
function byline_editorial_sanitize_planning_filters(array $filters): array
{
    $clean = [];

    $status = $filters['status'] ?? $filters['workflowStatus'] ?? ($filters['workflow'] ?? '');
    if (is_scalar($status) && $status !== '') {
        $clean['status'] = sanitize_key((string) $status);
    }

    $person_aliases = [
        'writer' => ['writer', 'writerId'],
        'author' => ['author', 'authorId'],
        'editor' => ['editor', 'editorId'],
    ];
    foreach ($person_aliases as $key => $aliases) {
        foreach ($aliases as $alias) {
            if (array_key_exists($alias, $filters) && absint($filters[$alias]) > 0) {
                $clean[$key] = absint($filters[$alias]);
                break;
            }
        }
    }

    $date_aliases = [
        'deadlineFrom' => ['deadlineFrom', 'deadline_from'],
        'deadlineTo' => ['deadlineTo', 'deadline_to'],
    ];
    foreach ($date_aliases as $key => $aliases) {
        $source_key = null;
        foreach ($aliases as $alias) {
            if (array_key_exists($alias, $filters)) {
                $source_key = $alias;
                break;
            }
        }
        if ($source_key === null) {
            continue;
        }

        $raw = is_scalar($filters[$source_key]) ? trim((string) $filters[$source_key]) : '';
        $value = function_exists('byline_editorial_sanitize_deadline')
            ? byline_editorial_sanitize_deadline($raw)
            : (preg_match('/^\d{4}-\d{2}-\d{2}$/', $raw) === 1 ? $raw : '');

        if ($value !== '') {
            $clean[$key] = $value;
        }
    }

    $planned_aliases = [
        'plannedFrom' => ['plannedFrom', 'planned_from'],
        'plannedTo' => ['plannedTo', 'planned_to'],
    ];
    foreach ($planned_aliases as $key => $aliases) {
        $source_key = null;
        foreach ($aliases as $alias) {
            if (array_key_exists($alias, $filters)) {
                $source_key = $alias;
                break;
            }
        }
        if ($source_key === null) {
            continue;
        }

        $value = byline_editorial_sanitize_planned_publish_at($filters[$source_key]);
        if ($value !== '') {
            $clean[$key] = $value;
        }
    }

    $post_status_value = $filters['postStatus'] ?? ($filters['wordpressState'] ?? ($filters['wordpress_state'] ?? null));
    if ($post_status_value !== null && is_scalar($post_status_value)) {
        $post_status = sanitize_key((string) $post_status_value);
        if (in_array($post_status, ['draft', 'pending', 'future', 'publish', 'private'], true)) {
            $clean['postStatus'] = $post_status;
        }
    }

    $visual_status = $filters['visualStatus'] ?? ($filters['visual_status'] ?? null);
    if ($visual_status !== null && is_scalar($visual_status) && (string) $visual_status !== '') {
        $clean['visualStatus'] = sanitize_key((string) $visual_status);
    }

    $coverage = $filters['coverage'] ?? ($filters['coverageId'] ?? null);
    if ($coverage !== null && is_scalar($coverage) && (string) $coverage !== '') {
        $clean['coverage'] = sanitize_key((string) $coverage);
    }

    $query = $filters['query'] ?? ($filters['search'] ?? '');
    if (is_scalar($query)) {
        $query = sanitize_text_field((string) $query);
        if (function_exists('mb_substr')) {
            $query = mb_substr($query, 0, 120);
        } else {
            $query = substr($query, 0, 120);
        }
        if ($query !== '') {
            $clean['query'] = $query;
        }
    }

    $boolean_aliases = [
        'mine' => ['mine'],
        'unassigned' => ['unassigned'],
        'overdue' => ['overdue'],
        'needsReview' => ['needsReview', 'needs_review'],
    ];
    foreach ($boolean_aliases as $key => $aliases) {
        foreach ($aliases as $alias) {
            if (array_key_exists($alias, $filters) && byline_editorial_planning_bool($filters[$alias])) {
                $clean[$key] = true;
                break;
            }
        }
    }

    $limit = isset($filters['limit']) ? absint($filters['limit']) : 50;
    $clean['limit'] = max(1, min(BYLINE_EDITORIAL_PLANNING_MAX_RESULTS, $limit ?: 50));
    $clean['offset'] = max(0, absint($filters['offset'] ?? 0));

    $allowed_orderby = ['modified', 'date', 'title', 'deadline', 'planned_publish'];
    $orderby = isset($filters['orderby']) ? sanitize_key((string) $filters['orderby']) : 'modified';
    $clean['orderby'] = in_array($orderby, $allowed_orderby, true) ? $orderby : 'modified';
    $order = strtoupper((string) ($filters['order'] ?? 'DESC'));
    $clean['order'] = in_array($order, ['ASC', 'DESC'], true) ? $order : 'DESC';

    return $clean;
}

/**
 * Construct the bounded query used by the Planning collection. The caller must
 * still apply per-post capability filtering because edit_post is object-aware.
 */
function byline_editorial_planning_query_args(array $filters = [], ?int $user_id = null): array
{
    $filters = byline_editorial_sanitize_planning_filters($filters);
    $meta_query = [];
    $user_id = byline_editorial_planning_current_user_id($user_id);

    if (!empty($filters['status'])) {
        $meta_key = defined('BYLINE_EDITORIAL_STATUS_META') ? BYLINE_EDITORIAL_STATUS_META : '_wwh_story_status';
        $meta_query[] = ['key' => $meta_key, 'value' => $filters['status'], 'compare' => '='];
    }

    if (!empty($filters['editor'])) {
        $meta_key = defined('BYLINE_EDITORIAL_EDITOR_META') ? BYLINE_EDITORIAL_EDITOR_META : '_wwh_story_editor_user_id';
        $meta_query[] = ['key' => $meta_key, 'value' => $filters['editor'], 'type' => 'NUMERIC', 'compare' => '='];
    }

    if (!empty($filters['writer'])) {
        $filters['author'] = $filters['writer'];
    }

    if (!empty($filters['deadlineFrom']) || !empty($filters['deadlineTo'])) {
        $deadline_clause = [
            'key' => defined('BYLINE_EDITORIAL_DEADLINE_META') ? BYLINE_EDITORIAL_DEADLINE_META : '_wwh_story_deadline',
            'type' => 'DATE',
        ];
        if (!empty($filters['deadlineFrom'])) {
            $deadline_clause['value'] = $filters['deadlineFrom'];
            $deadline_clause['compare'] = '>=';
        }
        if (!empty($filters['deadlineTo'])) {
            if (isset($deadline_clause['value'])) {
                $meta_query[] = [
                    'relation' => 'AND',
                    $deadline_clause,
                    [
                        'key' => $deadline_clause['key'],
                        'value' => $filters['deadlineTo'],
                        'type' => 'DATE',
                        'compare' => '<=',
                    ],
                ];
            } else {
                $deadline_clause['value'] = $filters['deadlineTo'];
                $deadline_clause['compare'] = '<=';
                $meta_query[] = $deadline_clause;
            }
        } else {
            $meta_query[] = $deadline_clause;
        }
    }

    if (!empty($filters['plannedFrom']) || !empty($filters['plannedTo'])) {
        $planned_key = BYLINE_EDITORIAL_PLANNED_PUBLISH_META;
        if (!empty($filters['plannedFrom'])) {
            $meta_query[] = [
                'key' => $planned_key,
                'value' => $filters['plannedFrom'],
                'compare' => '>=',
                'type' => 'CHAR',
            ];
        }
        if (!empty($filters['plannedTo'])) {
            $meta_query[] = [
                'key' => $planned_key,
                'value' => $filters['plannedTo'],
                'compare' => '<=',
                'type' => 'CHAR',
            ];
        }
    }

    if (!empty($filters['unassigned'])) {
        $editor_key = defined('BYLINE_EDITORIAL_EDITOR_META') ? BYLINE_EDITORIAL_EDITOR_META : '_wwh_story_editor_user_id';
        $meta_query[] = [
            'relation' => 'OR',
            ['key' => $editor_key, 'compare' => 'NOT EXISTS'],
            ['key' => $editor_key, 'value' => '', 'compare' => '='],
            ['key' => $editor_key, 'value' => '0', 'compare' => '='],
        ];
    }

    if (!empty($filters['overdue'])) {
        $meta_query[] = [
            'key' => defined('BYLINE_EDITORIAL_DEADLINE_META') ? BYLINE_EDITORIAL_DEADLINE_META : '_wwh_story_deadline',
            'value' => function_exists('current_time') ? current_time('Y-m-d') : gmdate('Y-m-d'),
            'type' => 'DATE',
            'compare' => '<',
        ];
    }

    if (!empty($filters['needsReview'])) {
        $meta_key = defined('BYLINE_EDITORIAL_STATUS_META') ? BYLINE_EDITORIAL_STATUS_META : '_wwh_story_status';
        $meta_query[] = ['key' => $meta_key, 'value' => 'ready', 'compare' => '='];
    }

    $orderby = $filters['orderby'];
    if ($orderby === 'deadline') {
        $orderby = 'meta_value';
        $meta_key = defined('BYLINE_EDITORIAL_DEADLINE_META') ? BYLINE_EDITORIAL_DEADLINE_META : '_wwh_story_deadline';
    } elseif ($orderby === 'planned_publish') {
        $orderby = 'meta_value';
        $meta_key = BYLINE_EDITORIAL_PLANNED_PUBLISH_META;
    } else {
        $meta_key = '';
    }

    $args = [
        'post_type' => 'post',
        'post_status' => !empty($filters['postStatus']) ? $filters['postStatus'] : ['draft', 'pending', 'future', 'publish', 'private'],
        'posts_per_page' => $filters['limit'],
        'offset' => $filters['offset'],
        'orderby' => $orderby,
        'order' => $filters['order'],
        'suppress_filters' => false,
    ];

    if (!empty($filters['query'])) {
        // Search is applied against the normalized summary below so headline,
        // writer, editor, and Coverage all share one contract.  A WP_Query
        // `s` clause would discard writer/editor/Coverage matches before that
        // post-filter could see them.  Keep this bounded to the collection's
        // maximum rather than allowing a free-form newsroom export.
        $args['posts_per_page'] = max((int) $args['posts_per_page'], BYLINE_EDITORIAL_PLANNING_MAX_RESULTS);
    }

    if (!empty($filters['author'])) {
        $args['author'] = $filters['author'];
    }
    if ($meta_key !== '') {
        $args['meta_key'] = $meta_key;
    }
    if ($meta_query !== []) {
        $args['meta_query'] = array_merge(['relation' => 'AND'], $meta_query);
    }

    return $args;
}

function byline_editorial_planning_user_display(int $user_id): ?array
{
    if ($user_id <= 0 || !function_exists('get_user_by')) {
        return null;
    }

    $user = get_user_by('id', $user_id);
    if (!$user instanceof WP_User) {
        return null;
    }

    return ['id' => (int) $user->ID, 'name' => (string) $user->display_name];
}

/**
 * A deliberately compact private Planning row. No post content or private
 * metadata is included in this shape.
 */
function byline_editorial_planning_story_summary(int $post_id, ?int $user_id = null): array
{
    $post = get_post($post_id);
    if (!$post instanceof WP_Post || $post->post_type !== 'post' || !byline_editorial_can_view_planning_story($post_id, $user_id)) {
        return [];
    }

    $author = byline_editorial_planning_user_display((int) $post->post_author);
    $editor_id = function_exists('byline_get_editorial_editor_id')
        ? byline_get_editorial_editor_id($post_id)
        : absint(get_post_meta($post_id, '_wwh_story_editor_user_id', true));
    $editor = byline_editorial_planning_user_display($editor_id);
    $workflow = function_exists('byline_get_editorial_story_state')
        ? byline_get_editorial_story_state($post_id)
        : ['status' => $post->post_status, 'storedStatus' => $post->post_status];
    $visual = function_exists('byline_get_editorial_media_request')
        ? byline_get_editorial_media_request($post_id)
        : ['type' => 'none', 'status' => 'needed', 'notes' => byline_editorial_planning_legacy_visuals($post_id), 'attachmentIds' => []];

    $post_date = (string) ($post->post_date_gmt ?? $post->post_date ?? '');
    $modified = (string) ($post->post_modified_gmt ?? $post->post_modified ?? '');
    $actual_schedule = $post->post_status === 'future' && $post_date !== ''
        ? byline_editorial_normalize_datetime(str_replace(' ', 'T', $post_date) . 'Z')
        : '';

    $thumbnail_id = function_exists('get_post_thumbnail_id') ? absint(get_post_thumbnail_id($post_id)) : 0;
    $has_thumbnail = function_exists('has_post_thumbnail') ? (bool) has_post_thumbnail($post_id) : $thumbnail_id > 0;
    if (function_exists('byline_editorial_task_count_for_story')) {
        $task_count = byline_editorial_task_count_for_story($post_id, $user_id);
    } elseif (function_exists('byline_task_count_for_story')) {
        // The shorter legacy-style helper is used by installations that load
        // the task domain independently of the newer editorial aliases.
        $task_count = byline_task_count_for_story($post_id, $user_id);
    } else {
        $task_count = 0;
    }
    $coverage = function_exists('byline_get_story_coverage_summary')
        ? byline_get_story_coverage_summary($post_id, $user_id)
        : [];

    $bylines = $author ? [$author] : [];
    if (function_exists('byline_get_story_contributors')) {
        $contributors = byline_get_story_contributors($post_id);
        if (is_array($contributors) && $contributors !== []) {
            $bylines = $contributors;
        }
    }

    return [
        'id' => $post_id,
        'title' => function_exists('get_the_title') ? (string) get_the_title($post_id) : (string) ($post->post_title ?? ''),
        'editUrl' => function_exists('get_edit_post_link') ? (string) get_edit_post_link($post_id, '') : '',
        'bylines' => $bylines,
        'writer' => $author,
        'workflow' => [
            'status' => (string) ($workflow['status'] ?? ''),
            'storedStatus' => (string) ($workflow['storedStatus'] ?? ''),
        ],
        'wordpress' => [
            'status' => (string) $post->post_status,
            'scheduledAt' => $actual_schedule,
            'published' => $post->post_status === 'publish',
            'publishedAt' => $post->post_status === 'publish' && $post_date !== ''
                ? byline_editorial_normalize_datetime(str_replace(' ', 'T', $post_date) . 'Z')
                : '',
        ],
        'editor' => $editor,
        'deadline' => function_exists('byline_get_editorial_deadline')
            ? byline_get_editorial_deadline($post_id)
            : byline_editorial_planning_legacy_deadline($post_id),
        'plannedPublishAt' => byline_get_editorial_planned_publish_at($post_id),
        'visual' => [
            'type' => (string) ($visual['type'] ?? 'none'),
            'status' => (string) ($visual['status'] ?? 'needed'),
            'assigneeId' => absint($visual['assigneeId'] ?? 0),
            'dueAt' => (string) ($visual['dueAt'] ?? ''),
            'notes' => (string) ($visual['notes'] ?? ''),
            'attachmentIds' => array_values(array_map('absint', (array) ($visual['attachmentIds'] ?? []))),
            'legacyNotes' => (string) ($visual['legacyNotes'] ?? ''),
        ],
        'tasks' => ['openCount' => absint($task_count)],
        'coverage' => is_array($coverage) ? $coverage : [],
        'featuredImage' => ['present' => $has_thumbnail, 'attachmentId' => $thumbnail_id],
        'modifiedAt' => $modified !== '' ? byline_editorial_normalize_datetime(str_replace(' ', 'T', $modified) . 'Z') : '',
    ];
}

function byline_editorial_planning_legacy_visuals(int $post_id): string
{
    return function_exists('byline_get_editorial_visuals')
        ? byline_get_editorial_visuals($post_id)
        : (string) get_post_meta($post_id, '_wwh_story_visuals', true);
}

function byline_editorial_planning_legacy_deadline(int $post_id): string
{
    return function_exists('byline_get_editorial_deadline')
        ? byline_get_editorial_deadline($post_id)
        : (string) get_post_meta($post_id, '_wwh_story_deadline', true);
}

/**
 * Return only rows the requesting user can edit. Capability filtering occurs
 * after the bounded query as edit_post is object-specific; no private row is
 * ever returned merely because it matched a collection filter.
 *
 * @return array<int,array<string,mixed>>
 */
function byline_editorial_collect_planning_stories(array $filters = [], ?int $user_id = null): array
{
    $user_id = byline_editorial_planning_current_user_id($user_id);
    if ($user_id <= 0 && function_exists('is_user_logged_in') && !is_user_logged_in()) {
        return [];
    }

    $posts = function_exists('get_posts')
        ? get_posts(byline_editorial_planning_query_args($filters, $user_id))
        : [];
    $items = [];
    $sanitized_filters = byline_editorial_sanitize_planning_filters($filters);

    foreach ((array) $posts as $post) {
        if (!$post instanceof WP_Post || !byline_editorial_can_view_planning_story((int) $post->ID, $user_id)) {
            continue;
        }

        $summary = byline_editorial_planning_story_summary((int) $post->ID, $user_id);
        if ($summary === []) {
            continue;
        }

        // A structured visual status is serialized, so apply the exact status
        // post-filter after the SQL prefilter instead of trusting LIKE alone.
        if (!empty($sanitized_filters['visualStatus']) && ($summary['visual']['status'] ?? '') !== $sanitized_filters['visualStatus']) {
            continue;
        }

        if (!empty($sanitized_filters['query'])) {
            $search = strtolower((string) $sanitized_filters['query']);
            $searchable = strtolower((string) ($summary['title'] ?? ''));
            foreach ((array) ($summary['bylines'] ?? []) as $byline) {
                if (is_array($byline)) {
                    $searchable .= ' ' . strtolower((string) ($byline['name'] ?? ''));
                }
            }
            if (is_array($summary['editor'] ?? null)) {
                $searchable .= ' ' . strtolower((string) ($summary['editor']['name'] ?? ''));
            }
            foreach ((array) ($summary['coverage'] ?? []) as $coverage) {
                if (is_array($coverage)) {
                    $searchable .= ' ' . strtolower((string) ($coverage['title'] ?? ''));
                }
            }
            if (strpos($searchable, $search) === false) {
                continue;
            }
        }

        if (!empty($sanitized_filters['coverage']) && function_exists('byline_story_has_coverage')
            && !byline_story_has_coverage((int) $post->ID, $sanitized_filters['coverage'])) {
            continue;
        }

        if (!empty($sanitized_filters['mine']) && $user_id > 0) {
            $is_mine = (int) $post->post_author === $user_id || (int) ($summary['editor']['id'] ?? 0) === $user_id;
            if (!$is_mine) {
                continue;
            }
        }

        $items[] = $summary;
    }

    return $items;
}

function byline_editorial_get_planning_collection(array $filters = [], ?int $user_id = null): array
{
    $items = byline_editorial_collect_planning_stories($filters, $user_id);
    $filters = byline_editorial_sanitize_planning_filters($filters);

    return [
        'items' => $items,
        'count' => count($items),
        'hasMore' => count($items) >= (int) ($filters['limit'] ?? 50),
        'filters' => $filters,
    ];
}

function byline_editorial_saved_view_user_id(?int $user_id = null)
{
    $current = byline_editorial_planning_current_user_id();
    $requested = byline_editorial_planning_current_user_id($user_id);

    $can_manage_other_users = function_exists('current_user_can') && current_user_can('manage_options');
    if ($requested <= 0 || ($current > 0 && $requested !== $current && !$can_manage_other_users)) {
        return new WP_Error('byline_editorial_saved_view_forbidden', 'Saved views belong to the current user.', ['status' => 403]);
    }

    return $requested;
}

function byline_editorial_saved_view_value(array $view): array
{
    $id = isset($view['id']) && is_scalar($view['id']) ? preg_replace('/[^a-zA-Z0-9_-]/', '', (string) $view['id']) : '';
    $name = isset($view['name']) && is_scalar($view['name']) ? sanitize_text_field((string) $view['name']) : '';
    $filters = isset($view['filters']) && is_array($view['filters'])
        ? byline_editorial_sanitize_planning_filters($view['filters'])
        : [];

    if ($id === '') {
        $id = function_exists('wp_generate_uuid4') ? wp_generate_uuid4() : uniqid('view_', true);
    }

    if (function_exists('mb_substr')) {
        $name = mb_substr($name, 0, 80);
    } else {
        $name = substr($name, 0, 80);
    }

    $created_at = isset($view['createdAt']) && is_scalar($view['createdAt'])
        ? byline_editorial_sanitize_planned_publish_at($view['createdAt'])
        : '';
    $updated_at = isset($view['updatedAt']) && is_scalar($view['updatedAt'])
        ? byline_editorial_sanitize_planned_publish_at($view['updatedAt'])
        : '';
    $result = [
        'id' => $id,
        'name' => $name,
        'filters' => $filters,
        'sort' => byline_editorial_sanitize_saved_view_sort($view['sort'] ?? []),
    ];
    if ($created_at !== '') {
        $result['createdAt'] = $created_at;
    }
    if ($updated_at !== '') {
        $result['updatedAt'] = $updated_at;
    }

    return $result;
}

/**
 * Saved-view sorting is a presentation preference, not a query escape hatch.
 * Keep only the keys the Planning client knows how to render.
 */
function byline_editorial_sanitize_saved_view_sort($sort): array
{
    $sort = is_array($sort) ? $sort : [];
    $allowed_keys = ['story', 'workflow', 'writer', 'deadline', 'planned', 'modified'];
    $key = isset($sort['key']) && is_scalar($sort['key']) ? sanitize_key((string) $sort['key']) : 'deadline';
    $direction = isset($sort['direction']) && is_scalar($sort['direction']) ? strtolower((string) $sort['direction']) : 'asc';

    return [
        'key' => in_array($key, $allowed_keys, true) ? $key : 'deadline',
        'direction' => in_array($direction, ['asc', 'desc'], true) ? $direction : 'asc',
    ];
}

/**
 * @return array<int,array<string,mixed>>|WP_Error
 */
function byline_editorial_get_saved_views(?int $user_id = null)
{
    $resolved = byline_editorial_saved_view_user_id($user_id);
    if ($resolved instanceof WP_Error) {
        return $resolved;
    }

    $raw = get_user_meta($resolved, BYLINE_EDITORIAL_SAVED_VIEWS_META, true);
    if (!is_array($raw)) {
        return [];
    }

    $views = [];
    foreach ($raw as $view) {
        if (!is_array($view)) {
            continue;
        }
        $normalized = byline_editorial_saved_view_value($view);
        if ($normalized['name'] !== '') {
            $views[] = $normalized;
        }
    }

    return array_slice($views, 0, 50);
}

/**
 * Create or replace a personal view. Passing an existing id updates that view
 * for the same account; it never searches or writes another user's meta.
 */
function byline_editorial_save_saved_view(array $view, ?int $user_id = null)
{
    $resolved = byline_editorial_saved_view_user_id($user_id);
    if ($resolved instanceof WP_Error) {
        return $resolved;
    }

    $normalized = byline_editorial_saved_view_value($view);
    if ($normalized['name'] === '') {
        return new WP_Error('byline_editorial_invalid_saved_view', 'A saved view needs a name.', ['status' => 400]);
    }

    $views = byline_editorial_get_saved_views($resolved);
    if ($views instanceof WP_Error) {
        return $views;
    }

    $now = gmdate('Y-m-d\TH:i:s\Z');
    $updated = false;
    foreach ($views as &$existing) {
        if ($existing['id'] !== $normalized['id']) {
            continue;
        }
        $normalized['createdAt'] = $existing['createdAt'] ?? $now;
        $normalized['updatedAt'] = $now;
        $existing = $normalized;
        $updated = true;
        break;
    }
    unset($existing);

    if (!$updated) {
        if (count($views) >= 50) {
            return new WP_Error('byline_editorial_saved_view_limit', 'You can save up to 50 Planning views.', ['status' => 400]);
        }
        $normalized['createdAt'] = $now;
        $normalized['updatedAt'] = $now;
        $views[] = $normalized;
    }

    update_user_meta($resolved, BYLINE_EDITORIAL_SAVED_VIEWS_META, $views);
    return $normalized;
}

function byline_editorial_update_saved_view(string $view_id, array $changes, ?int $user_id = null)
{
    $view_id = preg_replace('/[^a-zA-Z0-9_-]/', '', $view_id);
    $views = byline_editorial_get_saved_views($user_id);
    if ($views instanceof WP_Error) {
        return $views;
    }

    foreach ($views as $view) {
        if ($view['id'] === $view_id) {
            $changes['id'] = $view_id;
            $changes['name'] = array_key_exists('name', $changes) ? $changes['name'] : $view['name'];
            $changes['filters'] = array_key_exists('filters', $changes) ? $changes['filters'] : $view['filters'];
            $changes['sort'] = array_key_exists('sort', $changes) ? $changes['sort'] : ($view['sort'] ?? []);
            return byline_editorial_save_saved_view($changes, $user_id);
        }
    }

    return new WP_Error('byline_editorial_saved_view_not_found', 'That saved view does not exist.', ['status' => 404]);
}

function byline_editorial_delete_saved_view(string $view_id, ?int $user_id = null): bool
{
    $view_id = preg_replace('/[^a-zA-Z0-9_-]/', '', $view_id);
    $resolved = byline_editorial_saved_view_user_id($user_id);
    if ($resolved instanceof WP_Error) {
        return false;
    }

    $views = byline_editorial_get_saved_views($resolved);
    if ($views instanceof WP_Error) {
        return false;
    }

    $remaining = array_values(array_filter($views, static fn(array $view): bool => $view['id'] !== $view_id));
    if (count($remaining) === count($views)) {
        return false;
    }

    update_user_meta($resolved, BYLINE_EDITORIAL_SAVED_VIEWS_META, $remaining);
    return true;
}

function byline_editorial_register_planning_meta(): void
{
    register_post_meta('post', BYLINE_EDITORIAL_PLANNED_PUBLISH_META, [
        'single' => true,
        'type' => 'string',
        'sanitize_callback' => 'byline_editorial_sanitize_planned_publish_at',
        'show_in_rest' => false,
        'auth_callback' => static function (): bool {
            return current_user_can('edit_posts');
        },
    ]);
}
add_action('init', 'byline_editorial_register_planning_meta');
