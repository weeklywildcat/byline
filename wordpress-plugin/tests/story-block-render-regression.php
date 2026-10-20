<?php

// Story blocks at render time: credits come from the attachment as it is now,
// credits baked in by 0.3.24 are replaced, and unfinished blocks print nothing.
define('ABSPATH', __DIR__ . '/../');

$story_filters = [];
function add_filter(string $hook, $callback, int $priority = 10, int $accepted_args = 1): void
{
    global $story_filters;
    $story_filters[$hook][] = [$callback, $priority, $accepted_args];
}
function add_action(string $hook, $callback, int $priority = 10, int $accepted_args = 1): void { add_filter($hook, $callback, $priority, $accepted_args); }
function esc_html(string $value): string { return htmlspecialchars($value, ENT_QUOTES, 'UTF-8'); }
function wp_strip_all_tags(string $value): string { return trim(strip_tags($value)); }
function byline_photo_credit_for_attachment(int $id): string { return [10 => 'Jamal Whitfield', 11 => 'Maya Okafor', 12 => 'Jamal Whitfield'][$id] ?? ''; }

function story_assert(bool $condition, string $message): void
{
    if (!$condition) {
        fwrite(STDERR, $message . "\n");
        exit(1);
    }
}

require __DIR__ . '/../includes/content/story-blocks.php';

foreach (['annotated-image', 'before-after', 'scrolly-step', 'timeline', 'visualization'] as $slug) {
    story_assert(isset($story_filters['render_block_byline/' . $slug]), "The $slug block must be filtered at render time.");
}

$fixtures = __DIR__ . '/../../tests/fixtures/storytelling/';

// Annotated Image: the 0.3.24 snapshot ("Photo: Photo courtesy of ...") is replaced by the current credit, after the caption.
$annotated = '<figure class="wp-block-byline-annotated-image alignwide byline-annotated-image"><div class="byline-annotation-layout"><div class="byline-annotation-canvas"><img src="a.jpg" alt="" class="wp-image-10"/></div><ol class="byline-annotations"></ol></div><figcaption>The room.<p>Photo: Photo courtesy of the Wildcat Yearbook</p></figcaption></figure>';
$out = byline_story_render_annotated_image($annotated);
story_assert(strpos($out, 'Photo: Photo courtesy') === false, 'A credit baked into saved markup must not survive.');
story_assert(strpos($out, 'The room.<p class="photo-credit">Photo: Jamal Whitfield</p></figcaption>') !== false, 'The current attachment credit follows the caption.');
story_assert(substr_count($out, '<figcaption') === 1, 'A captioned figure keeps one caption.');
// Idempotent: rendering the already-rendered markup does not stack credits.
story_assert(substr_count(byline_story_render_annotated_image($out), 'Photo: Jamal Whitfield') === 1, 'Credits must not duplicate on a second pass.');
// A credit-only figure gets a caption; an uncredited one gets none.
$bare = str_replace('<figcaption>The room.<p>Photo: Photo courtesy of the Wildcat Yearbook</p></figcaption>', '', $annotated);
story_assert(strpos(byline_story_render_annotated_image($bare), '<figcaption class="wp-element-caption byline-photo-credit-only"><p class="photo-credit">Photo: Jamal Whitfield</p></figcaption>') !== false, 'A credit-only caption is created.');
story_assert(strpos(byline_story_render_annotated_image(str_replace('wp-image-10', 'wp-image-99', $bare)), 'figcaption') === false, 'An uncredited photograph prints no caption.');
// Nothing to show yet: no photograph.
story_assert(byline_story_render_annotated_image('<figure class="byline-annotated-image"><p>Annotated image pending.</p></figure>') === '', 'An annotated image without a photograph prints nothing.');

// Before / After: one line when one photographer, labelled when two; unfinished comparisons print nothing.
$pair = static fn(int $a, int $b): string => '<figure class="byline-before-after"><div class="byline-comparison-images"><div class="byline-comparison-image"><strong data-before="true">2019</strong><img src="a.jpg" alt="" class="wp-image-' . $a . '"/></div><div class="byline-comparison-image"><strong data-after="true">2026</strong><img src="b.jpg" alt="" class="wp-image-' . $b . '"/></div></div><figcaption>Same room.<p>2019 photo: Jamal Whitfield</p><p>2026 photo: Maya Okafor</p></figcaption></figure>';
story_assert(strpos(byline_story_render_before_after($pair(10, 12)), '<p class="photo-credit">Photo: Jamal Whitfield</p>') !== false, 'One photographer is credited once.');
story_assert(strpos(byline_story_render_before_after($pair(10, 11)), 'Photo: Jamal Whitfield (2019), Maya Okafor (2026)') !== false, 'Two photographers are credited with their labels.');
story_assert(strpos(byline_story_render_before_after($pair(10, 11)), '2019 photo:') === false, 'The old per-label lines are gone.');
story_assert(byline_story_render_before_after('<figure class="byline-before-after"><p>Choose both photographs to complete this comparison.</p><div class="byline-comparison-images"><div class="byline-comparison-image"><img src="a.jpg" class="wp-image-10"/></div></div></figure>') === '', 'A comparison with one photograph prints nothing.');

// Timeline: stubs and empty events drop out; an empty timeline prints nothing.
$timeline = '<ol class="wp-block-byline-timeline byline-timeline"><li class="byline-timeline-item"></li><li class="byline-timeline-item"><p class="byline-timeline-label">Only a label</p></li><li class="byline-timeline-item"><p class="byline-timeline-label">Oct. 8</p><h3 class="byline-timeline-title">Meeting</h3></li></ol>';
$out = byline_story_render_timeline($timeline);
story_assert(substr_count($out, 'byline-timeline-item') === 1 && strpos($out, 'Meeting') !== false, 'Only complete events remain.');
story_assert(byline_story_render_timeline('<ol class="byline-timeline"><li class="byline-timeline-item"></li></ol>') === '', 'An empty timeline prints nothing.');

// Visualization: an unusable embed publishes as its graphic; with nothing at all it prints nothing.
$viz = '<figure class="byline-visualization" data-mode="embed" data-height="standard"><div class="byline-visualization-media"><div class="byline-visualization-fallback-image"><img src="a.jpg" alt="" class="wp-image-10"/></div></div></figure>';
story_assert(strpos(byline_story_render_visualization($viz), 'data-mode="static"') !== false, 'An unsupported embed address falls back to the static graphic.');
story_assert(byline_story_render_visualization('<figure class="byline-visualization" data-mode="embed"><div class="byline-visualization-media"><div class="byline-visualization-fallback-image"></div></div></figure>') === '', 'A visualization with nothing to show prints nothing.');
story_assert(strpos(byline_story_render_visualization('<figure class="byline-visualization" data-mode="embed" data-src="https://datawrapper.dwcdn.net/AbCdE/"><div class="byline-visualization-media"><div class="byline-visualization-fallback-image"></div></div></figure>'), 'data-mode="embed"') !== false, 'A supported embed without a fallback graphic still publishes.');

// The reported article: every legacy credit in the saved corpus is replaced.
$corpus = (string) file_get_contents($fixtures . 'legacy-0.3.24-lunch-squeeze.html');
story_assert(strpos($corpus, '<p>Photo: Photo courtesy of the Wildcat Yearbook</p>') !== false, 'The corpus holds the legacy baked credit.');

echo "story block render ok\n";
