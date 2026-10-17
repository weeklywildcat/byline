<?php

// Inline body photographs must print their attachment's credit. Core's Image and
// Media & Text blocks never do, so a credited photo published without it unless
// this render-time filter adds it. The WordPress-dependent lookup is stubbed.
define('ABSPATH', __DIR__ . '/../');

$photo_credit_filters = [];
function add_filter(string $hook, $callback, int $priority = 10, int $accepted_args = 1): void
{
    global $photo_credit_filters;
    $photo_credit_filters[$hook][] = [$callback, $priority, $accepted_args];
}
function absint($value): int { return max(0, (int) abs((int) $value)); }
function esc_html(string $value): string { return htmlspecialchars($value, ENT_QUOTES, 'UTF-8'); }
function wp_strip_all_tags(string $value): string { return trim(strip_tags($value)); }

$photo_credit_meta = [
    9381 => ['creator' => 'Maycie Krajewski', 'creditText' => 'Maycie Krajewski/Weekly Wildcat'],
    9382 => ['creator' => '', 'creditText' => 'Photo by Jane <b>Doe</b> & Co'],
    9383 => ['creator' => '', 'creditText' => ''],
];
function byline_editorial_media_attachment_meta_value(int $attachment_id, string $field): string
{
    global $photo_credit_meta;
    return $photo_credit_meta[$attachment_id][$field] ?? '';
}

function photo_credit_assert(bool $condition, string $message): void
{
    if (!$condition) {
        fwrite(STDERR, $message . "\n");
        exit(1);
    }
}

require __DIR__ . '/../includes/content/photo-credits.php';

photo_credit_assert(($photo_credit_filters['render_block_core/image'][0][0] ?? '') === 'byline_photo_credit_image_block', 'Image blocks must print their credit.');
photo_credit_assert(($photo_credit_filters['render_block_core/media-text'][0][0] ?? '') === 'byline_photo_credit_media_text_block', 'Portrait + Text must print its credit.');
photo_credit_assert(($photo_credit_filters['render_block_core/image'][0][1] ?? 0) > 20, 'Credit must run after the gallery media filter.');

// Creator wins over the free-text credit line; a "Photo by" lead-in is dropped.
photo_credit_assert(byline_photo_credit_for_attachment(9381) === 'Maycie Krajewski', 'The Image Creator is the credit.');
photo_credit_assert(byline_photo_credit_for_attachment(9382) === 'Jane Doe & Co', 'Credit text is stripped of tags and its "Photo by" lead-in.');
photo_credit_assert(byline_photo_credit_for_attachment(9383) === '', 'An uncredited photo prints no credit.');
photo_credit_assert(byline_photo_credit_for_attachment(0) === '', 'No attachment, no credit.');

// The reported article: a captioned Image block keeps its caption and gains the credit.
$image = '<figure class="wp-block-image size-large"><img src="a-1024x768.jpg" alt="" class="wp-image-9381"/><figcaption class="wp-element-caption">Spectators watch the continued game on Saturday</figcaption></figure>';
$out = byline_photo_credit_image_block($image, ['attrs' => ['id' => 9381]]);
photo_credit_assert(strpos($out, 'Spectators watch the continued game on Saturday<p class="photo-credit">Photo: Maycie Krajewski</p></figcaption>') !== false, 'The credit must join the existing caption.');
photo_credit_assert(substr_count($out, '<figcaption') === 1, 'A captioned photo must not gain a second caption.');

// Legacy markup without a block id still resolves from Core's wp-image-N class.
photo_credit_assert(strpos(byline_photo_credit_image_block($image, ['attrs' => []]), 'Photo: Maycie Krajewski') !== false, 'The wp-image class must resolve the attachment.');

// An uncaptioned photo gets a credit-only caption inside the figure.
$bare = '<figure class="wp-block-image"><img src="a.jpg" alt="" class="wp-image-9381"/></figure>';
photo_credit_assert(
    byline_photo_credit_image_block($bare, ['attrs' => ['id' => 9381]]) === '<figure class="wp-block-image"><img src="a.jpg" alt="" class="wp-image-9381"/><figcaption class="wp-element-caption byline-photo-credit-only"><p class="photo-credit">Photo: Maycie Krajewski</p></figcaption></figure>',
    'An uncaptioned photo needs a credit-only caption.'
);

// Idempotent, and never touches uncredited photos or non-figure images.
photo_credit_assert(byline_photo_credit_image_block($out, ['attrs' => ['id' => 9381]]) === $out, 'Rendering twice must not duplicate the credit.');
photo_credit_assert(byline_photo_credit_image_block($bare, ['attrs' => ['id' => 9383]]) === $bare, 'An uncredited photo is unchanged.');
photo_credit_assert(byline_photo_credit_image_block('<img src="a.jpg" class="wp-image-9381">', ['attrs' => ['id' => 9381]]) === '<img src="a.jpg" class="wp-image-9381">', 'A bare image has no figure to caption.');
photo_credit_assert(strpos(byline_photo_credit_image_block('<figure><img class="wp-image-9382" src="b.jpg"/></figure>', ['attrs' => ['id' => 9382]]), 'Photo: Jane Doe &amp; Co') !== false, 'The credit is escaped.');

// Portrait + Text: credit under the media figure, even when a nested block already has one.
$media_text = '<div class="wp-block-media-text is-stacked-on-mobile"><figure class="wp-block-media-text__media"><img src="p.jpg" alt="" class="wp-image-9381"/></figure><div class="wp-block-media-text__content"><figure class="wp-block-image"><img src="n.jpg"/><figcaption><p class="photo-credit">Photo: Someone Else</p></figcaption></figure></div></div>';
$out = byline_photo_credit_media_text_block($media_text, ['attrs' => ['mediaId' => 9381, 'mediaType' => 'image']]);
photo_credit_assert(strpos($out, '<figure class="wp-block-media-text__media"><img src="p.jpg" alt="" class="wp-image-9381"/><figcaption class="wp-element-caption byline-photo-credit-only"><p class="photo-credit">Photo: Maycie Krajewski</p></figcaption></figure>') !== false, 'The media figure must carry its own credit.');
photo_credit_assert(strpos($out, 'Photo: Someone Else') !== false, 'Nested credits are preserved.');
photo_credit_assert(strpos(byline_photo_credit_media_text_block('<div class="wp-block-media-text is-image-fill"><figure class="wp-block-media-text__media"><img src="p.jpg"/></figure></div>', ['attrs' => ['mediaId' => 9381, 'imageFill' => true]]), 'photo-credit') === false, 'Image-fill media is a background and is left alone.');
photo_credit_assert(strpos(byline_photo_credit_media_text_block('<div class="wp-block-media-text"><figure class="wp-block-media-text__media"><video></video></figure></div>', ['attrs' => ['mediaId' => 9381, 'mediaType' => 'video']]), 'photo-credit') === false, 'Video media is not a photo.');

echo "Byline photo credits regression passed.\n";
