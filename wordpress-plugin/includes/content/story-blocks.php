<?php
/** Story-specific rendering. Gutenberg remains the canonical content tree. */
if (!defined('ABSPATH')) { exit; }

/** Invalid/duplicate anchors are deliberately excluded, never invented at render time. */
function byline_story_heading_entries(array $blocks, int $max_level = 3): array
{
    $entries = [];
    $anchors = [];
    $walk = static function (array $nodes) use (&$walk, &$entries, &$anchors, $max_level): void {
        foreach ($nodes as $node) {
            $attrs = is_array($node['attrs'] ?? null) ? $node['attrs'] : [];
            $attribute_anchor = is_string($attrs['anchor'] ?? null) ? $attrs['anchor'] : '';
            $html = (string) ($node['innerHTML'] ?? '');
            // Core 6.6 sources anchor from the saved HTML; newer Core may also
            // persist it in comment attrs. Count actual IDs across all blocks.
            preg_match_all('/<[a-z][^>]*\sid\s*=\s*["\']([^"\']+)["\']/i', $html, $id_matches);
            $node_ids = array_map(static fn(string $id): string => html_entity_decode($id, ENT_QUOTES | ENT_HTML5, 'UTF-8'), $id_matches[1]);
            if ($attribute_anchor !== '' && !in_array($attribute_anchor, $node_ids, true)) { $node_ids[] = $attribute_anchor; }
            foreach ($node_ids as $node_id) { $anchors[$node_id] = ($anchors[$node_id] ?? 0) + 1; }
            if (($node['blockName'] ?? '') === 'core/heading') {
                $level = (int) ($attrs['level'] ?? 2);
                $text = trim(html_entity_decode(strip_tags($html), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
                // Verify the native heading really contains that exact ID.
                $id = '';
                if (preg_match('/<h[23]\b[^>]*\sid\s*=\s*["\']([^"\']+)["\']/i', $html, $match)) {
                    $id = html_entity_decode($match[1], ENT_QUOTES | ENT_HTML5, 'UTF-8');
                }
                $anchor = $attribute_anchor !== '' ? $attribute_anchor : $id;
                if ($level >= 2 && $level <= min(3, $max_level) && $text !== '' && $id === $anchor && preg_match('/^[\p{L}\p{N}_][\p{L}\p{N}_.:-]*$/u', $anchor)) {
                    $entries[] = ['anchor' => $anchor, 'text' => $text, 'level' => $level];
                }
            }
            if (is_array($node['innerBlocks'] ?? null)) { $walk($node['innerBlocks']); }
        }
    };
    $walk($blocks);
    return array_values(array_filter($entries, static fn(array $entry): bool => $anchors[$entry['anchor']] === 1));
}

function byline_newsroom_render_table_of_contents(array $attributes = [], string $content = '', $block = null): string
{
    $post = get_post(byline_newsroom_block_post_id($block));
    if (!$post || !function_exists('parse_blocks')) { return ''; }
    $max_level = (int) ($attributes['maxLevel'] ?? 3) === 2 ? 2 : 3;
    $entries = byline_story_heading_entries(parse_blocks((string) $post->post_content), $max_level);
    if (count($entries) < 2) { return ''; }
    $title = byline_newsroom_attr_string($attributes, 'title', 'In this story');
    $title = $title !== '' ? $title : 'In this story';
    $tag = !empty($attributes['ordered']) ? 'ol' : 'ul';
    $items = '';
    foreach ($entries as $entry) {
        $items .= '<li class="byline-toc-level-' . (int) $entry['level'] . '"><a href="#' . esc_attr($entry['anchor']) . '">' . esc_html($entry['text']) . '</a></li>';
    }
    return '<nav class="byline-table-of-contents" aria-label="' . esc_attr($title) . '"><h2>' . esc_html($title) . '</h2><' . $tag . '>' . $items . '</' . $tag . '></nav>';
}

/** Public-safe attachment snapshot using the canonical Byline credit resolver. */
function byline_story_register_media_field(): void
{
    register_rest_field('attachment', 'byline_story_image', [
        'get_callback' => static function (array $attachment): array {
            $id = (int) ($attachment['id'] ?? 0);
            $srcset = wp_get_attachment_image_srcset($id, 'full');
            $sizes = wp_get_attachment_image_sizes($id, 'full');
            return [
                'srcSet' => is_string($srcset) ? $srcset : '',
                'sizes' => is_string($sizes) ? $sizes : '',
                'credit' => byline_story_credit($id),
            ];
        },
        'schema' => ['type' => 'object', 'readonly' => true, 'context' => ['view', 'edit']],
    ]);
}
add_action('rest_api_init', 'byline_story_register_media_field');

function byline_story_patterns(): array
{
    $paragraph = 'byline_newsroom_paragraph';
    $heading = 'byline_newsroom_heading';
    $pair = static function (string $left, string $right) use ($paragraph, $heading): string {
        return byline_newsroom_columns(
            byline_newsroom_column($heading($left, 3) . $paragraph('Add verified reporting and the sources behind it.')) .
            byline_newsroom_column($heading($right, 3) . $paragraph('Explain the other perspective or what remains uncertain.')),
            ['align' => 'wide', 'className' => 'is-style-byline-comparison']
        );
    };
    $qa = '';
    for ($i = 1; $i <= 3; $i++) { $qa .= $heading('Q: Add a question', 3) . $paragraph('Add the answer, preserving the speaker’s meaning.'); }
    return [
        'byline/qa-interview' => byline_newsroom_post_pattern('Q&A / Interview', 'Editable questions and answers. Duplicate or remove any pair.', byline_newsroom_group($qa, ['className' => 'is-style-byline-qa'])),
        'byline/what-we-know' => byline_newsroom_post_pattern("What We Know / What We Don't Know", 'Separate established facts from unanswered questions.', $pair('What we know', "What we don't know")),
        'byline/pros-cons' => byline_newsroom_post_pattern('Pros / Cons', 'Compare reported benefits and drawbacks.', $pair('Pros', 'Cons')),
        'byline/three-things' => byline_newsroom_post_pattern('Three Things to Know', 'A short, editable explainer.', $heading('Three things to know') . byline_newsroom_list(['The first thing readers should know.', 'The second verified point.', 'The next development to watch.'])),
        'byline/source-highlight' => byline_newsroom_post_pattern('Source Highlight', 'A passage from the record with citation and reporting context.', byline_newsroom_group(
            $heading('From the record', 3) . byline_newsroom_block_markup('core/quote', ['className' => 'is-style-byline-source-quote'], '<blockquote class="wp-block-quote is-style-byline-source-quote">' . $paragraph('Add a passage from the source.') . '<cite>Source, document and date</cite></blockquote>') . $paragraph('Explain why this evidence matters.'), ['className' => 'is-style-byline-evidence']
        )),
        'byline/document-evidence' => byline_newsroom_post_pattern('Document Evidence', 'An evidence group with room for an existing Document Viewer or Image.', byline_newsroom_group(
            $heading('From the record', 3) . $paragraph('Insert Document Viewer or Image here and select the source document from the media library.') . $paragraph('Add the key finding or short excerpt.') . $paragraph('Explain why this evidence matters.'), ['className' => 'is-style-byline-evidence']
        )),
    ];
}

/** Focusable native scroll regions; table semantics and Core saved markup stay intact. */
function byline_story_table_scroll_region(string $html): string
{
    if (!class_exists('WP_HTML_Tag_Processor') || (strpos($html, 'is-style-byline-data-table') === false && strpos($html, 'is-style-byline-comparison-table') === false)) {
        return $html;
    }
    $tags = new WP_HTML_Tag_Processor($html);
    if ($tags->next_tag(['class_name' => 'wp-block-table'])) {
        $tags->set_attribute('tabindex', '0');
        $tags->set_attribute('aria-label', 'Table. Scroll horizontally to view all columns.');
    }
    return $tags->get_updated_html();
}
add_filter('render_block_core/table', 'byline_story_table_scroll_region');

/*
 * Story blocks at render time.
 *
 * Two jobs, both done here so the static export, REST `content.rendered` and
 * Preview as Byline agree, and saved content is never rewritten:
 *
 *  1. Credits. Photograph credits come from the attachment's current metadata
 *     through the same resolver Core images use, not from a snapshot taken when
 *     the block was last saved. Credits baked in by Byline 0.3.24 and earlier
 *     are replaced, so a corrected credit reaches old articles too.
 *  2. Unfinished blocks. A block still waiting for a photograph, a graphic or
 *     any text prints nothing to readers, instead of an editor instruction.
 */

/** Attachment IDs of the images in a rendered block, in document order. */
function byline_story_image_ids(string $html): array
{
    preg_match_all('/<img\b[^>]*\bclass="[^"]*\bwp-image-(\d+)\b/i', $html, $matches);
    return array_map('intval', $matches[1] ?? []);
}

/** Credit lines to replace: ones baked into saved markup before 0.3.25 (plain `<p>Photo: Name</p>`) and our own. */
function byline_story_strip_legacy_credit_lines(string $html): string
{
    return (string) preg_replace('#<p(?:\sclass="photo-credit")?>(?:[^<:]{0,60}\s)?photo:\s[^<]*</p>#iu', '', $html);
}

/** Add credit lines to the figure's caption, creating the caption when the figure has none. */
function byline_story_add_credit_lines(string $figure, array $credit_lines): string
{
    $lines = '';
    foreach ($credit_lines as $line) {
        if (trim($line) !== '') {
            $lines .= '<p class="photo-credit">' . esc_html($line) . '</p>';
        }
    }
    if ($lines === '') {
        return $figure;
    }
    $end = strripos($figure, '</figcaption>');
    if ($end !== false) {
        return substr_replace($figure, $lines, $end, 0);
    }
    $close = strripos($figure, '</figure>');
    return $close === false ? $figure : substr_replace($figure, '<figcaption class="wp-element-caption byline-photo-credit-only">' . $lines . '</figcaption>', $close, 0);
}

/** Remove a caption that has nothing left in it. */
function byline_story_drop_empty_caption(string $html): string
{
    return (string) preg_replace('#<figcaption\b[^>]*>\s*</figcaption>#i', '', $html);
}

/** The credit for one attachment, or an empty string. */
function byline_story_credit(int $attachment_id): string
{
    return function_exists('byline_photo_credit_for_attachment') ? byline_photo_credit_for_attachment($attachment_id) : '';
}

/**
 * Responsive candidates for a story block's photographs, from the attachment as
 * it is now. Saved markup used to carry a snapshot `srcset` and a generic
 * `sizes` ("100vw, 1600px") that made every viewport fetch the largest file and
 * went stale when sizes were regenerated. `$sizes` is the block's real layout
 * (see BYLINE_STORY_IMAGE_SIZES); update it with the CSS.
 */
function byline_story_responsive_images(string $html, string $sizes): string
{
    if (!class_exists('WP_HTML_Tag_Processor') || !function_exists('wp_get_attachment_image_srcset') || stripos($html, '<img') === false) {
        return $html;
    }
    $tags = new WP_HTML_Tag_Processor($html);
    while ($tags->next_tag('IMG')) {
        if (!preg_match('/\bwp-image-(\d+)\b/', (string) $tags->get_attribute('class'), $match)) {
            continue;
        }
        $srcset = wp_get_attachment_image_srcset((int) $match[1], 'full');
        if (is_string($srcset) && $srcset !== '') {
            $tags->set_attribute('srcset', $srcset);
            $tags->set_attribute('sizes', $sizes);
        }
    }
    return $tags->get_updated_html();
}

/** Rendered widths per block, matching packages/ui/src/newsroom/*.css. */
const BYLINE_STORY_IMAGE_SIZES = [
    'annotated-image' => '(max-width: 700px) calc(100vw - 32px), (max-width: 1072px) calc((100vw - 32px) * 0.64), 660px',
    'before-after' => '(max-width: 1072px) calc(100vw - 32px), 1040px',
    'scrolly-step' => '(max-width: 899px) calc(100vw - 32px), 560px',
    'visualization' => '(max-width: 1072px) calc(100vw - 32px), 1040px',
];

function byline_story_render_annotated_image(string $content, array $block = []): string
{
    if (stripos($content, '<img') === false) {
        return '';
    }
    $ids = byline_story_image_ids($content);
    $content = byline_story_responsive_images(byline_story_drop_empty_caption(byline_story_strip_legacy_credit_lines($content)), BYLINE_STORY_IMAGE_SIZES['annotated-image']);
    $credit = $ids ? byline_story_credit($ids[0]) : '';
    return byline_story_add_credit_lines($content, [$credit !== '' ? 'Photo: ' . $credit : '']);
}

function byline_story_render_before_after(string $content, array $block = []): string
{
    if (substr_count(strtolower($content), '<img') < 2) {
        return '';
    }
    $ids = byline_story_image_ids($content);
    preg_match_all('#<strong\b[^>]*data-(?:before|after)[^>]*>(.*?)</strong>#is', $content, $labels);
    $credits = [];
    foreach ($ids as $index => $id) {
        $credit = byline_story_credit($id);
        if ($credit !== '') {
            $credits[] = [$credit, trim(wp_strip_all_tags((string) ($labels[1][$index] ?? '')))];
        }
    }
    $line = '';
    if ($credits) {
        $unique = array_values(array_unique(array_column($credits, 0)));
        $line = count($unique) === 1
            ? 'Photo: ' . $unique[0]
            : 'Photo: ' . implode(', ', array_map(static fn(array $pair): string => $pair[1] !== '' ? $pair[0] . ' (' . $pair[1] . ')' : $pair[0], $credits));
    }
    $content = byline_story_responsive_images(byline_story_drop_empty_caption(byline_story_strip_legacy_credit_lines($content)), BYLINE_STORY_IMAGE_SIZES['before-after']);
    return byline_story_add_credit_lines($content, [$line]);
}

function byline_story_render_scrolly_step(string $content, array $block = []): string
{
    $ids = byline_story_image_ids($content);
    if (!$ids) {
        return $content;
    }
    $content = byline_story_responsive_images(byline_story_drop_empty_caption(byline_story_strip_legacy_credit_lines($content)), BYLINE_STORY_IMAGE_SIZES['scrolly-step']);
    $credit = byline_story_credit($ids[0]);
    return (string) preg_replace_callback('#<figure\b[^>]*\bbyline-scrolly-media\b[^>]*>.*?</figure>#is', static fn(array $match): string => byline_story_add_credit_lines($match[0], [$credit !== '' ? 'Photo: ' . $credit : '']), $content, 1);
}

function byline_story_render_timeline(string $content, array $block = []): string
{
    // An event needs a title or reporting; a date label alone is a stub.
    $content = (string) preg_replace_callback('#<li\b[^>]*\bbyline-timeline-item\b[^>]*>(.*?)</li>#is', static function (array $match): string {
        return preg_match('#byline-timeline-(?:title|body)#', $match[1]) && trim(wp_strip_all_tags((string) preg_replace('#<p class="byline-timeline-label">.*?</p>#is', '', $match[1]))) !== '' ? $match[0] : '';
    }, $content);
    return strpos($content, 'byline-timeline-item') === false ? '' : $content;
}

function byline_story_render_visualization(string $content, array $block = []): string
{
    $has_image = stripos($content, '<img') !== false;
    $has_embed = strpos($content, 'data-src="') !== false;
    if (!$has_image && !$has_embed) {
        return '';
    }
    if (!$has_embed) {
        // An unsupported or missing embed address publishes as its static graphic.
        $content = str_replace('data-mode="embed"', 'data-mode="static"', $content);
    }
    return byline_story_responsive_images($content, BYLINE_STORY_IMAGE_SIZES['visualization']);
}

foreach ([
    'annotated-image' => 'byline_story_render_annotated_image',
    'before-after' => 'byline_story_render_before_after',
    'scrolly-step' => 'byline_story_render_scrolly_step',
    'timeline' => 'byline_story_render_timeline',
    'visualization' => 'byline_story_render_visualization',
] as $byline_story_slug => $byline_story_callback) {
    add_filter('render_block_byline/' . $byline_story_slug, $byline_story_callback, 20, 2);
}
unset($byline_story_slug, $byline_story_callback);
