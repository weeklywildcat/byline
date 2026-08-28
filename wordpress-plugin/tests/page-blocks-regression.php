<?php

define('ABSPATH', __DIR__ . '/../');

$page_block_test = [
    'categories' => [],
    'blocks' => [],
    'styles' => [],
    'meta' => [],
    'pattern_categories' => [],
    'patterns' => [],
    'post_type_supports' => [],
];

function add_action(...$args): void {}
function add_filter(...$args): void {}
function register_rest_field(...$args): void {}
function register_block_type($path) { global $page_block_test; $page_block_test['blocks'][] = $path; return true; }
function register_block_style($name, $style): void { global $page_block_test; $page_block_test['styles'][$name] = $style; }
function register_post_meta($post_type, $key, $args): void { global $page_block_test; $page_block_test['meta'][$post_type][$key] = $args; }
function register_block_pattern_category($name, $args): void { global $page_block_test; $page_block_test['pattern_categories'][$name] = $args; }
function register_block_pattern($name, $args): void { global $page_block_test; $page_block_test['patterns'][$name] = $args; }
function add_post_type_support($post_type, $feature): void { global $page_block_test; $page_block_test['post_type_supports'][$post_type][] = $feature; }
function sanitize_title($value): string { return strtolower(trim(preg_replace('/[^a-z0-9]+/i', '-', (string) $value), '-')); }
function sanitize_text_field($value): string { return trim(strip_tags((string) $value)); }
function byline_sanitize_public_url($value, string $fallback = ''): string
{
    if (!is_string($value)) {
        return $fallback;
    }
    return preg_match('/^(?:https?:)?\/\//i', $value) === 1 || strpos($value, '/') === 0 ? $value : $fallback;
}
function esc_url($value): string { return htmlspecialchars((string) $value, ENT_QUOTES); }
function esc_attr($value): string { return htmlspecialchars((string) $value, ENT_QUOTES); }
function esc_html($value): string { return htmlspecialchars((string) $value, ENT_QUOTES); }
function wp_kses_post($value): string { return (string) $value; }
function user_can($user_id, $capability, $post_id): bool { return $user_id === 7 && $capability === 'edit_post' && $post_id === 42; }

require __DIR__ . '/../includes/content/page-blocks.php';

function page_blocks_assert(bool $condition, string $message): void
{
    if (!$condition) {
        fwrite(STDERR, $message . "\n");
        exit(1);
    }
}

$categories = byline_add_page_block_category([['slug' => 'text', 'title' => 'Text']]);
page_blocks_assert($categories[0]['slug'] === 'byline', 'The Byline block category should be available to Pages.');
page_blocks_assert(count(byline_add_page_block_category($categories)) === count($categories), 'The Byline block category should not be duplicated.');

byline_register_page_section_block();
page_blocks_assert(count($page_block_test['blocks']) === 1 && substr($page_block_test['blocks'][0], -strlen('/build/blocks/page-section')) === '/build/blocks/page-section', 'The metadata-driven page-section block was not registered.');
page_blocks_assert(!isset($page_block_test['styles']['byline/page-section']), 'The metadata-declared Featured style must not be registered a second time.');
page_blocks_assert(($page_block_test['styles']['core/buttons']['name'] ?? '') === 'page-actions', 'The editable Core Buttons Page Actions style was not registered.');

byline_register_page_meta();
$meta = $page_block_test['meta']['page'][BYLINE_PAGE_EYEBROW_META] ?? null;
page_blocks_assert(is_array($meta) && $meta['show_in_rest'] === true && $meta['type'] === 'string', 'The page eyebrow meta must be registered in REST.');
page_blocks_assert($meta['sanitize_callback'] === 'sanitize_text_field', 'The page eyebrow meta must use text sanitization.');
page_blocks_assert(($meta['auth_callback'])(false, BYLINE_PAGE_EYEBROW_META, 42, 7) === true, 'The page eyebrow meta auth callback should allow page editors.');
page_blocks_assert(($meta['auth_callback'])(false, BYLINE_PAGE_EYEBROW_META, 42, 8) === false, 'The page eyebrow meta auth callback should reject other users.');

byline_enable_page_excerpt_support();
page_blocks_assert(in_array('excerpt', $page_block_test['post_type_supports']['page'] ?? [], true), 'Pages must support native excerpts.');

byline_register_page_patterns();
page_blocks_assert(isset($page_block_test['pattern_categories']['byline']), 'The Byline pattern category was not registered.');
page_blocks_assert(count($page_block_test['patterns']) === 5, 'Expected the generic Byline Page pattern set.');
foreach ($page_block_test['patterns'] as $name => $pattern) {
    page_blocks_assert(($pattern['categories'] ?? []) === ['byline'], "Pattern {$name} is not in the Byline category.");
    page_blocks_assert(($pattern['postTypes'] ?? []) === ['page'], "Pattern {$name} is not scoped to Pages.");
    page_blocks_assert(strpos($pattern['content'] ?? '', '<!-- wp:byline/page-section') !== false, "Pattern {$name} is not composed of page-section blocks.");
    page_blocks_assert(strpos($pattern['content'] ?? '', 'Weekly Wildcat') === false && strpos($pattern['content'] ?? '', 'Ninety Six') === false, "Pattern {$name} contains publication-specific copy.");
    page_blocks_assert(strpos($pattern['content'] ?? '', '<section class=') === false, "Pattern {$name} still stores a Page Section wrapper.");
}

$metadata = json_decode((string) file_get_contents(__DIR__ . '/../src/blocks/page-section/block.json'), true);
page_blocks_assert(is_array($metadata) && (int) ($metadata['apiVersion'] ?? 0) === 3, 'The page-section block must use block API v3.');
page_blocks_assert(($metadata['supports']['align'] ?? []) === ['wide'], 'The page-section block should support wide alignment.');
page_blocks_assert(($metadata['supports']['anchor'] ?? false) === true, 'The page-section block should support anchors.');
page_blocks_assert(($metadata['styles'][1]['name'] ?? '') === 'featured', 'The block metadata must expose the Featured style.');
page_blocks_assert(($metadata['render'] ?? '') === 'file:./render.php', 'The Page Section block must declare its server renderer.');
page_blocks_assert(is_readable(__DIR__ . '/../src/blocks/page-section/render.php'), 'The Page Section server renderer is missing from source.');

$section = byline_build_page_section_block('Accessibility', true, ['Editor-authored copy.']);
page_blocks_assert(($section['innerHTML'] ?? '') === '', 'A dynamic Page Section must not store wrapper HTML.');
page_blocks_assert(($section['innerContent'] ?? []) === [null], 'A dynamic Page Section must persist only InnerBlocks content.');

echo "Byline page block regression passed.\n";
