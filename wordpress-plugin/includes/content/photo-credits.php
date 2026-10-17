<?php

/**
 * Photo credits for photography inside the story body.
 *
 * The lead image prints its credit from the attachment's Byline metadata, but
 * the body is the post's rendered block HTML, and Core's Image and Media & Text
 * blocks never output credit. A credited photograph therefore published without
 * its credit whenever it sat in the body. This file closes that gap at render
 * time, so the static export, the REST `content.rendered` and Preview as Byline
 * all carry the same markup, and saved content is never rewritten.
 *
 * The line mirrors the lead image: `<p class="photo-credit">Photo: Name</p>`
 * inside the figure's caption. The credit is the attachment's Image Creator,
 * then its credit line, then the file's own metadata, the same order as the
 * public site's `getMediaCredit()` and `byline_editorial_media_attachment_meta_value()`.
 */

if (!defined('ABSPATH')) {
    exit;
}

/** The credit to print for an attachment, without a "Photo by" style lead-in. */
function byline_photo_credit_for_attachment(int $attachment_id): string
{
    if ($attachment_id <= 0 || !function_exists('byline_editorial_media_attachment_meta_value')) {
        return '';
    }

    $credit = '';
    foreach (['creator', 'creditText'] as $field) {
        $credit = trim(wp_strip_all_tags(byline_editorial_media_attachment_meta_value($attachment_id, $field)));
        if ($credit !== '') {
            break;
        }
    }

    return trim(preg_replace('/^(?:photos?|photograph|photography|image|credit)(?:\s+by\s+|\s*[:\-–—]\s*)/iu', '', $credit) ?? $credit);
}

/**
 * Add a credit line to a rendered figure unless it already carries one.
 *
 * With a caption the credit joins it; without one the figure gets a
 * credit-only caption. `$figure_pattern` selects the figure to extend.
 */
function byline_photo_credit_apply(string $html, string $credit, string $figure_pattern = '#<figure\b[^>]*>.*</figure>#is'): string
{
    $credit = trim($credit);
    if ($credit === '' || !preg_match($figure_pattern, $html, $match, PREG_OFFSET_CAPTURE)) {
        return $html;
    }

    // Judge the figure itself: a Media & Text block also contains its nested
    // blocks, which may already carry their own credit.
    $figure = $match[0][0];
    if (stripos($figure, 'photo-credit') !== false) {
        return $html;
    }

    $line = '<p class="photo-credit">Photo: ' . esc_html($credit) . '</p>';
    $caption_end = strripos($figure, '</figcaption>');

    if ($caption_end !== false) {
        $figure = substr_replace($figure, $line, $caption_end, 0);
    } else {
        $figure_end = strripos($figure, '</figure>');
        if ($figure_end === false) {
            return $html;
        }
        $figure = substr_replace($figure, '<figcaption class="wp-element-caption byline-photo-credit-only">' . $line . '</figcaption>', $figure_end, 0);
    }

    return substr_replace($html, $figure, (int) $match[0][1], strlen($match[0][0]));
}

/**
 * Core Image block: the attachment comes from the block's `id`, or Core's
 * `wp-image-N` class on legacy markup.
 *
 * @param array<string,mixed> $block Parsed block.
 */
function byline_photo_credit_image_block(string $content, array $block = []): string
{
    if (strpos($content, '<img') === false) {
        return $content;
    }

    $attributes = is_array($block['attrs'] ?? null) ? $block['attrs'] : [];
    $attachment_id = absint($attributes['id'] ?? 0);
    if ($attachment_id <= 0 && preg_match('/\bwp-image-(\d+)\b/', $content, $match)) {
        $attachment_id = absint($match[1]);
    }

    return byline_photo_credit_apply($content, byline_photo_credit_for_attachment($attachment_id));
}

/**
 * Core Media & Text (Portrait + Text): the credit goes under the media figure.
 * An "image fill" block paints the photograph as a background, so it has no
 * figure to caption and is left alone.
 *
 * @param array<string,mixed> $block Parsed block.
 */
function byline_photo_credit_media_text_block(string $content, array $block = []): string
{
    $attributes = is_array($block['attrs'] ?? null) ? $block['attrs'] : [];

    if (($attributes['mediaType'] ?? 'image') !== 'image' || !empty($attributes['imageFill']) || strpos($content, 'is-image-fill') !== false) {
        return $content;
    }

    $attachment_id = absint($attributes['mediaId'] ?? 0);
    if ($attachment_id <= 0) {
        return $content;
    }

    return byline_photo_credit_apply(
        $content,
        byline_photo_credit_for_attachment($attachment_id),
        '#<figure\b[^>]*\bwp-block-media-text__media\b[^>]*>.*?</figure>#is'
    );
}

add_filter('render_block_core/image', 'byline_photo_credit_image_block', 30, 2);
add_filter('render_block_core/media-text', 'byline_photo_credit_media_text_block', 30, 2);
