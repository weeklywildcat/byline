<?php
/**
 * Story brief and Reporting Plan: sources and appointments.
 *
 * Everything here is private newsroom context attached to the canonical
 * WordPress story. Nothing is a post type, nothing is registered with
 * `show_in_rest`, and nothing is read by the static-site snapshot.
 *
 * A source is a story-scoped reporting target (a person, an organization, or a
 * still-undefined "local reporter"). An appointment is a place and time someone
 * must be: an interview, a meeting, a shoot. An appointment is not a task
 * deadline, and it is not the article. Exact times are stored as UTC; target
 * windows are date-only values interpreted in the WordPress site timezone, so a
 * fuzzy "next week" never becomes a fabricated Monday-at-nine timestamp.
 */
if (!defined('ABSPATH')) {
    exit;
}

const BYLINE_STORY_BRIEF_META = '_byline_story_brief';
const BYLINE_STORY_SOURCES_META = '_byline_story_sources_v1';
const BYLINE_STORY_APPOINTMENTS_META = '_byline_story_appointments_v1';
const BYLINE_STORY_BRIEF_MAX = 4000;
const BYLINE_STORY_SOURCES_MAX = 30;
const BYLINE_STORY_APPOINTMENTS_MAX = 40;
const BYLINE_STORY_REPORTING_ASSIGNEES_MAX = 4;

function byline_source_statuses(): array
{
    return ['planned', 'contacted', 'waiting', 'needs-scheduling', 'scheduled', 'interviewed', 'declined', 'unavailable'];
}

function byline_appointment_kinds(): array
{
    return ['interview', 'meeting', 'event', 'photo', 'press-conference', 'game', 'performance', 'reporting', 'other'];
}

function byline_appointment_statuses(): array
{
    return ['planned', 'tentative', 'confirmed', 'completed', 'cancelled'];
}

function byline_appointment_modes(): array
{
    return ['unscheduled', 'window', 'exact'];
}

/* ----------------------------------------------------------------- brief */

function byline_get_story_brief(int $story_id): string
{
    return byline_story_paragraph(get_post_meta($story_id, BYLINE_STORY_BRIEF_META, true), BYLINE_STORY_BRIEF_MAX);
}

/**
 * Replace the brief. When `$expected` is supplied it must equal the stored text,
 * so a stale editor gets a conflict instead of erasing a colleague's rewrite.
 *
 * @return string|WP_Error
 */
function byline_set_story_brief(int $story_id, $brief, ?string $expected = null)
{
    if (!is_string($brief) || (function_exists('mb_strlen') ? mb_strlen($brief) : strlen($brief)) > BYLINE_STORY_BRIEF_MAX) {
        return new WP_Error('byline_brief_too_long', 'The brief can be up to ' . BYLINE_STORY_BRIEF_MAX . ' characters.', ['status' => 400]);
    }
    $next = byline_story_paragraph($brief, BYLINE_STORY_BRIEF_MAX);
    for ($attempt = 0; $attempt < BYLINE_STORY_COLLECTION_ATTEMPTS; $attempt++) {
        if ($attempt > 0) {
            byline_story_flush_meta_cache($story_id);
        }
        $exists = byline_story_meta_exists($story_id, BYLINE_STORY_BRIEF_META);
        $previous = $exists ? get_post_meta($story_id, BYLINE_STORY_BRIEF_META, true) : '';
        if ($expected !== null && byline_story_paragraph($previous, BYLINE_STORY_BRIEF_MAX) !== byline_story_paragraph($expected, BYLINE_STORY_BRIEF_MAX)) {
            return new WP_Error('byline_brief_conflict', 'The brief changed while you were editing it. Reload the story to see the newer version.', ['status' => 409]);
        }
        if ($next === '') {
            if (!$exists || delete_post_meta($story_id, BYLINE_STORY_BRIEF_META, $previous)) {
                return '';
            }
            continue;
        }
        if ($exists && $previous === $next) {
            return $next;
        }
        $written = $exists
            ? update_post_meta($story_id, BYLINE_STORY_BRIEF_META, wp_slash($next), $previous)
            : add_post_meta($story_id, BYLINE_STORY_BRIEF_META, wp_slash($next), true);
        if ($written) {
            return $next;
        }
    }
    return new WP_Error('byline_brief_conflict', 'The brief changed while you were editing it. Reload the story to see the newer version.', ['status' => 409]);
}

/* ---------------------------------------------------------- normalization */

/** Optional exact timestamp input: '' clears, anything unparseable is an error. */
function byline_story_timestamp_input($value)
{
    if ($value === null || $value === '') {
        return '';
    }
    $normalized = is_scalar($value) ? byline_editorial_normalize_datetime($value) : '';
    return $normalized !== '' ? $normalized : new WP_Error('byline_invalid_datetime', 'Use a valid date and time.', ['status' => 400]);
}

function byline_story_date_input($value)
{
    if ($value === null || $value === '') {
        return '';
    }
    $date = byline_story_date($value);
    return $date !== '' ? $date : new WP_Error('byline_invalid_date', 'Use a valid date.', ['status' => 400]);
}

/**
 * Build one canonical source from existing + incoming fields. Strict: the write
 * path rejects bad input; the read path (`byline_story_source_stored`) drops
 * rows that no longer validate.
 *
 * @return array<string,mixed>|WP_Error
 */
function byline_story_source_build(array $input, ?array $existing, array $access)
{
    $merged = array_merge($existing ?? ['label' => '', 'role' => '', 'organization' => '', 'status' => 'planned', 'assigneeIds' => [], 'notes' => ''], array_intersect_key($input, array_flip(['label', 'role', 'organization', 'status', 'assigneeIds', 'notes'])));
    $label = byline_story_line($merged['label'] ?? '', 120);
    if ($label === '') {
        return new WP_Error('byline_source_label_required', 'A source needs a label. A role or "Name TBD" is fine.', ['status' => 400]);
    }
    $status = sanitize_key((string) ($merged['status'] ?? 'planned'));
    if (!in_array($status, byline_source_statuses(), true)) {
        return new WP_Error('byline_source_invalid_status', 'Choose a valid source status.', ['status' => 400]);
    }
    $assignees = byline_story_validate_assignees(
        is_array($merged['assigneeIds'] ?? null) ? $merged['assigneeIds'] : [],
        $existing['assigneeIds'] ?? [], $access, BYLINE_STORY_REPORTING_ASSIGNEES_MAX
    );
    if (is_wp_error($assignees)) {
        return $assignees;
    }
    return [
        'label' => $label,
        'role' => byline_story_line($merged['role'] ?? '', 120),
        'organization' => byline_story_line($merged['organization'] ?? '', 120),
        'status' => $status,
        'assigneeIds' => $assignees,
        'notes' => byline_story_paragraph($merged['notes'] ?? '', 2000),
    ];
}

/** @return array<string,mixed>|null */
function byline_story_source_stored($row): ?array
{
    if (!is_array($row) || byline_story_valid_uuid($row['id'] ?? '') === '') {
        return null;
    }
    $label = byline_story_line($row['label'] ?? '', 120);
    $status = sanitize_key((string) ($row['status'] ?? 'planned'));
    if ($label === '') {
        return null;
    }
    return [
        'id' => byline_story_valid_uuid($row['id']),
        'label' => $label,
        'role' => byline_story_line($row['role'] ?? '', 120),
        'organization' => byline_story_line($row['organization'] ?? '', 120),
        'status' => in_array($status, byline_source_statuses(), true) ? $status : 'planned',
        'assigneeIds' => byline_story_id_list($row['assigneeIds'] ?? [], BYLINE_STORY_REPORTING_ASSIGNEES_MAX),
        'notes' => byline_story_paragraph($row['notes'] ?? '', 2000),
        'createdAt' => byline_editorial_normalize_datetime($row['createdAt'] ?? ''),
        'updatedAt' => byline_editorial_normalize_datetime($row['updatedAt'] ?? ''),
    ];
}

/**
 * Build one canonical appointment. The schedule mode decides which timing
 * fields survive, so switching modes can never leave stale values active.
 *
 * @param list<array<string,mixed>> $sources
 * @return array<string,mixed>|WP_Error
 */
function byline_story_appointment_build(array $input, ?array $existing, array $sources, array $access)
{
    $fields = ['title', 'kind', 'status', 'scheduleMode', 'windowStart', 'windowEnd', 'startAt', 'endAt', 'assigneeIds', 'sourceId', 'location', 'notes'];
    $defaults = ['title' => '', 'kind' => 'other', 'status' => 'planned', 'scheduleMode' => 'unscheduled', 'windowStart' => '', 'windowEnd' => '', 'startAt' => '', 'endAt' => '', 'assigneeIds' => [], 'sourceId' => null, 'location' => '', 'notes' => ''];
    $merged = array_merge($existing ?? $defaults, array_intersect_key($input, array_flip($fields)));

    $title = byline_story_line($merged['title'] ?? '', 160);
    if ($title === '') {
        return new WP_Error('byline_appointment_title_required', 'An appointment needs a title.', ['status' => 400]);
    }
    $kind = sanitize_key((string) ($merged['kind'] ?? 'other'));
    $status = sanitize_key((string) ($merged['status'] ?? 'planned'));
    $mode = sanitize_key((string) ($merged['scheduleMode'] ?? 'unscheduled'));
    if (!in_array($kind, byline_appointment_kinds(), true)) {
        return new WP_Error('byline_appointment_invalid_kind', 'Choose a valid appointment type.', ['status' => 400]);
    }
    if (!in_array($status, byline_appointment_statuses(), true)) {
        return new WP_Error('byline_appointment_invalid_status', 'Choose a valid appointment status.', ['status' => 400]);
    }
    if (!in_array($mode, byline_appointment_modes(), true)) {
        return new WP_Error('byline_appointment_invalid_mode', 'Choose whether the appointment is unscheduled, a date range, or an exact time.', ['status' => 400]);
    }

    $timing = ['windowStart' => null, 'windowEnd' => null, 'startAt' => null, 'endAt' => null];
    if ($mode === 'window') {
        $start = byline_story_date_input($merged['windowStart'] ?? '');
        $end = byline_story_date_input($merged['windowEnd'] ?? '');
        if (is_wp_error($start)) { return $start; }
        if (is_wp_error($end)) { return $end; }
        if ($start === '') {
            return new WP_Error('byline_appointment_window_start_required', 'Choose the first day of the target window.', ['status' => 400]);
        }
        if ($end !== '' && $end < $start) {
            return new WP_Error('byline_appointment_window_order', 'The target window cannot end before it starts.', ['status' => 400]);
        }
        $timing['windowStart'] = $start;
        $timing['windowEnd'] = $end !== '' ? $end : null;
    } elseif ($mode === 'exact') {
        $start = byline_story_timestamp_input($merged['startAt'] ?? '');
        $end = byline_story_timestamp_input($merged['endAt'] ?? '');
        if (is_wp_error($start)) { return $start; }
        if (is_wp_error($end)) { return $end; }
        if ($start === '') {
            return new WP_Error('byline_appointment_start_required', 'Choose a date and start time.', ['status' => 400]);
        }
        if ($end !== '' && $end < $start) {
            return new WP_Error('byline_appointment_time_order', 'The appointment cannot end before it starts.', ['status' => 400]);
        }
        $timing['startAt'] = $start;
        $timing['endAt'] = $end !== '' ? $end : null;
    }

    $source_id = $merged['sourceId'] ?? null;
    if ($source_id !== null && $source_id !== '') {
        $source_id = byline_story_valid_uuid($source_id);
        $known = in_array($source_id, array_column($sources, 'id'), true);
        if (!$known) {
            // A new link to a source that does not exist is an error. An old link
            // to a source that has since been removed is simply dropped.
            if (array_key_exists('sourceId', $input) && ($existing['sourceId'] ?? null) !== $source_id) {
                return new WP_Error('byline_appointment_unknown_source', 'That source is no longer on this story.', ['status' => 400]);
            }
            $source_id = null;
        }
    } else {
        $source_id = null;
    }

    $assignees = byline_story_validate_assignees(
        is_array($merged['assigneeIds'] ?? null) ? $merged['assigneeIds'] : [],
        $existing['assigneeIds'] ?? [], $access, BYLINE_STORY_REPORTING_ASSIGNEES_MAX
    );
    if (is_wp_error($assignees)) {
        return $assignees;
    }
    // Participants who hold only assigned work create appointments for themselves.
    if ($existing === null && !$access['manage'] && $assignees !== [$access['user']]) {
        return new WP_Error('byline_assignment_forbidden', 'You can create appointments only for yourself.', ['status' => 403]);
    }

    return array_merge([
        'title' => $title, 'kind' => $kind, 'status' => $status, 'scheduleMode' => $mode,
    ], $timing, [
        'assigneeIds' => $assignees,
        'sourceId' => $source_id,
        'location' => byline_story_line($merged['location'] ?? '', 160),
        'notes' => byline_story_paragraph($merged['notes'] ?? '', 2000),
    ]);
}

/** @return array<string,mixed>|null */
function byline_story_appointment_stored($row): ?array
{
    if (!is_array($row) || byline_story_valid_uuid($row['id'] ?? '') === '') {
        return null;
    }
    // Stored assignees may include accounts removed since: validate everything
    // else, then keep the IDs as written rather than dropping the appointment.
    $built = byline_story_appointment_build(array_merge($row, ['assigneeIds' => []]), null, [['id' => byline_story_valid_uuid($row['sourceId'] ?? '')]], ['manage' => true, 'user' => 0]);
    if (is_wp_error($built)) {
        return null;
    }
    $built['assigneeIds'] = byline_story_id_list($row['assigneeIds'] ?? [], BYLINE_STORY_REPORTING_ASSIGNEES_MAX);
    return ['id' => byline_story_valid_uuid($row['id'])] + $built + [
        'createdAt' => byline_editorial_normalize_datetime($row['createdAt'] ?? ''),
        'updatedAt' => byline_editorial_normalize_datetime($row['updatedAt'] ?? ''),
    ];
}

/** @return list<array<string,mixed>> */
function byline_story_sources_normalize(array $rows): array
{
    $sources = [];
    foreach (array_slice($rows, 0, BYLINE_STORY_SOURCES_MAX) as $row) {
        $source = byline_story_source_stored($row);
        if ($source !== null) {
            $sources[] = $source;
        }
    }
    return $sources;
}

/** @return list<array<string,mixed>> */
function byline_story_appointments_normalize(array $rows): array
{
    $appointments = [];
    foreach (array_slice($rows, 0, BYLINE_STORY_APPOINTMENTS_MAX) as $row) {
        $appointment = byline_story_appointment_stored($row);
        if ($appointment !== null) {
            $appointments[] = $appointment;
        }
    }
    return $appointments;
}

/* ------------------------------------------------------------- reads */

function byline_story_sources(int $story_id): array
{
    $stored = get_post_meta($story_id, BYLINE_STORY_SOURCES_META, true);
    return byline_story_sources_normalize(is_array($stored) ? $stored : []);
}

/** Appointments with links to sources that no longer exist cleared on read. */
function byline_story_appointments(int $story_id): array
{
    $stored = get_post_meta($story_id, BYLINE_STORY_APPOINTMENTS_META, true);
    $appointments = byline_story_appointments_normalize(is_array($stored) ? $stored : []);
    $known = array_column(byline_story_sources($story_id), 'id');
    foreach ($appointments as &$appointment) {
        if ($appointment['sourceId'] !== null && !in_array($appointment['sourceId'], $known, true)) {
            $appointment['sourceId'] = null;
        }
    }
    unset($appointment);
    return $appointments;
}

function byline_story_reporting_involves_user(int $story_id, int $user_id): bool
{
    foreach (array_merge(byline_story_sources($story_id), byline_story_appointments($story_id)) as $record) {
        if (in_array($user_id, $record['assigneeIds'], true)) {
            return true;
        }
    }
    return false;
}

/** Earliest first: exact times, then target windows, then unscheduled. */
function byline_story_appointment_sort(array $appointments): array
{
    usort($appointments, static function (array $a, array $b): int {
        $rank = ['exact' => 0, 'window' => 1, 'unscheduled' => 2];
        $key = static function (array $row): string {
            return $row['scheduleMode'] === 'exact' ? (string) $row['startAt'] : ($row['scheduleMode'] === 'window' ? (string) $row['windowStart'] : '');
        };
        return [$rank[$a['scheduleMode']], $key($a), $a['createdAt'], $a['id']] <=> [$rank[$b['scheduleMode']], $key($b), $b['createdAt'], $b['id']];
    });
    return $appointments;
}

/** Site-local calendar day of a UTC timestamp. */
function byline_story_site_day(string $utc): string
{
    $date = DateTimeImmutable::createFromFormat('Y-m-d\TH:i:s\Z', $utc, new DateTimeZone('UTC'));
    return $date instanceof DateTimeImmutable ? $date->setTimezone(byline_editorial_planning_timezone())->format('Y-m-d') : '';
}

function byline_story_site_today(): string
{
    return (new DateTimeImmutable('now', byline_editorial_planning_timezone()))->format('Y-m-d');
}

function byline_appointment_is_open(array $appointment): bool
{
    return in_array($appointment['status'], ['planned', 'tentative', 'confirmed'], true);
}

/**
 * Small, note-free summary for Planning lists and Story Peek.
 *
 * @return array{sources:int,interviewed:int,needsScheduling:int,toSchedule:int,nextAppointment:array<string,mixed>|null}
 */
function byline_story_reporting_summary(int $story_id): array
{
    $sources = byline_story_sources($story_id);
    $open = array_values(array_filter(byline_story_appointments($story_id), 'byline_appointment_is_open'));
    $now = byline_story_now();
    $today = byline_story_site_today();
    $next = null;
    foreach (byline_story_appointment_sort($open) as $appointment) {
        $upcoming = $appointment['scheduleMode'] === 'exact'
            ? ($appointment['endAt'] ?? $appointment['startAt']) >= $now
            : ($appointment['scheduleMode'] === 'window' && ($appointment['windowEnd'] ?? $appointment['windowStart']) >= $today);
        if ($upcoming) {
            $next = array_intersect_key($appointment, array_flip(['id', 'title', 'startAt', 'windowStart', 'windowEnd', 'scheduleMode']));
            break;
        }
    }
    return [
        'sources' => count($sources),
        'interviewed' => count(array_filter($sources, static function (array $s): bool { return $s['status'] === 'interviewed'; })),
        'needsScheduling' => count(array_filter($sources, static function (array $s): bool { return $s['status'] === 'needs-scheduling'; })),
        'toSchedule' => count(array_filter($open, static function (array $a): bool { return $a['scheduleMode'] !== 'exact'; })),
        'nextAppointment' => $next,
    ];
}

/* ---------------------------------------------------------- mutations */

function byline_story_reporting_access(int $story_id, ?int $user_id = null)
{
    $access = byline_story_context($story_id, $user_id);
    if (!$access['exists']) {
        return new WP_Error('byline_editorial_unknown_story', 'This story does not exist.', ['status' => 404]);
    }
    if (!$access['view']) {
        return new WP_Error('byline_story_context_forbidden', 'You are not part of this story.', ['status' => 403]);
    }
    return $access;
}

function byline_story_actor_name(?int $user_id = null): string
{
    $user = get_user_by('id', $user_id ?? get_current_user_id());
    return $user instanceof WP_User ? byline_story_line($user->display_name, 60) : 'Someone';
}

function byline_story_not_found(string $what): WP_Error
{
    return new WP_Error('byline_' . $what . '_not_found', 'That ' . $what . ' is no longer on this story.', ['status' => 404]);
}

function byline_story_stale(): WP_Error
{
    return new WP_Error('byline_stale_record', 'Someone else changed this while you were editing it. Reload the story to see their version.', ['status' => 409]);
}

/**
 * Create (no `$id`) or update one source.
 *
 * @return array{source:array<string,mixed>,sources:list<array<string,mixed>>}|WP_Error
 */
function byline_story_source_save(int $story_id, array $input, string $id = '', ?int $user_id = null)
{
    $access = byline_story_reporting_access($story_id, $user_id);
    if (is_wp_error($access)) {
        return $access;
    }
    $id = $id !== '' ? byline_story_valid_uuid($id) : '';
    $expected = isset($input['expectedUpdatedAt']) && is_string($input['expectedUpdatedAt']) ? $input['expectedUpdatedAt'] : null;
    $result = ['source' => null, 'previous' => null];
    $stored = byline_story_collection_update($story_id, BYLINE_STORY_SOURCES_META, static function (array $sources) use ($input, $id, $access, $expected, &$result) {
        $position = null;
        foreach ($sources as $index => $source) {
            if ($id !== '' && $source['id'] === $id) {
                $position = $index;
            }
        }
        if ($id !== '' && $position === null) {
            return byline_story_not_found('source');
        }
        $existing = $position !== null ? $sources[$position] : null;
        if ($existing === null) {
            if (!$access['manage']) {
                return new WP_Error('byline_source_forbidden', 'You can add sources only to stories you report.', ['status' => 403]);
            }
            if (count($sources) >= BYLINE_STORY_SOURCES_MAX) {
                return new WP_Error('byline_source_limit', 'A story can have up to ' . BYLINE_STORY_SOURCES_MAX . ' sources.', ['status' => 400]);
            }
        } else {
            if (!$access['manage'] && !in_array($access['user'], $existing['assigneeIds'], true)) {
                return new WP_Error('byline_source_forbidden', 'You can edit only sources assigned to you.', ['status' => 403]);
            }
            if ($expected !== null && $expected !== $existing['updatedAt']) {
                return byline_story_stale();
            }
        }
        $built = byline_story_source_build($input, $existing, $access);
        if (is_wp_error($built)) {
            return $built;
        }
        $now = byline_story_now();
        $record = $existing !== null
            ? array_merge($existing, $built, ['updatedAt' => $now])
            : ['id' => byline_story_uuid()] + $built + ['createdAt' => $now, 'updatedAt' => $now];
        $result = ['source' => $record, 'previous' => $existing];
        if ($position !== null) {
            $sources[$position] = $record;
        } else {
            $sources[] = $record;
        }
        return $sources;
    }, ['normalize' => 'byline_story_sources_normalize']);
    if (is_wp_error($stored)) {
        return $stored;
    }
    do_action('byline_story_source_changed', $story_id, $result['source'], $result['previous'], $result['previous'] === null ? 'created' : 'updated', $access['user']);
    return ['source' => $result['source'], 'sources' => $stored];
}

/**
 * Remove a source. Its appointments stay; only their link to the source clears.
 *
 * @return array{sources:list<array<string,mixed>>,appointments:list<array<string,mixed>>}|WP_Error
 */
function byline_story_source_delete(int $story_id, string $id, ?int $user_id = null, ?string $expected_updated_at = null)
{
    $access = byline_story_reporting_access($story_id, $user_id);
    if (is_wp_error($access)) {
        return $access;
    }
    $id = byline_story_valid_uuid($id);
    $removed = null;
    $stored = byline_story_collection_update($story_id, BYLINE_STORY_SOURCES_META, static function (array $sources) use ($id, $access, &$removed, $expected_updated_at) {
        foreach ($sources as $index => $source) {
            if ($source['id'] !== $id) {
                continue;
            }
            if (!$access['manage'] && !in_array($access['user'], $source['assigneeIds'], true)) {
                return new WP_Error('byline_source_forbidden', 'You can remove only sources assigned to you.', ['status' => 403]);
            }
            if ($expected_updated_at !== null && $expected_updated_at !== $source['updatedAt']) { return byline_story_stale(); }
            $removed = $source;
            unset($sources[$index]);
            return $sources;
        }
        return byline_story_not_found('source');
    }, ['normalize' => 'byline_story_sources_normalize']);
    if (is_wp_error($stored)) {
        return $stored;
    }
    $appointments = byline_story_collection_update($story_id, BYLINE_STORY_APPOINTMENTS_META, static function (array $rows) use ($id) {
        foreach ($rows as &$row) {
            if (($row['sourceId'] ?? null) === $id) {
                $row['sourceId'] = null;
            }
        }
        unset($row);
        return $rows;
    }, ['normalize' => 'byline_story_appointments_normalize']);
    do_action('byline_story_source_changed', $story_id, $removed, $removed, 'deleted', $access['user']);
    return ['sources' => $stored, 'appointments' => is_wp_error($appointments) ? byline_story_appointments($story_id) : $appointments];
}

/**
 * Create (no `$id`) or update one appointment.
 *
 * @return array{appointment:array<string,mixed>,appointments:list<array<string,mixed>>}|WP_Error
 */
function byline_story_appointment_save(int $story_id, array $input, string $id = '', ?int $user_id = null)
{
    $access = byline_story_reporting_access($story_id, $user_id);
    if (is_wp_error($access)) {
        return $access;
    }
    $id = $id !== '' ? byline_story_valid_uuid($id) : '';
    $expected = isset($input['expectedUpdatedAt']) && is_string($input['expectedUpdatedAt']) ? $input['expectedUpdatedAt'] : null;
    $sources = byline_story_sources($story_id);
    $result = ['appointment' => null, 'previous' => null];
    $stored = byline_story_collection_update($story_id, BYLINE_STORY_APPOINTMENTS_META, static function (array $rows) use ($input, $id, $access, $expected, $sources, &$result) {
        $position = null;
        foreach ($rows as $index => $row) {
            if ($id !== '' && $row['id'] === $id) {
                $position = $index;
            }
        }
        if ($id !== '' && $position === null) {
            return byline_story_not_found('appointment');
        }
        $existing = $position !== null ? $rows[$position] : null;
        if ($existing === null) {
            if (count($rows) >= BYLINE_STORY_APPOINTMENTS_MAX) {
                return new WP_Error('byline_appointment_limit', 'A story can have up to ' . BYLINE_STORY_APPOINTMENTS_MAX . ' appointments.', ['status' => 400]);
            }
        } else {
            if (!$access['manage'] && !in_array($access['user'], $existing['assigneeIds'], true)) {
                return new WP_Error('byline_appointment_forbidden', 'You can edit only appointments assigned to you.', ['status' => 403]);
            }
            if ($expected !== null && $expected !== $existing['updatedAt']) {
                return byline_story_stale();
            }
        }
        $built = byline_story_appointment_build($input, $existing, $sources, $access);
        if (is_wp_error($built)) {
            return $built;
        }
        $now = byline_story_now();
        $record = $existing !== null
            ? array_merge($existing, $built, ['updatedAt' => $now])
            : ['id' => byline_story_uuid()] + $built + ['createdAt' => $now, 'updatedAt' => $now];
        $result = ['appointment' => $record, 'previous' => $existing];
        if ($position !== null) {
            $rows[$position] = $record;
        } else {
            $rows[] = $record;
        }
        return $rows;
    }, ['normalize' => 'byline_story_appointments_normalize']);
    if (is_wp_error($stored)) {
        return $stored;
    }
    do_action('byline_story_appointment_changed', $story_id, $result['appointment'], $result['previous'], $result['previous'] === null ? 'created' : 'updated', $access['user']);
    return ['appointment' => $result['appointment'], 'appointments' => $stored];
}

/** Remove an appointment only; its source, tasks and links are untouched. */
function byline_story_appointment_delete(int $story_id, string $id, ?int $user_id = null, ?string $expected_updated_at = null)
{
    $access = byline_story_reporting_access($story_id, $user_id);
    if (is_wp_error($access)) {
        return $access;
    }
    $id = byline_story_valid_uuid($id);
    $removed = null;
    $stored = byline_story_collection_update($story_id, BYLINE_STORY_APPOINTMENTS_META, static function (array $rows) use ($id, $access, &$removed, $expected_updated_at) {
        foreach ($rows as $index => $row) {
            if ($row['id'] !== $id) {
                continue;
            }
            if (!$access['manage'] && !in_array($access['user'], $row['assigneeIds'], true)) {
                return new WP_Error('byline_appointment_forbidden', 'You can remove only appointments assigned to you.', ['status' => 403]);
            }
            if ($expected_updated_at !== null && $expected_updated_at !== $row['updatedAt']) { return byline_story_stale(); }
            $removed = $row;
            unset($rows[$index]);
            return $rows;
        }
        return byline_story_not_found('appointment');
    }, ['normalize' => 'byline_story_appointments_normalize']);
    if (is_wp_error($stored)) {
        return $stored;
    }
    do_action('byline_story_appointment_changed', $story_id, $removed, $removed, 'deleted', $access['user']);
    return ['appointments' => $stored];
}

/** The site-local label an appointment's timing reads as in a sentence. */
function byline_story_appointment_when(array $appointment): string
{
    $tz = byline_editorial_planning_timezone();
    $format = static function (string $utc, string $pattern) use ($tz): string {
        $date = DateTimeImmutable::createFromFormat('Y-m-d\TH:i:s\Z', $utc, new DateTimeZone('UTC'));
        return $date instanceof DateTimeImmutable ? $date->setTimezone($tz)->format($pattern) : '';
    };
    if ($appointment['scheduleMode'] === 'exact' && $appointment['startAt']) {
        return $format($appointment['startAt'], 'l \a\t g:i A');
    }
    if ($appointment['scheduleMode'] === 'window' && $appointment['windowStart']) {
        $start = DateTimeImmutable::createFromFormat('!Y-m-d', $appointment['windowStart']);
        $end = $appointment['windowEnd'] ? DateTimeImmutable::createFromFormat('!Y-m-d', $appointment['windowEnd']) : null;
        return $start && $end && $end != $start ? $start->format('M j') . '–' . $end->format($start->format('n') === $end->format('n') ? 'j' : 'M j') : ($start ? 'the week of ' . $start->format('M j') : '');
    }
    return 'a date to be set';
}

/* ------------------------------------------------------------- meta */

add_action('init', static function (): void {
    foreach ([BYLINE_STORY_BRIEF_META => 'string', BYLINE_STORY_SOURCES_META => 'array', BYLINE_STORY_APPOINTMENTS_META => 'array'] as $key => $type) {
        register_post_meta('post', $key, [
            'type' => $type, 'single' => true, 'show_in_rest' => false,
            'auth_callback' => static function ($allowed, $meta_key, $post_id): bool { return current_user_can('edit_post', (int) $post_id); },
        ]);
    }
});
