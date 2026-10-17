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
                'credit' => function_exists('byline_editorial_media_attachment_meta_value') ? byline_editorial_media_attachment_meta_value($id, 'creditText') : '',
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
