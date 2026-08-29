<?php

/**
 * The article preview is an authenticated admin surface, not a public draft
 * endpoint. These source contracts protect that boundary and the editor launch
 * path while the browser bundle itself is covered by the plugin build.
 */

$preview = file_get_contents(__DIR__ . '/../includes/editorial/preview.php');
$admin = file_get_contents(__DIR__ . '/../includes/editorial/admin.php');
$entrypoint = file_get_contents(__DIR__ . '/../src/editorial-workflow.tsx');
$main = file_get_contents(__DIR__ . '/../weekly-wildcat-headless.php');
$packager = file_get_contents(__DIR__ . '/../../scripts/package-plugin.sh');

$assert = static function ($condition, string $message): void {
    if (!$condition) {
        fwrite(STDERR, $message . "\n");
        exit(1);
    }
};

foreach ([$preview, $admin, $entrypoint, $main, $packager] as $source) {
    $assert(is_string($source), 'Could not read the article preview source contract.');
}

foreach ([
    "const BYLINE_EDITORIAL_PREVIEW_PAGE = 'byline-article-preview';",
    'current_user_can(\'edit_post\', $post_id)',
    "add_submenu_page(\n        null",
    "add_action('admin_enqueue_scripts', 'byline_editorial_preview_enqueue_assets', 20)",
    '\'model\' => byline_editorial_preview_can_view($post_id) ? byline_editorial_preview_presentation($post_id) : null',
    "echo '<meta name=\"robots\" content=\"noindex, nofollow\">';",
    'apply_filters(\'the_content\'',
] as $needle) {
    $assert(strpos($preview, $needle) !== false, "Preview contract missing: {$needle}");
}

foreach ([
    'register_rest_route',
    'template_redirect',
    'byline_publish_',
    'byline_deploy_',
] as $forbidden) {
    $assert(strpos($preview, $forbidden) === false, "Preview must not expose or trigger {$forbidden}.");
}

foreach ([
    "require_once __DIR__ . '/includes/editorial/preview.php';",
    "'previewUrl' => function_exists('byline_editorial_preview_page_url')",
] as $needle) {
    $assert(strpos($main . $admin, $needle) !== false, "Preview bootstrap contract missing: {$needle}");
}

foreach ([
    '<StoryPreviewLaunch postId={postId}',
    'await savePost?.();',
    'window.open(previewUrl.toString(), \'_blank\', \'noopener,noreferrer\')',
    'Preview as Byline',
    'Publishing and deployment actions are disabled there.',
] as $needle) {
    $assert(strpos($entrypoint, $needle) !== false, "Editor preview launch contract missing: {$needle}");
}

foreach ([
    'build/article-preview.js',
    'build/article-preview.asset.php',
    'build/article-preview.css',
] as $needle) {
    $assert(strpos($packager, $needle) !== false, "Plugin package contract missing: {$needle}");
}

echo "Editorial preview regression checks passed.\n";
