<?php

/**
 * The editor-facing transport for the Byline editorial workflow.
 *
 * Workflow values are internal newsroom information: who is editing a story, when
 * it is due, and what pictures it still needs. They are deliberately not exposed
 * through post meta in the public REST schema. This dedicated namespace requires
 * `edit_post` on the story for every request, so an anonymous reader of the
 * public API can never see an assignment or a deadline.
 *
 * One GET returns everything the block-editor sidebar needs — state, labels, the
 * assignable editors, and the current user's capabilities — so the sidebar never
 * polls and never walks the user table itself.
 */

if (!defined('ABSPATH')) {
    exit;
}

// The main plugin bootstrap intentionally remains stable for compatibility.
// Loading the editorial domain modules from this already-registered transport
// keeps the new slice available to both the plugin and focused standalone tests
// without creating a second bootstrap path.
foreach (['planning', 'media', 'tasks', 'coverage', 'readiness', 'corrections', 'feedback', 'contributors', 'activity', 'presets'] as $byline_editorial_module) {
    $byline_editorial_module_file = __DIR__ . '/' . $byline_editorial_module . '.php';
    if (is_readable($byline_editorial_module_file)) {
        require_once $byline_editorial_module_file;
    }
}
unset($byline_editorial_module, $byline_editorial_module_file);

function byline_editorial_rest_permission(WP_REST_Request $request)
{
    $post_id = absint($request->get_param('id'));
    $post = $post_id ? get_post($post_id) : null;

    if (!$post instanceof WP_Post || $post->post_type !== 'post') {
        return new WP_Error('byline_editorial_unknown_story', 'This story does not exist.', ['status' => 404]);
    }

    if (!current_user_can('edit_post', $post_id)) {
        return new WP_Error(
            'byline_editorial_forbidden',
            'You are not allowed to view this story\'s editorial workflow.',
            ['status' => rest_authorization_required_code()]
        );
    }

    return true;
}

function byline_editorial_rest_distribution_action_permission(WP_REST_Request $request)
{
    $story_permission = byline_editorial_rest_permission($request);
    if ($story_permission !== true) {
        return $story_permission;
    }

    if (current_user_can('publish_posts')
        || current_user_can('edit_others_posts')
        || current_user_can(defined('BYLINE_MANAGE_CAPABILITY') ? BYLINE_MANAGE_CAPABILITY : 'manage_byline')) {
        return true;
    }

    return new WP_Error(
        'byline_distribution_forbidden',
        'Only an editor can send or mark a story as distributed.',
        ['status' => rest_authorization_required_code()]
    );
}

/**
 * The status vocabulary, in newsroom order, with the derived publication state
 * marked so the client never offers it as a choice.
 */
function byline_editorial_rest_statuses(): array
{
    $statuses = [];

    foreach (byline_editorial_workflow_statuses() as $id => $definition) {
        $statuses[] = [
            'id' => $id,
            'label' => (string) $definition['label'],
            'group' => (string) $definition['group'],
            'selectable' => in_array($id, byline_editorial_selectable_status_ids(), true),
        ];
    }

    return $statuses;
}

function byline_editorial_rest_payload(int $post_id): array
{
    $state = byline_get_editorial_story_state($post_id);
    $can_assign = byline_editorial_can_assign($post_id);
    $post = get_post($post_id);
    $author = $post instanceof WP_Post ? get_user_by('id', (int) $post->post_author) : false;
    $media = function_exists('byline_get_editorial_media_request')
        ? byline_get_editorial_media_request($post_id)
        : [];
    $corrections = function_exists('byline_list_corrections')
        ? byline_list_corrections($post_id, false)
        : [];
    $readiness = function_exists('byline_get_story_readiness')
        ? byline_get_story_readiness($post_id)
        : [];

    return [
        'story' => $state,
        'statuses' => byline_editorial_rest_statuses(),
        'capabilities' => [
            'changeStatus' => byline_editorial_can_change_status($post_id),
            'assign' => $can_assign,
        ],
        // The writer is the WordPress post author and stays that way. It is
        // reported for context only; the sidebar never writes it.
        'writer' => $author instanceof WP_User
            ? ['id' => (int) $author->ID, 'name' => (string) $author->display_name]
            : null,
        // Only an editor may assign, so only an editor receives the roster.
        'editors' => $can_assign ? byline_editorial_assignable_editors() : [],
        'plannedPublishAt' => function_exists('byline_get_editorial_planned_publish_at')
            ? byline_get_editorial_planned_publish_at($post_id)
            : '',
        'media' => $media,
        'tasks' => function_exists('byline_task_count_for_story')
            ? ['openCount' => byline_task_count_for_story($post_id)]
            : ['openCount' => 0],
        'coverage' => function_exists('byline_get_story_coverage_summary')
            ? byline_get_story_coverage_summary($post_id, null)
            : [],
        'contributors' => function_exists('byline_get_story_contributors')
            ? byline_get_story_contributors($post_id)
            : [],
        'corrections' => $corrections,
        'readiness' => $readiness === [] ? null : [
            'passed' => (int) ($readiness['passed'] ?? 0),
            'warnings' => (int) ($readiness['warnings'] ?? 0),
            'errors' => (int) ($readiness['errors'] ?? 0),
            'total' => (int) ($readiness['total'] ?? 0),
            'ready' => !empty($readiness['ready']),
        ],
        'notes' => byline_editorial_rest_notes_support($post_id),
        'discord' => byline_editorial_rest_discord_context($post_id),
    ];
}

/**
 * WordPress Notes are progressive enhancement. Core 6.9 stores Notes as
 * ordinary comments with comment_type=note and exposes their support through
 * the post-type editor sub-feature. Do not call private/unstable Note helpers
 * or create a second Byline datastore just to render this action.
 */
function byline_editorial_rest_notes_support(int $post_id = 0): array
{
    $editor_supports_notes = false;
    if ($post_id > 0 && function_exists('get_all_post_type_supports')) {
        $supports = get_all_post_type_supports('post');
        $editor = is_array($supports['editor'] ?? null) ? ($supports['editor'][0] ?? []) : [];
        $editor_supports_notes = is_array($editor) && !empty($editor['notes']);
    }

    // is_avatar_comment_type() is a public Core function. The 'note' value was
    // added with the Core Notes feature in 6.9, so this is a useful version/API
    // signal while still allowing a site to disable Notes for posts.
    $core_notes_api = function_exists('get_comments')
        && function_exists('is_avatar_comment_type')
        && is_avatar_comment_type('note');
    $edit_url = $post_id > 0 && function_exists('get_edit_post_link')
        ? (string) get_edit_post_link($post_id, 'raw')
        : '';
    $available = $editor_supports_notes && $core_notes_api && $edit_url !== '';

    return [
        'available' => $available,
        'url' => $available ? esc_url_raw($edit_url) : '',
        'message' => $available ? '' : 'Notes are not available for this story in the current WordPress editor.',
    ];
}

/**
 * The Discord thread is presented as read-only context. The workflow domain does
 * not depend on the integration, so the value is read straight from meta and the
 * absence of the integration simply reports "not linked".
 */
function byline_editorial_rest_discord_thread(int $post_id): string
{
    if (!defined('WWH_DISCORD_THREAD_META')) {
        return '';
    }

    $thread_id = get_post_meta($post_id, WWH_DISCORD_THREAD_META, true);

    return is_string($thread_id) ? $thread_id : '';
}

/**
 * Discord's canonical thread URL is safe to expose when both snowflakes are
 * known. Keeping construction here means the editor and any other client do
 * not need to know how Byline stores Discord configuration.
 */
function byline_editorial_rest_discord_thread_url(int $post_id): string
{
    $thread_id = byline_editorial_rest_discord_thread($post_id);
    $guild_id = function_exists('byline_discord_setting') ? byline_discord_setting('guildId') : '';
    if ($thread_id === '' || $guild_id === '' || !preg_match('/^\d+$/', $thread_id) || !preg_match('/^\d+$/', $guild_id)) {
        return '';
    }

    return 'https://discord.com/channels/' . rawurlencode($guild_id) . '/' . rawurlencode($thread_id);
}

/**
 * Whether this publication has Discord set up at all.
 *
 * Only the fact of configuration is derived here — never a token, a webhook, a
 * bot URL, or any other credential. A story that already carries a thread is
 * treated as configured too, so an install whose Discord settings live only in
 * the bot's environment is not reported as disconnected.
 */
function byline_editorial_rest_discord_configured(int $post_id): bool
{
    if (byline_editorial_rest_discord_thread($post_id) !== '') {
        return true;
    }
    if (function_exists('byline_discord_enabled') && byline_discord_enabled()) {
        return true;
    }
    if (function_exists('byline_discord_setting')) {
        return byline_discord_setting('guildId') !== '' && byline_discord_setting('storyboardChannelId') !== '';
    }
    return false;
}

/**
 * The safe Discord projection for one story.
 *
 * The editor needs to tell three states apart: Discord is not configured, it is
 * configured but this story has no thread, and this story has a linked thread.
 * `canCreateThread` stays false because Byline has no WordPress-side API that
 * creates a storyboard thread; threads are created in Discord and linked by the
 * bot's reconciliation.
 *
 * @return array<string,mixed>
 */
function byline_editorial_rest_discord_context(int $post_id): array
{
    return [
        'configured' => byline_editorial_rest_discord_configured($post_id),
        'threadId' => byline_editorial_rest_discord_thread($post_id),
        'threadUrl' => byline_editorial_rest_discord_thread_url($post_id),
        'canCreateThread' => false,
    ];
}

function byline_editorial_rest_get_story(WP_REST_Request $request)
{
    return rest_ensure_response(byline_editorial_rest_payload(absint($request->get_param('id'))));
}

/**
 * Return the small protected read model needed to open an article workflow.
 *
 * The original story response remains intentionally unchanged for existing
 * integrations. New editor clients can use this projection so corrections,
 * contributor records, and other secondary collections stay lazy until an
 * editor opens the relevant panel.
 */
function byline_editorial_rest_bootstrap_payload(int $post_id): array
{
    $state = byline_get_editorial_story_state($post_id);
    $can_assign = byline_editorial_can_assign($post_id);
    $post = get_post($post_id);
    $author = $post instanceof WP_Post ? get_user_by('id', (int) $post->post_author) : false;
    $media = function_exists('byline_get_editorial_media_request')
        ? byline_get_editorial_media_request($post_id)
        : [];
    $readiness = function_exists('byline_get_story_readiness')
        ? byline_get_story_readiness($post_id)
        : [];
    $coverage = function_exists('byline_get_story_coverage_summary')
        ? byline_get_story_coverage_summary($post_id, null)
        : [];
    $contributor_count = function_exists('byline_get_story_contributor_entries')
        ? count(byline_get_story_contributor_entries($post_id, true))
        : (function_exists('byline_get_story_contributors') ? count(byline_get_story_contributors($post_id)) : 0);
    $correction_count = function_exists('byline_count_corrections')
        ? byline_count_corrections($post_id)
        : 0;

    return [
        'story' => $state,
        'statuses' => byline_editorial_rest_statuses(),
        'capabilities' => [
            'changeStatus' => byline_editorial_can_change_status($post_id),
            'assign' => $can_assign,
        ],
        'writer' => $author instanceof WP_User
            ? ['id' => (int) $author->ID, 'name' => (string) $author->display_name]
            : null,
        'editors' => $can_assign ? byline_editorial_assignable_editors() : [],
        'plannedPublishAt' => function_exists('byline_get_editorial_planned_publish_at')
            ? byline_get_editorial_planned_publish_at($post_id)
            : '',
        'media' => [
            'type' => (string) ($media['type'] ?? 'none'),
            'status' => (string) ($media['status'] ?? 'needed'),
            'label' => (string) ($media['label'] ?? $media['notes'] ?? ''),
            'isLegacy' => !empty($media['isLegacy']),
        ],
        'tasks' => [
            'openCount' => function_exists('byline_task_count_for_story')
                ? byline_task_count_for_story($post_id)
                : 0,
        ],
        'coverage' => $coverage,
        'contributors' => ['count' => $contributor_count],
        'corrections' => ['count' => $correction_count],
        'readiness' => $readiness === [] ? null : [
            'passed' => (int) ($readiness['passed'] ?? 0),
            'warnings' => (int) ($readiness['warnings'] ?? 0),
            'errors' => (int) ($readiness['errors'] ?? 0),
            'total' => (int) ($readiness['total'] ?? 0),
            'ready' => !empty($readiness['ready']),
        ],
        'notes' => byline_editorial_rest_notes_support($post_id),
        'discord' => byline_editorial_rest_discord_context($post_id),
    ];
}

function byline_editorial_rest_get_story_bootstrap(WP_REST_Request $request)
{
    return rest_ensure_response(byline_editorial_rest_bootstrap_payload(absint($request->get_param('id'))));
}

function byline_editorial_rest_update_story(WP_REST_Request $request)
{
    $post_id = absint($request->get_param('id'));
    $body = $request->get_json_params();
    $body = is_array($body) ? $body : [];
    $changes = [];
    $extended = [];

    // Only keys the request actually sent are applied, so a partial update never
    // clears a field the client did not know about.
    foreach (['status', 'editorId', 'deadline', 'visuals'] as $field) {
        if (array_key_exists($field, $body)) {
            $changes[$field] = $body[$field];
        }
    }

    foreach (['plannedPublishAt', 'media', 'visualRequest', 'coverageIds', 'contributors'] as $field) {
        if (array_key_exists($field, $body)) {
            $extended[$field] = $body[$field];
        }
    }

    $expected_revision = null;
    if (array_key_exists('expectedRevision', $body)) {
        $raw_revision = $body['expectedRevision'];
        if ((!is_int($raw_revision) && !is_numeric($raw_revision)) || (int) $raw_revision < 0) {
            return new WP_Error(
                'byline_editorial_invalid_revision',
                'The story revision is invalid. Reload the story and try again.',
                ['status' => 400]
            );
        }
        $expected_revision = (int) $raw_revision;
    }

    if ($changes === [] && $extended === []) {
        return new WP_Error('byline_editorial_empty_update', 'No editorial workflow changes were supplied.', ['status' => 400]);
    }

    // Check once before applying any of the grouped fields. Legacy callers can
    // omit expectedRevision; current admin clients get a deterministic conflict
    // instead of silently replacing a colleague's newer metadata.
    $revision_check = byline_assert_editorial_revision($post_id, $expected_revision);
    if ($revision_check !== true) {
        return $revision_check;
    }

    if (array_key_exists('plannedPublishAt', $extended) && !byline_editorial_can_assign($post_id)) {
        return new WP_Error('byline_editorial_forbidden_planned_publish', 'Only an editor can change the planned publication target.', ['status' => 403]);
    }

    if (array_key_exists('plannedPublishAt', $extended)
        && byline_editorial_sanitize_planned_publish_at($extended['plannedPublishAt']) === ''
        && trim((string) $extended['plannedPublishAt']) !== '') {
        return new WP_Error('byline_editorial_invalid_planned_publish', 'Use a valid planned publication date/time.', ['status' => 400]);
    }

    // Validate the shape and object references for every grouped field before
    // applying the primary workflow state. This keeps a mixed request atomic
    // from an editor's point of view: an invalid coverage/contributor/media
    // change cannot leave status or assignment partially updated.
    if (array_key_exists('media', $extended) || array_key_exists('visualRequest', $extended)) {
        $media = $extended['media'] ?? $extended['visualRequest'];
        if (!is_array($media)) {
            return new WP_Error('byline_editorial_invalid_media', 'The media request must be an object.', ['status' => 400]);
        }
        if (function_exists('byline_editorial_sanitize_media_request')) {
            $media_request = byline_editorial_sanitize_media_request($media);
            if (($media_request['assigneeId'] ?? 0) > 0 && function_exists('get_user_by') && !get_user_by('id', (int) $media_request['assigneeId'])) {
                return new WP_Error('byline_editorial_media_unknown_assignee', 'That media assignee does not exist.', ['status' => 400]);
            }
            if (($media_request['assigneeId'] ?? 0) > 0
                && function_exists('byline_editorial_media_assignee_can_be_set')
                && !byline_editorial_media_assignee_can_be_set($post_id, (int) $media_request['assigneeId'])) {
                return new WP_Error('byline_editorial_media_assignment_forbidden', 'Only an editor can assign media work to another user.', ['status' => 403]);
            }
        }
    }

    if (array_key_exists('coverageIds', $extended)) {
        if (!is_array($extended['coverageIds']) || !function_exists('byline_set_story_coverage_ids')) {
            return new WP_Error('byline_editorial_invalid_coverage', 'Coverage membership could not be updated.', ['status' => 400]);
        }
        if (function_exists('byline_sanitize_coverage_ids') && function_exists('byline_coverage_exists')) {
            foreach (byline_sanitize_coverage_ids($extended['coverageIds']) as $coverage_id) {
                if (!byline_coverage_exists((int) $coverage_id)) {
                    return new WP_Error('byline_coverage_not_found', 'One of the selected coverage objects does not exist.', ['status' => 404]);
                }
            }
        }
    }

    if (array_key_exists('contributors', $extended)) {
        if (!is_array($extended['contributors']) || !function_exists('byline_set_story_contributors')) {
            return new WP_Error('byline_editorial_invalid_contributors', 'Contributors could not be updated.', ['status' => 400]);
        }
        if (function_exists('byline_sanitize_story_contributors') && function_exists('byline_story_contributor_reference_exists')) {
            $normalised_contributors = byline_sanitize_story_contributors($extended['contributors']);
            if (count($normalised_contributors) !== count($extended['contributors'])) {
                return new WP_Error('byline_invalid_contributors', 'Every contributor must reference one existing user or guest contributor.', ['status' => 400]);
            }
            foreach ($normalised_contributors as $reference) {
                if (!byline_story_contributor_reference_exists($reference)) {
                    return new WP_Error('byline_unknown_contributor', 'One of the selected contributors no longer exists.', ['status' => 400]);
                }
            }
        }
    }

    if ($expected_revision !== null) {
        $changes['expectedRevision'] = $expected_revision;
    }

    // A grouped update writes to unrelated WordPress storage that cannot be
    // wrapped in a real transaction, so this does not pretend otherwise. Each
    // write registers how to undo itself; if a later write fails, the earlier
    // ones are restored and the request truly leaves nothing behind. Only when
    // a restore itself fails does the story keep changed state — and then the
    // revision is bumped and the client is told to reload, so it can never
    // believe the old revision is still authoritative.
    $rollbacks = [];
    $undo_all = static function () use (&$rollbacks): bool {
        $restored = true;
        foreach (array_reverse($rollbacks) as $undo) {
            try {
                if ($undo() === false) {
                    $restored = false;
                }
            } catch (Throwable $exception) {
                $restored = false;
            }
        }
        $rollbacks = [];
        return $restored;
    };
    $fail = static function ($error) use ($post_id, $undo_all) {
        if ($undo_all()) {
            return $error;
        }
        byline_bump_editorial_revision($post_id);
        return new WP_Error(
            'byline_editorial_partial_update',
            'Part of this change was saved before a later step failed, and it could not be undone. Reload the story to see what is stored now.',
            [
                'status' => 409,
                'currentRevision' => byline_get_editorial_revision($post_id),
            ]
        );
    };

    $previous_state = byline_get_editorial_story_state($post_id);
    $result = $changes !== [] ? byline_update_editorial_story_state($post_id, $changes, null, false) : $previous_state;

    if (is_wp_error($result)) {
        return $result;
    }

    if ($changes !== []) {
        $rollbacks[] = static function () use ($post_id, $changes, $previous_state): void {
            // Restore through the storage setters rather than the validating
            // update path: this is a repair of state the server itself wrote,
            // and it must not re-announce an editorial change that never held.
            if (array_key_exists('status', $changes)) {
                byline_set_editorial_status($post_id, (string) $previous_state['storedStatus']);
            }
            if (array_key_exists('editorId', $changes)) {
                byline_set_editorial_editor_id($post_id, (int) $previous_state['editorId']);
            }
            if (array_key_exists('deadline', $changes)) {
                byline_set_editorial_deadline($post_id, (string) $previous_state['deadline']);
            }
            if (array_key_exists('visuals', $changes)) {
                byline_set_editorial_visuals($post_id, (string) $previous_state['visuals']);
            }
        };
    }

    if (array_key_exists('plannedPublishAt', $extended)) {
        $previous_planned = function_exists('byline_get_editorial_planned_publish_at')
            ? byline_get_editorial_planned_publish_at($post_id)
            : '';
        if (byline_set_editorial_planned_publish_at($post_id, $extended['plannedPublishAt']) === false) {
            return $fail(new WP_Error('byline_editorial_invalid_planned_publish', 'Use a valid planned publication date/time.', ['status' => 400]));
        }
        $rollbacks[] = static function () use ($post_id, $previous_planned) {
            return byline_set_editorial_planned_publish_at($post_id, $previous_planned) !== false;
        };
    }

    if (array_key_exists('media', $extended) || array_key_exists('visualRequest', $extended)) {
        $media = $extended['media'] ?? $extended['visualRequest'];
        $media_meta_key = defined('BYLINE_EDITORIAL_MEDIA_REQUEST_META') ? BYLINE_EDITORIAL_MEDIA_REQUEST_META : '';
        $media_existed = $media_meta_key !== '' && function_exists('metadata_exists')
            ? (bool) metadata_exists('post', $post_id, $media_meta_key)
            : false;
        $media_previous = $media_meta_key !== '' ? get_post_meta($post_id, $media_meta_key, true) : '';
        $media_result = byline_set_editorial_media_request($post_id, $media);
        if (is_wp_error($media_result)) {
            return $fail($media_result);
        }
        if ($media_meta_key !== '') {
            $rollbacks[] = static function () use ($post_id, $media_meta_key, $media_existed, $media_previous): void {
                if ($media_existed) {
                    update_post_meta($post_id, $media_meta_key, $media_previous);
                    return;
                }
                delete_post_meta($post_id, $media_meta_key);
            };
        }
    }

    if (array_key_exists('coverageIds', $extended)) {
        $previous_coverage = function_exists('byline_get_story_coverage_ids')
            ? byline_get_story_coverage_ids($post_id)
            : [];
        $coverage_result = byline_set_story_coverage_ids($post_id, $extended['coverageIds']);
        if (is_wp_error($coverage_result)) {
            return $fail($coverage_result);
        }
        $rollbacks[] = static function () use ($post_id, $previous_coverage) {
            return !is_wp_error(byline_set_story_coverage_ids($post_id, $previous_coverage));
        };
    }

    if (array_key_exists('contributors', $extended)) {
        $previous_contributors = function_exists('byline_get_story_contributor_entries')
            ? byline_get_story_contributor_entries($post_id, false)
            : [];
        $contributors_result = byline_set_story_contributors($post_id, $extended['contributors']);
        if (is_wp_error($contributors_result)) {
            return $fail($contributors_result);
        }
        $rollbacks[] = static function () use ($post_id, $previous_contributors) {
            return !is_wp_error(byline_set_story_contributors($post_id, $previous_contributors));
        };
    }

    if ($changes !== [] || $extended !== []) {
        byline_bump_editorial_revision($post_id);
    }

    return rest_ensure_response(byline_editorial_rest_payload($post_id));
}

function byline_editorial_register_rest_routes(): void
{
    register_rest_route(BYLINE_REST_NAMESPACE, '/editorial/stories/(?P<id>\d+)/bootstrap', [
        'methods' => WP_REST_Server::READABLE,
        'callback' => 'byline_editorial_rest_get_story_bootstrap',
        'permission_callback' => 'byline_editorial_rest_permission',
        'args' => ['id' => ['type' => 'integer', 'required' => true, 'sanitize_callback' => 'absint']],
    ]);

    register_rest_route(BYLINE_REST_NAMESPACE, '/editorial/stories/(?P<id>\d+)', [
        [
            'methods' => WP_REST_Server::READABLE,
            'callback' => 'byline_editorial_rest_get_story',
            'permission_callback' => 'byline_editorial_rest_permission',
            'args' => ['id' => ['type' => 'integer', 'required' => true, 'sanitize_callback' => 'absint']],
        ],
        [
            'methods' => 'POST',
            'callback' => 'byline_editorial_rest_update_story',
            'permission_callback' => 'byline_editorial_rest_permission',
            'args' => ['id' => ['type' => 'integer', 'required' => true, 'sanitize_callback' => 'absint']],
        ],
    ]);

    byline_editorial_register_extended_rest_routes();
}
add_action('rest_api_init', 'byline_editorial_register_rest_routes');

// --- extended editorial transport -----------------------------------------

function byline_editorial_rest_request_params(WP_REST_Request $request): array
{
    if (method_exists($request, 'get_params')) {
        $params = $request->get_params();
        return is_array($params) ? $params : [];
    }

    return [];
}

function byline_editorial_rest_body(WP_REST_Request $request): array
{
    $body = $request->get_json_params();

    return is_array($body) ? $body : [];
}

function byline_editorial_rest_can_edit_posts(): bool
{
    return current_user_can('edit_posts');
}

function byline_editorial_rest_can_view_activity_newsroom(): bool
{
    return function_exists('byline_activity_can_view_newsroom')
        ? byline_activity_can_view_newsroom()
        : (current_user_can('edit_others_posts') || current_user_can(defined('BYLINE_MANAGE_CAPABILITY') ? BYLINE_MANAGE_CAPABILITY : 'manage_byline'));
}

function byline_editorial_rest_can_use_presets(): bool
{
    return function_exists('byline_editorial_presets_can_use')
        ? byline_editorial_presets_can_use()
        : byline_editorial_rest_can_edit_posts();
}

function byline_editorial_rest_can_edit_presets(): bool
{
    return function_exists('byline_editorial_presets_can_edit')
        ? byline_editorial_presets_can_edit()
        : current_user_can('manage_options');
}

function byline_editorial_rest_can_view_task(WP_REST_Request $request)
{
    $task_id = absint($request->get_param('id'));
    if ($task_id <= 0 || !function_exists('byline_task_post') || !(byline_task_post($task_id) instanceof WP_Post)) {
        return new WP_Error('byline_task_not_found', 'That task does not exist.', ['status' => 404]);
    }

    if (!byline_task_can_view($task_id)) {
        return new WP_Error('byline_task_forbidden', 'You are not allowed to view this task.', ['status' => rest_authorization_required_code()]);
    }

    return true;
}

function byline_editorial_rest_can_view_correction(WP_REST_Request $request)
{
    $correction_id = absint($request->get_param('id'));
    $correction = function_exists('byline_get_correction') ? byline_get_correction($correction_id) : [];
    if ($correction === []) {
        return new WP_Error('byline_correction_not_found', 'That correction does not exist.', ['status' => 404]);
    }
    if (!byline_correction_can_edit_story((int) $correction['storyId'])) {
        return new WP_Error('byline_correction_forbidden', 'You are not allowed to view this correction.', ['status' => rest_authorization_required_code()]);
    }

    return true;
}

function byline_editorial_rest_can_edit_coverage(WP_REST_Request $request)
{
    $coverage_id = absint($request->get_param('id'));
    if ($coverage_id > 0 && function_exists('byline_coverage_exists') && !byline_coverage_exists($coverage_id)) {
        return new WP_Error('byline_coverage_not_found', 'The coverage could not be found.', ['status' => 404]);
    }

    return $coverage_id > 0
        ? (function_exists('byline_coverage_can_edit') && byline_coverage_can_edit($coverage_id)
            ? true
            : new WP_Error('byline_coverage_forbidden', 'You are not allowed to edit this coverage.', ['status' => rest_authorization_required_code()]))
        : byline_editorial_rest_can_edit_posts();
}

function byline_editorial_rest_can_view_feedback(WP_REST_Request $request)
{
    return current_user_can('edit_others_posts') || current_user_can('manage_byline')
        ? true
        : new WP_Error('byline_feedback_forbidden', 'You are not allowed to view reader feedback.', ['status' => rest_authorization_required_code()]);
}

function byline_editorial_rest_can_view_feedback_item(WP_REST_Request $request)
{
    if (current_user_can('edit_others_posts') || current_user_can('manage_byline')) {
        return true;
    }

    $feedback_id = absint($request->get_param('id'));
    $feedback = function_exists('byline_get_feedback') ? byline_get_feedback($feedback_id) : [];
    if ($feedback === []) {
        return new WP_Error('byline_feedback_not_found', 'That feedback item does not exist.', ['status' => 404]);
    }

    $story_id = absint($feedback['storyId'] ?? 0);
    $story = $story_id > 0 ? get_post($story_id) : null;
    if ($story instanceof WP_Post && $story->post_type === 'post' && current_user_can('edit_post', $story_id)) {
        return true;
    }

    return new WP_Error('byline_feedback_forbidden', 'You are not allowed to view reader feedback for that story.', ['status' => rest_authorization_required_code()]);
}

function byline_editorial_rest_feedback_permission(WP_REST_Request $request)
{
    $origin = method_exists($request, 'get_header') ? (string) $request->get_header('origin') : '';

    if ($origin !== '' && function_exists('byline_feedback_allowed_cors_origin') && byline_feedback_allowed_cors_origin($origin) === '') {
        return new WP_Error('byline_feedback_origin_not_allowed', 'This feedback form is not available from that site.', ['status' => 403]);
    }

    return true;
}

function byline_editorial_rest_current_user_id(): int
{
    return function_exists('get_current_user_id') ? absint(get_current_user_id()) : 0;
}

/**
 * Return the small, non-sensitive person shape shared by Planning responses.
 * Guest contributor records use the same shape, so no user email or private
 * profile metadata can leak through an editorial collection response.
 */
function byline_editorial_rest_person($person): ?array
{
    if (!is_array($person)) {
        return null;
    }

    $id = absint($person['id'] ?? 0);
    $name = sanitize_text_field((string) ($person['name'] ?? ''));
    if ($id <= 0 || $name === '') {
        return null;
    }

    $result = ['id' => $id, 'name' => $name];
    if (isset($person['avatarUrl']) && is_scalar($person['avatarUrl'])) {
        $avatar = esc_url_raw((string) $person['avatarUrl']);
        if ($avatar !== '') {
            $result['avatarUrl'] = $avatar;
        }
    }

    return $result;
}

function byline_editorial_rest_user_person(int $user_id): ?array
{
    if ($user_id <= 0 || !function_exists('get_user_by')) {
        return null;
    }

    $user = get_user_by('id', $user_id);
    if (!$user instanceof WP_User) {
        return null;
    }

    return byline_editorial_rest_person([
        'id' => (int) $user->ID,
        'name' => (string) $user->display_name,
    ]);
}

function byline_editorial_rest_wordpress_state(string $status, array $wordpress = []): array
{
    $labels = [
        'draft' => 'Draft',
        'pending' => 'Pending review',
        'future' => 'Scheduled',
        'publish' => 'Published',
        'private' => 'Private',
    ];

    return [
        'id' => $status,
        'label' => $labels[$status] ?? $status,
        'isPublished' => $status === 'publish',
        'isScheduled' => $status === 'future',
        'scheduledAt' => ($wordpress['scheduledAt'] ?? '') !== '' ? (string) $wordpress['scheduledAt'] : null,
        'publishedAt' => ($wordpress['publishedAt'] ?? '') !== '' ? (string) $wordpress['publishedAt'] : null,
    ];
}

/** @return array<string,mixed> */
function byline_editorial_rest_planning_story(array $row): array
{
    $workflow_id = sanitize_key((string) ($row['workflow']['status'] ?? ''));
    $wordpress = is_array($row['wordpress'] ?? null) ? $row['wordpress'] : [];
    $wordpress_status = sanitize_key((string) ($wordpress['status'] ?? ''));
    $visual = is_array($row['visual'] ?? null) ? $row['visual'] : [];
    $featured = is_array($row['featuredImage'] ?? null) ? $row['featuredImage'] : [];
    $authors = [];
    foreach ((array) ($row['bylines'] ?? []) as $person) {
        $normalized = byline_editorial_rest_person($person);
        if ($normalized !== null) {
            $authors[] = $normalized;
        }
    }

    $coverage = [];
    foreach ((array) ($row['coverage'] ?? []) as $item) {
        if (!is_array($item) || absint($item['id'] ?? 0) <= 0) {
            continue;
        }
        $coverage[] = [
            'id' => absint($item['id']),
            'title' => sanitize_text_field((string) ($item['title'] ?? '')),
            'slug' => sanitize_title((string) ($item['slug'] ?? '')),
        ];
    }

    $deadline = (string) ($row['deadline'] ?? '');
    $planned = (string) ($row['plannedPublishAt'] ?? '');
    $modified = (string) ($row['modifiedAt'] ?? '');
    $featured_id = !empty($featured['present']) ? absint($featured['attachmentId'] ?? 0) : 0;
    $visual_status = sanitize_key((string) ($visual['status'] ?? 'needed'));
    $visual_labels = [
        'needed' => 'Needed',
        'assigned' => 'Assigned',
        'in-progress' => 'In progress',
        'uploaded' => 'Uploaded',
        'selected' => 'Selected',
        'done' => 'Done',
    ];

    return [
        'id' => absint($row['id'] ?? 0),
        'title' => sanitize_text_field((string) ($row['title'] ?? '')),
        'editUrl' => esc_url_raw((string) ($row['editUrl'] ?? '')),
        'authors' => $authors,
        'writer' => byline_editorial_rest_person($row['writer'] ?? null),
        'editor' => byline_editorial_rest_person($row['editor'] ?? null),
        'workflow' => [
            'id' => $workflow_id,
            'label' => byline_editorial_status_label($workflow_id),
            'group' => byline_editorial_status_group($workflow_id),
            'selectable' => $workflow_id !== BYLINE_EDITORIAL_PUBLISHED_STATUS,
        ],
        'wordpressState' => byline_editorial_rest_wordpress_state($wordpress_status, $wordpress),
        'deadline' => $deadline !== '' ? $deadline : null,
        'plannedPublication' => $planned !== '' ? $planned : null,
        'modifiedAt' => $modified !== '' ? $modified : null,
        'visual' => [
            'type' => sanitize_key((string) ($visual['type'] ?? 'none')),
            'status' => $visual_status,
            'label' => $visual_labels[$visual_status] ?? $visual_status,
            'notes' => (string) ($visual['notes'] ?? ''),
            'legacyNotes' => (string) ($visual['legacyNotes'] ?? ''),
            'attachmentIds' => array_values(array_map('absint', (array) ($visual['attachmentIds'] ?? []))),
        ],
        'openTaskCount' => absint($row['tasks']['openCount'] ?? 0),
        'coverage' => $coverage,
        'featuredImage' => $featured_id > 0 ? ['id' => $featured_id, 'isSelectedVisual' => !empty($featured['isLinked'])] : null,
        'needsReview' => $workflow_id === 'ready',
    ];
}

function byline_editorial_rest_saved_view(array $view, int $user_id): array
{
    $view['ownerId'] = $user_id;
    if (isset($view['filters']) && is_array($view['filters'])) {
        $view['filters'] = byline_editorial_rest_planning_filters($view['filters']);
    }
    if (!isset($view['sort']) || !is_array($view['sort'])) {
        $view['sort'] = ['key' => 'deadline', 'direction' => 'asc'];
    }

    return $view;
}

/**
 * Adapt the compact storage/query filter names to the public Planning client
 * contract. The domain still stores only its bounded canonical keys.
 */
function byline_editorial_rest_planning_filters(array $filters): array
{
    return [
        'query' => (string) ($filters['query'] ?? ''),
        'workflow' => (string) ($filters['status'] ?? $filters['workflow'] ?? ''),
        'writerId' => !empty($filters['writer']) ? absint($filters['writer']) : null,
        'editorId' => !empty($filters['editor']) ? absint($filters['editor']) : null,
        'deadlineFrom' => (string) ($filters['deadlineFrom'] ?? ''),
        'deadlineTo' => (string) ($filters['deadlineTo'] ?? ''),
        'plannedFrom' => (string) ($filters['plannedFrom'] ?? ''),
        'plannedTo' => (string) ($filters['plannedTo'] ?? ''),
        'wordpressState' => (string) ($filters['postStatus'] ?? ''),
        'visualStatus' => (string) ($filters['visualStatus'] ?? ''),
        'coverageId' => !empty($filters['coverage']) && is_numeric($filters['coverage']) ? absint($filters['coverage']) : null,
        'mine' => !empty($filters['mine']),
        'unassigned' => !empty($filters['unassigned']),
        'overdue' => !empty($filters['overdue']),
        'needsReview' => !empty($filters['needsReview']),
    ];
}

/** @return array<int,array<string,mixed>>|WP_Error */
function byline_editorial_rest_saved_view_list(int $user_id)
{
    $views = byline_editorial_get_saved_views($user_id);
    if (is_wp_error($views)) {
        return $views;
    }

    return array_map(static function (array $view) use ($user_id): array {
        return byline_editorial_rest_saved_view($view, $user_id);
    }, $views);
}

function byline_editorial_rest_planning(WP_REST_Request $request)
{
    $params = byline_editorial_rest_request_params($request);
    $user_id = byline_editorial_rest_current_user_id();
    $collection = byline_editorial_get_planning_collection($params, $user_id);
    $stories = array_map(static function (array $row): array {
        return byline_editorial_rest_planning_story($row);
    }, (array) ($collection['items'] ?? []));
    $saved_views = byline_editorial_rest_saved_view_list($user_id);
    if (is_wp_error($saved_views)) {
        return $saved_views;
    }
    $current_user = byline_editorial_rest_user_person($user_id);
    $can_assign = current_user_can('edit_others_posts');
    $can_edit_posts = current_user_can('edit_posts');
    $can_manage_feedback = current_user_can('edit_others_posts') || current_user_can('manage_byline');

    return rest_ensure_response([
        'stories' => $stories,
        'workflowStatuses' => byline_editorial_rest_statuses(),
        'savedViews' => $saved_views,
        'capabilities' => [
            'canMoveStories' => $can_edit_posts,
            'canAssign' => $can_assign,
            'canManageSavedViews' => $can_edit_posts,
            'canManageMedia' => $can_edit_posts,
            'canManageCoverage' => $can_edit_posts,
            'canManageFeedback' => $can_manage_feedback,
        ],
        'currentUser' => $current_user,
        'total' => count($stories),
        'nextPage' => null,
        // Keep the original collection keys for older admin consumers.
        'items' => $collection['items'] ?? [],
        'count' => $collection['count'] ?? count($stories),
        'hasMore' => !empty($collection['hasMore']),
        'filters' => $collection['filters'] ?? [],
    ]);
}

function byline_editorial_rest_saved_views(WP_REST_Request $request)
{
    $user_id = byline_editorial_rest_current_user_id();
    $views = byline_editorial_rest_saved_view_list($user_id);

    return is_wp_error($views) ? $views : rest_ensure_response(['items' => $views]);
}

function byline_editorial_rest_planning_views(WP_REST_Request $request)
{
    $user_id = byline_editorial_rest_current_user_id();
    $views = byline_editorial_rest_saved_view_list($user_id);

    return is_wp_error($views) ? $views : rest_ensure_response($views);
}

function byline_editorial_rest_save_view(WP_REST_Request $request)
{
    $body = byline_editorial_rest_body($request);
    $user_id = byline_editorial_rest_current_user_id();
    $result = byline_editorial_save_saved_view($body, $user_id);

    return is_wp_error($result) ? $result : rest_ensure_response(byline_editorial_rest_saved_view($result, $user_id));
}

function byline_editorial_rest_update_view(WP_REST_Request $request)
{
    $body = byline_editorial_rest_body($request);
    $user_id = byline_editorial_rest_current_user_id();
    $result = byline_editorial_update_saved_view((string) $request->get_param('id'), $body, $user_id);

    return is_wp_error($result) ? $result : rest_ensure_response(byline_editorial_rest_saved_view($result, $user_id));
}

function byline_editorial_rest_delete_view(WP_REST_Request $request)
{
    $user_id = byline_editorial_rest_current_user_id();
    if (!byline_editorial_delete_saved_view((string) $request->get_param('id'), $user_id)) {
        return new WP_Error('byline_editorial_saved_view_not_found', 'That saved view does not exist.', ['status' => 404]);
    }

    return rest_ensure_response(['deleted' => true]);
}

function byline_editorial_rest_get_media(WP_REST_Request $request)
{
    return rest_ensure_response(byline_get_editorial_media_request(absint($request->get_param('id'))));
}

/** @return array<string,mixed> */
function byline_editorial_rest_media_item(array $row): array
{
    $request = is_array($row['request'] ?? null) ? $row['request'] : [];
    $story_id = absint($row['storyId'] ?? 0);
    $featured = is_array($row['featuredImage'] ?? null) ? $row['featuredImage'] : [];

    return [
        // Media requests are additive story metadata, so the story ID is the
        // stable request ID. This avoids introducing a second media datastore.
        'id' => $story_id,
        'story' => [
            'id' => $story_id,
            'title' => sanitize_text_field((string) ($row['title'] ?? '')),
            'editUrl' => esc_url_raw((string) ($row['editUrl'] ?? '')),
        ],
        'type' => sanitize_key((string) ($request['type'] ?? 'none')),
        'status' => sanitize_key((string) ($request['status'] ?? 'needed')),
        'assignee' => byline_editorial_rest_user_person(absint($request['assigneeId'] ?? 0)),
        'dueAt' => (string) ($request['dueAt'] ?? '') !== '' ? (string) $request['dueAt'] : null,
        'notes' => (string) ($request['notes'] ?? ''),
        'legacyNotes' => (string) ($request['legacyNotes'] ?? ''),
        'attachmentIds' => array_values(array_map('absint', (array) ($request['attachmentIds'] ?? []))),
        'featuredAttachmentId' => !empty($featured['isLinked']) ? absint($featured['attachmentId'] ?? 0) : null,
    ];
}

function byline_editorial_rest_media(WP_REST_Request $request)
{
    $user_id = byline_editorial_rest_current_user_id();
    $items = byline_list_editorial_media_requests(byline_editorial_rest_request_params($request), $user_id);
    $can_assign = current_user_can('edit_others_posts');

    return rest_ensure_response([
        'requests' => array_map('byline_editorial_rest_media_item', $items),
        'assignees' => $can_assign && function_exists('byline_editorial_assignable_editors')
            ? byline_editorial_assignable_editors()
            : [],
        'capabilities' => [
            'canAssign' => $can_assign,
            'canManageMedia' => current_user_can('edit_posts'),
        ],
        // Preserve the original collection key for early admin consumers.
        'items' => $items,
    ]);
}

function byline_editorial_rest_update_media(WP_REST_Request $request)
{
    $story_id = absint($request->get_param('id'));
    $body = byline_editorial_rest_body($request);
    $result = byline_set_editorial_media_request($story_id, $body);

    return is_wp_error($result) ? $result : rest_ensure_response($result);
}

function byline_editorial_rest_set_media_featured(WP_REST_Request $request)
{
    $result = byline_editorial_set_media_request_featured_image(
        absint($request->get_param('id')),
        absint(byline_editorial_rest_body($request)['attachmentId'] ?? 0)
    );

    return is_wp_error($result) ? $result : rest_ensure_response($result);
}

/** @return array<string,mixed> */
function byline_editorial_rest_task_item(array $task): array
{
    $task['assignee'] = byline_editorial_rest_user_person(absint($task['assigneeId'] ?? 0));
    $task['createdBy'] = byline_editorial_rest_user_person(absint($task['creatorId'] ?? 0));
    $task['storyId'] = absint($task['storyId'] ?? 0) ?: null;
    $task['coverageId'] = absint($task['coverageId'] ?? 0) ?: null;
    $task['dueAt'] = (string) ($task['dueAt'] ?? '') !== '' ? (string) $task['dueAt'] : null;
    $task['completedAt'] = (string) ($task['completedAt'] ?? '') !== '' ? (string) $task['completedAt'] : null;

    return $task;
}

/** @return array<int,array<string,mixed>> */
function byline_editorial_rest_task_people(): array
{
    $people = [];
    if (!function_exists('byline_editorial_assignable_editors')) {
        return $people;
    }

    foreach (byline_editorial_assignable_editors() as $person) {
        $normalized = byline_editorial_rest_person($person);
        if ($normalized !== null) {
            $normalized['kind'] = 'user';
            $people[] = $normalized;
        }
    }

    return $people;
}

/** @return array<string,bool> */
function byline_editorial_rest_task_capabilities(int $story_id = 0): array
{
    $can_assign = current_user_can('edit_others_posts');
    $can_edit_story = $story_id > 0 && current_user_can('edit_post', $story_id);

    return [
        'canEditLinkedStory' => $can_edit_story,
        'canAssign' => $can_assign,
        'canDelete' => $story_id > 0 ? $can_edit_story : current_user_can('edit_others_posts'),
        'canManageUnlinked' => current_user_can('edit_others_posts'),
    ];
}

/** @return array<string,mixed> */
function byline_editorial_rest_task_payload(array $tasks, int $story_id = 0): array
{
    return [
        'storyId' => $story_id > 0 ? $story_id : null,
        'tasks' => array_map('byline_editorial_rest_task_item', $tasks),
        'people' => byline_editorial_rest_task_people(),
        'capabilities' => byline_editorial_rest_task_capabilities($story_id),
        // Compatibility with the first collection response.
        'items' => $tasks,
    ];
}

function byline_editorial_rest_tasks(WP_REST_Request $request)
{
    $params = byline_editorial_rest_request_params($request);
    $user_id = byline_editorial_rest_current_user_id();

    return rest_ensure_response(byline_editorial_rest_task_payload(byline_list_tasks($params, $user_id)));
}

function byline_editorial_rest_story_tasks(WP_REST_Request $request)
{
    $story_id = absint($request->get_param('id'));
    $user_id = byline_editorial_rest_current_user_id();

    return rest_ensure_response(byline_editorial_rest_task_payload(byline_get_story_tasks($story_id, $user_id), $story_id));
}

function byline_editorial_rest_create_task(WP_REST_Request $request)
{
    $body = byline_editorial_rest_body($request);
    $user_id = byline_editorial_rest_current_user_id();
    $result = byline_create_task($body, $user_id);

    return is_wp_error($result) ? $result : rest_ensure_response(byline_editorial_rest_task_item($result));
}

function byline_editorial_rest_create_story_task(WP_REST_Request $request)
{
    $body = byline_editorial_rest_body($request);
    $body['storyId'] = absint($request->get_param('id'));
    $user_id = byline_editorial_rest_current_user_id();
    $result = byline_create_task($body, $user_id);
    if (is_wp_error($result)) {
        return $result;
    }

    return rest_ensure_response(byline_editorial_rest_task_payload([$result], (int) $body['storyId']));
}

function byline_editorial_rest_get_task(WP_REST_Request $request)
{
    $task = byline_get_task(absint($request->get_param('id')));

    return rest_ensure_response($task === [] ? [] : byline_editorial_rest_task_item($task));
}

function byline_editorial_rest_update_task(WP_REST_Request $request)
{
    $user_id = byline_editorial_rest_current_user_id();
    $result = byline_update_task(absint($request->get_param('id')), byline_editorial_rest_body($request), $user_id);

    return is_wp_error($result) ? $result : rest_ensure_response(byline_editorial_rest_task_item($result));
}

function byline_editorial_rest_delete_task(WP_REST_Request $request)
{
    $user_id = byline_editorial_rest_current_user_id();
    $result = byline_delete_task(absint($request->get_param('id')), $user_id);

    return is_wp_error($result) ? $result : rest_ensure_response(['deleted' => true]);
}

function byline_editorial_rest_public_coverages(WP_REST_Request $request)
{
    $params = byline_editorial_rest_request_params($request);
    $args = [];
    if (isset($params['limit'])) {
        $args['limit'] = absint($params['limit']);
    }
    if (isset($params['status'])) {
        $args['status'] = sanitize_key((string) $params['status']);
    }

    return rest_ensure_response(['items' => byline_list_public_coverages($args)]);
}

function byline_editorial_rest_public_coverage(WP_REST_Request $request)
{
    $coverage = byline_get_public_coverage_by_slug((string) $request->get_param('slug'));

    return $coverage === null
        ? new WP_Error('byline_coverage_not_found', 'That public coverage could not be found.', ['status' => 404])
        : rest_ensure_response($coverage);
}

/**
 * Return the private Coverage record with nested story IDs filtered by the
 * current user's object-level story capability. The raw record is useful to
 * storage code, but it must never be handed to a broad collection endpoint.
 * Staff relationships are newsroom-wide planning metadata and are reserved
 * for editors/Byline managers.
 *
 * @return array<string,mixed>
 */
function byline_editorial_rest_filter_coverage_record(array $coverage): array
{
    if (function_exists('byline_coverage_editable_story_ids')) {
        $coverage['storyIds'] = byline_coverage_editable_story_ids(
            (array) ($coverage['storyIds'] ?? [])
        );
    } else {
        $coverage['storyIds'] = [];
    }

    if (!current_user_can('edit_others_posts') && !current_user_can('manage_byline')) {
        $coverage['staffIds'] = [];
    }

    return $coverage;
}

/** @return array<string,mixed> */
function byline_editorial_rest_admin_coverage_item(array $coverage): array
{
    $story_ids = function_exists('byline_coverage_editable_story_ids')
        ? byline_coverage_editable_story_ids((array) ($coverage['storyIds'] ?? []))
        : [];
    $stories = [];
    $planned_count = 0;
    foreach ($story_ids as $story_id) {
        $story = get_post($story_id);
        if (!$story instanceof WP_Post || $story->post_type !== 'post') {
            continue;
        }
        if ($story->post_status !== 'publish') {
            $planned_count++;
        }
        $stories[] = [
            'id' => $story_id,
            'title' => sanitize_text_field((string) ($story->post_title ?? '')),
            'editUrl' => function_exists('get_edit_post_link') ? esc_url_raw((string) get_edit_post_link($story_id, '')) : '',
            'isPublished' => $story->post_status === 'publish',
        ];
    }

    $staff = [];
    if (current_user_can('edit_others_posts') || current_user_can('manage_byline')) {
        foreach ((array) ($coverage['staffIds'] ?? []) as $staff_id) {
            $person = byline_editorial_rest_user_person(absint($staff_id));
            if ($person !== null) {
                $staff[] = $person;
            }
        }
    }

    $artwork = function_exists('byline_coverage_public_artwork')
        ? byline_coverage_public_artwork(absint($coverage['id'] ?? 0))
        : null;

    return [
        'id' => absint($coverage['id'] ?? 0),
        'title' => sanitize_text_field((string) ($coverage['title'] ?? '')),
        'slug' => sanitize_title((string) ($coverage['slug'] ?? '')),
        'shortDescription' => sanitize_text_field((string) ($coverage['description'] ?? '')),
        'artwork' => $artwork,
        'startAt' => (string) ($coverage['startAt'] ?? '') !== '' ? (string) $coverage['startAt'] : null,
        'endAt' => (string) ($coverage['endAt'] ?? '') !== '' ? (string) $coverage['endAt'] : null,
        'status' => sanitize_key((string) ($coverage['status'] ?? 'upcoming')),
        'publicLandingEnabled' => !empty($coverage['public']),
        'staff' => $staff,
        'storyCount' => count($story_ids),
        'plannedStoryCount' => $planned_count,
        'stories' => $stories,
    ];
}

function byline_editorial_rest_admin_coverages(WP_REST_Request $request)
{
    $params = byline_editorial_rest_request_params($request);
    $limit = min(100, max(1, absint($params['limit'] ?? 50)));
    $query = [
        'post_type' => BYLINE_COVERAGE_POST_TYPE,
        'post_status' => 'any',
        'posts_per_page' => $limit,
        'numberposts' => $limit,
        'orderby' => 'modified',
        'order' => 'DESC',
    ];
    $items = [];
    foreach ((array) get_posts($query) as $post) {
        if (!$post instanceof WP_Post) {
            continue;
        }
        $item = byline_get_coverage((int) $post->ID);
        if ($item === []) {
            continue;
        }
        if (isset($params['status']) && sanitize_key((string) $params['status']) !== (string) $item['status']) {
            continue;
        }
        $items[] = byline_editorial_rest_filter_coverage_record($item);
    }

    return rest_ensure_response([
        'coverage' => array_map('byline_editorial_rest_admin_coverage_item', $items),
        'capabilities' => ['canManageCoverage' => current_user_can('edit_posts')],
        // Preserve the private domain collection for existing authenticated
        // consumers; the normalized key is the Planning client contract.
        'items' => $items,
        'count' => count($items),
    ]);
}

function byline_editorial_rest_create_coverage(WP_REST_Request $request)
{
    $body = byline_editorial_rest_body($request);
    $user_id = function_exists('get_current_user_id') ? absint(get_current_user_id()) : 0;
    $result = byline_create_coverage($body, $user_id);

    return is_wp_error($result) ? $result : rest_ensure_response(byline_editorial_rest_filter_coverage_record($result));
}

function byline_editorial_rest_get_coverage(WP_REST_Request $request)
{
    $coverage = byline_get_coverage(absint($request->get_param('id')));

    return $coverage === []
        ? new WP_Error('byline_coverage_not_found', 'The coverage could not be found.', ['status' => 404])
        : rest_ensure_response(byline_editorial_rest_filter_coverage_record($coverage));
}

function byline_editorial_rest_update_coverage(WP_REST_Request $request)
{
    $result = byline_update_coverage(absint($request->get_param('id')), byline_editorial_rest_body($request));

    return is_wp_error($result) ? $result : rest_ensure_response(byline_editorial_rest_filter_coverage_record($result));
}

function byline_editorial_rest_delete_coverage(WP_REST_Request $request)
{
    $coverage_id = absint($request->get_param('id'));
    if (!byline_coverage_exists($coverage_id)) {
        return new WP_Error('byline_coverage_not_found', 'The coverage could not be found.', ['status' => 404]);
    }
    if (!current_user_can('delete_post', $coverage_id) && !current_user_can('edit_others_posts')) {
        return new WP_Error('byline_coverage_forbidden', 'You are not allowed to delete this coverage.', ['status' => 403]);
    }
    if (!function_exists('wp_delete_post') || !wp_delete_post($coverage_id, true)) {
        return new WP_Error('byline_coverage_delete_failed', 'The coverage could not be deleted.', ['status' => 500]);
    }

    return rest_ensure_response(['deleted' => true]);
}

function byline_editorial_rest_add_coverage_story(WP_REST_Request $request)
{
    $coverage_id = absint($request->get_param('id'));
    if (!byline_coverage_exists($coverage_id)) {
        return new WP_Error('byline_coverage_not_found', 'The coverage could not be found.', ['status' => 404]);
    }

    $body = byline_editorial_rest_body($request);
    $story_id = absint($body['storyId'] ?? $body['postId'] ?? 0);
    if ($story_id <= 0) {
        $title = sanitize_text_field((string) ($body['title'] ?? ''));
        if ($title === '') {
            return new WP_Error('byline_coverage_story_title_required', 'Choose a story or provide a title for a new draft.', ['status' => 400]);
        }
        $story_id = wp_insert_post([
            'post_type' => 'post',
            'post_status' => 'draft',
            'post_title' => $title,
            'post_author' => byline_editorial_rest_current_user_id(),
        ], true);
        if (is_wp_error($story_id)) {
            return $story_id;
        }
        $story_id = absint($story_id);
    }

    $story = get_post($story_id);
    if (!$story instanceof WP_Post || $story->post_type !== 'post') {
        return new WP_Error('byline_coverage_story_not_found', 'That story does not exist.', ['status' => 404]);
    }
    if (!current_user_can('edit_post', $story_id)) {
        return new WP_Error('byline_coverage_story_forbidden', 'You are not allowed to change that story\'s coverage.', ['status' => 403]);
    }

    $coverage_ids = byline_get_story_coverage_ids($story_id);
    if (!in_array($coverage_id, $coverage_ids, true)) {
        $coverage_ids[] = $coverage_id;
    }
    $result = byline_set_story_coverage_ids($story_id, $coverage_ids);
    if (is_wp_error($result)) {
        return $result;
    }

    return rest_ensure_response(byline_editorial_rest_admin_coverage_item(byline_get_coverage($coverage_id)));
}

function byline_editorial_rest_remove_coverage_story(WP_REST_Request $request)
{
    $coverage_id = absint($request->get_param('id'));
    $story_id = absint($request->get_param('story'));
    if (!byline_coverage_exists($coverage_id)) {
        return new WP_Error('byline_coverage_not_found', 'The coverage could not be found.', ['status' => 404]);
    }
    if (!byline_coverage_is_story($story_id)) {
        return new WP_Error('byline_coverage_story_not_found', 'That story does not exist.', ['status' => 404]);
    }
    if (!current_user_can('edit_post', $story_id)) {
        return new WP_Error('byline_coverage_story_forbidden', 'You are not allowed to change that story\'s coverage.', ['status' => 403]);
    }

    $coverage_ids = array_values(array_diff(byline_get_story_coverage_ids($story_id), [$coverage_id]));
    $result = byline_set_story_coverage_ids($story_id, $coverage_ids);
    if (is_wp_error($result)) {
        return $result;
    }

    return rest_ensure_response(byline_editorial_rest_admin_coverage_item(byline_get_coverage($coverage_id)));
}

function byline_editorial_rest_readiness(WP_REST_Request $request)
{
    return rest_ensure_response(byline_get_story_readiness(absint($request->get_param('id'))));
}

function byline_editorial_rest_story_corrections(WP_REST_Request $request)
{
    $story_id = absint($request->get_param('id'));
    $items = byline_list_corrections($story_id, false);

    return rest_ensure_response([
        'storyId' => $story_id,
        'records' => array_map('byline_editorial_rest_correction_item', $items),
        'legacyText' => null,
        'canEdit' => current_user_can('edit_post', $story_id),
        // Compatibility with the first protected response.
        'items' => $items,
    ]);
}

/** Convert the PHP correction vocabulary into the reusable panel contract. */
function byline_editorial_rest_correction_item(array $item): array
{
    return [
        'id' => absint($item['id'] ?? 0),
        'storyId' => absint($item['storyId'] ?? 0),
        'type' => sanitize_key((string) ($item['type'] ?? 'correction')),
        'publicText' => (string) ($item['text'] ?? $item['publicText'] ?? ''),
        'date' => (string) ($item['recordedAt'] ?? $item['date'] ?? ''),
        'createdAt' => (string) ($item['recordedAt'] ?? $item['createdAt'] ?? ''),
        'modifiedAt' => (string) ($item['updatedAt'] ?? $item['modifiedAt'] ?? ''),
    ];
}

function byline_editorial_rest_story_correction_payload(int $story_id): array
{
    $items = byline_list_corrections($story_id, false);

    return [
        'storyId' => $story_id,
        'records' => array_map('byline_editorial_rest_correction_item', $items),
        'legacyText' => null,
        'canEdit' => current_user_can('edit_post', $story_id),
        'items' => $items,
    ];
}

function byline_editorial_rest_create_story_correction(WP_REST_Request $request)
{
    $body = byline_editorial_rest_body($request);
    if (array_key_exists('publicText', $body)) {
        $body['text'] = $body['publicText'];
    }
    if (array_key_exists('date', $body)) {
        $body['recordedAt'] = $body['date'];
    }
    $result = byline_create_correction(
        absint($request->get_param('id')),
        $body,
        byline_editorial_rest_current_user_id()
    );

    if (is_wp_error($result)) {
        return $result;
    }

    return rest_ensure_response(byline_editorial_rest_story_correction_payload(absint($request->get_param('id'))));
}

function byline_editorial_rest_nested_correction(WP_REST_Request $request): array
{
    $correction_id = absint($request->get_param('correctionId'));
    $correction = byline_get_correction($correction_id);
    $story_id = absint($request->get_param('id'));
    if ($correction === [] || absint($correction['storyId'] ?? 0) !== $story_id) {
        return [];
    }

    return $correction;
}

function byline_editorial_rest_update_story_correction(WP_REST_Request $request)
{
    $correction = byline_editorial_rest_nested_correction($request);
    if ($correction === []) {
        return new WP_Error('byline_correction_not_found', 'That correction does not belong to this story.', ['status' => 404]);
    }
    $body = byline_editorial_rest_body($request);
    if (array_key_exists('publicText', $body)) {
        $body['text'] = $body['publicText'];
    }
    if (array_key_exists('date', $body)) {
        $body['recordedAt'] = $body['date'];
    }
    $result = byline_update_correction(absint($request->get_param('correctionId')), $body, byline_editorial_rest_current_user_id());

    return is_wp_error($result)
        ? $result
        : rest_ensure_response(byline_editorial_rest_story_correction_payload(absint($request->get_param('id'))));
}

function byline_editorial_rest_delete_story_correction(WP_REST_Request $request)
{
    $correction = byline_editorial_rest_nested_correction($request);
    if ($correction === []) {
        return new WP_Error('byline_correction_not_found', 'That correction does not belong to this story.', ['status' => 404]);
    }
    if (!byline_delete_correction(absint($request->get_param('correctionId')), byline_editorial_rest_current_user_id())) {
        return new WP_Error('byline_correction_delete_failed', 'The correction could not be deleted.', ['status' => 500]);
    }

    return rest_ensure_response(byline_editorial_rest_story_correction_payload(absint($request->get_param('id'))));
}

function byline_editorial_rest_admin_corrections(WP_REST_Request $request)
{
    $params = byline_editorial_rest_request_params($request);
    $story_id = absint($params['storyId'] ?? $params['postId'] ?? 0);
    if ($story_id > 0) {
        if (!byline_coverage_is_story($story_id) || !current_user_can('edit_post', $story_id)) {
            return new WP_Error('byline_correction_forbidden', 'You are not allowed to view corrections for that story.', ['status' => rest_authorization_required_code()]);
        }
        $items = byline_list_corrections($story_id, false);

        return rest_ensure_response(['corrections' => $items, 'items' => $items]);
    }

    $limit = min(100, max(1, absint($params['limit'] ?? 50)));
    $items = [];
    $records = function_exists('get_posts') ? get_posts([
        'post_type' => BYLINE_CORRECTION_POST_TYPE,
        'post_status' => 'publish',
        'posts_per_page' => $limit,
        'numberposts' => $limit,
        'orderby' => 'date',
        'order' => 'DESC',
        'no_found_rows' => true,
    ]) : [];
    foreach (is_array($records) ? $records : [] as $record) {
        if (!$record instanceof WP_Post) {
            continue;
        }
        $item = byline_get_correction((int) $record->ID);
        if ($item === [] || !byline_correction_can_edit_story((int) $item['storyId'])) {
            continue;
        }
        $items[] = $item;
    }

    return rest_ensure_response(['corrections' => $items, 'items' => $items]);
}

function byline_editorial_rest_public_corrections(WP_REST_Request $request)
{
    return rest_ensure_response([
        'items' => byline_list_public_corrections(byline_editorial_rest_request_params($request)),
    ]);
}

function byline_editorial_rest_create_correction(WP_REST_Request $request)
{
    $user_id = function_exists('get_current_user_id') ? absint(get_current_user_id()) : 0;
    $result = byline_create_correction(absint($request->get_param('id')), byline_editorial_rest_body($request), $user_id);

    return is_wp_error($result) ? $result : rest_ensure_response($result);
}

function byline_editorial_rest_get_correction(WP_REST_Request $request)
{
    return rest_ensure_response(byline_get_correction(absint($request->get_param('id'))));
}

function byline_editorial_rest_update_correction(WP_REST_Request $request)
{
    $user_id = function_exists('get_current_user_id') ? absint(get_current_user_id()) : 0;
    $result = byline_update_correction(absint($request->get_param('id')), byline_editorial_rest_body($request), $user_id);

    return is_wp_error($result) ? $result : rest_ensure_response($result);
}

function byline_editorial_rest_delete_correction(WP_REST_Request $request)
{
    $user_id = function_exists('get_current_user_id') ? absint(get_current_user_id()) : 0;
    if (!byline_delete_correction(absint($request->get_param('id')), $user_id)) {
        return new WP_Error('byline_correction_delete_failed', 'The correction could not be deleted.', ['status' => 500]);
    }

    return rest_ensure_response(['deleted' => true]);
}

function byline_editorial_rest_feedback_options(WP_REST_Request $request)
{
    return new WP_REST_Response(null, 204);
}

function byline_editorial_rest_submit_feedback(WP_REST_Request $request)
{
    $body = byline_editorial_rest_body($request);
    $origin = method_exists($request, 'get_header') ? (string) $request->get_header('origin') : null;
    // Do not trust a browser-controlled forwarding header for abuse controls.
    // Deployments with a trusted proxy can normalize REMOTE_ADDR before WP runs.
    $ip = function_exists('byline_feedback_request_ip') ? byline_feedback_request_ip() : null;
    $result = byline_submit_reader_feedback($body, $ip, $origin);

    if (is_wp_error($result)) {
        return $result;
    }

    // Never return the stored message/email to an anonymous browser.
    return rest_ensure_response(['accepted' => true]);
}

function byline_editorial_rest_feedback_cors($served, $result, $request, $server)
{
    if (!is_object($request) || !method_exists($request, 'get_route') || strpos((string) $request->get_route(), '/byline/v1/feedback') === false) {
        return $served;
    }

    $origin = method_exists($request, 'get_header') ? (string) $request->get_header('origin') : '';
    if ($origin === '' || !function_exists('byline_feedback_cors_headers')) {
        return $served;
    }

    foreach (byline_feedback_cors_headers($origin) as $name => $value) {
        if (!headers_sent()) {
            header($name . ': ' . $value);
        }
    }

    return $served;
}

function byline_editorial_rest_feedback(WP_REST_Request $request)
{
    $items = byline_list_feedback(
        byline_editorial_rest_request_params($request),
        byline_editorial_rest_current_user_id()
    );
    $feedback = array_map('byline_editorial_rest_feedback_item', $items);

    return rest_ensure_response([
        'feedback' => $feedback,
        'capabilities' => ['canManageFeedback' => current_user_can('edit_others_posts') || current_user_can('manage_byline')],
        // Keep the original key for authenticated callers that adopted the
        // first grouped REST response.
        'items' => $items,
    ]);
}

/** @return array<string,mixed> */
function byline_editorial_rest_feedback_item(array $item): array
{
    $story_id = absint($item['storyId'] ?? 0);
    $story = $story_id > 0 ? get_post($story_id) : null;
    $item['story'] = $story instanceof WP_Post && $story->post_type === 'post'
        ? [
            'id' => $story_id,
            'title' => sanitize_text_field((string) ($story->post_title ?? '')),
            'url' => function_exists('get_permalink') ? esc_url_raw((string) get_permalink($story_id)) : '',
            'editUrl' => function_exists('get_edit_post_link') ? esc_url_raw((string) get_edit_post_link($story_id, '')) : '',
        ]
        : null;

    return $item;
}

function byline_editorial_rest_get_feedback(WP_REST_Request $request)
{
    $feedback = byline_get_feedback(absint($request->get_param('id')));

    return $feedback === []
        ? new WP_Error('byline_feedback_not_found', 'That feedback item does not exist.', ['status' => 404])
        : rest_ensure_response(byline_editorial_rest_feedback_item($feedback));
}

function byline_editorial_rest_update_feedback(WP_REST_Request $request)
{
    $feedback_id = absint($request->get_param('id'));
    if (byline_get_feedback($feedback_id) === []) {
        return new WP_Error('byline_feedback_not_found', 'That feedback item does not exist.', ['status' => 404]);
    }
    $body = byline_editorial_rest_body($request);
    $status = sanitize_key((string) ($body['status'] ?? ''));
    if (!byline_update_feedback_status($feedback_id, $status)) {
        return new WP_Error('byline_feedback_update_failed', 'The feedback status could not be updated.', ['status' => 400]);
    }

    return rest_ensure_response(byline_editorial_rest_feedback_item(byline_get_feedback($feedback_id)));
}

function byline_editorial_rest_feedback_correction_draft(WP_REST_Request $request)
{
    $draft = byline_feedback_correction_draft(absint($request->get_param('id')));

    return is_wp_error($draft) ? $draft : rest_ensure_response($draft);
}

function byline_editorial_rest_create_feedback_correction(WP_REST_Request $request)
{
    $body = byline_editorial_rest_body($request);
    $result = byline_create_correction_from_feedback(absint($request->get_param('id')), (string) ($body['text'] ?? ''), function_exists('get_current_user_id') ? absint(get_current_user_id()) : null);

    return is_wp_error($result) ? $result : rest_ensure_response($result);
}

function byline_editorial_rest_public_guests(WP_REST_Request $request)
{
    $limit = min(100, max(1, absint($request->get_param('limit') ?: 50)));
    $posts = get_posts([
        'post_type' => BYLINE_GUEST_POST_TYPE,
        'post_status' => 'publish',
        'posts_per_page' => $limit,
        'numberposts' => $limit,
        'orderby' => 'title',
        'order' => 'ASC',
    ]);
    $items = [];
    foreach ((array) $posts as $post) {
        if (!$post instanceof WP_Post) {
            continue;
        }
        $item = byline_get_public_guest_contributor((int) $post->ID);
        if ($item !== null) {
            $items[] = $item;
        }
    }

    return rest_ensure_response(['items' => $items]);
}

function byline_editorial_rest_create_guest(WP_REST_Request $request)
{
    $result = byline_create_guest_contributor(byline_editorial_rest_body($request), function_exists('get_current_user_id') ? absint(get_current_user_id()) : null);

    return is_wp_error($result) ? $result : rest_ensure_response($result);
}

function byline_editorial_rest_get_guest(WP_REST_Request $request)
{
    $guest_id = absint($request->get_param('id'));
    $guest = byline_get_guest_contributor($guest_id);

    return $guest === null
        ? new WP_Error('byline_guest_not_found', 'That guest contributor does not exist.', ['status' => 404])
        : rest_ensure_response($guest);
}

function byline_editorial_rest_update_guest(WP_REST_Request $request)
{
    $result = byline_update_guest_contributor(absint($request->get_param('id')), byline_editorial_rest_body($request), function_exists('get_current_user_id') ? absint(get_current_user_id()) : null);

    return is_wp_error($result) ? $result : rest_ensure_response($result);
}

function byline_editorial_rest_delete_guest(WP_REST_Request $request)
{
    $result = byline_delete_guest_contributor(absint($request->get_param('id')), function_exists('get_current_user_id') ? absint(get_current_user_id()) : null, true);

    return is_wp_error($result) ? $result : rest_ensure_response(['deleted' => (bool) $result]);
}

function byline_editorial_rest_story_contributors_payload(int $story_id): array
{
    $contributors = byline_get_story_contributors($story_id);
    $available = [];
    if (function_exists('byline_editorial_assignable_editors')) {
        foreach (byline_editorial_assignable_editors() as $person) {
            $normalized = byline_editorial_rest_person($person);
            if ($normalized !== null) {
                $normalized['kind'] = 'user';
                $available[] = $normalized;
            }
        }
    }

    return [
        'storyId' => $story_id,
        'contributors' => $contributors,
        'available' => $available,
        'canEdit' => current_user_can('edit_post', $story_id),
    ];
}

function byline_editorial_rest_story_contributors(WP_REST_Request $request)
{
    return rest_ensure_response(byline_editorial_rest_story_contributors_payload(absint($request->get_param('id'))));
}

function byline_editorial_rest_update_story_contributors(WP_REST_Request $request)
{
    $body = byline_editorial_rest_body($request);
    $contributors = array_key_exists('contributors', $body) ? $body['contributors'] : $body;
    if (!is_array($contributors)) {
        return new WP_Error('byline_invalid_contributors', 'Contributors must be an ordered list.', ['status' => 400]);
    }

    $result = byline_set_story_contributors(
        absint($request->get_param('id')),
        $contributors,
        byline_editorial_rest_current_user_id()
    );

    if (is_wp_error($result)) {
        return $result;
    }

    return rest_ensure_response(byline_editorial_rest_story_contributors_payload(absint($request->get_param('id'))));
}

function byline_editorial_rest_story_distribution_payload(int $post_id): array
{
    if (!function_exists('byline_distribution_get_state')) {
        return [
            'storyId' => $post_id,
            'headline' => '',
            'canonicalUrl' => '',
            'excerpt' => '',
            'channels' => [],
            'capabilities' => ['addToNewsletter' => false],
        ];
    }

    $post = get_post($post_id);
    $headline = function_exists('get_the_title') ? (string) get_the_title($post_id) : ($post instanceof WP_Post ? (string) $post->post_title : '');
    $canonical = function_exists('get_permalink') ? (string) get_permalink($post_id) : '';
    $excerpt = function_exists('get_the_excerpt') ? (string) get_the_excerpt($post_id) : ($post instanceof WP_Post ? (string) $post->post_excerpt : '');
    $state = byline_distribution_get_state($post_id);
    $channels = [];
    foreach ((array) ($state['channels'] ?? []) as $channel_id => $channel) {
        if (!is_array($channel)) {
            continue;
        }
        $id = sanitize_key((string) ($channel['channelId'] ?? $channel_id));
        if ($id === '') {
            continue;
        }
        $is_social = $id !== 'website' && $id !== 'discord' && $id !== 'newsletter';
        $channels[] = array_merge($channel, [
            'id' => $id,
            'capabilities' => [
                'copy' => true,
                'markDistributed' => $is_social,
                'send' => in_array($id, ['discord', 'newsletter'], true),
                'schedule' => false,
            ],
        ]);
    }

    return [
        'storyId' => $post_id,
        'headline' => wp_strip_all_tags($headline),
        'canonicalUrl' => esc_url_raw($canonical),
        'excerpt' => wp_strip_all_tags($excerpt),
        'channels' => $channels,
        'capabilities' => [
            'addToNewsletter' => !empty($state['channels']['newsletter']['configured']),
            // Reported so the article panel never has to probe an integration
            // route it is not allowed to read just to decide whether to offer
            // Retry. The retry route remains the authorization boundary.
            'retryWebsite' => current_user_can(
                defined('BYLINE_MANAGE_INTEGRATIONS_CAPABILITY')
                    ? BYLINE_MANAGE_INTEGRATIONS_CAPABILITY
                    : 'manage_byline_integrations'
            ),
        ],
    ];
}

function byline_editorial_rest_story_distribution(WP_REST_Request $request)
{
    return rest_ensure_response(byline_editorial_rest_story_distribution_payload(absint($request->get_param('id'))));
}

function byline_editorial_rest_story_distribution_action(WP_REST_Request $request)
{
    $post_id = absint($request->get_param('id'));
    $channel_id = sanitize_key((string) $request->get_param('channelId'));
    $action = sanitize_key((string) (byline_editorial_rest_body($request)['action'] ?? ''));
    if (!function_exists('byline_distribution_get_state')) {
        return new WP_Error('byline_distribution_unavailable', 'Distribution integrations are not available on this site.', ['status' => 503]);
    }

    $result = null;
    if ($action === 'markdistributed' && function_exists('byline_distribution_mark_social')) {
        $result = byline_distribution_mark_social($post_id, $channel_id);
    } elseif ($action === 'send' && in_array($channel_id, ['discord', 'newsletter'], true) && function_exists('byline_distribution_request')) {
        $result = byline_distribution_request($post_id, $channel_id);
    } elseif ($action === 'schedule') {
        return new WP_Error('byline_distribution_schedule_unavailable', 'This channel does not support scheduling from the editor.', ['status' => 409]);
    }

    if (!is_array($result) || empty($result['ok'])) {
        return new WP_Error('byline_distribution_action_failed', (string) ($result['error'] ?? 'The distribution action could not be completed.'), ['status' => 400]);
    }

    return rest_ensure_response(byline_editorial_rest_story_distribution_payload($post_id));
}

function byline_editorial_rest_story_newsletter(WP_REST_Request $request)
{
    $post_id = absint($request->get_param('id'));
    if (!function_exists('byline_distribution_request')) {
        return new WP_Error('byline_distribution_unavailable', 'Newsletter distribution is not available on this site.', ['status' => 503]);
    }
    $result = byline_distribution_request($post_id, 'newsletter');
    if (!is_array($result) || empty($result['ok'])) {
        return new WP_Error('byline_distribution_newsletter_failed', (string) ($result['error'] ?? 'The story could not be added to the newsletter.'), ['status' => 400]);
    }

    return rest_ensure_response(byline_editorial_rest_story_distribution_payload($post_id));
}

function byline_editorial_rest_register_public_contributor_field(): void
{
    static $registered = false;
    if ($registered) {
        return;
    }
    if (!function_exists('register_rest_field')) {
        return;
    }

    register_rest_field('post', 'contributors', [
        'get_callback' => static function (array $post): array {
            if (!function_exists('byline_get_public_story_contributors')) {
                return [];
            }

            return byline_get_public_story_contributors(absint($post['id'] ?? 0));
        },
        'schema' => [
            'description' => 'Public-safe ordered story contributors.',
            'type' => 'array',
            'context' => ['view', 'edit'],
        ],
    ]);

    register_rest_field('post', 'corrections', [
        'get_callback' => static function (array $post): array {
            return function_exists('byline_get_public_corrections')
                ? byline_get_public_corrections(absint($post['id'] ?? 0))
                : [];
        },
        'schema' => [
            'description' => 'Public structured corrections and updates for a published story.',
            'type' => 'array',
            'context' => ['view', 'edit'],
        ],
    ]);
    $registered = true;
}

function byline_editorial_rest_can_create_guest(): bool
{
    return function_exists('byline_guest_can_create')
        ? byline_guest_can_create()
        : (current_user_can('edit_others_posts')
            || current_user_can(defined('BYLINE_MANAGE_CAPABILITY') ? BYLINE_MANAGE_CAPABILITY : 'manage_byline'));
}

function byline_editorial_rest_can_edit_guest(WP_REST_Request $request)
{
    $guest_id = absint($request->get_param('id'));
    if (!function_exists('byline_guest_contributor_post') || !(byline_guest_contributor_post($guest_id) instanceof WP_Post)) {
        return new WP_Error('byline_guest_not_found', 'That guest contributor does not exist.', ['status' => 404]);
    }

    return function_exists('byline_guest_can_edit') && byline_guest_can_edit($guest_id)
        ? true
        : new WP_Error('byline_guest_forbidden', 'You are not allowed to manage this guest contributor.', ['status' => rest_authorization_required_code()]);
}

/**
 * Parse the deliberately small activity query vocabulary at the transport
 * boundary. The domain helper applies the final action allowlist and limit.
 *
 * @return array{limit:int,types:array<int,string>,storyId:int}
 */
function byline_editorial_rest_activity_filters(WP_REST_Request $request): array
{
    $params = byline_editorial_rest_request_params($request);
    $raw_types = $params['types'] ?? ($params['actions'] ?? []);
    if (is_string($raw_types)) {
        $raw_types = preg_split('/\s*,\s*/', $raw_types, -1, PREG_SPLIT_NO_EMPTY);
    }
    $types = is_array($raw_types)
        ? array_values(array_filter(array_map('sanitize_key', $raw_types)))
        : [];

    return [
        'limit' => min(200, max(1, absint($params['limit'] ?? 50))),
        'types' => $types,
        'storyId' => absint($params['storyId'] ?? 0),
    ];
}

function byline_editorial_rest_story_activity(WP_REST_Request $request)
{
    $story_id = absint($request->get_param('id'));
    if (!function_exists('byline_get_story_activity')) {
        return new WP_Error('byline_activity_unavailable', 'Activity is not available on this site.', ['status' => 503]);
    }

    $filters = byline_editorial_rest_activity_filters($request);
    $items = byline_get_story_activity($story_id, [
        'limit' => min(50, $filters['limit']),
        'types' => $filters['types'],
    ]);

    return rest_ensure_response([
        'storyId' => $story_id,
        'activity' => $items,
        'items' => $items,
    ]);
}

function byline_editorial_rest_newsroom_activity(WP_REST_Request $request)
{
    if (!function_exists('byline_list_newsroom_activity')) {
        return new WP_Error('byline_activity_unavailable', 'Activity is not available on this site.', ['status' => 503]);
    }

    $filters = byline_editorial_rest_activity_filters($request);
    $items = byline_list_newsroom_activity([
        'limit' => $filters['limit'],
        'storyId' => $filters['storyId'],
        'types' => $filters['types'],
    ]);

    return rest_ensure_response([
        'activity' => $items,
        'items' => $items,
    ]);
}

function byline_editorial_rest_presets_payload(): array
{
    $presets = function_exists('byline_get_editorial_presets')
        ? byline_get_editorial_presets()
        : [];
    $revision = function_exists('byline_editorial_presets_revision') ? byline_editorial_presets_revision() : 0;

    return [
        'presets' => $presets,
        'types' => function_exists('byline_editorial_preset_types') ? byline_editorial_preset_types() : array_keys($presets),
        'revision' => $revision,
    ];
}

function byline_editorial_rest_presets(WP_REST_Request $request)
{
    return rest_ensure_response(byline_editorial_rest_presets_payload());
}

function byline_editorial_rest_get_preset(WP_REST_Request $request)
{
    $type = (string) $request->get_param('type');
    $preset = function_exists('byline_get_editorial_preset') ? byline_get_editorial_preset($type) : null;
    if (!is_array($preset)) {
        return new WP_Error('byline_unknown_preset', 'That newsroom preset does not exist.', ['status' => 404]);
    }

    return rest_ensure_response([
        'preset' => $preset,
        'revision' => function_exists('byline_editorial_presets_revision') ? byline_editorial_presets_revision() : 0,
    ]);
}

function byline_editorial_rest_update_preset(WP_REST_Request $request)
{
    $body = byline_editorial_rest_body($request);
    $changes = isset($body['changes']) && is_array($body['changes']) ? $body['changes'] : $body;
    $type = (string) $request->get_param('type');
    $result = function_exists('byline_update_editorial_preset')
        ? byline_update_editorial_preset($type, $changes)
        : new WP_Error('byline_preset_unavailable', 'Preset storage is unavailable.', ['status' => 503]);
    if (is_wp_error($result)) {
        return $result;
    }

    return rest_ensure_response([
        'preset' => $result,
        'revision' => function_exists('byline_editorial_presets_revision') ? byline_editorial_presets_revision() : 0,
    ]);
}

function byline_editorial_rest_reset_preset(WP_REST_Request $request)
{
    $type = (string) $request->get_param('type');
    $result = function_exists('byline_reset_editorial_preset')
        ? byline_reset_editorial_preset($type)
        : new WP_Error('byline_preset_unavailable', 'Preset storage is unavailable.', ['status' => 503]);
    if (is_wp_error($result)) {
        return $result;
    }

    return rest_ensure_response([
        'preset' => $result,
        'revision' => function_exists('byline_editorial_presets_revision') ? byline_editorial_presets_revision() : 0,
    ]);
}

function byline_editorial_rest_apply_preset(WP_REST_Request $request)
{
    if (!function_exists('byline_apply_editorial_preset')) {
        return new WP_Error('byline_preset_unavailable', 'Preset application is unavailable on this site.', ['status' => 503]);
    }

    $body = byline_editorial_rest_body($request);
    $context = isset($body['context']) && is_array($body['context']) ? $body['context'] : [];
    $overrides = isset($body['overrides']) && is_array($body['overrides']) ? $body['overrides'] : [];
    $preset = byline_apply_editorial_preset((string) $request->get_param('type'), $context, $overrides);
    if ($preset === []) {
        return new WP_Error('byline_unknown_preset', 'That newsroom preset does not exist.', ['status' => 404]);
    }

    return rest_ensure_response(['preset' => $preset]);
}

function byline_editorial_register_extended_rest_routes(): void
{
    register_rest_route(BYLINE_REST_NAMESPACE, '/editorial/activity', [
        'methods' => WP_REST_Server::READABLE,
        'callback' => 'byline_editorial_rest_newsroom_activity',
        'permission_callback' => 'byline_editorial_rest_can_view_activity_newsroom',
    ]);
    register_rest_route(BYLINE_REST_NAMESPACE, '/editorial/stories/(?P<id>\d+)/activity', [
        'methods' => WP_REST_Server::READABLE,
        'callback' => 'byline_editorial_rest_story_activity',
        'permission_callback' => 'byline_editorial_rest_permission',
        'args' => ['id' => ['type' => 'integer', 'required' => true, 'sanitize_callback' => 'absint']],
    ]);

    register_rest_route(BYLINE_REST_NAMESPACE, '/editorial/presets', [
        'methods' => WP_REST_Server::READABLE,
        'callback' => 'byline_editorial_rest_presets',
        'permission_callback' => 'byline_editorial_rest_can_use_presets',
    ]);
    register_rest_route(BYLINE_REST_NAMESPACE, '/editorial/presets/(?P<type>[a-z0-9_-]+)', [
        [
            'methods' => WP_REST_Server::READABLE,
            'callback' => 'byline_editorial_rest_get_preset',
            'permission_callback' => 'byline_editorial_rest_can_use_presets',
        ],
        [
            'methods' => WP_REST_Server::EDITABLE,
            'callback' => 'byline_editorial_rest_update_preset',
            'permission_callback' => 'byline_editorial_rest_can_edit_presets',
        ],
    ]);
    register_rest_route(BYLINE_REST_NAMESPACE, '/editorial/presets/(?P<type>[a-z0-9_-]+)/reset', [
        [
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => 'byline_editorial_rest_reset_preset',
            'permission_callback' => 'byline_editorial_rest_can_edit_presets',
        ],
        [
            'methods' => 'DELETE',
            'callback' => 'byline_editorial_rest_reset_preset',
            'permission_callback' => 'byline_editorial_rest_can_edit_presets',
        ],
    ]);
    register_rest_route(BYLINE_REST_NAMESPACE, '/editorial/presets/(?P<type>[a-z0-9_-]+)/apply', [
        'methods' => WP_REST_Server::CREATABLE,
        'callback' => 'byline_editorial_rest_apply_preset',
        'permission_callback' => 'byline_editorial_rest_can_use_presets',
    ]);

    register_rest_route(BYLINE_REST_NAMESPACE, '/editorial/planning', [
        'methods' => WP_REST_Server::READABLE,
        'callback' => 'byline_editorial_rest_planning',
        'permission_callback' => 'byline_editorial_rest_can_edit_posts',
    ]);

    register_rest_route(BYLINE_REST_NAMESPACE, '/editorial/saved-views', [
        [
            'methods' => WP_REST_Server::READABLE,
            'callback' => 'byline_editorial_rest_saved_views',
            'permission_callback' => 'byline_editorial_rest_can_edit_posts',
        ],
        [
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => 'byline_editorial_rest_save_view',
            'permission_callback' => 'byline_editorial_rest_can_edit_posts',
        ],
    ]);
    register_rest_route(BYLINE_REST_NAMESPACE, '/editorial/saved-views/(?P<id>[A-Za-z0-9_-]+)', [
        [
            'methods' => WP_REST_Server::EDITABLE,
            'callback' => 'byline_editorial_rest_update_view',
            'permission_callback' => 'byline_editorial_rest_can_edit_posts',
        ],
        [
            'methods' => 'DELETE',
            'callback' => 'byline_editorial_rest_delete_view',
            'permission_callback' => 'byline_editorial_rest_can_edit_posts',
        ],
    ]);
    // Canonical Planning client alias. Keep /editorial/saved-views above for
    // early installs that consumed the first grouped endpoint.
    register_rest_route(BYLINE_REST_NAMESPACE, '/editorial/planning/views', [
        [
            'methods' => WP_REST_Server::READABLE,
            'callback' => 'byline_editorial_rest_planning_views',
            'permission_callback' => 'byline_editorial_rest_can_edit_posts',
        ],
        [
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => 'byline_editorial_rest_save_view',
            'permission_callback' => 'byline_editorial_rest_can_edit_posts',
        ],
    ]);
    register_rest_route(BYLINE_REST_NAMESPACE, '/editorial/planning/views/(?P<id>[A-Za-z0-9_-]+)', [
        [
            'methods' => WP_REST_Server::EDITABLE,
            'callback' => 'byline_editorial_rest_update_view',
            'permission_callback' => 'byline_editorial_rest_can_edit_posts',
        ],
        [
            'methods' => 'DELETE',
            'callback' => 'byline_editorial_rest_delete_view',
            'permission_callback' => 'byline_editorial_rest_can_edit_posts',
        ],
    ]);

    register_rest_route(BYLINE_REST_NAMESPACE, '/editorial/stories/(?P<id>\d+)/media', [
        [
            'methods' => WP_REST_Server::READABLE,
            'callback' => 'byline_editorial_rest_get_media',
            'permission_callback' => 'byline_editorial_rest_permission',
        ],
        [
            'methods' => WP_REST_Server::EDITABLE,
            'callback' => 'byline_editorial_rest_update_media',
            'permission_callback' => 'byline_editorial_rest_permission',
        ],
    ]);
    register_rest_route(BYLINE_REST_NAMESPACE, '/editorial/media', [
        'methods' => WP_REST_Server::READABLE,
        'callback' => 'byline_editorial_rest_media',
        'permission_callback' => 'byline_editorial_rest_can_edit_posts',
    ]);
    register_rest_route(BYLINE_REST_NAMESPACE, '/admin/media', [
        'methods' => WP_REST_Server::READABLE,
        'callback' => 'byline_editorial_rest_media',
        'permission_callback' => 'byline_editorial_rest_can_edit_posts',
    ]);
    register_rest_route(BYLINE_REST_NAMESPACE, '/admin/media/(?P<id>\d+)', [
        'methods' => WP_REST_Server::EDITABLE,
        'callback' => 'byline_editorial_rest_update_media',
        'permission_callback' => 'byline_editorial_rest_permission',
    ]);
    register_rest_route(BYLINE_REST_NAMESPACE, '/editorial/stories/(?P<id>\d+)/media/featured', [
        'methods' => WP_REST_Server::CREATABLE,
        'callback' => 'byline_editorial_rest_set_media_featured',
        'permission_callback' => 'byline_editorial_rest_permission',
    ]);

    register_rest_route(BYLINE_REST_NAMESPACE, '/editorial/tasks', [
        [
            'methods' => WP_REST_Server::READABLE,
            'callback' => 'byline_editorial_rest_tasks',
            'permission_callback' => 'byline_editorial_rest_can_edit_posts',
        ],
        [
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => 'byline_editorial_rest_create_task',
            'permission_callback' => 'byline_editorial_rest_can_edit_posts',
        ],
    ]);
    register_rest_route(BYLINE_REST_NAMESPACE, '/editorial/tasks/(?P<id>\d+)', [
        [
            'methods' => WP_REST_Server::READABLE,
            'callback' => 'byline_editorial_rest_get_task',
            'permission_callback' => 'byline_editorial_rest_can_view_task',
        ],
        [
            'methods' => WP_REST_Server::EDITABLE,
            'callback' => 'byline_editorial_rest_update_task',
            'permission_callback' => 'byline_editorial_rest_can_view_task',
        ],
        [
            'methods' => 'DELETE',
            'callback' => 'byline_editorial_rest_delete_task',
            'permission_callback' => 'byline_editorial_rest_can_view_task',
        ],
    ]);
    register_rest_route(BYLINE_REST_NAMESPACE, '/editorial/stories/(?P<id>\d+)/tasks', [
        [
            'methods' => WP_REST_Server::READABLE,
            'callback' => 'byline_editorial_rest_story_tasks',
            'permission_callback' => 'byline_editorial_rest_permission',
        ],
        [
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => 'byline_editorial_rest_create_story_task',
            'permission_callback' => 'byline_editorial_rest_permission',
        ],
    ]);

    register_rest_route(BYLINE_REST_NAMESPACE, '/coverage', [
        'methods' => WP_REST_Server::READABLE,
        'callback' => 'byline_editorial_rest_public_coverages',
        'permission_callback' => '__return_true',
    ]);
    register_rest_route(BYLINE_REST_NAMESPACE, '/coverage/(?P<slug>[a-z0-9-]+)', [
        'methods' => WP_REST_Server::READABLE,
        'callback' => 'byline_editorial_rest_public_coverage',
        'permission_callback' => '__return_true',
    ]);
    register_rest_route(BYLINE_REST_NAMESPACE, '/admin/coverage', [
        [
            'methods' => WP_REST_Server::READABLE,
            'callback' => 'byline_editorial_rest_admin_coverages',
            'permission_callback' => 'byline_editorial_rest_can_edit_posts',
        ],
        [
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => 'byline_editorial_rest_create_coverage',
            'permission_callback' => 'byline_editorial_rest_can_edit_posts',
        ],
    ]);
    register_rest_route(BYLINE_REST_NAMESPACE, '/admin/coverage/(?P<id>\d+)', [
        [
            'methods' => WP_REST_Server::READABLE,
            'callback' => 'byline_editorial_rest_get_coverage',
            'permission_callback' => 'byline_editorial_rest_can_edit_coverage',
        ],
        [
            'methods' => WP_REST_Server::EDITABLE,
            'callback' => 'byline_editorial_rest_update_coverage',
            'permission_callback' => 'byline_editorial_rest_can_edit_coverage',
        ],
        [
            'methods' => 'DELETE',
            'callback' => 'byline_editorial_rest_delete_coverage',
            'permission_callback' => 'byline_editorial_rest_can_edit_coverage',
        ],
    ]);
    register_rest_route(BYLINE_REST_NAMESPACE, '/admin/coverage/(?P<id>\d+)/stories', [
        'methods' => WP_REST_Server::CREATABLE,
        'callback' => 'byline_editorial_rest_add_coverage_story',
        'permission_callback' => 'byline_editorial_rest_can_edit_coverage',
    ]);
    register_rest_route(BYLINE_REST_NAMESPACE, '/admin/coverage/(?P<id>\d+)/stories/(?P<story>\d+)', [
        'methods' => 'DELETE',
        'callback' => 'byline_editorial_rest_remove_coverage_story',
        'permission_callback' => 'byline_editorial_rest_can_edit_coverage',
    ]);

    register_rest_route(BYLINE_REST_NAMESPACE, '/editorial/readiness/(?P<id>\d+)', [
        'methods' => WP_REST_Server::READABLE,
        'callback' => 'byline_editorial_rest_readiness',
        'permission_callback' => 'byline_editorial_rest_permission',
    ]);

    register_rest_route(BYLINE_REST_NAMESPACE, '/editorial/stories/(?P<id>\d+)/corrections', [
        [
            'methods' => WP_REST_Server::READABLE,
            'callback' => 'byline_editorial_rest_story_corrections',
            'permission_callback' => 'byline_editorial_rest_permission',
        ],
        [
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => 'byline_editorial_rest_create_correction',
            'permission_callback' => 'byline_editorial_rest_permission',
        ],
    ]);
    register_rest_route(BYLINE_REST_NAMESPACE, '/editorial/stories/(?P<id>\d+)/corrections/(?P<correctionId>\d+)', [
        [
            'methods' => WP_REST_Server::EDITABLE,
            'callback' => 'byline_editorial_rest_update_story_correction',
            'permission_callback' => 'byline_editorial_rest_permission',
        ],
        [
            'methods' => 'DELETE',
            'callback' => 'byline_editorial_rest_delete_story_correction',
            'permission_callback' => 'byline_editorial_rest_permission',
        ],
    ]);
    register_rest_route(BYLINE_REST_NAMESPACE, '/corrections', [
        'methods' => WP_REST_Server::READABLE,
        'callback' => 'byline_editorial_rest_public_corrections',
        'permission_callback' => '__return_true',
    ]);
    register_rest_route(BYLINE_REST_NAMESPACE, '/editorial/corrections/(?P<id>\d+)', [
        [
            'methods' => WP_REST_Server::READABLE,
            'callback' => 'byline_editorial_rest_get_correction',
            'permission_callback' => 'byline_editorial_rest_can_view_correction',
        ],
        [
            'methods' => WP_REST_Server::EDITABLE,
            'callback' => 'byline_editorial_rest_update_correction',
            'permission_callback' => 'byline_editorial_rest_can_view_correction',
        ],
        [
            'methods' => 'DELETE',
            'callback' => 'byline_editorial_rest_delete_correction',
            'permission_callback' => 'byline_editorial_rest_can_view_correction',
        ],
    ]);
    register_rest_route(BYLINE_REST_NAMESPACE, '/admin/editorial/corrections', [
        'methods' => WP_REST_Server::READABLE,
        'callback' => 'byline_editorial_rest_admin_corrections',
        'permission_callback' => 'byline_editorial_rest_can_edit_posts',
    ]);
    register_rest_route(BYLINE_REST_NAMESPACE, '/admin/editorial/corrections/(?P<id>\d+)', [
        [
            'methods' => WP_REST_Server::READABLE,
            'callback' => 'byline_editorial_rest_get_correction',
            'permission_callback' => 'byline_editorial_rest_can_view_correction',
        ],
        [
            'methods' => WP_REST_Server::EDITABLE,
            'callback' => 'byline_editorial_rest_update_correction',
            'permission_callback' => 'byline_editorial_rest_can_view_correction',
        ],
        [
            'methods' => 'DELETE',
            'callback' => 'byline_editorial_rest_delete_correction',
            'permission_callback' => 'byline_editorial_rest_can_view_correction',
        ],
    ]);

    register_rest_route(BYLINE_REST_NAMESPACE, '/feedback', [
        [
            'methods' => 'OPTIONS',
            'callback' => 'byline_editorial_rest_feedback_options',
            'permission_callback' => 'byline_editorial_rest_feedback_permission',
        ],
        [
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => 'byline_editorial_rest_submit_feedback',
            'permission_callback' => 'byline_editorial_rest_feedback_permission',
        ],
    ]);
    register_rest_route(BYLINE_REST_NAMESPACE, '/admin/feedback', [
        'methods' => WP_REST_Server::READABLE,
        'callback' => 'byline_editorial_rest_feedback',
        'permission_callback' => 'byline_editorial_rest_can_view_feedback',
    ]);
    register_rest_route(BYLINE_REST_NAMESPACE, '/admin/feedback/(?P<id>\d+)', [
        [
            'methods' => WP_REST_Server::READABLE,
            'callback' => 'byline_editorial_rest_get_feedback',
            'permission_callback' => 'byline_editorial_rest_can_view_feedback_item',
        ],
        [
            'methods' => WP_REST_Server::EDITABLE,
            'callback' => 'byline_editorial_rest_update_feedback',
            'permission_callback' => 'byline_editorial_rest_can_view_feedback_item',
        ],
    ]);
    register_rest_route(BYLINE_REST_NAMESPACE, '/admin/feedback/(?P<id>\d+)/correction-draft', [
        'methods' => WP_REST_Server::READABLE,
        'callback' => 'byline_editorial_rest_feedback_correction_draft',
        'permission_callback' => 'byline_editorial_rest_can_view_feedback_item',
    ]);
    register_rest_route(BYLINE_REST_NAMESPACE, '/admin/feedback/(?P<id>\d+)/correction', [
        'methods' => WP_REST_Server::CREATABLE,
        'callback' => 'byline_editorial_rest_create_feedback_correction',
        'permission_callback' => 'byline_editorial_rest_can_view_feedback_item',
    ]);
    if (function_exists('add_filter')) {
        add_filter('rest_pre_serve_request', 'byline_editorial_rest_feedback_cors', 10, 4);
    }

    register_rest_route(BYLINE_REST_NAMESPACE, '/editorial/stories/(?P<id>\d+)/contributors', [
        [
            'methods' => WP_REST_Server::READABLE,
            'callback' => 'byline_editorial_rest_story_contributors',
            'permission_callback' => 'byline_editorial_rest_permission',
        ],
        [
            'methods' => WP_REST_Server::EDITABLE,
            'callback' => 'byline_editorial_rest_update_story_contributors',
            'permission_callback' => 'byline_editorial_rest_permission',
        ],
    ]);
    register_rest_route(BYLINE_REST_NAMESPACE, '/editorial/stories/(?P<id>\d+)/distribution', [
        'methods' => WP_REST_Server::READABLE,
        'callback' => 'byline_editorial_rest_story_distribution',
        'permission_callback' => 'byline_editorial_rest_permission',
    ]);
    register_rest_route(BYLINE_REST_NAMESPACE, '/editorial/stories/(?P<id>\d+)/distribution/newsletter', [
        'methods' => WP_REST_Server::CREATABLE,
        'callback' => 'byline_editorial_rest_story_newsletter',
        'permission_callback' => 'byline_editorial_rest_distribution_action_permission',
    ]);
    register_rest_route(BYLINE_REST_NAMESPACE, '/editorial/stories/(?P<id>\d+)/distribution/(?P<channelId>[a-z0-9_-]+)', [
        'methods' => WP_REST_Server::CREATABLE,
        'callback' => 'byline_editorial_rest_story_distribution_action',
        'permission_callback' => 'byline_editorial_rest_distribution_action_permission',
    ]);

    register_rest_route(BYLINE_REST_NAMESPACE, '/contributors/guests', [
        'methods' => WP_REST_Server::READABLE,
        'callback' => 'byline_editorial_rest_public_guests',
        'permission_callback' => '__return_true',
    ]);
    register_rest_route(BYLINE_REST_NAMESPACE, '/admin/contributors/guests', [
        'methods' => WP_REST_Server::CREATABLE,
        'callback' => 'byline_editorial_rest_create_guest',
        'permission_callback' => 'byline_editorial_rest_can_create_guest',
    ]);
    register_rest_route(BYLINE_REST_NAMESPACE, '/admin/contributors/guests/(?P<id>\d+)', [
        [
            'methods' => WP_REST_Server::READABLE,
            'callback' => 'byline_editorial_rest_get_guest',
            'permission_callback' => 'byline_editorial_rest_can_edit_guest',
        ],
        [
            'methods' => WP_REST_Server::EDITABLE,
            'callback' => 'byline_editorial_rest_update_guest',
            'permission_callback' => 'byline_editorial_rest_can_edit_guest',
        ],
        [
            'methods' => 'DELETE',
            'callback' => 'byline_editorial_rest_delete_guest',
            'permission_callback' => 'byline_editorial_rest_can_edit_guest',
        ],
    ]);
    byline_editorial_rest_register_public_contributor_field();
}
