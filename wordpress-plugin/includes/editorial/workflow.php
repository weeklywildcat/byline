<?php

/**
 * The Byline editorial workflow domain.
 *
 * Editorial workflow is a first-class newsroom concept that belongs to Byline,
 * not to any one integration. Discord, the block editor, the Posts list, and any
 * future surface are all consumers of the helpers below; none of them own the
 * model. Nothing in this file may call an integration.
 *
 * Editorial workflow is deliberately *not* WordPress `post_status`. A story can
 * be a WordPress draft while it is editorially "Reporting", and it can be a
 * WordPress scheduled post while its editorial work is finished. The two states
 * answer different questions, so they are stored and displayed separately.
 *
 * Storage note: the meta keys below are the ones already written on installed
 * sites. The constants use Byline naming while pointing at the existing
 * identifiers so there is exactly one source of truth per value.
 */

if (!defined('ABSPATH')) {
    exit;
}

const BYLINE_EDITORIAL_STATUS_META = '_wwh_story_status';
const BYLINE_EDITORIAL_EDITOR_META = '_wwh_story_editor_user_id';
const BYLINE_EDITORIAL_DEADLINE_META = '_wwh_story_deadline';
const BYLINE_EDITORIAL_VISUALS_META = '_wwh_story_visuals';
// This is a new private coordination marker. It is deliberately not exposed
// through post REST meta; clients receive it only from protected editorial
// responses and send it back as expectedRevision on meaningful mutations.
const BYLINE_EDITORIAL_REVISION_META = '_byline_story_editorial_revision';

/**
 * The default status for a story that has never had workflow metadata written.
 * Reading falls back to this; nothing writes it on read.
 */
const BYLINE_EDITORIAL_DEFAULT_STATUS = 'pitch';

/**
 * The status a published story reports regardless of what is stored. Publication
 * is owned by WordPress, so "published" is derived, never selected.
 */
const BYLINE_EDITORIAL_PUBLISHED_STATUS = 'published';

/**
 * The canonical workflow definition, in newsroom order.
 *
 * `group` separates the ordered main line from the sidelined states and from the
 * derived publication state, so a UI can render progress without hard-coding
 * which identifiers belong where. Identifiers are stable storage and Discord
 * values and must not be renamed.
 */
function byline_editorial_workflow_statuses(): array
{
    return [
        'pitch' => ['label' => 'Pitch', 'group' => 'main'],
        'assigned' => ['label' => 'Assigned', 'group' => 'main'],
        'reporting' => ['label' => 'Reporting', 'group' => 'main'],
        'writing' => ['label' => 'Writing', 'group' => 'main'],
        'editing' => ['label' => 'Editing', 'group' => 'main'],
        'ready' => ['label' => 'Ready for Review', 'group' => 'main'],
        'on-hold' => ['label' => 'On Hold', 'group' => 'sidelined'],
        'dropped' => ['label' => 'Dropped', 'group' => 'sidelined'],
        BYLINE_EDITORIAL_PUBLISHED_STATUS => ['label' => 'Published', 'group' => 'derived'],
    ];
}

/**
 * Every recognised identifier, including the derived publication state. This is
 * the set Discord has always accepted and must keep accepting.
 */
function byline_editorial_status_ids(): array
{
    return array_keys(byline_editorial_workflow_statuses());
}

/**
 * The identifiers an editor may actually choose. "Published" is excluded because
 * it follows the WordPress publication state.
 */
function byline_editorial_selectable_status_ids(): array
{
    return array_values(array_filter(
        byline_editorial_status_ids(),
        static function (string $status): bool {
            return $status !== BYLINE_EDITORIAL_PUBLISHED_STATUS;
        }
    ));
}

function byline_editorial_status_label(string $status): string
{
    $statuses = byline_editorial_workflow_statuses();

    return isset($statuses[$status]) ? (string) $statuses[$status]['label'] : $status;
}

function byline_editorial_status_group(string $status): string
{
    $statuses = byline_editorial_workflow_statuses();

    return isset($statuses[$status]) ? (string) $statuses[$status]['group'] : 'main';
}

/**
 * Normalises any input to a recognised identifier. Unrecognised values fall back
 * to the default rather than throwing: a story with corrupt metadata still has
 * to open in the editor.
 */
function byline_editorial_sanitize_status($value): string
{
    $status = sanitize_key((string) $value);

    return in_array($status, byline_editorial_status_ids(), true) ? $status : BYLINE_EDITORIAL_DEFAULT_STATUS;
}

/**
 * Deadlines are editorial metadata in plain `YYYY-MM-DD`. They never influence
 * `post_date`, scheduling, or deployment.
 */
function byline_editorial_sanitize_deadline($value): string
{
    $value = trim((string) $value);
    $date = DateTimeImmutable::createFromFormat('!Y-m-d', $value);

    return $date instanceof DateTimeImmutable && $date->format('Y-m-d') === $value ? $value : '';
}

function byline_editorial_sanitize_visuals($value): string
{
    return sanitize_textarea_field((string) $value);
}

/**
 * The stored workflow status, ignoring publication state. Publishing must not
 * destroy this, so callers that need the display value ask for the effective
 * status instead.
 */
function byline_get_editorial_status(int $post_id): string
{
    $stored = get_post_meta($post_id, BYLINE_EDITORIAL_STATUS_META, true);

    if (!is_string($stored) || trim($stored) === '') {
        return BYLINE_EDITORIAL_DEFAULT_STATUS;
    }

    $status = byline_editorial_sanitize_status($stored);

    // A stored "published" is legacy data. Treat it as unset workflow progress
    // rather than a selectable stage so unpublishing does not strand the story.
    return $status === BYLINE_EDITORIAL_PUBLISHED_STATUS ? BYLINE_EDITORIAL_DEFAULT_STATUS : $status;
}

/**
 * What the newsroom should see. A published post reports "Published"; the
 * pre-publication stage stays intact underneath so unpublishing recovers it.
 */
function byline_get_effective_editorial_status(int $post_id): string
{
    $post = get_post($post_id);

    if ($post instanceof WP_Post && $post->post_status === 'publish') {
        return BYLINE_EDITORIAL_PUBLISHED_STATUS;
    }

    return byline_get_editorial_status($post_id);
}

/**
 * Writes the workflow status. Refuses the derived publication state: nothing may
 * fake "Published" through the workflow model.
 */
function byline_set_editorial_status(int $post_id, string $status): bool
{
    if (sanitize_key($status) === BYLINE_EDITORIAL_PUBLISHED_STATUS) {
        return false;
    }

    update_post_meta($post_id, BYLINE_EDITORIAL_STATUS_META, byline_editorial_sanitize_status($status));

    return true;
}

function byline_get_editorial_editor_id(int $post_id): int
{
    return absint(get_post_meta($post_id, BYLINE_EDITORIAL_EDITOR_META, true));
}

function byline_set_editorial_editor_id(int $post_id, int $user_id): void
{
    $user_id = absint($user_id);

    if ($user_id > 0) {
        update_post_meta($post_id, BYLINE_EDITORIAL_EDITOR_META, $user_id);

        return;
    }

    delete_post_meta($post_id, BYLINE_EDITORIAL_EDITOR_META);
}

function byline_get_editorial_deadline(int $post_id): string
{
    return byline_editorial_sanitize_deadline(get_post_meta($post_id, BYLINE_EDITORIAL_DEADLINE_META, true));
}

function byline_set_editorial_deadline(int $post_id, string $deadline): void
{
    $deadline = byline_editorial_sanitize_deadline($deadline);

    if ($deadline === '') {
        delete_post_meta($post_id, BYLINE_EDITORIAL_DEADLINE_META);

        return;
    }

    update_post_meta($post_id, BYLINE_EDITORIAL_DEADLINE_META, $deadline);
}

function byline_get_editorial_visuals(int $post_id): string
{
    return byline_editorial_sanitize_visuals(get_post_meta($post_id, BYLINE_EDITORIAL_VISUALS_META, true));
}

function byline_set_editorial_visuals(int $post_id, string $visuals): void
{
    $visuals = byline_editorial_sanitize_visuals($visuals);

    if ($visuals === '') {
        delete_post_meta($post_id, BYLINE_EDITORIAL_VISUALS_META);

        return;
    }

    update_post_meta($post_id, BYLINE_EDITORIAL_VISUALS_META, $visuals);
}

function byline_get_editorial_revision(int $post_id): int
{
    return max(0, absint(get_post_meta($post_id, BYLINE_EDITORIAL_REVISION_META, true)));
}

function byline_bump_editorial_revision(int $post_id): int
{
    $revision = byline_get_editorial_revision($post_id) + 1;
    update_post_meta($post_id, BYLINE_EDITORIAL_REVISION_META, $revision);

    return $revision;
}

/**
 * Compare a client snapshot with the current private editorial snapshot.
 *
 * A null expected revision means a legacy caller did not opt into optimistic
 * concurrency. That keeps old integrations working while all current admin
 * clients can opt into a clear conflict instead of silently overwriting a
 * colleague's assignment or workflow change.
 *
 * @return true|WP_Error
 */
function byline_assert_editorial_revision(int $post_id, ?int $expected_revision = null)
{
    if ($expected_revision === null) {
        return true;
    }

    if ($expected_revision < 0) {
        return new WP_Error(
            'byline_editorial_invalid_revision',
            'The story revision is invalid. Reload the story and try again.',
            ['status' => 400]
        );
    }

    $current_revision = byline_get_editorial_revision($post_id);
    if ($current_revision === $expected_revision) {
        return true;
    }

    return new WP_Error(
        'byline_editorial_conflict',
        'This story changed while you were editing it. Reload changes before trying again.',
        [
            'status' => 409,
            'expectedRevision' => $expected_revision,
            'currentRevision' => $current_revision,
        ]
    );
}

/**
 * The complete editorial state for one story. `status` is the effective display
 * value; `storedStatus` is the pre-publication stage that survives publication.
 */
function byline_get_editorial_story_state(int $post_id): array
{
    $post_id = absint($post_id);
    $post = get_post($post_id);
    $post_status = $post instanceof WP_Post ? $post->post_status : '';

    return [
        'postId' => $post_id,
        'status' => byline_get_effective_editorial_status($post_id),
        'storedStatus' => byline_get_editorial_status($post_id),
        'isPublished' => $post_status === 'publish',
        'postStatus' => $post_status,
        'revision' => byline_get_editorial_revision($post_id),
        'editorId' => byline_get_editorial_editor_id($post_id),
        'deadline' => byline_get_editorial_deadline($post_id),
        'visuals' => byline_get_editorial_visuals($post_id),
    ];
}

/**
 * Any user who can edit the story owns its workflow stage and its visual needs.
 */
function byline_editorial_can_change_status(int $post_id, ?int $user_id = null): bool
{
    return $user_id === null
        ? current_user_can('edit_post', $post_id)
        : user_can($user_id, 'edit_post', $post_id);
}

/**
 * Assignment is an editor's decision. An Author must not be able to hand a story
 * to an editor or move a newsroom deadline.
 */
function byline_editorial_can_assign(int $post_id, ?int $user_id = null): bool
{
    return $user_id === null
        ? current_user_can('edit_others_posts')
        : user_can($user_id, 'edit_others_posts');
}

/**
 * Applies a partial set of changes under the capability rules above.
 *
 * Absent keys are left alone, so a caller that only knows about the status never
 * clears an assignment. Returns the resulting state, or WP_Error when the change
 * is not permitted or the value is unusable.
 *
 * @param array<string, mixed> $changes
 * @return array|WP_Error
 */
function byline_update_editorial_story_state(int $post_id, array $changes, ?int $user_id = null, bool $bump_revision = true)
{
    $post_id = absint($post_id);
    $post = get_post($post_id);

    if (!$post instanceof WP_Post || $post->post_type !== 'post') {
        return new WP_Error('byline_editorial_unknown_story', 'This story does not exist.', ['status' => 404]);
    }

    if (!byline_editorial_can_change_status($post_id, $user_id)) {
        return new WP_Error('byline_editorial_forbidden', 'You are not allowed to change this story.', ['status' => 403]);
    }

    $expected_revision = null;
    if (array_key_exists('expectedRevision', $changes)) {
        $raw_revision = $changes['expectedRevision'];
        if (!is_int($raw_revision) && !is_numeric($raw_revision)) {
            return new WP_Error(
                'byline_editorial_invalid_revision',
                'The story revision is invalid. Reload the story and try again.',
                ['status' => 400]
            );
        }
        $expected_revision = (int) $raw_revision;
        unset($changes['expectedRevision']);
    }

    $can_assign = byline_editorial_can_assign($post_id, $user_id);
    $assignment_keys = ['editorId', 'deadline'];

    foreach ($assignment_keys as $key) {
        if (array_key_exists($key, $changes) && !$can_assign) {
            return new WP_Error(
                'byline_editorial_forbidden_assignment',
                'Only an editor can change the assigned editor or the deadline.',
                ['status' => 403]
            );
        }
    }

    if (array_key_exists('status', $changes)) {
        $requested = sanitize_key((string) $changes['status']);

        if ($requested === BYLINE_EDITORIAL_PUBLISHED_STATUS) {
            return new WP_Error(
                'byline_editorial_derived_status',
                'Published follows the WordPress publication state and cannot be set here.',
                ['status' => 400]
            );
        }

        if (!in_array($requested, byline_editorial_selectable_status_ids(), true)) {
            return new WP_Error('byline_editorial_invalid_status', 'That workflow status is not recognised.', ['status' => 400]);
        }

        $changes['status'] = $requested;
    }

    if (array_key_exists('editorId', $changes)) {
        $editor_id = absint($changes['editorId']);

        if ($editor_id > 0 && !get_user_by('id', $editor_id)) {
            return new WP_Error('byline_editorial_unknown_editor', 'That editor account does not exist.', ['status' => 400]);
        }

        $changes['editorId'] = $editor_id;
    }

    if (array_key_exists('deadline', $changes)) {
        $deadline = trim((string) $changes['deadline']);

        if ($deadline !== '' && byline_editorial_sanitize_deadline($deadline) === '') {
            return new WP_Error('byline_editorial_invalid_deadline', 'Use a valid date in YYYY-MM-DD format.', ['status' => 400]);
        }

        $changes['deadline'] = $deadline;
    }

    if (array_key_exists('visuals', $changes)) {
        $changes['visuals'] = (string) $changes['visuals'];
    }

    $revision_check = byline_assert_editorial_revision($post_id, $expected_revision);
    if ($revision_check !== true) {
        return $revision_check;
    }

    // Keep the transition context private to the post-update action. Consumers
    // such as notifications may need to distinguish a review return from an
    // ordinary forward move, while existing three-argument integrations remain
    // fully compatible.
    $previous_state = byline_get_editorial_story_state($post_id);

    if (array_key_exists('status', $changes)) {
        byline_set_editorial_status($post_id, (string) $changes['status']);
    }
    if (array_key_exists('editorId', $changes)) {
        byline_set_editorial_editor_id($post_id, (int) $changes['editorId']);
    }
    if (array_key_exists('deadline', $changes)) {
        byline_set_editorial_deadline($post_id, (string) $changes['deadline']);
    }
    if (array_key_exists('visuals', $changes)) {
        byline_set_editorial_visuals($post_id, (string) $changes['visuals']);
    }

    if ($bump_revision && $changes !== []) {
        byline_bump_editorial_revision($post_id);
    }

    $state = byline_get_editorial_story_state($post_id);

    /**
     * Fires after editorial workflow state changed on a story.
     *
     * Integrations subscribe here. The workflow domain never calls an
     * integration itself, so a downstream service being unavailable can never
     * block an editorial change.
     */
    do_action('byline_editorial_story_updated', $post_id, $state, $changes, $previous_state);

    return $state;
}

/**
 * Editors available for assignment. Anyone who can edit posts can be handed a
 * story to edit; the capability, not a role name, defines the list.
 *
 * @return array<int, array{id:int,name:string}>
 */
function byline_editorial_assignable_editors(): array
{
    $users = get_users([
        'capability' => 'edit_posts',
        'orderby' => 'display_name',
        'order' => 'ASC',
        'fields' => ['ID', 'display_name'],
        'number' => 200,
    ]);

    $editors = [];

    foreach ($users as $user) {
        $editors[] = [
            'id' => (int) $user->ID,
            'name' => (string) $user->display_name,
        ];
    }

    return $editors;
}

/**
 * Registers the workflow meta with WordPress so sanitisation and authorisation
 * run wherever the values are written.
 *
 * `show_in_rest` stays false on every key. Assignments, deadlines, and visual
 * needs are internal newsroom information and must never appear in an anonymous
 * REST response; the editor reads them through the capability-protected Byline
 * editorial endpoint instead.
 */
function byline_editorial_register_meta(): void
{
    foreach ([
        BYLINE_EDITORIAL_STATUS_META => 'byline_editorial_sanitize_status',
        BYLINE_EDITORIAL_DEADLINE_META => 'byline_editorial_sanitize_deadline',
        BYLINE_EDITORIAL_VISUALS_META => 'byline_editorial_sanitize_visuals',
    ] as $key => $sanitize) {
        register_post_meta('post', $key, [
            'single' => true,
            'type' => 'string',
            'sanitize_callback' => $sanitize,
            'show_in_rest' => false,
            'auth_callback' => static function () {
                return current_user_can('edit_posts');
            },
        ]);
    }

    register_post_meta('post', BYLINE_EDITORIAL_EDITOR_META, [
        'single' => true,
        'type' => 'integer',
        'sanitize_callback' => 'absint',
        'show_in_rest' => false,
        'auth_callback' => static function () {
            return current_user_can('edit_others_posts');
        },
    ]);

    register_post_meta('post', BYLINE_EDITORIAL_REVISION_META, [
        'single' => true,
        'type' => 'integer',
        'sanitize_callback' => 'absint',
        'show_in_rest' => false,
        'auth_callback' => static function () {
            return current_user_can('edit_posts');
        },
    ]);
}
add_action('init', 'byline_editorial_register_meta');
