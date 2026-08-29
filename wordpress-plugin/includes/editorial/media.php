<?php

/**
 * Structured newsroom media requests.
 *
 * `_wwh_story_visuals` remains the legacy free-text field. A structured request
 * is an additive canonical record; reads expose the legacy note as a fallback
 * and writes never delete or overwrite that installed-site value.
 */

if (!defined('ABSPATH')) {
    exit;
}

if (!defined('BYLINE_EDITORIAL_MEDIA_REQUEST_META')) {
    define('BYLINE_EDITORIAL_MEDIA_REQUEST_META', '_byline_story_visual_request_v1');
}

if (!defined('BYLINE_EDITORIAL_MEDIA_TYPES')) {
    define('BYLINE_EDITORIAL_MEDIA_TYPES', ['none', 'photo', 'gallery', 'graphic', 'video', 'other']);
}

if (!defined('BYLINE_EDITORIAL_MEDIA_STATUSES')) {
    define('BYLINE_EDITORIAL_MEDIA_STATUSES', ['needed', 'assigned', 'in-progress', 'uploaded', 'selected', 'done']);
}

function byline_editorial_media_request_default(): array
{
    return [
        'type' => 'none',
        'status' => 'needed',
        'assigneeId' => 0,
        'dueAt' => '',
        'notes' => '',
        'attachmentIds' => [],
    ];
}

function byline_editorial_media_request_is_structured(int $post_id): bool
{
    if (function_exists('metadata_exists')) {
        return (bool) metadata_exists('post', $post_id, BYLINE_EDITORIAL_MEDIA_REQUEST_META);
    }

    $stored = get_post_meta($post_id, BYLINE_EDITORIAL_MEDIA_REQUEST_META, true);
    return is_array($stored) && $stored !== [];
}

function byline_editorial_media_request_trim(string $value, int $max_length = 4000): string
{
    $value = sanitize_textarea_field($value);

    return function_exists('mb_substr') ? mb_substr($value, 0, $max_length) : substr($value, 0, $max_length);
}

/**
 * Read the attachment collection from every request shape that has existed in
 * the editorial API. The returned value is intentionally not sanitized here so
 * the write path can reject invalid IDs instead of silently losing them.
 */
function byline_editorial_media_request_attachment_value($value)
{
    if (is_string($value) && function_exists('json_decode')) {
        $decoded = json_decode($value, true);
        $value = is_array($decoded) ? $decoded : [];
    }

    if (!is_array($value)) {
        return [];
    }

    foreach (['attachmentIds', 'linkedAttachmentIds', 'attachments'] as $key) {
        if (array_key_exists($key, $value)) {
            return $value[$key];
        }
    }

    return [];
}

/** @return array<int,int> */
function byline_editorial_media_attachment_input_ids($value): array
{
    if (is_string($value) && function_exists('json_decode')) {
        $decoded = json_decode($value, true);
        $value = is_array($decoded) ? $decoded : [];
    }
    if (!is_array($value)) {
        return [];
    }

    $ids = [];
    foreach ($value as $item) {
        $attachment_id = is_array($item)
            ? absint($item['id'] ?? $item['attachmentId'] ?? 0)
            : (is_scalar($item) ? absint($item) : 0);
        if ($attachment_id <= 0 || in_array($attachment_id, $ids, true)) {
            continue;
        }
        $ids[] = $attachment_id;
    }

    return $ids;
}

function byline_editorial_media_attachment_ids($value): array
{
    $ids = [];
    foreach (byline_editorial_media_attachment_input_ids($value) as $attachment_id) {
        if (byline_editorial_media_attachment_is_allowed($attachment_id)) {
            $ids[] = $attachment_id;
        }
    }

    return $ids;
}

/**
 * Sanitise a request without trusting serialized input or arbitrary attachment
 * metadata. Validation that needs to return a useful error is performed by the
 * write helper after this normalization.
 */
function byline_editorial_sanitize_media_request($value): array
{
    if (is_string($value) && function_exists('json_decode')) {
        $decoded = json_decode($value, true);
        $value = is_array($decoded) ? $decoded : [];
    }

    $value = is_array($value) ? $value : [];
    $default = byline_editorial_media_request_default();
    $type = sanitize_key((string) ($value['type'] ?? $default['type']));
    $status = sanitize_key((string) ($value['status'] ?? $default['status']));

    if (!in_array($type, BYLINE_EDITORIAL_MEDIA_TYPES, true)) {
        $type = 'other';
    }
    if (!in_array($status, BYLINE_EDITORIAL_MEDIA_STATUSES, true)) {
        $status = 'needed';
    }

    $due_at = '';
    if (array_key_exists('dueAt', $value)) {
        $due_at = function_exists('byline_editorial_normalize_datetime')
            ? byline_editorial_normalize_datetime($value['dueAt'])
            : (is_scalar($value['dueAt']) ? sanitize_text_field((string) $value['dueAt']) : '');
    } elseif (array_key_exists('dueDate', $value)) {
        $due_at = function_exists('byline_editorial_normalize_datetime')
            ? byline_editorial_normalize_datetime($value['dueDate'])
            : (is_scalar($value['dueDate']) ? sanitize_text_field((string) $value['dueDate']) : '');
    }

    $notes = $value['notes'] ?? '';
    $notes = is_scalar($notes) ? byline_editorial_media_request_trim((string) $notes) : '';
    $attachment_value = byline_editorial_media_request_attachment_value($value);

    return [
        'type' => $type,
        'status' => $status,
        'assigneeId' => absint($value['assigneeId'] ?? $value['assignee'] ?? 0),
        'dueAt' => $due_at,
        'notes' => $notes,
        'attachmentIds' => byline_editorial_media_attachment_ids($attachment_value),
    ];
}

function byline_editorial_media_request_legacy_notes(int $post_id): string
{
    if (function_exists('byline_get_editorial_visuals')) {
        return byline_get_editorial_visuals($post_id);
    }

    return sanitize_textarea_field((string) get_post_meta($post_id, '_wwh_story_visuals', true));
}

/**
 * Return the structured record plus an explicit legacy marker. The legacy note
 * is used as the visible notes fallback until an editor intentionally saves a
 * structured request.
 */
function byline_get_editorial_media_request(int $post_id, ?int $user_id = null): array
{
    $stored = get_post_meta($post_id, BYLINE_EDITORIAL_MEDIA_REQUEST_META, true);
    $structured = byline_editorial_media_request_is_structured($post_id);
    $request = byline_editorial_sanitize_media_request($stored);
    $legacy_notes = byline_editorial_media_request_legacy_notes($post_id);
    $raw_attachment_ids = byline_editorial_media_attachment_input_ids(
        byline_editorial_media_request_attachment_value($stored)
    );
    $attachment_state = byline_editorial_media_request_attachment_state($post_id, $request['attachmentIds'], $user_id);
    $invalid_attachment_ids = array_values(array_unique(array_merge(
        byline_editorial_media_invalid_attachment_ids($raw_attachment_ids, $post_id, $user_id),
        array_map('absint', (array) ($attachment_state['invalidAttachmentIds'] ?? []))
    )));

    if (!$structured) {
        $request['notes'] = $legacy_notes;
    }

    $request['legacyNotes'] = $legacy_notes;
    $request['isLegacy'] = !$structured;
    if ($user_id !== null) {
        $request['attachmentIds'] = $attachment_state['attachmentIds'];
    }
    $request['attachments'] = $attachment_state['attachments'];
    $request['invalidAttachmentIds'] = $invalid_attachment_ids;
    $attachment_state['invalidAttachmentIds'] = $invalid_attachment_ids;
    $attachment_state['ready'] = $invalid_attachment_ids === []
        && $attachment_state['missingAltIds'] === []
        && $attachment_state['missingCreditIds'] === []
        && $attachment_state['missingRightsIds'] === [];
    $request['mediaReadiness'] = $attachment_state;

    return $request;
}

function byline_editorial_media_assignee_can_be_set(int $story_id, int $assignee_id, ?int $user_id = null): bool
{
    if ($assignee_id <= 0) {
        return true;
    }

    $user_id = function_exists('byline_editorial_planning_current_user_id')
        ? byline_editorial_planning_current_user_id($user_id)
        : absint($user_id);
    if ($user_id > 0 && $assignee_id === $user_id) {
        return true;
    }

    if ($user_id > 0 && function_exists('byline_editorial_user_can')) {
        return byline_editorial_user_can($user_id, 'edit_others_posts');
    }

    return function_exists('current_user_can') && current_user_can('edit_others_posts');
}

function byline_editorial_media_attachment_is_allowed(int $attachment_id, int $story_id = 0, ?int $user_id = null): bool
{
    if ($attachment_id <= 0) {
        return false;
    }

    $attachment = function_exists('get_post') ? get_post($attachment_id) : null;
    if (function_exists('get_post') && !$attachment instanceof WP_Post) {
        return false;
    }
    if ($attachment instanceof WP_Post && $attachment->post_type !== 'attachment') {
        return false;
    }
    if (function_exists('get_post_type') && get_post_type($attachment_id) !== 'attachment') {
        return false;
    }
    if ($story_id > 0 && function_exists('get_post_type') && get_post_type($story_id) !== 'post') {
        return false;
    }

    // Linking reuses a Media Library item; it does not transfer ownership. A
    // caller must still be able to read (or edit) the attachment just as it
    // would through the normal WordPress media APIs.
    if ($user_id !== null) {
        $user_id = absint($user_id);
        if ($user_id <= 0) {
            return false;
        }
        if (function_exists('byline_editorial_user_can')) {
            return byline_editorial_user_can($user_id, 'read_post', $attachment_id)
                || byline_editorial_user_can($user_id, 'edit_post', $attachment_id);
        }
        if (function_exists('user_can')) {
            return (bool) user_can($user_id, 'read_post', $attachment_id)
                || (bool) user_can($user_id, 'edit_post', $attachment_id);
        }

        return function_exists('current_user_can')
            && (current_user_can('read_post', $attachment_id) || current_user_can('edit_post', $attachment_id));
    }

    // A media item can safely be reused by multiple stories. There is no
    // reverse single-story pointer to overwrite here.
    return true;
}

/** @return array<string,string> */
function byline_editorial_media_license_defaults(): array
{
    $config = function_exists('byline_get_publication_config')
        ? byline_get_publication_config()
        : [];
    $licensing = is_array($config['licensing'] ?? null) ? $config['licensing'] : [];

    return [
        'copyrightNotice' => trim((string) ($licensing['copyrightNotice'] ?? '')),
        'licenseUrl' => trim((string) ($licensing['imageLicenseUrl'] ?? '')),
        'acquireLicensePage' => trim((string) ($licensing['acquireLicensePage'] ?? '')),
    ];
}

function byline_editorial_media_attachment_meta_value(int $attachment_id, string $field): string
{
    $canonical_key = [
        'creator' => 'creator',
        'creditText' => 'credit_text',
        'copyrightNotice' => 'copyright_notice',
        'licenseUrl' => 'license_url',
        'acquireLicensePage' => 'acquire_license_url',
    ][$field] ?? '';

    if ($canonical_key !== '' && function_exists('wwh_image_meta_value')) {
        $value = wwh_image_meta_value($attachment_id, $canonical_key);
        if (trim($value) !== '') {
            return trim($value);
        }
    }

    $keys = [
        'creator' => ['_ww_image_creator'],
        'creditText' => ['_ww_image_credit_text', '_byline_image_credit_text', '_byline_story_image_credit'],
        'copyrightNotice' => ['_ww_image_copyright_notice'],
        'licenseUrl' => ['_ww_image_license_url'],
        'acquireLicensePage' => ['_ww_image_acquire_license_url'],
    ][$field] ?? [];
    foreach ($keys as $key) {
        $value = get_post_meta($attachment_id, $key, true);
        if (is_scalar($value) && trim((string) $value) !== '') {
            return trim((string) $value);
        }
    }

    if ($field === 'creditText' && function_exists('wp_get_attachment_metadata')) {
        $metadata = wp_get_attachment_metadata($attachment_id);
        $image_meta = is_array($metadata) && is_array($metadata['image_meta'] ?? null)
            ? $metadata['image_meta']
            : [];
        $value = $image_meta['credit'] ?? $image_meta['copyright'] ?? '';
        if (is_scalar($value) && trim((string) $value) !== '') {
            return trim((string) $value);
        }
    }

    return '';
}

function byline_editorial_media_attachment_is_image(int $attachment_id): bool
{
    if (function_exists('wp_attachment_is_image')) {
        return (bool) wp_attachment_is_image($attachment_id);
    }
    if (function_exists('get_post_mime_type')) {
        return strpos((string) get_post_mime_type($attachment_id), 'image/') === 0;
    }

    return false;
}

function byline_editorial_media_attachment_featured_id(int $post_id): int
{
    if (function_exists('get_post_thumbnail_id')) {
        return absint(get_post_thumbnail_id($post_id));
    }

    return absint(get_post_meta($post_id, '_thumbnail_id', true));
}

/** @return array<string,mixed> */
function byline_editorial_media_attachment_details(int $attachment_id): array
{
    $attachment = function_exists('get_post') ? get_post($attachment_id) : null;
    $is_image = byline_editorial_media_attachment_is_image($attachment_id);
    $alt = function_exists('wp_get_attachment_image_alt')
        ? trim((string) wp_get_attachment_image_alt($attachment_id))
        : trim((string) get_post_meta($attachment_id, '_wp_attachment_image_alt', true));
    $creator = byline_editorial_media_attachment_meta_value($attachment_id, 'creator');
    $credit = byline_editorial_media_attachment_meta_value($attachment_id, 'creditText');
    $defaults = byline_editorial_media_license_defaults();
    $copyright = byline_editorial_media_attachment_meta_value($attachment_id, 'copyrightNotice');
    $license = byline_editorial_media_attachment_meta_value($attachment_id, 'licenseUrl');
    $acquire = byline_editorial_media_attachment_meta_value($attachment_id, 'acquireLicensePage');
    $effective_copyright = $copyright !== '' ? $copyright : $defaults['copyrightNotice'];
    $effective_license = $license !== '' ? $license : $defaults['licenseUrl'];
    $effective_acquire = $acquire !== '' ? $acquire : $defaults['acquireLicensePage'];
    $url = function_exists('wp_get_attachment_url') ? (string) wp_get_attachment_url($attachment_id) : '';
    $preview_url = $url;
    if (function_exists('wp_get_attachment_image_src')) {
        $source = wp_get_attachment_image_src($attachment_id, 'medium');
        if (is_array($source) && !empty($source[0])) {
            $preview_url = (string) $source[0];
        }
    }
    $mime_type = function_exists('get_post_mime_type') ? (string) get_post_mime_type($attachment_id) : '';

    return [
        'id' => $attachment_id,
        'title' => $attachment instanceof WP_Post ? sanitize_text_field((string) $attachment->post_title) : '',
        'url' => $url,
        'previewUrl' => $preview_url,
        'mimeType' => $mime_type,
        'isImage' => $is_image,
        'alt' => $alt,
        'creator' => $creator,
        'creditText' => $credit,
        'copyrightNotice' => $effective_copyright,
        'licenseUrl' => $effective_license,
        'acquireLicensePage' => $effective_acquire,
        'checks' => [
            'alt' => !$is_image || $alt !== '',
            'credit' => !$is_image || $credit !== '' || $creator !== '',
            'rights' => $effective_copyright !== '' || $effective_license !== '' || $effective_acquire !== '',
        ],
    ];
}

/** @return array<string,mixed> */
function byline_editorial_media_request_attachment_state(int $post_id, array $attachment_ids, ?int $user_id = null): array
{
    $valid_ids = [];
    $invalid_ids = [];
    $attachments = [];
    $missing_alt = [];
    $missing_credit = [];
    $missing_rights = [];

    foreach (byline_editorial_media_attachment_input_ids($attachment_ids) as $attachment_id) {
        if (!byline_editorial_media_attachment_is_allowed($attachment_id, $post_id, $user_id)) {
            $invalid_ids[] = $attachment_id;
            continue;
        }

        $valid_ids[] = $attachment_id;
        $details = byline_editorial_media_attachment_details($attachment_id);
        $attachments[] = $details;
        if (empty($details['checks']['alt'])) {
            $missing_alt[] = $attachment_id;
        }
        if (empty($details['checks']['credit'])) {
            $missing_credit[] = $attachment_id;
        }
        if (empty($details['checks']['rights'])) {
            $missing_rights[] = $attachment_id;
        }
    }

    $featured_id = byline_editorial_media_attachment_featured_id($post_id);
    $featured_linked = $featured_id > 0
        && in_array($featured_id, $valid_ids, true)
        && byline_editorial_media_attachment_is_image($featured_id)
        ? $featured_id
        : 0;

    return [
        'attachmentIds' => $valid_ids,
        'invalidAttachmentIds' => $invalid_ids,
        'attachments' => $attachments,
        'featuredAttachmentId' => $featured_linked,
        'missingAltIds' => $missing_alt,
        'missingCreditIds' => $missing_credit,
        'missingRightsIds' => $missing_rights,
        'ready' => $invalid_ids === [] && $missing_alt === [] && $missing_credit === [] && $missing_rights === [],
    ];
}

/** @return array<int,int> */
function byline_editorial_media_invalid_attachment_ids($value, int $story_id = 0, ?int $user_id = null): array
{
    $invalid = [];
    foreach (byline_editorial_media_attachment_input_ids($value) as $attachment_id) {
        if (!byline_editorial_media_attachment_is_allowed($attachment_id, $story_id, $user_id)) {
            $invalid[] = $attachment_id;
        }
    }

    return $invalid;
}

/**
 * Deterministically derive the next request state from the current request and
 * one media event. This is the only place that turns attachment/featured
 * changes into workflow status transitions.
 */
function byline_editorial_reconcile_media_request_status(int $post_id, array $request, array $context = [])
{
    $user_id = array_key_exists('userId', $context) ? absint($context['userId']) : null;
    $raw_attachment_ids = byline_editorial_media_attachment_input_ids(
        byline_editorial_media_request_attachment_value($request)
    );
    $input_invalid_ids = byline_editorial_media_invalid_attachment_ids($raw_attachment_ids, $post_id, $user_id);
    $request = byline_editorial_sanitize_media_request($request);
    $state = byline_editorial_media_request_attachment_state($post_id, $request['attachmentIds'], $user_id);
    $invalid_ids = array_values(array_unique(array_merge(
        array_map('absint', $input_invalid_ids),
        array_map('absint', (array) ($context['invalidAttachmentIds'] ?? [])),
        array_map('absint', (array) ($state['invalidAttachmentIds'] ?? []))
    )));
    if ($invalid_ids !== []) {
        return new WP_Error(
            'byline_editorial_media_invalid_attachment',
            'One or more selected media items is missing or cannot be read by this user.',
            ['status' => 400, 'attachmentIds' => $invalid_ids]
        );
    }

    $previous = is_array($context['previousRequest'] ?? null)
        ? byline_editorial_sanitize_media_request($context['previousRequest'])
        : byline_editorial_media_request_default();
    $previous_ids = byline_editorial_media_attachment_input_ids($context['previousAttachmentIds'] ?? ($previous['attachmentIds'] ?? []));
    $current_ids = array_values(array_map('absint', (array) $request['attachmentIds']));
    $previous_compare = $previous_ids;
    $current_compare = $current_ids;
    sort($previous_compare);
    sort($current_compare);
    $attachments_changed = $previous_compare !== $current_compare;
    $assignee_changed = absint($previous['assigneeId'] ?? 0) !== absint($request['assigneeId'] ?? 0);
    $event = strtolower(trim((string) ($context['event'] ?? '')));
    if (in_array($event, ['attachment-link', 'attachment-unlink', 'attachment-linked', 'attachment-unlinked'], true)) {
        $event = 'attachment-change';
    }
    $status_provided = !empty($context['statusProvided']);
    $requested_status = (string) $request['status'];
    $explicit_completion = !empty($context['explicitCompletion'])
        || $event === 'explicit-completion'
        || ($status_provided && $requested_status === 'done' && $event !== 'attachment-change');

    if ($event === '' && $attachments_changed) {
        $event = 'attachment-change';
    }

    $status = $requested_status;
    if ($explicit_completion) {
        if ($request['type'] !== 'none' && $current_ids === []) {
            return new WP_Error(
                'byline_editorial_media_incomplete',
                'A media request needs a linked attachment before it can be completed.',
                ['status' => 400]
            );
        }
        $status = 'done';
    } elseif ($event === 'featured-selection') {
        $status = !empty($state['featuredAttachmentId'])
            ? 'selected'
            : ($current_ids === [] ? ($request['assigneeId'] > 0 ? 'assigned' : 'needed') : 'uploaded');
    } elseif ($event === 'attachment-change' && $attachments_changed) {
        if ($current_ids === []) {
            // Keep evidence that work began, but otherwise derive the open
            // state from the current assignment rather than the removed file.
            $status = $previous['status'] === 'in-progress'
                ? 'in-progress'
                : ($request['assigneeId'] > 0 ? 'assigned' : 'needed');
        } elseif ($status_provided && in_array($requested_status, ['in-progress', 'uploaded', 'selected'], true)) {
            // A complete legacy-shaped write may intentionally specify the
            // state alongside a new attachment. Preserve that explicit state.
            $status = $requested_status;
        } elseif ($state['featuredAttachmentId'] > 0 && $previous['status'] === 'selected') {
            $status = 'selected';
        } else {
            // Linking media means the request has received an upload. It does
            // not imply that a complex request is complete.
            $status = 'uploaded';
        }
    } elseif (!$attachments_changed && $assignee_changed && !$status_provided
        && $requested_status === 'needed' && $request['assigneeId'] > 0) {
        $status = 'assigned';
    }

    $request['status'] = in_array($status, BYLINE_EDITORIAL_MEDIA_STATUSES, true) ? $status : 'needed';

    return $request;
}

// Keep the alternate verb used by a few integrations as a compatibility alias
// while all callers share the one reconciliation implementation above.
function byline_reconcile_editorial_media_request_status(int $post_id, array $request, array $context = [])
{
    return byline_editorial_reconcile_media_request_status($post_id, $request, $context);
}

function byline_set_editorial_media_request(int $post_id, array $value, ?int $user_id = null, array $context = [])
{
    $post_id = absint($post_id);
    $post = get_post($post_id);
    $user_id = function_exists('byline_editorial_planning_current_user_id')
        ? byline_editorial_planning_current_user_id($user_id)
        : absint($user_id);

    $can_edit = $user_id > 0 && function_exists('byline_editorial_user_can')
        ? byline_editorial_user_can($user_id, 'edit_post', $post_id)
        : (function_exists('current_user_can') && current_user_can('edit_post', $post_id));

    if (!$post instanceof WP_Post || $post->post_type !== 'post') {
        return new WP_Error('byline_editorial_media_unknown_story', 'This story does not exist.', ['status' => 404]);
    }
    if (!$can_edit) {
        return new WP_Error('byline_editorial_media_forbidden', 'You are not allowed to edit this story\'s media request.', ['status' => 403]);
    }

    $current = byline_get_editorial_media_request($post_id, $user_id);
    $has_attachment_field = false;
    foreach (['attachmentIds', 'linkedAttachmentIds', 'attachments'] as $key) {
        if (array_key_exists($key, $value)) {
            $has_attachment_field = true;
            break;
        }
    }

    // The REST update contract is partial. Merge only fields supplied by the
    // caller so a status or assignee change cannot erase request details.
    $merged = [
        'type' => $current['type'] ?? 'none',
        'status' => $current['status'] ?? 'needed',
        'assigneeId' => $current['assigneeId'] ?? 0,
        'dueAt' => $current['dueAt'] ?? '',
        'notes' => $current['notes'] ?? '',
        'attachmentIds' => $current['attachmentIds'] ?? [],
    ];
    foreach (['type', 'status', 'notes'] as $key) {
        if (array_key_exists($key, $value)) {
            $merged[$key] = $value[$key];
        }
    }
    if (array_key_exists('assigneeId', $value)) {
        $merged['assigneeId'] = $value['assigneeId'];
    } elseif (array_key_exists('assignee', $value)) {
        $merged['assigneeId'] = $value['assignee'];
    }
    if (array_key_exists('dueAt', $value)) {
        $merged['dueAt'] = $value['dueAt'];
    } elseif (array_key_exists('dueDate', $value)) {
        $merged['dueAt'] = $value['dueDate'];
    }
    if ($has_attachment_field) {
        $merged['attachmentIds'] = byline_editorial_media_request_attachment_value($value);
    }

    $raw_attachment_ids = byline_editorial_media_attachment_input_ids(
        $has_attachment_field
            ? byline_editorial_media_request_attachment_value($value)
            : ($current['attachmentIds'] ?? [])
    );
    $invalid_attachment_ids = $has_attachment_field
        ? byline_editorial_media_invalid_attachment_ids($raw_attachment_ids, $post_id, $user_id)
        : array_values(array_map('absint', (array) ($current['invalidAttachmentIds'] ?? [])));
    if ($invalid_attachment_ids !== []) {
        return new WP_Error(
            'byline_editorial_media_invalid_attachment',
            'One or more selected media items is missing or cannot be read by this user.',
            ['status' => 400, 'attachmentIds' => $invalid_attachment_ids]
        );
    }

    $request = byline_editorial_sanitize_media_request($merged);
    if ($request['assigneeId'] > 0) {
        if (!get_user_by('id', $request['assigneeId'])) {
            return new WP_Error('byline_editorial_media_unknown_assignee', 'That media assignee does not exist.', ['status' => 400]);
        }
        if (!byline_editorial_media_assignee_can_be_set($post_id, $request['assigneeId'], $user_id)) {
            return new WP_Error('byline_editorial_media_assignment_forbidden', 'Only an editor can assign media work to another user.', ['status' => 403]);
        }
    }

    $context['previousRequest'] = $current;
    $context['previousAttachmentIds'] = $current['attachmentIds'] ?? [];
    $context['userId'] = $user_id;
    $context['statusProvided'] = array_key_exists('statusProvided', $context)
        ? !empty($context['statusProvided'])
        : array_key_exists('status', $value);
    $context['attachmentFieldProvided'] = $has_attachment_field;
    if (!isset($context['event']) && $has_attachment_field) {
        $previous_compare = array_values(array_map('absint', (array) ($current['attachmentIds'] ?? [])));
        $next_compare = array_values(array_map('absint', (array) $request['attachmentIds']));
        sort($previous_compare);
        sort($next_compare);
        if ($previous_compare !== $next_compare) {
            $context['event'] = 'attachment-change';
        }
    }
    if ($invalid_attachment_ids !== []) {
        $context['invalidAttachmentIds'] = $invalid_attachment_ids;
    }

    $reconciled = byline_editorial_reconcile_media_request_status($post_id, $request, $context);
    if (is_wp_error($reconciled)) {
        return $reconciled;
    }

    $previous_featured_id = byline_editorial_media_attachment_featured_id($post_id);
    update_post_meta($post_id, BYLINE_EDITORIAL_MEDIA_REQUEST_META, $reconciled);
    if ($previous_featured_id > 0 && !in_array($previous_featured_id, (array) $reconciled['attachmentIds'], true)) {
        if (function_exists('delete_post_thumbnail')) {
            delete_post_thumbnail($post_id);
        } else {
            delete_post_meta($post_id, '_thumbnail_id');
        }
    }

    $result = byline_get_editorial_media_request($post_id, $user_id);
    do_action('byline_editorial_media_request_updated', $post_id, $result, $user_id);

    return $result;
}

function byline_editorial_set_media_request_attachments(int $post_id, array $attachment_ids, bool $replace = true, ?int $user_id = null)
{
    $current = byline_get_editorial_media_request($post_id, $user_id);
    $ids = $replace ? $attachment_ids : array_merge((array) ($current['attachmentIds'] ?? []), $attachment_ids);
    $current['attachmentIds'] = $ids;
    unset($current['legacyNotes'], $current['isLegacy']);

    return byline_set_editorial_media_request($post_id, $current, $user_id, [
        'event' => 'attachment-change',
        'statusProvided' => false,
    ]);
}

function byline_editorial_link_media_request_attachment(int $post_id, int $attachment_id, ?int $user_id = null)
{
    return byline_editorial_set_media_request_attachments($post_id, [$attachment_id], false, $user_id);
}

function byline_editorial_unlink_media_request_attachment(int $post_id, int $attachment_id, ?int $user_id = null)
{
    $current = byline_get_editorial_media_request($post_id, $user_id);
    $remaining = array_values(array_filter(
        (array) ($current['attachmentIds'] ?? []),
        static fn($id): bool => absint($id) !== absint($attachment_id)
    ));

    return byline_editorial_set_media_request_attachments($post_id, $remaining, true, $user_id);
}

function byline_editorial_set_media_request_featured_image(int $post_id, int $attachment_id, ?int $user_id = null)
{
    $user_id = function_exists('byline_editorial_planning_current_user_id')
        ? byline_editorial_planning_current_user_id($user_id)
        : absint($user_id);
    $post = get_post($post_id);
    $allowed = $user_id > 0 && function_exists('byline_editorial_user_can')
        ? byline_editorial_user_can($user_id, 'edit_post', $post_id)
        : (function_exists('current_user_can') && current_user_can('edit_post', $post_id));
    if (!$post instanceof WP_Post || $post->post_type !== 'post' || !$allowed) {
        return new WP_Error('byline_editorial_media_forbidden', 'You are not allowed to change this story.', ['status' => 403]);
    }
    if (!byline_editorial_media_attachment_is_allowed($attachment_id, $post_id, $user_id)) {
        return new WP_Error('byline_editorial_media_invalid_attachment', 'That media item is missing or cannot be read by this user.', ['status' => 400]);
    }

    $request = byline_get_editorial_media_request($post_id, $user_id);
    if (!in_array($attachment_id, (array) ($request['attachmentIds'] ?? []), true)) {
        return new WP_Error('byline_editorial_media_not_linked', 'Select the attachment for this story before making it featured.', ['status' => 400]);
    }
    if (!byline_editorial_media_attachment_is_image($attachment_id)) {
        return new WP_Error('byline_editorial_media_not_image', 'Only an image attachment can be featured.', ['status' => 400]);
    }

    $previous_featured_id = byline_editorial_media_attachment_featured_id($post_id);
    if (!function_exists('set_post_thumbnail') || !set_post_thumbnail($post_id, $attachment_id)) {
        return new WP_Error('byline_editorial_media_featured_failed', 'WordPress could not set that image as featured.', ['status' => 500]);
    }

    $result = byline_set_editorial_media_request(
        $post_id,
        ['status' => 'selected'],
        $user_id,
        ['event' => 'featured-selection', 'featuredAttachmentId' => $attachment_id]
    );
    if (is_wp_error($result)) {
        if ($previous_featured_id > 0 && function_exists('set_post_thumbnail')) {
            set_post_thumbnail($post_id, $previous_featured_id);
        } elseif (function_exists('delete_post_thumbnail')) {
            delete_post_thumbnail($post_id);
        } else {
            delete_post_meta($post_id, '_thumbnail_id');
        }

        return $result;
    }

    return $result;
}

function byline_editorial_complete_media_request(int $post_id, ?int $user_id = null)
{
    return byline_set_editorial_media_request(
        $post_id,
        ['status' => 'done'],
        $user_id,
        ['event' => 'explicit-completion', 'explicitCompletion' => true]
    );
}

function byline_editorial_media_request_needs_work(int $post_id): bool
{
    $request = byline_get_editorial_media_request($post_id);
    return ($request['type'] ?? 'none') !== 'none' && ($request['status'] ?? 'needed') !== 'done';
}

/**
 * Return the private Media Desk collection. Legacy visual notes are included as
 * `isLegacy` rows so an upgrade never makes an existing request disappear. The
 * collection is capability-filtered per story because edit_posts alone is not
 * enough to read another author's private planning data.
 *
 * @return array<int,array<string,mixed>>
 */
function byline_list_editorial_media_requests(array $filters = [], ?int $user_id = null): array
{
    $limit = min(200, max(1, absint($filters['limit'] ?? 100)));
    $args = [
        'post_type' => 'post',
        'post_status' => ['draft', 'pending', 'future', 'publish', 'private'],
        'posts_per_page' => $limit,
        'numberposts' => $limit,
        'orderby' => 'modified',
        'order' => 'DESC',
        'no_found_rows' => true,
        'meta_query' => [
            'relation' => 'OR',
            ['key' => BYLINE_EDITORIAL_MEDIA_REQUEST_META, 'compare' => 'EXISTS'],
            ['key' => '_wwh_story_visuals', 'value' => '', 'compare' => '!='],
        ],
    ];

    if (!empty($filters['storyId'])) {
        $args['p'] = absint($filters['storyId']);
    }

    $posts = function_exists('get_posts') ? get_posts($args) : [];
    $items = [];
    $status_filter = isset($filters['status']) ? sanitize_key((string) $filters['status']) : '';
    $type_filter = isset($filters['type']) ? sanitize_key((string) $filters['type']) : '';
    $assignee_filter = isset($filters['assigneeId']) ? absint($filters['assigneeId']) : 0;
    $due_from = isset($filters['dueFrom']) && function_exists('byline_editorial_normalize_datetime')
        ? byline_editorial_normalize_datetime($filters['dueFrom'])
        : '';
    $due_to = isset($filters['dueTo']) && function_exists('byline_editorial_normalize_datetime')
        ? byline_editorial_normalize_datetime($filters['dueTo'])
        : '';

    foreach (is_array($posts) ? $posts : [] as $post) {
        if (!$post instanceof WP_Post || !function_exists('byline_editorial_can_view_planning_story')
            || !byline_editorial_can_view_planning_story((int) $post->ID, $user_id)) {
            continue;
        }

        $request = byline_get_editorial_media_request((int) $post->ID, $user_id);
        if ($request['isLegacy'] && $request['type'] === 'none' && $request['notes'] === '') {
            continue;
        }
        if ($status_filter !== '' && $request['status'] !== $status_filter) {
            continue;
        }
        if ($type_filter !== '' && $request['type'] !== $type_filter) {
            continue;
        }
        if ($assignee_filter > 0 && absint($request['assigneeId']) !== $assignee_filter) {
            continue;
        }
        if ($due_from !== '' && ($request['dueAt'] === '' || $request['dueAt'] < $due_from)) {
            continue;
        }
        if ($due_to !== '' && ($request['dueAt'] === '' || $request['dueAt'] > $due_to)) {
            continue;
        }

        $featured_id = function_exists('get_post_thumbnail_id') ? absint(get_post_thumbnail_id((int) $post->ID)) : 0;
        $items[] = [
            'storyId' => (int) $post->ID,
            'title' => function_exists('get_the_title') ? (string) get_the_title((int) $post->ID) : (string) ($post->post_title ?? ''),
            'editUrl' => function_exists('get_edit_post_link') ? (string) get_edit_post_link((int) $post->ID, '') : '',
            'wordpressStatus' => (string) $post->post_status,
            'request' => $request,
            'featuredImage' => [
                'attachmentId' => $featured_id,
                'isLinked' => $featured_id > 0 && in_array($featured_id, (array) ($request['attachmentIds'] ?? []), true),
            ],
        ];
    }

    usort($items, static function (array $left, array $right): int {
        $left_due = (string) ($left['request']['dueAt'] ?? '');
        $right_due = (string) ($right['request']['dueAt'] ?? '');
        if ($left_due === '' && $right_due !== '') {
            return 1;
        }
        if ($left_due !== '' && $right_due === '') {
            return -1;
        }
        if ($left_due !== $right_due) {
            return strcmp($left_due, $right_due);
        }

        return ((int) $right['storyId']) <=> ((int) $left['storyId']);
    });

    return $items;
}

function byline_get_editorial_media_requests($filters = [], ?int $user_id = null): array
{
    // Some older integration code uses the plural provider as a per-story
    // lookup. Keep that call shape compatible while the REST collection accepts
    // a filter array.
    if (is_numeric($filters) && !is_array($filters)) {
        return [byline_get_editorial_media_request(absint($filters), $user_id)];
    }

    $filters = is_array($filters) ? $filters : [];
    return byline_list_editorial_media_requests($filters, $user_id);
}

function byline_list_media_requests(array $filters = [], ?int $user_id = null): array
{
    return byline_list_editorial_media_requests($filters, $user_id);
}

function byline_editorial_register_media_meta(): void
{
    register_post_meta('post', BYLINE_EDITORIAL_MEDIA_REQUEST_META, [
        'single' => true,
        'type' => 'object',
        'sanitize_callback' => 'byline_editorial_sanitize_media_request',
        'show_in_rest' => false,
        'auth_callback' => static function (): bool {
            return current_user_can('edit_posts');
        },
    ]);
}
add_action('init', 'byline_editorial_register_media_meta');
