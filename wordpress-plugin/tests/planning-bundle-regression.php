<?php

/**
 * Planning is the third private React 19 root. Today routes to Home, Stories and
 * the other Planning destinations to the planning bundle, and an open story to
 * the Story Workspace; WordPress's own React must not appear on any of them.
 */
$app = file_get_contents(__DIR__ . '/../includes/admin/app.php');
$webpack = file_get_contents(__DIR__ . '/../webpack.config.js');
$entry = file_get_contents(__DIR__ . '/../src/planning-entry.tsx');
$index = file_get_contents(__DIR__ . '/../src/index.tsx');

$assert = static function ($condition, string $message): void {
    if (!$condition) {
        fwrite(STDERR, $message . "\n");
        exit(1);
    }
};

foreach ([$app, $webpack, $entry, $index] as $source) {
    $assert(is_string($source), 'Could not read the Planning bundle sources.');
}

foreach ([
    "'story-workspace' : (\$is_home ? 'home' : (\$is_planning ? 'planning' : 'index'))",
    "'byline-planning'",
    "'bylinePlanning'",
    "'planning.css'",
    "'style-planning.css'",
    "wp_set_script_translations(\$script_handle, 'weekly-wildcat-headless')",
    'byline-nova-page',
] as $needle) {
    $assert(strpos($app, $needle) !== false, "Planning routing contract missing: {$needle}");
}

// Only Planning's own page is the planning bundle: Settings and Newsletters keep the legacy admin app.
$assert(preg_match('/\$is_planning = !\$is_workspace && !\$is_home && \$page === BYLINE_ADMIN_PLANNING_PAGE;/', $app) === 1, 'Planning must be selected only on the Planning page, after Home and the workspace.');
$assert(strpos($app, "wp_register_style('byline-nova-page'") !== false && strpos($app, 'if ($is_nova)') !== false, 'The white canvas must be gated to the React 19 screens.');

// The planning root externalizes exactly apiFetch and i18n, and nothing React.
$assert(strpos($webpack, "name: 'planning'") !== false, 'webpack must build the planning entry.');
$assert(strpos($webpack, "request === '@wordpress/i18n' ? ['wp', 'i18n']") !== false, 'Planning must keep wp.i18n external.');
foreach (['@wordpress/element', '@wordpress/components'] as $forbidden) {
    $assert(strpos($entry, $forbidden) === false, "The planning entry must not import {$forbidden}.");
}

// The legacy admin app no longer renders Planning at all.
$assert(strpos($index, 'PlanningApp') === false && strpos($index, './planning') === false, 'The legacy admin bundle must not include Planning.');

echo "Byline Planning bundle regression passed.\n";
