<?php

if (!defined('ABSPATH')) {
    exit;
}

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
    return rest_ensure_response([
        ...$published,
        'autosave' => is_array($autosave) ? $autosave : null,
    ]);
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

function byline_rest_publish_design(WP_REST_Request $request)
{
    $template = byline_rest_design_template($request);
    $params = $request->get_json_params();
    $document = $params['document'] ?? null;
    $base_revision = (int) ($params['baseRevisionId'] ?? -1);
    $validation = byline_validate_design_document($document, $template);
    if (is_wp_error($validation)) {
        return $validation;
    }

    $existing = byline_get_design_post($template);
    $published_revision = byline_design_revision($existing);
    $conflict = byline_design_conflict($base_revision, $published_revision);
    if ($conflict) {
        return $conflict;
    }
    if ($existing) {
        wp_save_post_revision($existing->ID);
    }

    $post_data = [
        'post_type' => BYLINE_DESIGN_POST_TYPE,
        'post_status' => 'publish',
        'post_title' => 'Byline design: ' . $template,
        'post_content' => wp_json_encode($document),
    ];
    if ($existing) {
        $post_data['ID'] = $existing->ID;
        $post_id = wp_update_post(wp_slash($post_data), true);
    } else {
        $post_id = wp_insert_post(wp_slash($post_data), true);
    }
    if (is_wp_error($post_id)) {
        return $post_id;
    }

    $next_revision = $published_revision + 1;
    update_post_meta($post_id, BYLINE_DESIGN_TEMPLATE_META, $template);
    update_post_meta($post_id, BYLINE_DESIGN_REVISION_META, $next_revision);
    delete_user_meta(get_current_user_id(), byline_design_autosave_key($template));
    wp_save_post_revision($post_id);
    if (function_exists('wwh_schedule_cloudflare_deploy')) {
        wwh_schedule_cloudflare_deploy();
    }

    return rest_ensure_response(byline_published_design($template));
}

function byline_rest_design_revisions(WP_REST_Request $request)
{
    $template = byline_rest_design_template($request);
    $post = byline_get_design_post($template);
    if (!$post) {
        return rest_ensure_response([]);
    }
    $revisions = wp_get_post_revisions($post->ID, ['posts_per_page' => 50]);
    return rest_ensure_response(array_values(array_map(static fn(WP_Post $revision): array => [
        'id' => $revision->ID,
        'authorId' => (int) $revision->post_author,
        'modifiedAt' => mysql_to_rfc3339($revision->post_modified_gmt),
    ], $revisions)));
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
    register_rest_route(BYLINE_REST_NAMESPACE, '/admin/design/(?P<template>[a-z0-9:-]+)/autosave', [
        'methods' => WP_REST_Server::EDITABLE,
        'callback' => 'byline_rest_autosave_design',
        'permission_callback' => static fn() => current_user_can(BYLINE_EDIT_DESIGN_CAPABILITY),
    ]);
    register_rest_route(BYLINE_REST_NAMESPACE, '/admin/design/(?P<template>[a-z0-9:-]+)/publish', [
        'methods' => WP_REST_Server::CREATABLE,
        'callback' => 'byline_rest_publish_design',
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
