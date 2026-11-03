<?php
/**
 * Multiple production assignments per story (media v2).
 *
 * A story may need cafeteria photos from one person, a timeline graphic from
 * another and reaction video from a third, each with its own owner, due time,
 * status and Media Library attachments. There is intentionally no "writing"
 * assignment: the WordPress story, its contributors and its workflow are the
 * writing work.
 *
 * Transition from the single structured request (`_byline_story_visual_request_v1`)
 * is additive and never destructive:
 *
 * - While `_byline_story_media_assignments_v2` is absent, reads project the
 *   installed request as one assignment (id `legacy-v1`). Reads never write.
 * - The first intentional v2 mutation materializes that projection into v2 and
 *   applies the change in the same compare-and-swap write.
 * - The installed v1 value and the legacy free-text note are left untouched for
 *   compatibility and recovery.
 * - The original single-request API keeps working: once v2 exists it reads and
 *   writes the story's primary assignment.
 */
if (!defined('ABSPATH')) {
    exit;
}

const BYLINE_MEDIA_ASSIGNMENTS_META = '_byline_story_media_assignments_v2';
const BYLINE_MEDIA_ASSIGNMENTS_MAX = 12;
const BYLINE_MEDIA_LEGACY_ID = 'legacy-v1';

function byline_media_assignment_types(): array
{
    return ['photo', 'gallery', 'graphic', 'video', 'audio', 'other'];
}

function byline_media_assignment_default_title(string $type): string
{
    return ['photo' => 'Photo request', 'gallery' => 'Gallery', 'graphic' => 'Graphic', 'video' => 'Video', 'audio' => 'Audio', 'other' => 'Visual request'][$type] ?? 'Visual request';
}

function byline_media_assignment_valid_id($value): string
{
    $value = is_string($value) ? strtolower(trim($value)) : '';
    return $value === BYLINE_MEDIA_LEGACY_ID ? $value : byline_story_valid_uuid($value);
}

function byline_media_assignments_materialized(int $story_id): bool
{
    return byline_story_meta_exists($story_id, BYLINE_MEDIA_ASSIGNMENTS_META);
}

/** One stored row, or null. Attachment IDs are kept as written so invalid ones can be reported. */
function byline_media_assignment_row($row): ?array
{
    if (!is_array($row)) {
        return null;
    }
    $id = byline_media_assignment_valid_id($row['id'] ?? '');
    if ($id === '') {
        return null;
    }
    $type = sanitize_key((string) ($row['type'] ?? 'other'));
    $type = in_array($type, byline_media_assignment_types(), true) ? $type : 'other';
    $status = sanitize_key((string) ($row['status'] ?? 'needed'));
    $title = byline_story_line($row['title'] ?? '', 160);
    return [
        'id' => $id,
        'title' => $title !== '' ? $title : byline_media_assignment_default_title($type),
        'type' => $type,
        'status' => in_array($status, BYLINE_EDITORIAL_MEDIA_STATUSES, true) ? $status : 'needed',
        'assigneeId' => absint($row['assigneeId'] ?? 0),
        'dueAt' => byline_editorial_normalize_datetime($row['dueAt'] ?? ''),
        'notes' => byline_story_paragraph($row['notes'] ?? '', 4000),
        'attachmentIds' => byline_editorial_media_attachment_input_ids($row['attachmentIds'] ?? []),
        'order' => max(1, absint($row['order'] ?? 1)),
        'createdAt' => byline_editorial_normalize_datetime($row['createdAt'] ?? ''),
        'updatedAt' => byline_editorial_normalize_datetime($row['updatedAt'] ?? ''),
    ];
}

/** @return list<array<string,mixed>> */
function byline_media_assignments_normalize(array $rows): array
{
    $assignments = [];
    $seen = [];
    foreach (array_slice($rows, 0, BYLINE_MEDIA_ASSIGNMENTS_MAX) as $row) {
        $assignment = byline_media_assignment_row($row);
        if ($assignment !== null && !isset($seen[$assignment['id']])) {
            $seen[$assignment['id']] = true;
            $assignments[] = $assignment;
        }
    }
    usort($assignments, static function (array $a, array $b): int { return [$a['order'], $a['createdAt'], $a['id']] <=> [$b['order'], $b['createdAt'], $b['id']]; });
    return $assignments;
}

/**
 * The installed single request, shown as one assignment. Read-only: nothing here
 * is persisted until a v2 mutation materializes it.
 *
 * @return list<array<string,mixed>>
 */
function byline_media_assignments_legacy_projection(int $story_id): array
{
    $stored = get_post_meta($story_id, BYLINE_EDITORIAL_MEDIA_REQUEST_META, true);
    $request = byline_editorial_sanitize_media_request($stored);
    $structured = byline_editorial_media_request_is_structured($story_id);
    $notes = $structured ? $request['notes'] : byline_editorial_media_request_legacy_notes($story_id);
    if ($request['type'] === 'none' && $notes === '') {
        return [];
    }
    $type = $request['type'] === 'none' ? 'other' : $request['type'];
    $row = byline_media_assignment_row([
        'id' => BYLINE_MEDIA_LEGACY_ID, 'title' => byline_media_assignment_default_title($type), 'type' => $type,
        'status' => $request['status'], 'assigneeId' => $request['assigneeId'], 'dueAt' => $request['dueAt'], 'notes' => $notes,
        'attachmentIds' => byline_editorial_media_attachment_input_ids(byline_editorial_media_request_attachment_value($stored)),
        'order' => 1,
    ]);
    return $row === null ? [] : [$row];
}

/** Stored assignments, or the projected installed request. Never writes. */
function byline_media_assignments_stored(int $story_id): array
{
    if (byline_media_assignments_materialized($story_id)) {
        $stored = get_post_meta($story_id, BYLINE_MEDIA_ASSIGNMENTS_META, true);
        return byline_media_assignments_normalize(is_array($stored) ? $stored : []);
    }
    return byline_media_assignments_legacy_projection($story_id);
}

/** The assignment the single-request API speaks for: first unfinished, else first. */
function byline_media_assignment_primary(array $assignments): ?array
{
    foreach ($assignments as $assignment) {
        if ($assignment['status'] !== 'done') {
            return $assignment;
        }
    }
    return $assignments[0] ?? null;
}

function byline_media_assignments_involve_user(int $story_id, int $user_id): bool
{
    foreach (byline_media_assignments_stored($story_id) as $assignment) {
        if ($assignment['assigneeId'] === $user_id) {
            return true;
        }
    }
    return false;
}

/**
 * Compact roll-up for Planning rows (no notes).
 *
 * @return array{total:int,open:int,assigneeIds:list<int>,nextDueAt:string|null}
 */
function byline_media_assignments_summary(int $story_id): array
{
    $assignments = byline_media_assignments_stored($story_id);
    $open = array_values(array_filter($assignments, static function (array $a): bool { return $a['status'] !== 'done'; }));
    $due = array_values(array_filter(array_column($open, 'dueAt')));
    sort($due);
    return [
        'total' => count($assignments),
        'open' => count($open),
        'assigneeIds' => array_values(array_unique(array_filter(array_column($open, 'assigneeId')))),
        'nextDueAt' => $due[0] ?? null,
    ];
}

/**
 * Add attachment readiness (alt text, credit, rights, featured image) to one
 * assignment. Shared with the installed single request.
 *
 * @return array<string,mixed>
 */
function byline_media_assignment_decorate(int $story_id, array $assignment, ?int $user_id = null): array
{
    $decorated = byline_editorial_media_request_decorate($story_id, byline_editorial_sanitize_media_request($assignment), $assignment, $user_id, '', false);
    $readiness = $decorated['mediaReadiness'];
    return [
        'id' => $assignment['id'], 'title' => $assignment['title'], 'type' => $assignment['type'], 'status' => $assignment['status'],
        'assigneeId' => $assignment['assigneeId'], 'dueAt' => $assignment['dueAt'], 'notes' => $assignment['notes'],
        'attachmentIds' => $decorated['attachmentIds'], 'attachments' => $decorated['attachments'],
        'invalidAttachmentIds' => $decorated['invalidAttachmentIds'], 'mediaReadiness' => $readiness,
        'featuredAttachmentId' => absint($readiness['featuredAttachmentId'] ?? 0) ?: null,
        'order' => $assignment['order'], 'isLegacy' => $assignment['id'] === BYLINE_MEDIA_LEGACY_ID && !byline_media_assignments_materialized($story_id),
        'createdAt' => $assignment['createdAt'], 'updatedAt' => $assignment['updatedAt'],
    ];
}

/**
 * The single-request shape that speaks for ALL of a story's assignments, so
 * readiness can warn about any open assignment or any linked file with missing
 * alt text, credit or rights — not only the primary one. Null until a story has
 * been given assignments in v2.
 *
 * @return array<string,mixed>|null
 */
function byline_media_assignments_readiness_view(int $story_id): ?array
{
    if (!byline_media_assignments_materialized($story_id)) {
        return null;
    }
    $assignments = byline_get_story_media_assignments($story_id);
    $open = array_filter($assignments, static function (array $a): bool { return $a['status'] !== 'done'; });
    $union = static function (string $field) use ($assignments): array {
        $ids = [];
        foreach ($assignments as $a) {
            $ids = array_merge($ids, array_map('absint', (array) ($a['mediaReadiness'][$field] ?? [])));
        }
        return array_values(array_unique($ids));
    };
    $readiness = ['invalidAttachmentIds' => $union('invalidAttachmentIds'), 'missingAltIds' => $union('missingAltIds'), 'missingCreditIds' => $union('missingCreditIds'), 'missingRightsIds' => $union('missingRightsIds')];
    return [
        'type' => $assignments === [] ? 'none' : 'photo', 'status' => $open === [] ? 'done' : 'needed', 'isLegacy' => false,
        'invalidAttachmentIds' => $readiness['invalidAttachmentIds'], 'mediaReadiness' => $readiness,
    ];
}

/** @return list<array<string,mixed>> */
function byline_get_story_media_assignments(int $story_id, ?int $user_id = null): array
{
    return array_map(static function (array $assignment) use ($story_id, $user_id): array {
        return byline_media_assignment_decorate($story_id, $assignment, $user_id);
    }, byline_media_assignments_stored($story_id));
}

/** Stored fields from a validated request-shaped array. */
function byline_media_assignment_apply(array $assignment, array $request): array
{
    foreach (['status', 'assigneeId', 'dueAt', 'notes', 'attachmentIds'] as $field) {
        $assignment[$field] = $request[$field];
    }
    return $assignment;
}

/**
 * Create (no `$id`) or update one assignment. The first call on a story that
 * still has only the installed request materializes it into v2 in the same
 * atomic write.
 *
 * @return array{assignment:array<string,mixed>,assignments:list<array<string,mixed>>}|WP_Error
 */
function byline_media_assignment_save(int $story_id, array $input, string $id = '', ?int $user_id = null)
{
    $access = byline_story_context($story_id, $user_id);
    if (!$access['exists']) {
        return new WP_Error('byline_editorial_unknown_story', 'This story does not exist.', ['status' => 404]);
    }
    if (!$access['view']) {
        return new WP_Error('byline_story_context_forbidden', 'You are not part of this story.', ['status' => 403]);
    }
    $user_id = $access['user'];
    $id = $id !== '' ? byline_media_assignment_valid_id($id) : '';
    $expected = isset($input['expectedUpdatedAt']) && is_string($input['expectedUpdatedAt']) ? $input['expectedUpdatedAt'] : null;
    $result = ['assignment' => null, 'previous' => null];

    $stored = byline_story_collection_update($story_id, BYLINE_MEDIA_ASSIGNMENTS_META, static function (array $rows) use ($story_id, $input, $id, $access, $user_id, $expected, &$result) {
        $position = null;
        foreach ($rows as $index => $row) {
            if ($id !== '' && $row['id'] === $id) {
                $position = $index;
            }
        }
        if ($id !== '' && $position === null) {
            return byline_story_not_found('assignment');
        }
        $existing = $position !== null ? $rows[$position] : null;
        $mine = $existing !== null && $existing['assigneeId'] === $user_id;

        if ($existing === null && !$access['manage']) {
            return new WP_Error('byline_media_forbidden', 'You can add production assignments only to stories you report or edit.', ['status' => 403]);
        }
        if ($existing !== null) {
            if (!$access['manage'] && !$mine) {
                return new WP_Error('byline_media_forbidden', 'You can update only production assignments assigned to you.', ['status' => 403]);
            }
            if ($expected !== null && $expected !== $existing['updatedAt']) {
                return byline_story_stale();
            }
            if (!$access['manage'] && array_diff(array_keys($input), ['status', 'notes', 'attachmentIds', 'expectedUpdatedAt']) !== []) {
                return new WP_Error('byline_media_forbidden', 'You can change only the status, notes and files of your own assignment.', ['status' => 403]);
            }
        } elseif (count($rows) >= BYLINE_MEDIA_ASSIGNMENTS_MAX) {
            return new WP_Error('byline_media_limit', 'A story can have up to ' . BYLINE_MEDIA_ASSIGNMENTS_MAX . ' production assignments.', ['status' => 400]);
        }

        $base = $existing ?? ['id' => '', 'title' => '', 'type' => 'photo', 'status' => 'needed', 'assigneeId' => 0, 'dueAt' => '', 'notes' => '', 'attachmentIds' => [], 'order' => 0];
        $merged = $base;
        foreach (['title', 'type', 'status', 'notes'] as $field) {
            if (array_key_exists($field, $input)) {
                $merged[$field] = $input[$field];
            }
        }
        if (array_key_exists('assigneeId', $input)) {
            $merged['assigneeId'] = $input['assigneeId'];
        }
        if (array_key_exists('dueAt', $input)) {
            $merged['dueAt'] = $input['dueAt'];
        }
        $has_attachments = array_key_exists('attachmentIds', $input);
        if ($has_attachments) {
            $merged['attachmentIds'] = $input['attachmentIds'];
        }

        $type = sanitize_key((string) $merged['type']);
        if (!in_array($type, byline_media_assignment_types(), true)) {
            return new WP_Error('byline_media_invalid_type', 'Choose photo, gallery, graphic, video, audio or other.', ['status' => 400]);
        }
        $status_input = sanitize_key((string) $merged['status']);
        if (!in_array($status_input, BYLINE_EDITORIAL_MEDIA_STATUSES, true)) {
            return new WP_Error('byline_media_invalid_status', 'Choose a valid production status.', ['status' => 400]);
        }
        $title = byline_story_line($merged['title'] ?? '', 160);
        if ($title === '') {
            $title = byline_media_assignment_default_title($type);
        }
        $due = '';
        if (($merged['dueAt'] ?? '') !== '' && $merged['dueAt'] !== null) {
            $due = byline_editorial_normalize_datetime($merged['dueAt']);
            if ($due === '') {
                return new WP_Error('byline_media_invalid_due', 'Use a valid due date and time.', ['status' => 400]);
            }
        }
        $assignee = absint($merged['assigneeId'] ?? 0);
        if ($assignee > 0) {
            if (!get_user_by('id', $assignee)) {
                return new WP_Error('byline_editorial_media_unknown_assignee', 'That media assignee does not exist.', ['status' => 400]);
            }
            if ($assignee !== ($existing['assigneeId'] ?? 0) && !byline_editorial_media_assignee_can_be_set($story_id, $assignee, $user_id)) {
                return new WP_Error('byline_editorial_media_assignment_forbidden', 'Only an editor can assign media work to another user.', ['status' => 403]);
            }
        }
        $attachment_input = $has_attachments ? $input['attachmentIds'] : $base['attachmentIds'];
        $raw_attachment_ids = byline_editorial_media_attachment_input_ids($attachment_input);
        if ($has_attachments) {
            $invalid = byline_editorial_media_invalid_attachment_ids($raw_attachment_ids, $story_id, $user_id);
            if ($invalid !== []) {
                return new WP_Error('byline_editorial_media_invalid_attachment', 'One or more selected media items is missing or cannot be read by this user.', ['status' => 400, 'attachmentIds' => $invalid]);
            }
            $featured = byline_editorial_media_attachment_featured_id($story_id);
            if ($featured > 0 && in_array($featured, $base['attachmentIds'], true) && !in_array($featured, $raw_attachment_ids, true)) {
                $kept_elsewhere = false;
                foreach ($rows as $row) {
                    if ($row['id'] !== ($existing['id'] ?? '') && in_array($featured, $row['attachmentIds'], true)) {
                        $kept_elsewhere = true;
                    }
                }
                if (!$kept_elsewhere) {
                    return byline_editorial_media_featured_in_use_error($story_id, $featured);
                }
            }
        }

        // Reuse the one status reconciliation the single request has always used.
        $request = ['type' => $type, 'status' => $status_input, 'assigneeId' => $assignee, 'dueAt' => $due, 'notes' => byline_story_paragraph($merged['notes'] ?? '', 4000), 'attachmentIds' => $raw_attachment_ids];
        // Only an actual change to the files is checked against what this user may
        // read; a status update must not fail because a colleague linked a file.
        $context = [
            'previousRequest' => byline_editorial_sanitize_media_request($base),
            'previousAttachmentIds' => $base['attachmentIds'],
            'statusProvided' => array_key_exists('status', $input),
            'attachmentFieldProvided' => $has_attachments,
        ];
        if ($has_attachments) {
            $context['userId'] = $user_id;
            $a = $base['attachmentIds'];
            $b = $raw_attachment_ids;
            sort($a);
            sort($b);
            if ($a !== $b) {
                $context['event'] = 'attachment-change';
            }
        }
        $reconciled = byline_editorial_reconcile_media_request_status($story_id, $request, $context);
        if (is_wp_error($reconciled)) {
            return $reconciled;
        }

        $now = byline_story_now();
        $next_order = 1 + max(array_merge([0], array_column($rows, 'order')));
        $record = $existing !== null
            ? byline_media_assignment_apply(array_merge($existing, ['title' => $title, 'type' => $type, 'updatedAt' => $now]), $reconciled)
            : byline_media_assignment_apply(['id' => byline_story_uuid(), 'title' => $title, 'type' => $type, 'order' => $next_order, 'createdAt' => $now, 'updatedAt' => $now], $reconciled);
        if ($existing !== null && array_key_exists('order', $input) && $access['manage']) {
            $record['order'] = max(1, absint($input['order']));
        }
        $result = ['assignment' => $record, 'previous' => $existing];
        if ($position !== null) {
            $rows[$position] = $record;
        } else {
            $rows[] = $record;
        }
        return $rows;
    }, ['normalize' => 'byline_media_assignments_normalize', 'initial' => 'byline_media_assignments_legacy_projection', 'persist_empty' => true]);
    if (is_wp_error($stored)) {
        return $stored;
    }
    $decorated = byline_media_assignment_decorate($story_id, byline_media_assignment_row($result['assignment']), $user_id);
    do_action('byline_editorial_media_assignment_changed', $story_id, $decorated, $result['previous'], $result['previous'] === null ? 'created' : 'updated', $user_id);
    return ['assignment' => $decorated, 'assignments' => byline_get_story_media_assignments($story_id, $user_id)];
}

/** @return array{assignments:list<array<string,mixed>>}|WP_Error */
function byline_media_assignment_delete(int $story_id, string $id, ?int $user_id = null, ?string $expected_updated_at = null)
{
    $access = byline_story_context($story_id, $user_id);
    if (!$access['exists'] || !$access['view']) {
        return new WP_Error('byline_story_context_forbidden', 'You are not part of this story.', ['status' => $access['exists'] ? 403 : 404]);
    }
    if (!$access['manage']) {
        return new WP_Error('byline_media_forbidden', 'You cannot remove production assignments from this story.', ['status' => 403]);
    }
    $id = byline_media_assignment_valid_id($id);
    $removed = null;
    $stored = byline_story_collection_update($story_id, BYLINE_MEDIA_ASSIGNMENTS_META, static function (array $rows) use ($story_id, $id, &$removed, $expected_updated_at) {
        foreach ($rows as $index => $row) {
            if ($row['id'] !== $id) {
                continue;
            }
            if ($expected_updated_at !== null && $expected_updated_at !== $row['updatedAt']) { return byline_story_stale(); }
            $featured = byline_editorial_media_attachment_featured_id($story_id);
            if ($featured > 0 && in_array($featured, $row['attachmentIds'], true)) {
                $elsewhere = false;
                foreach ($rows as $other) {
                    if ($other['id'] !== $id && in_array($featured, $other['attachmentIds'], true)) {
                        $elsewhere = true;
                    }
                }
                if (!$elsewhere) {
                    return byline_editorial_media_featured_in_use_error($story_id, $featured);
                }
            }
            $removed = $row;
            unset($rows[$index]);
            return $rows;
        }
        return byline_story_not_found('assignment');
    }, ['normalize' => 'byline_media_assignments_normalize', 'initial' => 'byline_media_assignments_legacy_projection', 'persist_empty' => true]);
    if (is_wp_error($stored)) {
        return $stored;
    }
    do_action('byline_editorial_media_assignment_changed', $story_id, $removed, $removed, 'deleted', $access['user']);
    return ['assignments' => byline_get_story_media_assignments($story_id, $access['user'])];
}

/**
 * Persist the single-request API's write onto the story's primary assignment.
 * Used by the original media endpoint once a story has been materialized.
 *
 * @return true|WP_Error
 */
function byline_media_assignment_persist_primary(int $story_id, array $request)
{
    $stored = byline_story_collection_update($story_id, BYLINE_MEDIA_ASSIGNMENTS_META, static function (array $rows) use ($request) {
        $primary = byline_media_assignment_primary($rows);
        $now = byline_story_now();
        if ($primary === null) {
            if (($request['type'] ?? 'none') === 'none') {
                return $rows;
            }
            $type = in_array($request['type'], byline_media_assignment_types(), true) ? $request['type'] : 'other';
            $rows[] = byline_media_assignment_apply(['id' => byline_story_uuid(), 'title' => byline_media_assignment_default_title($type), 'type' => $type, 'order' => 1 + max(array_merge([0], array_column($rows, 'order'))), 'createdAt' => $now, 'updatedAt' => $now], $request);
            return $rows;
        }
        foreach ($rows as $index => $row) {
            if ($row['id'] === $primary['id']) {
                $type = in_array($request['type'] ?? '', byline_media_assignment_types(), true) ? $request['type'] : $row['type'];
                $rows[$index] = byline_media_assignment_apply(array_merge($row, ['type' => $type, 'updatedAt' => $now]), $request);
            }
        }
        return $rows;
    }, ['normalize' => 'byline_media_assignments_normalize', 'persist_empty' => true]);
    return is_wp_error($stored) ? $stored : true;
}

/**
 * Private production-assignment rows across stories for the Media Desk. A story
 * manager sees every assignment; a participant who holds only assigned work sees
 * only their own.
 *
 * @return list<array<string,mixed>>
 */
function byline_list_editorial_media_assignments(array $filters = [], ?int $user_id = null): array
{
    $limit = min(200, max(1, absint($filters['limit'] ?? 100)));
    $posts = get_posts([
        'post_type' => 'post', 'post_status' => ['draft', 'pending', 'future', 'publish', 'private'],
        'posts_per_page' => $limit, 'orderby' => 'modified', 'order' => 'DESC', 'no_found_rows' => true,
        'meta_query' => ['relation' => 'OR',
            ['key' => BYLINE_MEDIA_ASSIGNMENTS_META, 'compare' => 'EXISTS'],
            ['key' => BYLINE_EDITORIAL_MEDIA_REQUEST_META, 'compare' => 'EXISTS'],
            ['key' => '_wwh_story_visuals', 'value' => '', 'compare' => '!='],
        ],
    ] + (!empty($filters['storyId']) ? ['p' => absint($filters['storyId'])] : []));
    $status = isset($filters['status']) ? sanitize_key((string) $filters['status']) : '';
    $type = isset($filters['type']) ? sanitize_key((string) $filters['type']) : '';
    $assignee = isset($filters['assigneeId']) ? absint($filters['assigneeId']) : 0;
    $due_from = isset($filters['dueFrom']) ? byline_editorial_normalize_datetime($filters['dueFrom']) : '';
    $due_to = isset($filters['dueTo']) ? byline_editorial_normalize_datetime($filters['dueTo']) : '';
    $rows = [];
    foreach ($posts as $post) {
        $access = byline_story_context((int) $post->ID, $user_id);
        if (!$access['view']) {
            continue;
        }
        foreach (byline_get_story_media_assignments((int) $post->ID, $access['user']) as $assignment) {
            if (!$access['manage'] && $assignment['assigneeId'] !== $access['user']) {
                continue;
            }
            if (($status !== '' && $assignment['status'] !== $status) || ($type !== '' && $assignment['type'] !== $type)
                || ($assignee > 0 && $assignment['assigneeId'] !== $assignee)
                || ($due_from !== '' && ($assignment['dueAt'] === '' || $assignment['dueAt'] < $due_from))
                || ($due_to !== '' && ($assignment['dueAt'] === '' || $assignment['dueAt'] > $due_to))) {
                continue;
            }
            $featured_id = absint(get_post_thumbnail_id((int) $post->ID));
            $rows[] = [
                'storyId' => (int) $post->ID, 'title' => (string) get_the_title((int) $post->ID),
                'editUrl' => (string) get_edit_post_link((int) $post->ID, ''), 'wordpressStatus' => (string) $post->post_status,
                'assignment' => $assignment,
                'featuredImage' => ['attachmentId' => $featured_id, 'isLinked' => $featured_id > 0 && in_array($featured_id, $assignment['attachmentIds'], true)],
            ];
        }
    }
    usort($rows, static function (array $a, array $b): int {
        $left = (string) $a['assignment']['dueAt'];
        $right = (string) $b['assignment']['dueAt'];
        if (($left === '') !== ($right === '')) {
            return $left === '' ? 1 : -1;
        }
        return [$left, $b['storyId'], $a['assignment']['order']] <=> [$right, $a['storyId'], $b['assignment']['order']];
    });
    return $rows;
}

add_action('init', static function (): void {
    register_post_meta('post', BYLINE_MEDIA_ASSIGNMENTS_META, [
        'type' => 'array', 'single' => true, 'show_in_rest' => false,
        'auth_callback' => static function ($allowed, $key, $post_id): bool { return current_user_can('edit_post', (int) $post_id); },
    ]);
});
