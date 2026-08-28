<?php

/** Focused capability/version-gating coverage for the optional Command Palette adapter. */

define('ABSPATH', __DIR__ . '/../');
const BYLINE_MANAGE_CAPABILITY = 'manage_byline';
const BYLINE_EDIT_DESIGN_CAPABILITY = 'edit_byline_design';
const BYLINE_MANAGE_INTEGRATIONS_CAPABILITY = 'manage_byline_integrations';

$capabilities = ['edit_posts' => true, 'manage_byline' => true, 'edit_byline_design' => true, 'manage_byline_integrations' => false];
$scripts = ['wp-commands' => true, 'wp-data' => true];
$actions = [];

function command_assert(bool $condition, string $message): void
{
    if (!$condition) {
        fwrite(STDERR, $message . "\n");
        exit(1);
    }
}

function current_user_can(string $capability, ...$args): bool { global $capabilities; return !empty($capabilities[$capability]); }
function admin_url(string $path = ''): string { return 'https://example.test/wp-admin/' . ltrim($path, '/'); }
function add_query_arg(array $args, string $url): string { return $url . '?' . http_build_query($args); }
function wp_json_encode($value): string { return json_encode($value); }
function wp_script_is(string $handle, string $status): bool { global $scripts; return !empty($scripts[$handle]); }
function add_action(string $hook, $callback, int $priority = 10, int $accepted_args = 1): void { global $actions; $actions[$hook][] = $callback; }
function byline_admin_feature_enabled(string $feature): bool { return $feature === 'sports'; }

require __DIR__ . '/../includes/commands/commands.php';

$commands = byline_command_palette_commands();
$names = array_column($commands, 'name');
command_assert(in_array('byline/new-story', $names, true) && in_array('byline/studio', $names, true), 'Authorized navigation commands were not registered.');
command_assert(!in_array('byline/deployment', $names, true), 'Deployment command bypassed its integration capability gate.');

$scripts = ['wp-commands' => false, 'wp-data' => false];
ob_start();
byline_command_palette_footer_script();
$without_core = ob_get_clean();
command_assert($without_core === '', 'Command Palette adapter did not gracefully no-op without Core command scripts.');

$scripts = ['wp-commands' => true, 'wp-data' => true];
ob_start();
byline_command_palette_footer_script();
$script = ob_get_clean();
command_assert(strpos($script, 'registerCommand') !== false && strpos($script, 'new-story') !== false, 'Command Palette adapter did not emit native registration code when supported.');
byline_register_command_palette_hooks();
command_assert(isset($actions['admin_print_footer_scripts']), 'Command Palette registration hook was not explicit.');

$capabilities['edit_posts'] = false;
$capabilities['manage_byline'] = false;
$capabilities['edit_byline_design'] = false;
$commands_without_access = byline_command_palette_commands();
command_assert($commands_without_access === [], 'Unauthorized users received capability-gated Byline commands.');

echo "Byline command-palette regression passed.\n";
