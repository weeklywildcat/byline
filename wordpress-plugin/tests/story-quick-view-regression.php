<?php

/**
 * The Quick View REST aggregate stays as a protected, lazy compatibility route
 * (it must not become a second public story API). The admin no longer has a
 * Quick View of its own: every Planning screen opens the one Story Peek, which
 * reads the Story Workspace read model.
 */

$route = file_get_contents(__DIR__ . '/../includes/editorial/quick-view.php');
$planning = file_get_contents(__DIR__ . '/../src/planning/PlanningApp.tsx');
$peek = file_get_contents(__DIR__ . '/../src/story/StoryPeek.tsx');
$api = file_get_contents(__DIR__ . '/../src/planning/planning-api.ts');

$assert = static function ($condition, string $message): void {
    if (!$condition) {
        fwrite(STDERR, $message . "\n");
        exit(1);
    }
};

foreach ([$route, $planning, $peek, $api] as $source) {
    $assert(is_string($source), 'Could not read the Story Quick View contract.');
}

foreach ([
    "'/editorial/stories/(?P<id>\\d+)/quick-view'",
    "'permission_callback' => 'byline_editorial_rest_permission'",
    'byline_editorial_rest_bootstrap_payload',
    'byline_editorial_rest_task_payload',
    'byline_get_story_activity',
] as $needle) {
    $assert(strpos($route, $needle) !== false, "Quick View route contract missing: {$needle}");
}

foreach (['/wp/v2/posts', 'register_post_meta', 'current_user_can(\'read\''] as $forbidden) {
    $assert(strpos($route, $forbidden) === false, "Quick View route must not use {$forbidden}.");
}

// One Story Peek, shared by Home and Planning, reading the workspace read model.
$assert(!file_exists(__DIR__ . '/../src/planning/StoryQuickView.tsx'), 'The retired Planning Quick View component must not return.');
$assert(!file_exists(__DIR__ . '/../src/home/StoryPeek.tsx'), 'Story Peek lives in src/story, not under home/.');
$assert(strpos($planning, '<StoryPeekHost') !== false, 'Planning must mount the shared Story Peek.');
$assert(strpos($peek, "getWorkspace") !== false, 'Story Peek must read the Story Workspace read model.');
$assert(strpos($api, 'getStoryQuickView') === false && strpos($planning . $peek, 'StoryQuickView') === false, 'No client may consume the Quick View aggregate.');
foreach (glob(__DIR__ . '/../src/**/*.tsx') ?: [] as $file) {
    $assert(!preg_match('/export (?:function|const) StoryPeek\b/', (string) file_get_contents($file)) || realpath($file) === realpath(__DIR__ . '/../src/story/StoryPeek.tsx'), 'There must be exactly one StoryPeek implementation.');
}

echo "Story Quick View regression checks passed.\n";
