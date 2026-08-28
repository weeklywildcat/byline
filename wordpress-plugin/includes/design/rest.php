<?php

if (!defined('ABSPATH')) {
    exit;
}

// The main plugin bootstrap intentionally remains untouched. Loading the
// shared publish/schedule helpers from the design REST module keeps them
// available to immediate REST publishes and cron execution alike.
require_once __DIR__ . '/publishing.php';
require_once __DIR__ . '/scheduling.php';

function byline_rest_design_template(WP_REST_Request $request): string
{
    return sanitize_text_field((string) $request['template']);
}

function byline_rest_get_public_design(WP_REST_Request $request)
{
    $template = byline_rest_design_template($request);
    if (!byline_is_design_template($template)) {
        return new WP_Error('byline_unknown_template', __('Unknown Byline template.', 'weekly-wildcat-headless'), ['status' => 404]);
    }
    return rest_ensure_response(byline_published_design($template));
}

function byline_rest_list_public_designs()
{
    return rest_ensure_response(array_map(static function (string $template): array {
        $published = byline_published_design($template);
        return ['template' => $template, 'revision' => $published['revision'], 'modifiedAt' => $published['modifiedAt']];
    }, byline_design_templates()));
}

function byline_rest_admin_bootstrap()
{
    return rest_ensure_response([
        'protocol' => byline_protocol_manifest(),
        'publication' => byline_publication_response(),
        'templates' => byline_design_templates(),
        'themes' => ['byline-editorial', 'byline-magazine', 'byline-modern', 'weekly-wildcat'],
        'capabilities' => [
            'editDesign' => current_user_can(BYLINE_EDIT_DESIGN_CAPABILITY),
            'publishDesign' => current_user_can(BYLINE_PUBLISH_DESIGN_CAPABILITY),
        ],
    ]);
}

function byline_rest_get_admin_design(WP_REST_Request $request)
{
    $template = byline_rest_design_template($request);
    if (!byline_is_design_template($template)) {
        return new WP_Error('byline_unknown_template', __('Unknown Byline template.', 'weekly-wildcat-headless'), ['status' => 404]);
    }
    $published = byline_published_design($template);
    $autosave = get_user_meta(get_current_user_id(), byline_design_autosave_key($template), true);
    $response = $published;
    $response['autosave'] = is_array($autosave) ? $autosave : null;
    $post = byline_get_design_post($template);
    $author = $post ? get_userdata((int) $post->post_author) : false;
    $response['publishedAuthorId'] = $author instanceof WP_User ? (int) $author->ID : 0;
    $response['publishedAuthorName'] = $author instanceof WP_User ? (string) $author->display_name : '';
    return rest_ensure_response($response);
}

function byline_rest_design_deployment_payload(): array
{
    $deployment = function_exists('byline_deployment_status')
        ? byline_deployment_status()
        : [
            'configured' => false,
            'pending' => false,
            'lastTriggeredAt' => 'Never',
            'lastStatus' => 'Not configured',
        ];
    $deployment['canRetry'] = current_user_can(
        defined('BYLINE_MANAGE_INTEGRATIONS_CAPABILITY')
            ? BYLINE_MANAGE_INTEGRATIONS_CAPABILITY
            : 'manage_options'
    );
    $deployment['publicManifest'] = function_exists('byline_public_manifest_diagnostic')
        ? byline_public_manifest_diagnostic()
        : ['reachable' => false, 'status' => 'Unavailable', 'designRevisions' => []];
    return $deployment;
}

function byline_rest_get_design_deployment(WP_REST_Request $request)
{
    $template = byline_rest_design_template($request);
    if (!byline_is_design_template($template)) {
        return new WP_Error('byline_unknown_template', __('Unknown Byline template.', 'weekly-wildcat-headless'), ['status' => 404]);
    }
    return rest_ensure_response(byline_rest_design_deployment_payload());
}

function byline_rest_autosave_design(WP_REST_Request $request)
{
    $template = byline_rest_design_template($request);
    $document = $request->get_json_params()['document'] ?? null;
    $base_revision = (int) ($request->get_json_params()['baseRevisionId'] ?? -1);
    if (!byline_is_design_template($template)) {
        return new WP_Error('byline_unknown_template', __('Unknown Byline template.', 'weekly-wildcat-headless'), ['status' => 404]);
    }
    $validation = byline_validate_design_document($document, $template);
    if (is_wp_error($validation)) {
        return $validation;
    }
    $published = byline_published_design($template);
    $conflict = byline_design_conflict($base_revision, $published['revision']);
    if ($conflict) {
        return $conflict;
    }

    $autosave = [
        'document' => $document,
        'baseRevisionId' => $base_revision,
        'modifiedAt' => gmdate(DATE_ATOM),
    ];
    update_user_meta(get_current_user_id(), byline_design_autosave_key($template), $autosave);
    return rest_ensure_response($autosave);
}

/**
 * Discards the current user's draft for a template.
 *
 * Deliberately narrow. It deletes one user meta record -- this editor's own
 * autosave -- and touches nothing else: no published revision, no post, no
 * deployment. Resetting a stale draft is an editing decision, not a release,
 * and another editor's draft is not this editor's to discard.
 */
function byline_rest_delete_design_autosave(WP_REST_Request $request)
{
    $template = byline_rest_design_template($request);
    if (!byline_is_design_template($template)) {
        return new WP_Error('byline_unknown_template', __('Unknown Byline template.', 'weekly-wildcat-headless'), ['status' => 404]);
    }

    delete_user_meta(get_current_user_id(), byline_design_autosave_key($template));

    $published = byline_published_design($template);
    $response = $published;
    $response['autosave'] = null;

    return rest_ensure_response($response);
}

function byline_rest_publish_design(WP_REST_Request $request)
{
    $template = byline_rest_design_template($request);
    $params = $request->get_json_params();
    $document = $params['document'] ?? null;
    $base_revision = (int) ($params['baseRevisionId'] ?? -1);
    $published = byline_publish_design_document(
        $template,
        $document,
        $base_revision,
        get_current_user_id(),
        'immediate',
        true
    );
    if (is_wp_error($published)) {
        return $published;
    }

    $response = $published;
    $response['deployment'] = byline_rest_design_deployment_payload();
    return rest_ensure_response($response);
}

function byline_rest_list_design_schedules(WP_REST_Request $request)
{
    $template = byline_rest_design_template($request);
    if (!byline_is_design_template($template)) {
        return new WP_Error('byline_unknown_template', __('Unknown Byline template.', 'weekly-wildcat-headless'), ['status' => 404]);
    }
    if (!function_exists('get_posts')) {
        return rest_ensure_response([]);
    }

    $posts = get_posts([
        'post_type' => BYLINE_DESIGN_SCHEDULE_POST_TYPE,
        'post_status' => 'any',
        'posts_per_page' => 100,
        'orderby' => 'ID',
        'order' => 'DESC',
        'meta_key' => BYLINE_DESIGN_SCHEDULE_TEMPLATE_META,
        'meta_value' => $template,
    ]);
    $records = [];
    foreach (is_array($posts) ? $posts : [] as $post) {
        if (!$post instanceof WP_Post) {
            continue;
        }
        $record = byline_get_design_schedule((int) $post->ID);
        if ($record) {
            $records[] = $record;
        }
    }
    return rest_ensure_response($records);
}

function byline_rest_create_design_schedule(WP_REST_Request $request)
{
    $template = byline_rest_design_template($request);
    $params = $request->get_json_params();
    $result = byline_create_design_schedule(
        $template,
        $params['document'] ?? null,
        (int) ($params['baseRevisionId'] ?? -1),
        (string) ($params['scheduledAt'] ?? ''),
        max(0, (int) get_current_user_id()),
        (string) ($params['idempotencyKey'] ?? '')
    );
    return is_wp_error($result) ? $result : rest_ensure_response($result);
}

function byline_rest_reschedule_design(WP_REST_Request $request)
{
    $schedule_id = (int) $request['schedule'];
    $record = byline_get_design_schedule($schedule_id);
    if (!$record || $record['template'] !== byline_rest_design_template($request)) {
        return new WP_Error('byline_unknown_design_schedule', __('Unknown scheduled design.', 'weekly-wildcat-headless'), ['status' => 404]);
    }
    $result = byline_design_schedule_reschedule(
        $schedule_id,
        (string) ($request->get_json_params()['scheduledAt'] ?? '')
    );
    return is_wp_error($result) ? $result : rest_ensure_response($result);
}

function byline_rest_rebase_design_schedule(WP_REST_Request $request)
{
    $schedule_id = (int) $request['schedule'];
    $record = byline_get_design_schedule($schedule_id);
    if (!$record || $record['template'] !== byline_rest_design_template($request)) {
        return new WP_Error('byline_unknown_design_schedule', __('Unknown scheduled design.', 'weekly-wildcat-headless'), ['status' => 404]);
    }
    $result = byline_design_schedule_rebase(
        $schedule_id,
        (int) ($request->get_json_params()['baseRevisionId'] ?? -1)
    );
    return is_wp_error($result) ? $result : rest_ensure_response($result);
}

function byline_rest_cancel_design_schedule(WP_REST_Request $request)
{
    $schedule_id = (int) $request['schedule'];
    $record = byline_get_design_schedule($schedule_id);
    if (!$record || $record['template'] !== byline_rest_design_template($request)) {
        return new WP_Error('byline_unknown_design_schedule', __('Unknown scheduled design.', 'weekly-wildcat-headless'), ['status' => 404]);
    }
    $result = byline_cancel_design_schedule($schedule_id);
    return is_wp_error($result) ? $result : rest_ensure_response($result);
}

function byline_rest_design_revisions(WP_REST_Request $request)
{
    $template = byline_rest_design_template($request);
    $post = byline_get_design_post($template);
    if (!$post) {
        return rest_ensure_response([]);
    }
    $revisions = wp_get_post_revisions($post->ID, ['posts_per_page' => 50]);
    return rest_ensure_response(array_values(array_map(static function (WP_Post $revision): array {
        $author = get_userdata((int) $revision->post_author);
        return [
            'id' => $revision->ID,
            'authorId' => (int) $revision->post_author,
            'authorName' => $author instanceof WP_User ? (string) $author->display_name : '',
            'modifiedAt' => mysql_to_rfc3339($revision->post_modified_gmt),
        ];
    }, $revisions)));
}

function byline_rest_restore_design_revision(WP_REST_Request $request)
{
    $template = byline_rest_design_template($request);
    $post = byline_get_design_post($template);
    $revision = wp_get_post_revision((int) $request['revision']);
    if (!$post || !$revision || (int) $revision->post_parent !== $post->ID) {
        return new WP_Error('byline_unknown_revision', __('Unknown design revision.', 'weekly-wildcat-headless'), ['status' => 404]);
    }
    $document = json_decode($revision->post_content, true);
    $validation = byline_validate_design_document($document, $template);
    if (is_wp_error($validation)) {
        return $validation;
    }
    $autosave = [
        'document' => $document,
        'baseRevisionId' => byline_design_revision($post),
        'modifiedAt' => gmdate(DATE_ATOM),
        'restoredFromRevisionId' => $revision->ID,
    ];
    update_user_meta(get_current_user_id(), byline_design_autosave_key($template), $autosave);
    return rest_ensure_response($autosave);
}

function byline_register_design_routes(): void
{
    register_rest_route(BYLINE_REST_NAMESPACE, '/designs', [
        'methods' => WP_REST_Server::READABLE,
        'callback' => 'byline_rest_list_public_designs',
        'permission_callback' => '__return_true',
    ]);
    register_rest_route(BYLINE_REST_NAMESPACE, '/design/(?P<template>[a-z0-9:-]+)', [
        'methods' => WP_REST_Server::READABLE,
        'callback' => 'byline_rest_get_public_design',
        'permission_callback' => '__return_true',
    ]);
    register_rest_route(BYLINE_REST_NAMESPACE, '/admin/bootstrap', [
        'methods' => WP_REST_Server::READABLE,
        'callback' => 'byline_rest_admin_bootstrap',
        'permission_callback' => static fn() => current_user_can(BYLINE_MANAGE_CAPABILITY),
    ]);
    register_rest_route(BYLINE_REST_NAMESPACE, '/admin/design/(?P<template>[a-z0-9:-]+)', [
        'methods' => WP_REST_Server::READABLE,
        'callback' => 'byline_rest_get_admin_design',
        'permission_callback' => static fn() => current_user_can(BYLINE_EDIT_DESIGN_CAPABILITY),
    ]);
    register_rest_route(BYLINE_REST_NAMESPACE, '/admin/design/(?P<template>[a-z0-9:-]+)/deployment', [
        'methods' => WP_REST_Server::READABLE,
        'callback' => 'byline_rest_get_design_deployment',
        'permission_callback' => static fn() => current_user_can(BYLINE_EDIT_DESIGN_CAPABILITY),
    ]);
    register_rest_route(BYLINE_REST_NAMESPACE, '/admin/design/(?P<template>[a-z0-9:-]+)/autosave', [
        [
            'methods' => WP_REST_Server::EDITABLE,
            'callback' => 'byline_rest_autosave_design',
            'permission_callback' => static fn() => current_user_can(BYLINE_EDIT_DESIGN_CAPABILITY),
        ],
        [
            'methods' => WP_REST_Server::DELETABLE,
            'callback' => 'byline_rest_delete_design_autosave',
            'permission_callback' => static fn() => current_user_can(BYLINE_EDIT_DESIGN_CAPABILITY),
        ],
    ]);
    register_rest_route(BYLINE_REST_NAMESPACE, '/admin/design/(?P<template>[a-z0-9:-]+)/publish', [
        'methods' => WP_REST_Server::CREATABLE,
        'callback' => 'byline_rest_publish_design',
        'permission_callback' => static fn() => current_user_can(BYLINE_PUBLISH_DESIGN_CAPABILITY),
    ]);
    register_rest_route(BYLINE_REST_NAMESPACE, '/admin/design/(?P<template>[a-z0-9:-]+)/schedules', [
        'methods' => WP_REST_Server::READABLE,
        'callback' => 'byline_rest_list_design_schedules',
        'permission_callback' => static fn() => current_user_can(BYLINE_PUBLISH_DESIGN_CAPABILITY),
    ]);
    register_rest_route(BYLINE_REST_NAMESPACE, '/admin/design/(?P<template>[a-z0-9:-]+)/schedule', [
        'methods' => WP_REST_Server::CREATABLE,
        'callback' => 'byline_rest_create_design_schedule',
        'permission_callback' => static fn() => current_user_can(BYLINE_PUBLISH_DESIGN_CAPABILITY),
    ]);
    register_rest_route(BYLINE_REST_NAMESPACE, '/admin/design/(?P<template>[a-z0-9:-]+)/schedule/(?P<schedule>\d+)/reschedule', [
        'methods' => WP_REST_Server::CREATABLE,
        'callback' => 'byline_rest_reschedule_design',
        'permission_callback' => static fn() => current_user_can(BYLINE_PUBLISH_DESIGN_CAPABILITY),
    ]);
    register_rest_route(BYLINE_REST_NAMESPACE, '/admin/design/(?P<template>[a-z0-9:-]+)/schedule/(?P<schedule>\d+)/rebase', [
        'methods' => WP_REST_Server::CREATABLE,
        'callback' => 'byline_rest_rebase_design_schedule',
        'permission_callback' => static fn() => current_user_can(BYLINE_PUBLISH_DESIGN_CAPABILITY),
    ]);
    register_rest_route(BYLINE_REST_NAMESPACE, '/admin/design/(?P<template>[a-z0-9:-]+)/schedule/(?P<schedule>\d+)', [
        'methods' => WP_REST_Server::DELETABLE,
        'callback' => 'byline_rest_cancel_design_schedule',
        'permission_callback' => static fn() => current_user_can(BYLINE_PUBLISH_DESIGN_CAPABILITY),
    ]);
    register_rest_route(BYLINE_REST_NAMESPACE, '/admin/design/(?P<template>[a-z0-9:-]+)/revisions', [
        'methods' => WP_REST_Server::READABLE,
        'callback' => 'byline_rest_design_revisions',
        'permission_callback' => static fn() => current_user_can(BYLINE_EDIT_DESIGN_CAPABILITY),
    ]);
    register_rest_route(BYLINE_REST_NAMESPACE, '/admin/design/(?P<template>[a-z0-9:-]+)/restore/(?P<revision>\d+)', [
        'methods' => WP_REST_Server::CREATABLE,
        'callback' => 'byline_rest_restore_design_revision',
        'permission_callback' => static fn() => current_user_can(BYLINE_EDIT_DESIGN_CAPABILITY),
    ]);
}
add_action('rest_api_init', 'byline_register_design_routes');
