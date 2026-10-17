<?php

/**
 * Media delivery for article photography.
 *
 * One attachment plays three different roles in a story, and they must not be
 * conflated:
 *
 *  - the inline image: a responsive `src`/`srcset`/`sizes` set sized for the
 *    rendered gallery cell (Core already generates `srcset`; this file supplies
 *    an accurate `sizes` hint);
 *  - the full image: the attachment's canonical `full` URL, exposed as
 *    `data-byline-full-url` for the progressive lightbox and the image sitemap,
 *    and used as the Photo Gallery's ordinary media link;
 *  - the saved content: never rewritten here. Everything below runs at render
 *    time, so legacy galleries keep their stored markup.
 *
 * The full URL always comes from `wp_get_attachment_image_url( $id, 'full' )`.
 * It is never derived by editing a filename.
 */

if (!defined('ABSPATH')) {
    exit;
}

// Deliberately not `data-byline-full-src`. Core's wp_filter_content_tags() finds
// an image's source with the unanchored pattern /src="([^"]+)"/, so any
// attribute whose name ends in `src` and precedes the real `src` is mistaken for
// it. That derived the width, height and srcset from the original instead of
// the inline derivative. Keep this name free of the substring `src=`.
const BYLINE_GALLERY_MEDIA_FULL_ATTRIBUTE = 'data-byline-full-url';
const BYLINE_GALLERY_MEDIA_PHOTO_GALLERY_CLASS = 'is-style-byline-photo-gallery';
const BYLINE_GALLERY_MEDIA_PHOTO_PAIR_CLASS = 'is-style-byline-photo-pair';

// Layout constants mirrored from packages/ui/src/newsroom-blocks.css: the wide
// measure (--article-wide-width), the gallery gap, the page gutter and the
// column breakpoints. `sizes` is only a hint, so approximate gutters are fine.
const BYLINE_GALLERY_MEDIA_WIDE_PX = 1040;
const BYLINE_GALLERY_MEDIA_GAP_PX = 18;
const BYLINE_GALLERY_MEDIA_GUTTER_PX = 32;

/**
 * Which Byline gallery presentation a block uses: 'gallery', 'pair' or ''.
 *
 * @param array<string,mixed> $block Parsed block.
 */
function byline_gallery_media_variant(array $block): string
{
    $attributes = is_array($block['attrs'] ?? null) ? $block['attrs'] : [];
    $classes = preg_split('/\s+/', trim((string) ($attributes['className'] ?? ''))) ?: [];

    if (in_array(BYLINE_GALLERY_MEDIA_PHOTO_GALLERY_CLASS, $classes, true)) {
        return 'gallery';
    }

    return in_array(BYLINE_GALLERY_MEDIA_PHOTO_PAIR_CLASS, $classes, true) ? 'pair' : '';
}

/**
 * A `sizes` attribute matching the shared gallery grid: one column up to 540px,
 * at most two columns up to 900px, then the configured columns inside the
 * 1040px wide measure.
 */
function byline_gallery_media_sizes(string $variant, int $columns): string
{
    $gutter = BYLINE_GALLERY_MEDIA_GUTTER_PX;
    $gap = BYLINE_GALLERY_MEDIA_GAP_PX;
    $wide = BYLINE_GALLERY_MEDIA_WIDE_PX;
    $desktop = $variant === 'pair' ? 2 : max(1, min(6, $columns));
    $tablet = min($desktop, 2);
    $full_width = sprintf('calc(100vw - %dpx)', $gutter);

    $parts = [sprintf('(max-width: 540px) %s', $full_width)];

    if ($tablet > 1) {
        $parts[] = sprintf('(max-width: 900px) calc((100vw - %dpx - %dpx) / 2)', $gutter, $gap);
    } else {
        $parts[] = sprintf('(max-width: 900px) %s', $full_width);
    }

    if ($desktop > 1) {
        $gaps = $gap * ($desktop - 1);
        $parts[] = sprintf('(max-width: %dpx) calc((100vw - %dpx - %dpx) / %d)', $wide + $gutter, $gutter, $gaps, $desktop);
        $parts[] = sprintf('%dpx', (int) round(($wide - $gaps) / $desktop));
    } else {
        $parts[] = sprintf('(max-width: %dpx) %s', $wide + $gutter, $full_width);
        $parts[] = sprintf('%dpx', $wide);
    }

    return implode(', ', $parts);
}

/** A comparison key that ignores scheme, query string and fragment. */
function byline_gallery_media_url_key(string $url): string
{
    $url = preg_replace('/[?#].*$/', '', trim($url)) ?? '';

    return strtolower(preg_replace('#^(?:https?:)?//#i', '', $url) ?? '');
}

/**
 * Every registered derivative URL of an attachment, keyed for comparison.
 *
 * @return array<string,true>
 */
function byline_gallery_media_derivative_keys(int $attachment_id): array
{
    $metadata = function_exists('wp_get_attachment_metadata') ? wp_get_attachment_metadata($attachment_id) : false;
    $sizes = is_array($metadata) && is_array($metadata['sizes'] ?? null) ? array_keys($metadata['sizes']) : [];
    $keys = [];

    foreach ($sizes as $size) {
        $url = wp_get_attachment_image_url($attachment_id, (string) $size);
        if (is_string($url) && $url !== '') {
            $keys[byline_gallery_media_url_key($url)] = true;
        }
    }

    return $keys;
}

/** The attachment an <img> belongs to, from Core's `wp-image-N` class or `data-id`. */
function byline_gallery_media_attachment_id(WP_HTML_Tag_Processor $tags): int
{
    $classes = (string) $tags->get_attribute('class');

    if (preg_match('/(?:^|\s)wp-image-(\d+)(?:\s|$)/', $classes, $match)) {
        return absint($match[1]);
    }

    $data_id = $tags->get_attribute('data-id');

    return is_string($data_id) ? absint($data_id) : 0;
}

/**
 * The canonical full-size URL of an image attachment, or '' when the ID is not
 * a usable image.
 */
function byline_gallery_media_full_url(int $attachment_id): string
{
    if ($attachment_id <= 0 || !function_exists('wp_attachment_is_image') || !wp_attachment_is_image($attachment_id)) {
        return '';
    }

    $url = wp_get_attachment_image_url($attachment_id, 'full');

    return is_string($url) ? $url : '';
}

/**
 * Expose the full-size URL on every attachment-backed Image block. This is
 * metadata only: it does not change what the browser downloads, and it gives
 * the static build one canonical URL per editorial photograph.
 *
 * @param array<string,mixed> $block Parsed block.
 */
function byline_gallery_media_annotate_image(string $content, array $block = []): string
{
    if (!class_exists('WP_HTML_Tag_Processor') || strpos($content, '<img') === false) {
        return $content;
    }

    $tags = new WP_HTML_Tag_Processor($content);

    while ($tags->next_tag('img')) {
        if ($tags->get_attribute(BYLINE_GALLERY_MEDIA_FULL_ATTRIBUTE) !== null) {
            continue;
        }

        $full = byline_gallery_media_full_url(byline_gallery_media_attachment_id($tags));
        if ($full !== '') {
            $tags->set_attribute(BYLINE_GALLERY_MEDIA_FULL_ATTRIBUTE, $full);
        }
    }

    return $tags->get_updated_html();
}

/**
 * Photo Gallery and Photo Pair: describe the real rendered width to the
 * browser and, for Photo Gallery, point an ordinary media link at the full
 * image instead of an intermediate derivative.
 *
 * Only a link that already targets another size of the same attachment is
 * rewritten. Links to attachment pages, articles or external sites are an
 * author's choice and are left alone, and unlinked images stay unlinked.
 *
 * @param array<string,mixed> $block Parsed core/gallery block.
 */
function byline_gallery_media_enhance_gallery(string $content, array $block = []): string
{
    $variant = byline_gallery_media_variant($block);

    if ($variant === '' || !class_exists('WP_HTML_Tag_Processor')) {
        return $content;
    }

    $attributes = is_array($block['attrs'] ?? null) ? $block['attrs'] : [];
    $columns = isset($attributes['columns']) ? (int) $attributes['columns'] : 3;
    $sizes = byline_gallery_media_sizes($variant, $columns);
    $tags = new WP_HTML_Tag_Processor($content);
    $anchor_open = false;

    while ($tags->next_tag(['tag_closers' => 'visit'])) {
        $tag = $tags->get_tag();

        if ($tags->is_tag_closer()) {
            if ($tag === 'A' || $tag === 'FIGURE') {
                $anchor_open = false;
            }
            continue;
        }

        if ($tag === 'A') {
            $tags->set_bookmark('byline-gallery-anchor');
            $anchor_open = true;
            continue;
        }

        if ($tag !== 'IMG') {
            continue;
        }

        $tags->set_attribute('sizes', $sizes);

        if ($variant !== 'gallery') {
            continue;
        }

        $attachment_id = byline_gallery_media_attachment_id($tags);
        $full = byline_gallery_media_full_url($attachment_id);
        if ($full === '') {
            continue;
        }

        $tags->set_attribute(BYLINE_GALLERY_MEDIA_FULL_ATTRIBUTE, $full);

        if (!$anchor_open) {
            continue;
        }

        $tags->set_bookmark('byline-gallery-image');
        if (!$tags->seek('byline-gallery-anchor')) {
            continue;
        }

        $href = (string) $tags->get_attribute('href');
        if ($href !== '' && byline_gallery_media_url_key($href) !== byline_gallery_media_url_key($full)
            && isset(byline_gallery_media_derivative_keys($attachment_id)[byline_gallery_media_url_key($href)])) {
            $tags->set_attribute('href', $full);
        }

        $tags->seek('byline-gallery-image');
    }

    return $tags->get_updated_html();
}

add_filter('render_block_core/image', 'byline_gallery_media_annotate_image', 20, 2);
add_filter('render_block_core/gallery', 'byline_gallery_media_enhance_gallery', 20, 2);
