<?php
/**
 * Focused regression checks for the block-editor newsroom panel integration.
 *
 * This intentionally inspects the source contract rather than booting React:
 * the browser bundle is covered by the plugin typecheck/build, while these
 * assertions protect the entrypoint from silently losing a panel or route.
 */

$entrypoint = file_get_contents(__DIR__ . '/../src/editorial-workflow.tsx');
$rest = file_get_contents(__DIR__ . '/../includes/editorial/rest.php');

if (!is_string($entrypoint) || !is_string($rest)) {
    fwrite(STDERR, "Could not read the editorial entrypoint or REST adapter.\n");
    exit(1);
}

$assert = static function (bool $condition, string $message): void {
    if (!$condition) {
        fwrite(STDERR, $message . "\n");
        exit(1);
    }
};

foreach ([
    "import { CorrectionsPanel }",
    "import { ContributorsPanel }",
    "import { DistributionPanel }",
    "import { ReadinessPanel }",
    "import { TasksPanel }",
    "import { WorkflowPanel }",
    '<EditorialNewsroomPanels',
    '<WorkflowControls key={postId}',
    "body.plannedPublishAt = body.plannedPublication",
    "body.text = body.publicText",
] as $needle) {
    $assert(strpos($entrypoint, $needle) !== false, "Entrypoint contract missing: {$needle}");
}

foreach ([
    "/editorial/stories/(?P<id>\\d+)/tasks",
    "/editorial/stories/(?P<id>\\d+)/corrections/(?P<correctionId>\\d+)",
    "/editorial/stories/(?P<id>\\d+)/distribution",
    "byline_editorial_rest_story_tasks",
    "byline_editorial_rest_story_correction_payload",
    "byline_editorial_rest_story_distribution_payload",
    "byline_editorial_rest_permission",
] as $needle) {
    $assert(strpos($rest, $needle) !== false, "REST adapter contract missing: {$needle}");
}

echo "Editorial workflow entrypoint regression checks passed.\n";
