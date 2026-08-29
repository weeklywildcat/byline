<?php

/**
 * Optional adapter for WordPress's native Command Palette.
 *
 * Command Palette is a JavaScript/Core feature, so this PHP module only emits
 * capability-filtered navigation commands when the documented wp-commands and
 * wp-data script surfaces are present. Older supported WordPress versions
 * simply receive no commands and no error.
 */

if (!defined('ABSPATH')) {
    exit;
}
function byline_command_palette_url(string $page, array $args = []): string
{
    $query = array_merge(['page' => $page], $args);
    if (function_exists('admin_url') && function_exists('add_query_arg')) {
        return add_query_arg($query, admin_url('admin.php'));
    }
    return 'admin.php?' . http_build_query($query);
}

function byline_command_palette_commands(): array
{
    $commands = [];
    $add = static function (array &$list, string $name, string $label, string $url): void {
        if ($url === '') {
            return;
        }
        $list[] = ['name' => $name, 'label' => $label, 'url' => $url];
    };

    $feature_enabled = static function (string $feature): bool {
        return !function_exists('byline_admin_feature_enabled') || byline_admin_feature_enabled($feature);
    };

    if (current_user_can('edit_posts')) {
        $add($commands, 'byline/new-story', 'New story', function_exists('admin_url') ? admin_url('post-new.php?post_type=post') : 'post-new.php?post_type=post');
        $add($commands, 'byline/find-story', 'Find or open a story', function_exists('admin_url') ? admin_url('edit.php?post_type=post') : 'edit.php?post_type=post');
        $add($commands, 'byline/planning', 'Open Planning', byline_command_palette_url('byline-planning'));
        $add($commands, 'byline/my-stories', 'My Stories', byline_command_palette_url('byline-planning', ['tab' => 'stories', 'mine' => '1']));
        $add($commands, 'byline/ready-for-review', 'Ready for Review', byline_command_palette_url('byline-planning', ['tab' => 'stories', 'workflow' => 'ready']));
        $add($commands, 'byline/coverage', 'Open Coverage', byline_command_palette_url('byline-planning', ['tab' => 'coverage']));
        $add($commands, 'byline/new-coverage', 'New coverage', byline_command_palette_url('byline-planning', ['tab' => 'coverage']));
        $add($commands, 'byline/media-desk', 'Open Media Desk', byline_command_palette_url('byline-planning', ['tab' => 'media']));
        if (current_user_can('upload_files')) {
            $add($commands, 'byline/upload-photos', 'Upload photos', function_exists('admin_url') ? admin_url('media-new.php') : 'media-new.php');
        }
        if (current_user_can('edit_others_posts')) {
            $add($commands, 'byline/assign-story', 'Assign a story', byline_command_palette_url('byline-planning', ['tab' => 'stories', 'unassigned' => '1']));
        }
        $add($commands, 'byline/move-story', 'Move a story to a stage', byline_command_palette_url('byline-planning', ['tab' => 'stories']));
        if ($feature_enabled('newsletter')) {
            $add($commands, 'byline/newsletters', 'Open Newsletters', byline_command_palette_url('byline-newsletters'));
        }
        $add($commands, 'byline/performance', 'Open Performance', byline_command_palette_url('byline-planning', ['tab' => 'performance']));
        $add($commands, 'byline/content-health', 'Open Content Health', byline_command_palette_url('byline-planning', ['tab' => 'content-health']));
        if (current_user_can('edit_others_posts') || current_user_can(defined('BYLINE_MANAGE_CAPABILITY') ? BYLINE_MANAGE_CAPABILITY : 'manage_byline')) {
            $add($commands, 'byline/create-correction', 'Create a correction', byline_command_palette_url('byline-planning', ['tab' => 'feedback']));
        }
        if ($feature_enabled('sports')) {
            $post_type = defined('WWH_SPORTS_GAME_POST_TYPE') ? WWH_SPORTS_GAME_POST_TYPE : 'ww_sports_game';
            $add($commands, 'byline/add-game', 'Add game', function_exists('admin_url') ? admin_url('post-new.php?post_type=' . rawurlencode($post_type)) : 'post-new.php?post_type=' . rawurlencode($post_type));
        }
    }
    $manage_capability = defined('BYLINE_MANAGE_CAPABILITY') ? BYLINE_MANAGE_CAPABILITY : 'manage_byline';
    if (current_user_can($manage_capability) || current_user_can('edit_posts')) {
        $home_page = current_user_can($manage_capability)
            ? (defined('BYLINE_ADMIN_PAGE') ? BYLINE_ADMIN_PAGE : 'byline')
            : (defined('BYLINE_ADMIN_PLANNING_PAGE') ? BYLINE_ADMIN_PLANNING_PAGE : 'byline-planning');
        $home_args = current_user_can($manage_capability) ? [] : ['tab' => 'today'];
        $add($commands, 'byline/home', 'Open Byline Home', byline_command_palette_url($home_page, $home_args));
    }
    if (current_user_can($manage_capability)) {
        $add($commands, 'byline/health-check', 'Run Byline health check', byline_command_palette_url(defined('BYLINE_ADMIN_SETTINGS_PAGE') ? BYLINE_ADMIN_SETTINGS_PAGE : 'byline-settings', ['tab' => 'diagnostics']));
    }
    if (current_user_can(defined('BYLINE_EDIT_DESIGN_CAPABILITY') ? BYLINE_EDIT_DESIGN_CAPABILITY : 'edit_byline_design')) {
        $add($commands, 'byline/studio', 'Open Homepage Studio', byline_command_palette_url('byline-studio'));
    }
    if (current_user_can(defined('BYLINE_MANAGE_INTEGRATIONS_CAPABILITY') ? BYLINE_MANAGE_INTEGRATIONS_CAPABILITY : 'manage_byline_integrations')) {
        $deployment_url = byline_command_palette_url('byline-integrations', ['tab' => 'deployment']);
        $add($commands, 'byline/deployment', 'Open Deployment', $deployment_url);
        $add($commands, 'byline/retry-website-build', 'Retry website build', $deployment_url);
    }
    return $commands;
}

function byline_command_palette_scripts_available(): bool
{
    if (!function_exists('wp_script_is')) {
        return false;
    }
    $commands_loaded = wp_script_is('wp-commands', 'enqueued') || wp_script_is('wp-commands', 'registered');
    $data_loaded = wp_script_is('wp-data', 'enqueued') || wp_script_is('wp-data', 'registered');
    return $commands_loaded && $data_loaded;
}

function byline_command_palette_footer_script(): void
{
    if (!byline_command_palette_scripts_available()) {
        return;
    }
    $commands = byline_command_palette_commands();
    if ($commands === []) {
        return;
    }
    $encoded = function_exists('wp_json_encode') ? wp_json_encode($commands) : json_encode($commands);
    if (!is_string($encoded) || $encoded === '') {
        return;
    }
    echo '<script>(function(w){if(!w||!w.wp||!w.wp.data||!w.wp.commands||!w.wp.data.dispatch||!w.wp.commands.store){return;}var d=w.wp.data.dispatch(w.wp.commands.store),c=' . $encoded . ';if(!d||typeof d.registerCommand!=="function"){return;}c.forEach(function(x){var u=x.url;delete x.url;x.callback=function(){w.location.href=u;};d.registerCommand(x);});})(window);</script>';
}

function byline_register_command_palette_hooks(): void
{
    if (function_exists('add_action')) {
        add_action('admin_print_footer_scripts', 'byline_command_palette_footer_script');
    }
}
