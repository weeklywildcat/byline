<?php

if (!defined('ABSPATH')) {
    exit;
}

function byline_register_admin_app(): void
{
    add_menu_page(
        'Byline',
        'Byline',
        BYLINE_MANAGE_CAPABILITY,
        'byline',
        'byline_render_admin_app',
        'dashicons-welcome-write-blog',
        3
    );
}
add_action('admin_menu', 'byline_register_admin_app');

function byline_render_admin_app(): void
{
    if (!current_user_can(BYLINE_MANAGE_CAPABILITY)) {
        wp_die(esc_html__('Sorry, you are not allowed to manage Byline.', 'weekly-wildcat-headless'));
    }

    echo '<div id="byline-admin-root"></div>';
}

function byline_admin_native_urls(): array
{
    return [
        'authors' => admin_url('users.php'),
        'teams' => admin_url('edit.php?post_type=' . WWH_SPORTS_GAME_POST_TYPE . '&page=wwh-sports-team-settings'),
        'games' => admin_url('edit.php?post_type=' . WWH_SPORTS_GAME_POST_TYPE),
        'rosters' => admin_url('edit.php?post_type=' . WWH_SPORTS_ROSTER_POST_TYPE),
        'events' => admin_url('edit.php?post_type=' . WWH_SCHOOL_EVENT_POST_TYPE),
        'legacySettings' => admin_url('options-general.php?page=wwh-settings'),
    ];
}

function byline_enqueue_admin_app(string $hook_suffix): void
{
    if ($hook_suffix !== 'toplevel_page_byline') {
        return;
    }

    wp_enqueue_media();

    $asset_file = __DIR__ . '/../../build/index.asset.php';
    $script_file = __DIR__ . '/../../build/index.js';
    if (!is_readable($asset_file) || !is_readable($script_file)) {
        add_action('admin_notices', static function (): void {
            echo '<div class="notice notice-error"><p>' . esc_html__('Byline admin assets are missing. Install a release build or run the admin asset build.', 'weekly-wildcat-headless') . '</p></div>';
        });
        return;
    }

    $asset = require $asset_file;
    $dependencies = is_array($asset['dependencies'] ?? null) ? $asset['dependencies'] : [];
    $version = is_string($asset['version'] ?? null) ? $asset['version'] : BYLINE_PLUGIN_VERSION;

    wp_enqueue_script(
        'byline-admin',
        plugins_url('build/index.js', dirname(__DIR__, 2) . '/weekly-wildcat-headless.php'),
        $dependencies,
        $version,
        true
    );

    foreach ([
        'byline-admin-vendor' => 'index.css',
        'byline-admin' => 'style-index.css',
    ] as $style_handle => $style_name) {
        $style_file = __DIR__ . '/../../build/' . $style_name;
        if (!is_readable($style_file)) {
            continue;
        }

        wp_enqueue_style(
            $style_handle,
            plugins_url('build/' . $style_name, dirname(__DIR__, 2) . '/weekly-wildcat-headless.php'),
            ['wp-components'],
            $version
        );
    }

    wp_localize_script('byline-admin', 'bylineAdmin', [
        'restPath' => '/' . BYLINE_REST_NAMESPACE . '/capabilities/protocol',
        'publicationPath' => '/' . BYLINE_REST_NAMESPACE . '/publication',
        'diagnosticsPath' => '/' . BYLINE_REST_NAMESPACE . '/admin/diagnostics',
        'deploymentPath' => '/' . BYLINE_REST_NAMESPACE . '/admin/deployment',
        'nonce' => wp_create_nonce('wp_rest'),
        'pluginVersion' => BYLINE_PLUGIN_VERSION,
        'capabilities' => [
            'manage' => current_user_can(BYLINE_MANAGE_CAPABILITY),
            'editDesign' => current_user_can(BYLINE_EDIT_DESIGN_CAPABILITY),
            'publishDesign' => current_user_can(BYLINE_PUBLISH_DESIGN_CAPABILITY),
            'manageIntegrations' => current_user_can(BYLINE_MANAGE_INTEGRATIONS_CAPABILITY),
        ],
        'features' => byline_get_publication_config()['features'],
        'themeIds' => byline_publication_theme_ids(),
        'nativeUrls' => byline_admin_native_urls(),
    ]);

    add_filter('admin_body_class', static fn(string $classes): string => $classes . ' byline-admin-page');
}
add_action('admin_enqueue_scripts', 'byline_enqueue_admin_app');
