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
function wp_get_attachment_metadata(int $id) { return [10 => ['width' => 1600, 'height' => 1067], 11 => ['width' => 1600, 'height' => 615], 12 => ['width' => 1600, 'height' => 1067], 13 => ['width' => 1600, 'height' => 2000]][$id] ?? false; }
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
// Comparisons saved before the crop/contain choice (no data-fit) always showed both photographs complete: keep that for different shapes only.
story_assert(strpos(byline_story_render_before_after($pair(10, 13)), '<figure data-fit="contain" class="byline-before-after">') !== false, 'Older comparison of different shapes stays complete.');
story_assert(strpos(byline_story_render_before_after($pair(10, 12)), 'data-fit') === false, 'Older comparison of the same shape is left alone.');
story_assert(strpos(byline_story_render_before_after($pair(10, 11)), 'data-fit="contain"') !== false, 'A panorama against a landscape differs by more than 12%.');
story_assert(strpos(byline_story_render_before_after($pair(10, 99)), 'data-fit') === false, 'A photograph WordPress has no dimensions for is left alone.');
$chosen = str_replace('<figure class="byline-before-after">', '<figure class="byline-before-after" data-fit="cover">', $pair(10, 13));
story_assert(substr_count(byline_story_render_before_after($chosen), 'data-fit') === 1 && strpos(byline_story_render_before_after($chosen), 'data-fit="cover"') !== false, 'An explicit crop choice is never overridden.');
story_assert(substr_count(byline_story_render_before_after(byline_story_render_before_after($pair(10, 13))), 'data-fit') === 1, 'The fit is not added twice on a second pass.');
// A comparison saved by the redesigned block credits the same way and prints no instruction.
$slim = '<figure class="byline-before-after" data-fit="cover"><div class="byline-comparison-images" style="--comparison-aspect:1.5"><div class="byline-comparison-image"><strong data-before="true">Before</strong><img src="a.jpg" alt="" class="wp-image-10"/></div><div class="byline-comparison-image"><strong data-after="true">After</strong><img src="b.jpg" alt="" class="wp-image-11"/></div></div><figcaption>Same room.</figcaption></figure>';
story_assert(strpos(byline_story_render_before_after($slim), 'Same room.<p class="photo-credit">Photo: Jamal Whitfield (Before), Maya Okafor (After)</p></figcaption>') !== false, 'The redesigned comparison is credited after its caption.');
// The redesigned annotated image has no instruction paragraph and no baked-in credit; its credit follows the caption.
$slim_annotated = '<figure class="byline-annotated-image"><div class="byline-annotation-layout"><div class="byline-annotation-canvas"><img src="a.jpg" alt="" class="wp-image-10"/><a class="byline-annotation-marker" href="#annotation-a">1</a></div><ol class="byline-annotations" role="list"><li id="annotation-a" tabindex="0"><h3>Entrance</h3></li></ol></div><figcaption>The room.</figcaption></figure>';
story_assert(strpos(byline_story_render_annotated_image($slim_annotated), 'The room.<p class="photo-credit">Photo: Jamal Whitfield</p></figcaption>') !== false, 'The redesigned annotated image is credited after its caption.');
story_assert(byline_story_render_annotated_image('<figure class="wp-block-byline-annotated-image byline-annotated-image"></figure>') === '', 'An annotated image with no photograph prints nothing.');
story_assert(strpos(byline_story_render_annotated_image($annotated), '<ol class="byline-annotations" role="list">') !== false, 'Older annotation lists get an explicit list role.');
story_assert(substr_count(byline_story_render_annotated_image($slim_annotated), 'role="list"') === 1, 'A list that already has its role is not given a second one.');

// Timeline: stubs and empty events drop out; an empty timeline prints nothing.
$timeline = '<ol class="wp-block-byline-timeline byline-timeline"><li class="byline-timeline-item"></li><li class="byline-timeline-item"><p class="byline-timeline-label">Only a label</p></li><li class="byline-timeline-item"><p class="byline-timeline-label">Oct. 8</p><h3 class="byline-timeline-title">Meeting</h3></li></ol>';
$out = byline_story_render_timeline($timeline);
story_assert(substr_count($out, 'byline-timeline-item') === 1 && strpos($out, 'Meeting') !== false, 'Only complete events remain.');
story_assert(byline_story_render_timeline('<ol class="byline-timeline"><li class="byline-timeline-item"></li></ol>') === '', 'An empty timeline prints nothing.');
// The first event naming a new year starts a period; undated and same-year events do not; a latest event keeps its class.
$event = static fn(string $label, string $title, string $extra = ''): string => '<li class="byline-timeline-item' . $extra . '">' . ($label !== '' ? '<p class="byline-timeline-label">' . $label . '</p>' : '') . '<h3 class="byline-timeline-title">' . $title . '</h3></li>';
$out = byline_story_render_timeline('<ol class="byline-timeline">' . $event('Fall 2026', 'A') . $event('Oct. 8', 'B') . $event('Jan. 5, 2027', 'C') . $event('Mar. 2027', 'D') . $event('', 'E') . $event('Spring 2028', 'F', ' is-current') . '</ol>');
story_assert(substr_count($out, 'is-new-period') === 2, 'Only the 2027 and 2028 events begin a new period.');
story_assert(strpos($out, '<li class="byline-timeline-item is-new-period"><p class="byline-timeline-label">Jan. 5, 2027</p>') !== false, 'The first 2027 event is marked.');
story_assert(strpos($out, '<li class="byline-timeline-item is-current is-new-period"><p class="byline-timeline-label">Spring 2028') !== false, 'A latest event can also begin a period.');
story_assert(substr_count(byline_story_render_timeline($out), 'is-new-period') === 2, 'Marking is idempotent.');
story_assert(strpos(byline_story_render_timeline('<ol class="byline-timeline">' . $event('Fall 2026', 'A') . '<li class="byline-timeline-item"><p class="byline-timeline-label">2027</p></li>' . $event('Fall 2027', 'B') . '</ol>'), 'is-new-period') !== false, 'A dropped stub does not hide the change of year.');

// Visualization: an unusable embed publishes as its graphic; with nothing at all it prints nothing.
$viz = '<figure class="byline-visualization" data-mode="embed" data-height="standard"><div class="byline-visualization-media"><div class="byline-visualization-fallback-image"><img src="a.jpg" alt="" class="wp-image-10"/></div></div></figure>';
story_assert(strpos(byline_story_render_visualization($viz), 'data-mode="static"') !== false, 'An unsupported embed address falls back to the static graphic.');
story_assert(byline_story_render_visualization('<figure class="byline-visualization" data-mode="embed"><div class="byline-visualization-media"><div class="byline-visualization-fallback-image"></div></div></figure>') === '', 'A visualization with nothing to show prints nothing.');
story_assert(strpos(byline_story_render_visualization('<figure class="byline-visualization" data-mode="embed" data-src="https://datawrapper.dwcdn.net/AbCdE/"><div class="byline-visualization-media"><div class="byline-visualization-fallback-image"></div></div></figure>'), 'data-mode="embed"') !== false, 'A supported embed without a fallback graphic still publishes.');
// A graphic from the media library prints its credit; one typed in the block (or baked in by 0.3.24) is not repeated.
$graphic = '<figure class="byline-visualization" data-mode="static"><div class="byline-visualization-media"><div class="byline-visualization-fallback-image"><img src="a.jpg" alt="" width="1600" height="615" class="wp-image-11"/></div></div></figure>';
$out = byline_story_render_visualization($graphic);
story_assert(strpos($out, '<figcaption class="wp-element-caption byline-photo-credit-only"><p class="photo-credit">Credit: Maya Okafor</p></figcaption>') !== false, 'A graphic with a media-library credit is credited.');
story_assert(substr_count(byline_story_render_visualization($out), 'Maya Okafor') === 1, 'The credit does not stack on a second pass.');
$typed = str_replace('</figure>', '<figcaption><p class="byline-visualization-source">Source: District</p><p class="photo-credit">Credit: Weekly Wildcat staff</p></figcaption></figure>', $graphic);
story_assert(strpos(byline_story_render_visualization($typed), 'Maya Okafor') === false, 'A credit typed in the block replaces the attachment credit.');
story_assert(strpos(byline_story_render_visualization(str_replace('wp-image-11', 'wp-image-99', $graphic)), 'figcaption') === false, 'A graphic with no credit prints no caption.');

// The reported article: every legacy credit in the saved corpus is replaced.
$corpus = (string) file_get_contents($fixtures . 'legacy-0.3.24-lunch-squeeze.html');
story_assert(strpos($corpus, '<p>Photo: Photo courtesy of the Wildcat Yearbook</p>') !== false, 'The corpus holds the legacy baked credit.');

echo "story block render ok\n";
