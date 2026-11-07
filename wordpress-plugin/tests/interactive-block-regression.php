<?php

// Interactive block: the render isolates the uploaded file in an allow-scripts
// sandbox without ever printing it as markup, and the save guard keeps anyone
// without unfiltered_html from adding or changing one.
define('ABSPATH', __DIR__ . '/../');

$interactive_filters = [];
$interactive_can = false;
$interactive_posts = [];
function add_filter(string $hook, $callback, int $priority = 10, int $accepted_args = 1): void
{
    global $interactive_filters;
    $interactive_filters[$hook][] = [$callback, $priority, $accepted_args];
}
function add_action(string $hook, $callback, int $priority = 10, int $accepted_args = 1): void { add_filter($hook, $callback, $priority, $accepted_args); }
function esc_html(string $value): string { return htmlspecialchars($value, ENT_QUOTES, 'UTF-8'); }
function esc_attr(string $value): string { return htmlspecialchars($value, ENT_QUOTES, 'UTF-8'); }
function wp_strip_all_tags(string $value): string { return trim(strip_tags($value)); }
function wp_unslash($value) { return stripslashes($value); }
function wp_slash($value) { return addslashes($value); }
function current_user_can(string $capability): bool { global $interactive_can; return $capability === 'unfiltered_html' && $interactive_can; }
function get_post(int $id) { global $interactive_posts; return isset($interactive_posts[$id]) ? (object) ['post_content' => $interactive_posts[$id]] : null; }

function interactive_assert(bool $condition, string $message): void
{
    if (!$condition) {
        fwrite(STDERR, $message . "\n");
        exit(1);
    }
}

require __DIR__ . '/../includes/content/interactive-block.php';

interactive_assert(isset($interactive_filters['wp_insert_post_data']), 'The save guard must filter post data.');
interactive_assert(isset($interactive_filters['enqueue_block_editor_assets']), 'The editor must be told whether to offer the block.');

$html = "<!doctype html><title>Quiz</title><p>Tom &amp; Jerry &lt;b&gt; [gallery] \"quoted\" 'single'</p><script>document.body.dataset.ready = '1';</script>";
$attributes = ['document' => base64_encode($html), 'title' => 'Find your <em>lunch</em> wave', 'description' => 'Pick a period & see "your" wait.', 'credit' => 'Weekly Wildcat staff', 'heightPreset' => 'tall', 'align' => 'wide'];
$out = byline_interactive_render($attributes);

// One iframe, sandboxed with allow-scripts and nothing else; the file never becomes page markup.
interactive_assert(substr_count($out, '<iframe') === 1, 'One frame is printed.');
interactive_assert(preg_match('/<iframe [^>]*sandbox="allow-scripts"[^>]*>/', $out) === 1, 'The frame is sandboxed with allow-scripts only.');
interactive_assert(strpos($out, 'allow-same-origin') === false && strpos($out, 'allow-top-navigation') === false && strpos($out, 'allow-popups') === false && strpos($out, 'allow-forms') === false, 'No other sandbox permission is granted.');
interactive_assert(stripos($out, '<script') === false, 'No script tag reaches the article markup.');
interactive_assert(strpos($out, '[gallery]') === false && strpos($out, '&#91;gallery]') !== false, 'Shortcode brackets inside the file are inert.');
preg_match('/ srcdoc="([^"]*)"/', $out, $srcdoc);
interactive_assert(isset($srcdoc[1]), 'The file is the frame srcdoc.');
interactive_assert(html_entity_decode($srcdoc[1], ENT_QUOTES | ENT_HTML5, 'UTF-8') === $html . BYLINE_INTERACTIVE_RESIZE_SCRIPT, 'The frame receives the file exactly, entities included, followed by the resize reporter.');
interactive_assert(strpos($srcdoc[1], 'Tom &amp;amp; Jerry &amp;lt;b&amp;gt;') !== false, 'Existing entities are escaped again, not collapsed.');
// Readers get a title, a description that names the frame, and the credit.
interactive_assert(strpos($out, '<h3 class="byline-interactive-title">Find your lunch wave</h3>') !== false, 'The title is plain text in a figure heading.');
interactive_assert(preg_match('/<p class="byline-interactive-description" id="(byline-interactive-[0-9a-f]{10})">Pick a period &amp; see &quot;your&quot; wait\.<\/p>/', $out, $described) === 1, 'The description is escaped and identified.');
interactive_assert(strpos($out, 'aria-describedby="' . $described[1] . '"') !== false, 'The frame is described by the description.');
interactive_assert(strpos($out, 'title="Find your lunch wave"') !== false, 'The frame is named by the title.');
interactive_assert(strpos($out, '<figcaption><p class="photo-credit">Credit: Weekly Wildcat staff</p></figcaption>') !== false, 'The credit is printed.');
interactive_assert(strpos($out, '<figure class="wp-block-byline-interactive byline-interactive alignwide" data-height="tall">') === 0, 'The figure carries its alignment and starting height.');
interactive_assert(strpos($out, '<noscript>') !== false, 'Readers without JavaScript are told why the frame is empty.');
interactive_assert(strpos($out, 'loading="lazy"') !== false && strpos($out, 'referrerpolicy="no-referrer"') !== false, 'The frame loads lazily and sends no referrer.');

// Defaults and unfinished blocks.
$plain = byline_interactive_render(['document' => base64_encode('<p>Hi</p>'), 'title' => 'T', 'description' => 'D', 'heightPreset' => 'giant', 'align' => 'left']);
interactive_assert(strpos($plain, 'class="wp-block-byline-interactive byline-interactive" data-height="standard"') !== false, 'Unknown heights and alignments fall back.');
interactive_assert(strpos($plain, 'figcaption') === false, 'No credit, no caption.');
foreach ([
    'no file' => ['title' => 'T', 'description' => 'D'],
    'no title' => ['document' => base64_encode('<p>Hi</p>'), 'description' => 'D'],
    'no description' => ['document' => base64_encode('<p>Hi</p>'), 'title' => 'T'],
    'not base64' => ['document' => '<script>alert(1)</script>', 'title' => 'T', 'description' => 'D'],
    'not UTF-8' => ['document' => base64_encode("<p>\xff\xfe</p>"), 'title' => 'T', 'description' => 'D'],
    'too large' => ['document' => base64_encode(str_repeat('a', BYLINE_INTERACTIVE_MAX_BYTES + 1)), 'title' => 'T', 'description' => 'D'],
    'blank file' => ['document' => base64_encode("  \n "), 'title' => 'T', 'description' => 'D'],
] as $case => $unfinished) {
    interactive_assert(byline_interactive_render($unfinished) === '', "An interactive with $case prints nothing.");
}

// The save guard.
$block = static fn(string $file, string $title = 'T'): string => '<!-- wp:byline/interactive ' . json_encode(['title' => $title, 'description' => 'D', 'document' => base64_encode($file)], JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_QUOT) . ' /-->';
$existing = $block('<p>Approved by an editor</p>');
$interactive_posts[42] = "<!-- wp:paragraph -->\n<p>Story</p>\n<!-- /wp:paragraph -->\n\n" . $existing;
$guard = static fn(string $content, array $data = [], array $postarr = ['ID' => 42]): string => wp_unslash(byline_interactive_guard_post_data(['post_content' => wp_slash($content)] + $data, $postarr)['post_content']);
$story = "<!-- wp:paragraph -->\n<p>Story with \"quotes\" and a back\\slash</p>\n<!-- /wp:paragraph -->\n\n";

interactive_assert(byline_interactive_documents($interactive_posts[42]) === [base64_encode('<p>Approved by an editor</p>')], 'Documents are read from block delimiters.');
interactive_assert($guard($story . $existing) === $story . $existing, 'An author keeps an interactive an editor already added, and the rest of the post is untouched.');
interactive_assert($guard($story . $block('<p>Approved by an editor</p>', 'Retitled')) === $story . $block('<p>Approved by an editor</p>', 'Retitled'), 'An author may retitle an approved interactive.');
interactive_assert($guard($story . $existing . $block('<script>steal()</script>')) === $story . $existing, 'An author cannot add a new interactive.');
interactive_assert($guard($story . $block('<p>Swapped</p>')) === $story, 'An author cannot swap the file of an existing one.');
interactive_assert($guard($story . $block('<p>New</p>'), [], []) === $story, 'An author cannot add one to a new post.');
interactive_assert($guard($story . $existing, ['post_type' => 'revision', 'post_parent' => 42], []) === $story . $existing, 'A revision or autosave compares with its parent post.');
interactive_assert($guard($story . $block('<p>New</p>'), ['post_type' => 'revision', 'post_parent' => 42], []) === $story, 'A revision cannot smuggle in a new file.');
interactive_assert($guard($story) === $story, 'Posts without interactives are untouched.');
$interactive_can = true;
interactive_assert($guard($story . $block('<p>New</p>'), [], []) === $story . $block('<p>New</p>'), 'An editor may add an interactive.');

// The static-site fixture holds exactly what WordPress renders for its saved block.
$fixture = json_decode((string) file_get_contents(__DIR__ . '/../../tests/fixtures/story-presentations.json'), true);
interactive_assert(preg_match(BYLINE_INTERACTIVE_DELIMITER, $fixture['saved'], $saved) === 1, 'The article fixture has an Interactive block.');
$fixture_attributes = json_decode($saved[1], true) + ['align' => 'wide'];
interactive_assert(strpos($fixture['rendered'], byline_interactive_render($fixture_attributes)) !== false, 'The fixture rendering matches the PHP renderer.');

fwrite(STDOUT, "Interactive block regression passed.\n");
