<?php

/** The story editor autosaves every 30 seconds; other post types keep WordPress' default. */

define('ABSPATH', __DIR__ . '/../');

$filters = [];
$overrides = [];
function add_filter($hook, $callback, $priority = 10, $args = 1): void { global $filters; $filters[$hook][] = $callback; }
function add_action(...$args): void {}
function apply_filters($hook, $value, ...$args)
{
    global $overrides;
    return array_key_exists($hook, $overrides) ? $overrides[$hook] : $value;
}

require __DIR__ . '/../includes/editorial/editor-autosave.php';

function autosave_test_assert(bool $condition, string $message): void
{
    if (!$condition) {
        fwrite(STDERR, $message . "\n");
        exit(1);
    }
}

autosave_test_assert(in_array('byline_editor_settings_autosave', $filters['block_editor_settings_all'] ?? [], true), 'The editor settings filter must be registered.');
autosave_test_assert(byline_editor_autosave_interval() === 30, 'The default interval is 30 seconds.');

$story = (object) ['post' => (object) ['post_type' => 'post']];
$page = (object) ['post' => (object) ['post_type' => 'page']];
$none = (object) ['post' => null];
$base = ['autosaveInterval' => 60, 'other' => true];

autosave_test_assert(byline_editor_settings_autosave($base, $story) === ['autosaveInterval' => 30, 'other' => true], 'Stories autosave every 30 seconds and keep every other setting.');
autosave_test_assert(byline_editor_settings_autosave($base, $page) === $base, 'Pages keep the WordPress default.');
autosave_test_assert(byline_editor_settings_autosave($base, $none) === $base, 'Contexts without a post keep the WordPress default.');
autosave_test_assert(byline_editor_settings_autosave($base, null) === $base, 'A missing context is tolerated.');

foreach ([[5, 10], [0, 10], [-3, 10], [45, 45], [9999, 300]] as [$requested, $expected]) {
    $overrides['byline_editor_autosave_interval'] = $requested;
    autosave_test_assert(byline_editor_autosave_interval() === $expected, "A requested interval of $requested is clamped to $expected.");
}

echo "Editor autosave regression passed.\n";
