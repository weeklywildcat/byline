<?php

/**
 * Quick View must remain one protected, lazy aggregate rather than becoming a
 * second public story API or a collection of unbounded private requests.
 */

$route = file_get_contents(__DIR__ . '/../includes/editorial/quick-view.php');
$planning = file_get_contents(__DIR__ . '/../src/planning/PlanningApp.tsx');
$api = file_get_contents(__DIR__ . '/../src/planning/planning-api.ts');

$assert = static function ($condition, string $message): void {
    if (!$condition) {
        fwrite(STDERR, $message . "\n");
        exit(1);
    }
};

foreach ([$route, $planning, $api] as $source) {
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

foreach ([
    'const [quickViewStoryId, setQuickViewStoryId]',
    '<StoryQuickView',
    'getStoryQuickView',
    'handleUpdateStory',
    'setStories((items) => items.map',
] as $needle) {
    $assert(strpos($planning . $api, $needle) !== false, "Quick View client contract missing: {$needle}");
}

echo "Story Quick View regression checks passed.\n";
