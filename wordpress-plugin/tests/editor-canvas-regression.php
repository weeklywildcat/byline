<?php

define('ABSPATH', __DIR__ . '/../');

$canvas_test = ['actions' => [], 'scripts' => [], 'styles' => [], 'admin' => true];

class WP_Screen
{
    public function __construct(public string $base, public string $post_type, private bool $block_editor = true) {}
    public function is_block_editor(): bool { return $this->block_editor; }
}

$canvas_screen = null;
function get_current_screen() { global $canvas_screen; return $canvas_screen; }
function is_admin(): bool { global $canvas_test; return $canvas_test['admin']; }
function add_action(string $hook, $callback, ...$args): void { global $canvas_test; $canvas_test['actions'][$hook][] = $callback; }
function plugins_url(string $path, string $plugin_file): string { return 'https://example.test/' . $path; }
function wp_enqueue_script($handle, $src, $deps = [], $version = null, $in_footer = false): void { global $canvas_test; $canvas_test['scripts'][] = [$handle, $src]; }
function wp_enqueue_style($handle, $src, $deps = [], $version = null): void { global $canvas_test; $canvas_test['styles'][] = [$handle, $src]; }

function canvas_assert(bool $condition, string $message): void
{
    if (!$condition) {
        fwrite(STDERR, $message . "\n");
        exit(1);
    }
}

require __DIR__ . '/../includes/content/editor-canvas.php';

canvas_assert(in_array('byline_enqueue_editor_canvas_script', $canvas_test['actions']['enqueue_block_editor_assets'] ?? [], true), 'The canvas script must load with the block editor.');
canvas_assert(in_array('byline_enqueue_editor_canvas_style', $canvas_test['actions']['enqueue_block_assets'] ?? [], true), 'The canvas stylesheet must use enqueue_block_assets so it reaches the editor iframe.');

$build = __DIR__ . '/../build';
$created = [];
foreach (['editor-canvas.asset.php' => "<?php return ['dependencies' => ['wp-data'], 'version' => 'test'];", 'editor-canvas.js' => '', 'editor-canvas.css' => ''] as $file => $contents) {
    if (!file_exists($build . '/' . $file)) {
        @mkdir($build, 0777, true);
        file_put_contents($build . '/' . $file, $contents);
        $created[] = $build . '/' . $file;
    }
}

$cases = [
    'a Post in the block editor' => [new WP_Screen('post', 'post'), true],
    'a Page' => [new WP_Screen('post', 'page'), false],
    'a Byline legacy post type' => [new WP_Screen('post', 'ww_game'), false],
    'a Post in the classic editor' => [new WP_Screen('post', 'post', false), false],
    'the Posts list' => [new WP_Screen('edit', 'post'), false],
];
foreach ($cases as $label => [$screen, $applies]) {
    $canvas_screen = $screen;
    canvas_assert(byline_editor_canvas_screen_applies() === $applies, "Canvas screen check is wrong for {$label}.");
    $canvas_test['scripts'] = [];
    $canvas_test['styles'] = [];
    byline_enqueue_editor_canvas_script();
    byline_enqueue_editor_canvas_style();
    canvas_assert(count($canvas_test['scripts']) === ($applies ? 1 : 0), "Canvas script enqueue is wrong for {$label}.");
    canvas_assert(count($canvas_test['styles']) === ($applies ? 1 : 0), "Canvas style enqueue is wrong for {$label}.");
}

$canvas_screen = new WP_Screen('post', 'post');
$canvas_test['admin'] = false;
$canvas_test['styles'] = [];
byline_enqueue_editor_canvas_style();
canvas_assert($canvas_test['styles'] === [], 'The canvas stylesheet must never load on the public front end.');

foreach ($created as $file) {
    unlink($file);
}

echo "Byline editor canvas regression passed.\n";
