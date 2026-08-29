<?php

/**
 * Editable story workflow/setup presets.
 *
 * Presets contain newsroom metadata only: section slugs, workflow/readiness
 * policies, visual requirements, bounded task descriptors, and association
 * slots. They deliberately contain no article title, body, placeholder copy, or
 * other fake prose.
 *
 * Built-in values are code-owned defaults. A single private option stores
 * sanitized patches for those defaults, so an editor can change one field
 * without replacing unrelated settings. Applying a preset is pure: it returns
 * a sanitized seed and never creates or mutates a story.
 */

if (!defined('ABSPATH')) {
    exit;
}

const BYLINE_EDITORIAL_PRESETS_OPTION = 'byline_editorial_presets_v1';
const BYLINE_EDITORIAL_PRESETS_REVISION_OPTION = 'byline_editorial_presets_revision';
const BYLINE_EDITORIAL_PRESETS_SCHEMA_VERSION = 1;
const BYLINE_EDITORIAL_PRESETS_MAX_TASKS = 8;
const BYLINE_PRESETS_OPTION = BYLINE_EDITORIAL_PRESETS_OPTION;

/**
 * The five built-in preset identities. These are stable storage/API keys.
 *
 * @return array<int, string>
 */
function byline_editorial_preset_types(): array
{
    return ['news', 'sports-recap', 'opinion', 'photo-story', 'breaking'];
}

function byline_editorial_preset_aliases(): array
{
    return [
        'sports' => 'sports-recap',
        'photo' => 'photo-story',
    ];
}

function byline_editorial_normalize_preset_type($type): string
{
    $type = function_exists('sanitize_key')
        ? sanitize_key((string) $type)
        : strtolower((string) preg_replace('/[^a-z0-9_-]/i', '', (string) $type));
    $type = byline_editorial_preset_aliases()[$type] ?? $type;

    return in_array($type, byline_editorial_preset_types(), true) ? $type : '';
}

function byline_editorial_preset_key($value): string
{
    if (function_exists('sanitize_key')) {
        return sanitize_key((string) $value);
    }

    return strtolower((string) preg_replace('/[^a-z0-9_-]/i', '', (string) $value));
}

function byline_editorial_preset_text($value, int $maximum = 80): string
{
    if (!is_scalar($value)) {
        return '';
    }

    $value = function_exists('sanitize_text_field')
        ? sanitize_text_field((string) $value)
        : trim(strip_tags((string) $value));
    $value = (string) preg_replace(
        [
            '/\b(?:authorization|bearer|token|secret|password|passwd|api[_ -]?key|client[_ -]?secret|signature)\s*[:=]\s*[^\s,;]+/i',
            '/\b[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}\b/i',
        ],
        '[redacted]',
        $value
    );

    if (function_exists('mb_substr')) {
        return mb_substr($value, 0, $maximum);
    }

    return substr($value, 0, $maximum);
}

/**
 * Return defaults with no stored user patches.
 *
 * @return array<string, array<string, mixed>>
 */
function byline_editorial_default_presets(): array
{
    return [
        'news' => [
            'id' => 'news',
            'label' => 'News',
            'section' => 'news',
            'workflow' => [
                'status' => 'reporting',
                'deadlineOffsetDays' => 3,
                'deadlinePolicy' => 'relative',
            ],
            'readiness' => [
                'policy' => 'normal',
                'required' => ['headline', 'writer', 'section'],
                'recommended' => ['featured-image'],
            ],
            'media' => [
                'mode' => 'recommended',
                'requireCredit' => false,
                'requireAltText' => false,
            ],
            'tasks' => [],
            'associations' => [
                'coverageId' => 0,
                'gameId' => 0,
                'eventId' => 0,
                'teamIds' => [],
            ],
        ],
        'sports-recap' => [
            'id' => 'sports-recap',
            'label' => 'Sports recap',
            'section' => 'sports',
            'workflow' => [
                'status' => 'writing',
                'deadlineOffsetDays' => 1,
                'deadlinePolicy' => 'relative',
            ],
            'readiness' => [
                'policy' => 'sports',
                'required' => ['headline', 'writer', 'section', 'game'],
                'recommended' => ['score', 'featured-image'],
            ],
            'media' => [
                'mode' => 'requested',
                'requireCredit' => true,
                'requireAltText' => true,
            ],
            'tasks' => [],
            'associations' => [
                'coverageId' => 0,
                'gameId' => 0,
                'eventId' => 0,
                'teamIds' => [],
            ],
        ],
        'opinion' => [
            'id' => 'opinion',
            'label' => 'Opinion',
            'section' => 'opinion',
            'workflow' => [
                'status' => 'writing',
                'deadlineOffsetDays' => 5,
                'deadlinePolicy' => 'relative',
            ],
            'readiness' => [
                'policy' => 'opinion',
                'required' => ['headline', 'writer', 'section', 'contributor-profile'],
                'recommended' => [],
            ],
            'media' => [
                'mode' => 'recommended',
                'requireCredit' => false,
                'requireAltText' => false,
            ],
            'tasks' => [],
            'associations' => [
                'coverageId' => 0,
                'gameId' => 0,
                'eventId' => 0,
                'teamIds' => [],
            ],
        ],
        'photo-story' => [
            'id' => 'photo-story',
            'label' => 'Photo story',
            'section' => 'photo',
            'workflow' => [
                'status' => 'reporting',
                'deadlineOffsetDays' => 3,
                'deadlinePolicy' => 'relative',
            ],
            'readiness' => [
                'policy' => 'visual',
                'required' => ['headline', 'writer', 'section'],
                'recommended' => ['image-alt', 'image-credit'],
            ],
            'media' => [
                'mode' => 'visual-first',
                'requireCredit' => true,
                'requireAltText' => true,
            ],
            'tasks' => [],
            'associations' => [
                'coverageId' => 0,
                'gameId' => 0,
                'eventId' => 0,
                'teamIds' => [],
            ],
        ],
        'breaking' => [
            'id' => 'breaking',
            'label' => 'Breaking',
            'section' => 'news',
            'workflow' => [
                'status' => 'reporting',
                'deadlineOffsetDays' => 0,
                'deadlinePolicy' => 'same-day',
            ],
            'readiness' => [
                'policy' => 'minimum',
                'required' => ['headline', 'writer', 'section'],
                'recommended' => ['featured-image'],
            ],
            'media' => [
                'mode' => 'recommended',
                'requireCredit' => false,
                'requireAltText' => false,
            ],
            'tasks' => [
                [
                    'key' => 'follow-up-missing-readiness',
                    'when' => 'missing-noncritical',
                    'required' => false,
                ],
            ],
            'associations' => [
                'coverageId' => 0,
                'gameId' => 0,
                'eventId' => 0,
                'teamIds' => [],
            ],
        ],
    ];
}

/**
 * @param mixed $value
 * @param array<int, string> $allowed
 * @return array<int, string>
 */
function byline_editorial_preset_string_list($value, array $allowed, int $maximum = 12): array
{
    if (!is_array($value)) {
        return [];
    }

    $result = [];
    foreach (array_slice($value, 0, $maximum) as $item) {
        $item = byline_editorial_preset_key($item);
        if ($item !== '' && in_array($item, $allowed, true) && !in_array($item, $result, true)) {
            $result[] = $item;
        }
    }

    return $result;
}

function byline_editorial_preset_id($value): int
{
    if (!is_scalar($value)) {
        return 0;
    }

    return function_exists('absint') ? absint($value) : abs((int) $value);
}

/**
 * @param array<string, mixed> $input
 * @return array<string, mixed>
 */
function byline_editorial_preset_sanitize_workflow(array $input): array
{
    $result = [];
    $statuses = ['pitch', 'assigned', 'reporting', 'writing', 'editing', 'ready', 'on-hold', 'dropped'];
    if (function_exists('byline_editorial_selectable_status_ids')) {
        $statuses = byline_editorial_selectable_status_ids();
    }

    if (array_key_exists('status', $input)) {
        $status = byline_editorial_preset_key($input['status']);
        if (in_array($status, $statuses, true)) {
            $result['status'] = $status;
        }
    }

    if (array_key_exists('deadlineOffsetDays', $input) && is_scalar($input['deadlineOffsetDays'])) {
        $days = (int) $input['deadlineOffsetDays'];
        if ((string) $days === trim((string) $input['deadlineOffsetDays']) && $days >= 0 && $days <= 30) {
            $result['deadlineOffsetDays'] = $days;
        }
    }

    if (array_key_exists('deadlinePolicy', $input)) {
        $policy = byline_editorial_preset_key($input['deadlinePolicy']);
        if (in_array($policy, ['relative', 'same-day', 'none'], true)) {
            $result['deadlinePolicy'] = $policy;
        }
    }

    return $result;
}

/**
 * @param array<string, mixed> $input
 * @return array<string, mixed>
 */
function byline_editorial_preset_sanitize_readiness(array $input): array
{
    $allowed_checks = [
        'headline',
        'writer',
        'section',
        'featured-image',
        'image-alt',
        'image-credit',
        'contributor-profile',
        'game',
        'score',
    ];
    $result = [];

    if (array_key_exists('policy', $input)) {
        $policy = byline_editorial_preset_key($input['policy']);
        if (in_array($policy, ['normal', 'sports', 'opinion', 'visual', 'minimum'], true)) {
            $result['policy'] = $policy;
        }
    }
    foreach (['required', 'recommended'] as $field) {
        if (array_key_exists($field, $input)) {
            $result[$field] = byline_editorial_preset_string_list($input[$field], $allowed_checks);
        }
    }

    return $result;
}

/**
 * @param array<string, mixed> $input
 * @return array<string, mixed>
 */
function byline_editorial_preset_sanitize_media(array $input): array
{
    $result = [];
    if (array_key_exists('mode', $input)) {
        $mode = byline_editorial_preset_key($input['mode']);
        if (in_array($mode, ['none', 'recommended', 'requested', 'required', 'visual-first'], true)) {
            $result['mode'] = $mode;
        }
    }
    foreach (['requireCredit', 'requireAltText'] as $field) {
        if (array_key_exists($field, $input)) {
            $result[$field] = !empty($input[$field]);
        }
    }

    return $result;
}

/**
 * @param array<string, mixed> $input
 * @return array<int, array<string, mixed>>
 */
function byline_editorial_preset_sanitize_tasks(array $input): array
{
    $result = [];
    foreach (array_slice($input, 0, BYLINE_EDITORIAL_PRESETS_MAX_TASKS) as $task) {
        if (!is_array($task)) {
            continue;
        }
        $key = byline_editorial_preset_key($task['key'] ?? '');
        if ($key === '' || preg_match('/^[a-z0-9][a-z0-9_-]{0,63}$/', $key) !== 1) {
            continue;
        }
        $when = byline_editorial_preset_key($task['when'] ?? 'always');
        if (!in_array($when, ['always', 'missing-noncritical', 'missing-required', 'on-publish'], true)) {
            $when = 'always';
        }
        $result[] = [
            'key' => $key,
            'when' => $when,
            'required' => !empty($task['required']),
        ];
    }

    return $result;
}

/**
 * @param array<string, mixed> $input
 * @return array<string, mixed>
 */
function byline_editorial_preset_sanitize_associations(array $input): array
{
    $result = [];
    foreach (['storyId', 'coverageId', 'gameId', 'eventId', 'teamId'] as $field) {
        if (!array_key_exists($field, $input) || !is_scalar($input[$field])) {
            continue;
        }
        $value = byline_editorial_preset_id($input[$field]);
        if ($value > 0) {
            $result[$field] = $value;
        }
    }
    if (array_key_exists('teamIds', $input) && is_array($input['teamIds'])) {
        $ids = [];
        foreach (array_slice($input['teamIds'], 0, 20) as $item) {
            $item = byline_editorial_preset_id($item);
            if ($item > 0 && !in_array($item, $ids, true)) {
                $ids[] = $item;
            }
        }
        $result['teamIds'] = $ids;
    }

    return $result;
}

/**
 * Sanitize only fields allowed in a user override patch.
 *
 * @param array<string, mixed> $input
 * @return array<string, mixed>
 */
function byline_editorial_preset_sanitize_patch(string $type, array $input): array
{
    $type = byline_editorial_normalize_preset_type($type);
    if ($type === '') {
        return [];
    }

    $result = [];
    if (array_key_exists('label', $input)) {
        $label = byline_editorial_preset_text($input['label']);
        if ($label !== '') {
            $result['label'] = $label;
        }
    }
    if (array_key_exists('section', $input)) {
        $section = byline_editorial_preset_key($input['section']);
        if ($section !== '' && preg_match('/^[a-z0-9][a-z0-9-]{0,63}$/', $section) === 1) {
            $result['section'] = $section;
        }
    }
    if (isset($input['workflow']) && is_array($input['workflow'])) {
        $workflow = byline_editorial_preset_sanitize_workflow($input['workflow']);
        if ($workflow !== []) {
            $result['workflow'] = $workflow;
        }
    }
    if (isset($input['readiness']) && is_array($input['readiness'])) {
        $readiness = byline_editorial_preset_sanitize_readiness($input['readiness']);
        if ($readiness !== []) {
            $result['readiness'] = $readiness;
        }
    }
    if (isset($input['media']) && is_array($input['media'])) {
        $media = byline_editorial_preset_sanitize_media($input['media']);
        if ($media !== []) {
            $result['media'] = $media;
        }
    }
    if (array_key_exists('tasks', $input) && is_array($input['tasks'])) {
        $result['tasks'] = byline_editorial_preset_sanitize_tasks($input['tasks']);
    }
    if (isset($input['associations']) && is_array($input['associations'])) {
        $associations = byline_editorial_preset_sanitize_associations($input['associations']);
        if ($associations !== []) {
            $result['associations'] = $associations;
        }
    }

    return $result;
}

/**
 * Return one complete sanitized preset without applying stored user patches.
 *
 * @param array<string, mixed> $input
 * @return array<string, mixed>
 */
function byline_sanitize_editorial_preset(string $type, array $input): array
{
    $type = byline_editorial_normalize_preset_type($type);
    $defaults = byline_editorial_default_presets();
    if ($type === '' || !isset($defaults[$type])) {
        return [];
    }

    return byline_editorial_preset_merge(
        $defaults[$type],
        byline_editorial_preset_sanitize_patch($type, $input)
    );
}

/**
 * @param array<string, mixed> $base
 * @param array<string, mixed> $patch
 * @return array<string, mixed>
 */
function byline_editorial_preset_merge(array $base, array $patch): array
{
    foreach ($patch as $key => $value) {
        if (is_array($value) && isset($base[$key]) && is_array($base[$key])) {
            // Lists are replacements; named configuration objects merge.
            $is_list = $value === [] || array_keys($value) === range(0, count($value) - 1);
            $base[$key] = $is_list
                ? $value
                : byline_editorial_preset_merge($base[$key], $value);
            continue;
        }
        $base[$key] = $value;
    }

    return $base;
}

/**
 * @return array<string, array<string, mixed>>
 */
function byline_editorial_preset_option_patches(): array
{
    if (!function_exists('get_option')) {
        return [];
    }

    $stored = get_option(BYLINE_EDITORIAL_PRESETS_OPTION, []);
    if (!is_array($stored)) {
        return [];
    }
    $stored = isset($stored['presets']) && is_array($stored['presets']) ? $stored['presets'] : $stored;
    $patches = [];

    foreach (byline_editorial_preset_types() as $type) {
        if (isset($stored[$type]) && is_array($stored[$type])) {
            $patches[$type] = byline_editorial_preset_sanitize_patch($type, $stored[$type]);
        }
    }

    return $patches;
}

/**
 * @param string $type
 * @return array<string, mixed>|null
 */
function byline_get_editorial_preset(string $type): ?array
{
    $type = byline_editorial_normalize_preset_type($type);
    $defaults = byline_editorial_default_presets();
    if ($type === '' || !isset($defaults[$type])) {
        return null;
    }

    $patches = byline_editorial_preset_option_patches();
    $preset = byline_editorial_preset_merge($defaults[$type], $patches[$type] ?? []);
    $preset['id'] = $type;

    return $preset;
}

/**
 * @return array<string, array<string, mixed>>
 */
function byline_get_editorial_presets(): array
{
    $result = [];
    foreach (byline_editorial_preset_types() as $type) {
        $preset = byline_get_editorial_preset($type);
        if (is_array($preset)) {
            $result[$type] = $preset;
        }
    }

    return $result;
}

function byline_editorial_preset_management_capability(): string
{
    return defined('BYLINE_MANAGE_CAPABILITY') ? BYLINE_MANAGE_CAPABILITY : 'manage_byline';
}

function byline_editorial_presets_can_use(?int $user_id = null): bool
{
    if ($user_id === null) {
        return function_exists('current_user_can') && (
            current_user_can('edit_posts')
            || current_user_can(byline_editorial_preset_management_capability())
        );
    }

    return function_exists('user_can') && (
        user_can($user_id, 'edit_posts')
        || user_can($user_id, byline_editorial_preset_management_capability())
    );
}

function byline_editorial_presets_can_edit(?int $user_id = null): bool
{
    if ($user_id === null) {
        return function_exists('current_user_can') && (
            current_user_can('manage_options')
            || current_user_can(byline_editorial_preset_management_capability())
        );
    }

    return function_exists('user_can') && (
        user_can($user_id, 'manage_options')
        || user_can($user_id, byline_editorial_preset_management_capability())
    );
}

function byline_editorial_presets_revision(): int
{
    if (!function_exists('get_option')) {
        return 0;
    }

    return function_exists('absint')
        ? absint(get_option(BYLINE_EDITORIAL_PRESETS_REVISION_OPTION, 0))
        : abs((int) get_option(BYLINE_EDITORIAL_PRESETS_REVISION_OPTION, 0));
}

function byline_editorial_bump_presets_revision(): int
{
    $revision = byline_editorial_presets_revision() + 1;
    if (function_exists('update_option')) {
        update_option(BYLINE_EDITORIAL_PRESETS_REVISION_OPTION, $revision);
    }

    return $revision;
}

/**
 * @return WP_Error|array<string, mixed>
 */
function byline_editorial_preset_error(string $code, string $message, int $status = 400)
{
    if (class_exists('WP_Error')) {
        return new WP_Error($code, $message, ['status' => $status]);
    }

    return [];
}

/**
 * Merge a sanitized patch into one preset without resetting other overrides.
 *
 * @param array<string, mixed> $changes
 * @return array<string, mixed>|WP_Error
 */
function byline_update_editorial_preset(string $type, array $changes, ?int $user_id = null)
{
    $type = byline_editorial_normalize_preset_type($type);
    if ($type === '') {
        return byline_editorial_preset_error('byline_unknown_preset', 'That newsroom preset does not exist.', 404);
    }
    if (!byline_editorial_presets_can_edit($user_id)) {
        return byline_editorial_preset_error('byline_preset_forbidden', 'You are not allowed to edit newsroom presets.', 403);
    }
    if (!function_exists('update_option')) {
        return byline_editorial_preset_error('byline_preset_unavailable', 'Preset storage is unavailable.', 500);
    }

    $patch = byline_editorial_preset_sanitize_patch($type, $changes);
    if ($patch === [] && $changes !== []) {
        return byline_get_editorial_preset($type) ?? [];
    }
    $patches = byline_editorial_preset_option_patches();
    $patches[$type] = byline_editorial_preset_merge($patches[$type] ?? [], $patch);

    update_option(BYLINE_EDITORIAL_PRESETS_OPTION, [
        'schemaVersion' => BYLINE_EDITORIAL_PRESETS_SCHEMA_VERSION,
        'presets' => $patches,
    ]);

    byline_editorial_bump_presets_revision();

    return byline_get_editorial_preset($type) ?? [];
}

function byline_save_editorial_preset(string $type, array $changes, ?int $user_id = null)
{
    return byline_update_editorial_preset($type, $changes, $user_id);
}

/**
 * Remove only the user patch; code-owned defaults remain available.
 *
 * @return array<string, mixed>|WP_Error
 */
function byline_reset_editorial_preset(string $type, ?int $user_id = null)
{
    $type = byline_editorial_normalize_preset_type($type);
    if ($type === '') {
        return byline_editorial_preset_error('byline_unknown_preset', 'That newsroom preset does not exist.', 404);
    }
    if (!byline_editorial_presets_can_edit($user_id)) {
        return byline_editorial_preset_error('byline_preset_forbidden', 'You are not allowed to edit newsroom presets.', 403);
    }
    if (!function_exists('update_option')) {
        return byline_editorial_preset_error('byline_preset_unavailable', 'Preset storage is unavailable.', 500);
    }

    $patches = byline_editorial_preset_option_patches();
    unset($patches[$type]);
    update_option(BYLINE_EDITORIAL_PRESETS_OPTION, [
        'schemaVersion' => BYLINE_EDITORIAL_PRESETS_SCHEMA_VERSION,
        'presets' => $patches,
    ]);
    byline_editorial_bump_presets_revision();

    return byline_get_editorial_preset($type) ?? [];
}

/**
 * @param array<string, mixed> $context
 * @param array<string, mixed> $overrides
 * @return array<string, mixed>
 */
function byline_apply_editorial_preset(string $type, array $context = [], array $overrides = []): array
{
    $type = byline_editorial_normalize_preset_type($type);
    $preset = $type !== '' ? byline_get_editorial_preset($type) : null;
    if (!is_array($preset)) {
        return [];
    }

    $context_override = isset($context['overrides']) && is_array($context['overrides'])
        ? $context['overrides']
        : [];
    foreach (['label', 'section', 'workflow', 'readiness', 'media', 'tasks', 'associations'] as $field) {
        if (array_key_exists($field, $context)) {
            $context_override[$field] = $context[$field];
        }
    }
    $safe_overrides = byline_editorial_preset_sanitize_patch(
        $type,
        array_merge($context_override, $overrides)
    );
    $preset = byline_editorial_preset_merge($preset, $safe_overrides);

    $association_context = isset($context['associations']) && is_array($context['associations'])
        ? $context['associations']
        : [];
    foreach (['storyId', 'coverageId', 'gameId', 'eventId', 'teamId', 'teamIds'] as $field) {
        if (array_key_exists($field, $context)) {
            $association_context[$field] = $context[$field];
        }
    }
    $safe_associations = byline_editorial_preset_sanitize_associations($association_context);
    $existing_associations = is_array($preset['associations'] ?? null) ? $preset['associations'] : [];

    foreach (['storyId', 'coverageId', 'gameId', 'eventId', 'teamId'] as $field) {
        if (isset($safe_associations[$field]) && $safe_associations[$field] > 0) {
            $existing_associations[$field] = $safe_associations[$field];
        }
    }
    if (array_key_exists('teamIds', $safe_associations)) {
        $existing_team_ids = isset($existing_associations['teamIds']) && is_array($existing_associations['teamIds'])
            ? $existing_associations['teamIds']
            : [];
        $existing_associations['teamIds'] = byline_editorial_preset_sanitize_associations([
            'teamIds' => array_merge($existing_team_ids, $safe_associations['teamIds']),
        ])['teamIds'] ?? [];
    }
    $preset['associations'] = $existing_associations;
    $preset['id'] = $type;

    return $preset;
}

function byline_editorial_apply_preset(string $type, array $context = [], array $overrides = []): array
{
    return byline_apply_editorial_preset($type, $context, $overrides);
}
