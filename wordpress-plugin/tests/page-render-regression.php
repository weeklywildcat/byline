<?php

define('ABSPATH', __DIR__ . '/../');

function sanitize_text_field($value): string { return trim(strip_tags((string) $value)); }
function absint($value): int { return abs((int) $value); }
function esc_html($value): string { return htmlspecialchars((string) $value, ENT_QUOTES); }
function get_block_wrapper_attributes(): string { return 'class="wp-block-byline-page-section is-style-featured" data-anchor="accessibility"'; }

function page_render_assert(bool $condition, string $message): void
{
    if (!$condition) {
        fwrite(STDERR, $message . "\n");
        exit(1);
    }
}

$attributes = [
    'heading' => 'Accessibility <script>alert(1)</script>',
    'headingLevel' => 99,
];
$content = '<p>Rendered child content.</p>';

ob_start();
include __DIR__ . '/../src/blocks/page-section/render.php';
$rendered = (string) ob_get_clean();

page_render_assert(strpos($rendered, '<section class="wp-block-byline-page-section is-style-featured" data-anchor="accessibility">') !== false, 'Page Section rendering must use WordPress wrapper attributes.');
page_render_assert(strpos($rendered, '<h2 class="wp-block-heading">Accessibility alert(1)</h2>') !== false && strpos($rendered, '<script>') === false, 'Page Section headings must be sanitized server-side.');
page_render_assert(strpos($rendered, '<h99') === false, 'Invalid heading levels must fall back to H2.');
page_render_assert(strpos($rendered, '<div class="wp-block-byline-page-section__body"><p>Rendered child content.</p></div>') !== false, 'Rendered InnerBlocks content must remain inside the body wrapper.');

echo "Byline page render regression passed.\n";
