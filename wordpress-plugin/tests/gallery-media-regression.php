<?php

// Pure helpers for Photo Gallery media delivery. The HTML rewriting itself needs
// WordPress's HTML API and attachment functions, so it is covered by the
// WordPress E2E specification (tests/e2e/gallery-media.spec.ts).
define('ABSPATH', __DIR__ . '/../');

$gallery_media_filters = [];
function add_filter(string $hook, $callback, int $priority = 10, int $accepted_args = 1): void
{
    global $gallery_media_filters;
    $gallery_media_filters[$hook][] = [$callback, $priority, $accepted_args];
}
function absint($value): int { return max(0, (int) abs((int) $value)); }

function gallery_media_assert(bool $condition, string $message): void
{
    if (!$condition) {
        fwrite(STDERR, $message . "\n");
        exit(1);
    }
}

require __DIR__ . '/../includes/content/gallery-media.php';

// Registered on exactly the two blocks, after Core's own render callbacks.
gallery_media_assert(($gallery_media_filters['render_block_core/image'][0][0] ?? '') === 'byline_gallery_media_annotate_image', 'Image blocks must advertise their full-size URL.');
gallery_media_assert(($gallery_media_filters['render_block_core/gallery'][0][0] ?? '') === 'byline_gallery_media_enhance_gallery', 'Galleries must describe their rendered width.');

// The full-size attribute must never collide with Core's /src="..."/ extraction.
gallery_media_assert(BYLINE_GALLERY_MEDIA_FULL_ATTRIBUTE === 'data-byline-full-url', 'The full-size attribute name changed.');
gallery_media_assert(!preg_match('/src$/', BYLINE_GALLERY_MEDIA_FULL_ATTRIBUTE), 'An attribute ending in "src" is mistaken for the image source by wp_filter_content_tags().');
$core_probe = '<img ' . BYLINE_GALLERY_MEDIA_FULL_ATTRIBUTE . '="https://example.org/full.jpg" src="https://example.org/large-1024x683.jpg">';
gallery_media_assert(preg_match('/src="([^"]+)"/', $core_probe, $match) === 1 && $match[1] === 'https://example.org/large-1024x683.jpg', 'Core must still find the real src.');

// Which presentation a gallery uses.
gallery_media_assert(byline_gallery_media_variant(['attrs' => ['className' => 'foo is-style-byline-photo-gallery']]) === 'gallery', 'Photo Gallery was not recognised.');
gallery_media_assert(byline_gallery_media_variant(['attrs' => ['className' => 'is-style-byline-photo-pair']]) === 'pair', 'Photo Pair was not recognised.');
gallery_media_assert(byline_gallery_media_variant(['attrs' => ['className' => 'is-style-byline-news-grid']]) === '', 'Other galleries must not be touched.');
gallery_media_assert(byline_gallery_media_variant(['attrs' => []]) === '', 'A plain gallery must not be touched.');

// Three columns: phone ~ viewport, tablet ~ half, desktop ~ a third of the 1040px measure.
gallery_media_assert(
    byline_gallery_media_sizes('gallery', 3) === '(max-width: 540px) calc(100vw - 32px), (max-width: 900px) calc((100vw - 32px - 18px) / 2), (max-width: 1072px) calc((100vw - 32px - 36px) / 3), 335px',
    'Three-column sizes drifted from the gallery grid.'
);
gallery_media_assert(
    byline_gallery_media_sizes('pair', 3) === '(max-width: 540px) calc(100vw - 32px), (max-width: 900px) calc((100vw - 32px - 18px) / 2), (max-width: 1072px) calc((100vw - 32px - 18px) / 2), 511px',
    'A pair is always two columns.'
);
gallery_media_assert(
    byline_gallery_media_sizes('gallery', 1) === '(max-width: 540px) calc(100vw - 32px), (max-width: 900px) calc(100vw - 32px), (max-width: 1072px) calc(100vw - 32px), 1040px',
    'A single-column gallery fills the wide measure.'
);
gallery_media_assert(strpos(byline_gallery_media_sizes('gallery', 99), 'calc((100vw - 32px - 90px) / 6), ') !== false, 'Column counts are bounded.');

// Link comparison ignores scheme, query and fragment only; it never edits filenames.
gallery_media_assert(byline_gallery_media_url_key('HTTPS://Example.org/a/photo-1024x683.jpg?x=1#y') === 'example.org/a/photo-1024x683.jpg', 'URL comparison key changed.');
gallery_media_assert(byline_gallery_media_url_key('http://example.org/a/photo.jpg') !== byline_gallery_media_url_key('http://example.org/a/photo-1024x683.jpg'), 'Derivatives must stay distinct from the original.');

echo "Byline gallery media regression passed.\n";
