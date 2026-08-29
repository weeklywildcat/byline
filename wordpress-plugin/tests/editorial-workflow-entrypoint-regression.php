<?php
/**
 * Focused regression checks for the block-editor newsroom panel integration.
 *
 * This intentionally inspects the source contract rather than booting React:
 * the browser bundle is covered by the plugin typecheck/build, while these
 * assertions protect the entrypoint from silently losing a panel or route.
 */

$entrypoint = file_get_contents(__DIR__ . '/../src/editorial-workflow.tsx');
$styles = file_get_contents(__DIR__ . '/../src/editorial-workflow.css');
$rest = file_get_contents(__DIR__ . '/../includes/editorial/rest.php');

if (!is_string($entrypoint) || !is_string($styles) || !is_string($rest)) {
    fwrite(STDERR, "Could not read the editorial entrypoint, styles, or REST adapter.\n");
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
    "import { TasksPanel }",
    "Panel, PanelBody",
    "import * as editorModule from '@wordpress/editor';",
    '<EditorialNewsroomPanels',
    '<WorkflowControls key={postId}',
    'function PrePublishReadinessPanel',
    'function PostPublishLifecycle',
    'PluginPrePublishPanel',
    'PluginPostPublishPanel',
    "const sidebarTitle = __('Story'",
    '${storyPath(postId)}/bootstrap',
    'initialOpen={true}',
    'initialOpen={false}',
    'className="byline-editorial-sidebar"',
    'onToggle',
    "body.plannedPublishAt = body.plannedPublication",
    "body.text = body.publicText",
] as $needle) {
    $assert(strpos($entrypoint, $needle) !== false, "Entrypoint contract missing: {$needle}");
}

$assert(substr_count($entrypoint, '<WorkflowControls') === 1, 'The editor entrypoint renders more than one workflow controls surface.');
$assert(strpos($entrypoint, '<WorkflowPanel') === false, 'The legacy duplicate WorkflowPanel is still mounted.');
$assert(strpos($entrypoint, 'client.getWorkflow') === false, 'A secondary panel still issues a duplicate workflow request.');
$assert(strpos($entrypoint, 'Workflow: %s') === false, 'The sidebar title still exposes a dynamic workflow label.');

// PluginSidebar registers its own More-menu entry. Rendering
// PluginSidebarMoreMenuItem as well puts two identical "Story" items in that
// menu, so exactly one registration must exist.
$assert(substr_count($entrypoint, '<PluginSidebar') === 1, 'The editor entrypoint registers more than one Story sidebar.');
$assert(strpos($entrypoint, '<PluginSidebarMoreMenuItem') === false, 'A duplicate Story entry is still registered in the editor More menu.');
$assert(strpos($entrypoint, '<PluginPostStatusInfo') !== false, 'The Workflow summary row was dropped from the WordPress Summary panel.');

// Every protected workflow mutation has to travel through the one serialized,
// revision-aware queue. A second ad-hoc queue is what let a Stage change and a
// Visual Notes autosave send the same expected revision.
$assert(strpos($entrypoint, 'createWorkflowMutationQueue') !== false, 'The workflow sidebar no longer uses the serialized mutation queue.');
$assert(strpos($entrypoint, 'createSerializedWorkflowSaveQueue') === false, 'A second, unrelated workflow save queue was reintroduced.');
$assert(substr_count($entrypoint, "method: 'POST', data:") === 1, 'More than one code path posts directly to the protected story endpoint.');
$assert(strpos($entrypoint, 'const busy = isLoading;') !== false, 'A workflow save in flight is disabling the controls again; editors must be able to keep typing.');
$assert(strpos($entrypoint, 'hasConflict') !== false, 'The sidebar no longer surfaces a real revision conflict as a reload state.');

// Discord is optional, and the three states it can be in are distinguishable.
$assert(strpos($entrypoint, 'workflowDiscordState') !== false, 'The Discussion panel no longer distinguishes Discord configuration from a linked thread.');
$assert(strpos($entrypoint, "discordState !== 'not-configured'") !== false, 'An unconfigured Discord integration is no longer hidden from the article sidebar.');

// A published story with no deploy target is neither live nor a build failure.
$assert(strpos($entrypoint, "'needs-configuration'") !== false, 'The post-publish lifecycle lost the needs-configuration website state.');

foreach ([
    '.byline-editorial-sidebar',
    '.byline-story-summary',
    '.byline-prepublish-readiness',
    '.byline-postpublish-lifecycle',
    // The sidebar is about 280px wide. These are the rules that keep it to one
    // scrolling axis and stop a busy indicator from shifting the layout.
    'repeat(auto-fit, minmax(min(100%, 132px), 1fr))',
    "input[type='date']",
    'white-space: normal;',
    'overflow-wrap: anywhere;',
    'min-height: 30px;',
    '@container (max-width: 300px)',
] as $needle) {
    $assert(strpos($styles, $needle) !== false, "Sidebar style contract missing: {$needle}");
}

$assert(strpos($styles, 'container-type: inline-size') !== false, 'The Story panel is no longer a query container, so its narrow layout cannot respond to the sidebar width.');

foreach ([
    "/editorial/stories/(?P<id>\\d+)/tasks",
    "/editorial/stories/(?P<id>\\d+)/corrections/(?P<correctionId>\\d+)",
    "/editorial/stories/(?P<id>\\d+)/distribution",
    "byline_editorial_rest_story_tasks",
    "byline_editorial_rest_story_correction_payload",
    "byline_editorial_rest_story_distribution_payload",
    "byline_editorial_rest_permission",
    // The protected bootstrap has to carry enough Discord state for the client
    // to tell "not configured" from "configured, no thread yet".
    "byline_editorial_rest_discord_context",
    "'configured' => byline_editorial_rest_discord_configured(",
    "'canCreateThread' => false",
    // A grouped update either applies completely or leaves nothing behind.
    "byline_editorial_partial_update",
] as $needle) {
    $assert(strpos($rest, $needle) !== false, "REST adapter contract missing: {$needle}");
}

foreach (['botToken', 'clientSecret', 'bridgeSecret', 'hookUrl'] as $secret) {
    $assert(strpos($rest, $secret) === false, "The editorial REST adapter must never reference the {$secret} credential.");
}

echo "Editorial workflow entrypoint regression checks passed.\n";
