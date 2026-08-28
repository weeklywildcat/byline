<?php

/**
 * WordPress-native authoring for normal Byline Pages.
 *
 * Homepage composition remains in Studio. This file owns only the small
 * amount of block, pattern, metadata, and editor glue needed for authored
 * WordPress Pages.
 */

if (!defined('ABSPATH')) {
    exit;
}

if (!function_exists('byline_build_page_section_block')) {
    require_once __DIR__ . '/pages.php';
}

const BYLINE_PAGE_BLOCK_CATEGORY = 'byline';
const BYLINE_PAGE_PATTERN_CATEGORY = 'byline';
const BYLINE_PAGE_EDITOR_HANDLE = 'byline-page-editor';

/**
 * Add one intentional Byline category without replacing WordPress's native
 * block categories. The second filter is retained for older editor builds.
 */
function byline_add_page_block_category(array $categories, $post = null): array
{
    foreach ($categories as $category) {
        if (is_array($category) && ($category['slug'] ?? '') === BYLINE_PAGE_BLOCK_CATEGORY) {
            return $categories;
        }
    }

    array_unshift($categories, [
        'slug' => BYLINE_PAGE_BLOCK_CATEGORY,
        'title' => 'Byline',
        'icon' => null,
    ]);

    return $categories;
}
add_filter('block_categories_all', 'byline_add_page_block_category', 10, 2);
add_filter('block_categories', 'byline_add_page_block_category', 10, 1);

function byline_register_page_section_block(): void
{
    $block_path = dirname(__DIR__, 2) . '/build/blocks/page-section';

    // register_block_type() accepts a built block directory on all supported
    // WordPress versions. Avoid newer metadata collection helpers so a 6.6
    // installation remains a supported baseline.
    if (function_exists('register_block_type')) {
        register_block_type($block_path);
    }

    if (function_exists('register_block_style')) {
        register_block_style('byline/page-section', [
            'name' => 'featured',
            'label' => 'Featured',
        ]);
    }
}
add_action('init', 'byline_register_page_section_block', 20);

function byline_register_page_meta(): void
{
    register_post_meta('page', BYLINE_PAGE_EYEBROW_META, [
        'single' => true,
        'type' => 'string',
        'default' => '',
        'sanitize_callback' => 'sanitize_text_field',
        'show_in_rest' => true,
        'auth_callback' => static function ($allowed, $meta_key, $post_id, $user_id): bool {
            return user_can((int) $user_id, 'edit_post', (int) $post_id);
        },
    ]);
}
add_action('init', 'byline_register_page_meta', 10);

function byline_enable_page_excerpt_support(): void
{
    if (function_exists('add_post_type_support')) {
        add_post_type_support('page', 'excerpt');
    }
}
add_action('init', 'byline_enable_page_excerpt_support', 11);

/** @return string */
function byline_page_section_block(string $heading, bool $featured = false, array $paragraphs = [], array $buttons = []): string
{
    return byline_serialize_page_block(byline_build_page_section_block($heading, $featured, $paragraphs, $buttons));
}

function byline_page_pattern_content(string $heading, bool $featured = false, int $paragraph_count = 1, bool $buttons = false): string
{
    $paragraphs = [];
    for ($index = 0; $index < $paragraph_count; $index++) {
        $paragraphs[] = $index === 0
            ? 'Add the main point for this section.'
            : 'Add supporting context, detail, or an example.';
    }

    return byline_page_section_block(
        $heading,
        $featured,
        $paragraphs,
        $buttons ? [['label' => 'Learn more', 'href' => '/']] : []
    );
}

function byline_register_page_patterns(): void
{
    if (function_exists('register_block_pattern_category')) {
        register_block_pattern_category(BYLINE_PAGE_PATTERN_CATEGORY, ['label' => 'Byline']);
    }

    if (!function_exists('register_block_pattern')) {
        return;
    }

    $patterns = [
        'byline/standard-page-section' => [
            'title' => 'Byline — Standard Page Section',
            'description' => 'A flexible editorial section with a heading and two paragraphs.',
            'content' => byline_page_pattern_content('Section heading', false, 2),
        ],
        'byline/featured-callout' => [
            'title' => 'Byline — Featured Callout',
            'description' => 'A high-emphasis section with supporting copy and an editable button.',
            'content' => byline_page_pattern_content('Featured callout', true, 1, true),
        ],
        'byline/two-callouts' => [
            'title' => 'Byline — Two Callouts',
            'description' => 'Two editable featured sections for related calls to action.',
            'content' => byline_page_pattern_content('First callout', true, 1, true) . byline_page_pattern_content('Second callout', true, 1, true),
        ],
        'byline/standard-information-page' => [
            'title' => 'Byline — Standard Information Page',
            'description' => 'A starter layout with four ordinary page sections.',
            'content' => byline_page_pattern_content('Introduction')
                . byline_page_pattern_content('Details')
                . byline_page_pattern_content('What to expect')
                . byline_page_pattern_content('Next steps'),
        ],
        'byline/policy-page' => [
            'title' => 'Byline — Policy Page',
            'description' => 'A starter layout for clear, editable policy information.',
            'content' => byline_page_pattern_content('Effective date')
                . byline_page_pattern_content('Policy')
                . byline_page_pattern_content('Questions'),
        ],
    ];

    foreach ($patterns as $name => $pattern) {
        register_block_pattern($name, array_merge($pattern, [
            'categories' => [BYLINE_PAGE_PATTERN_CATEGORY],
            'postTypes' => ['page'],
            'keywords' => ['page', 'section', 'content'],
            'inserter' => true,
        ]));
    }
}
add_action('init', 'byline_register_page_patterns', 25);

function byline_page_editor_screen_uses_block_editor($screen = null): bool
{
    $screen = $screen instanceof WP_Screen ? $screen : (function_exists('get_current_screen') ? get_current_screen() : null);

    return $screen instanceof WP_Screen
        && $screen->base === 'post'
        && $screen->post_type === 'page'
        && method_exists($screen, 'is_block_editor')
        && $screen->is_block_editor();
}

function byline_enqueue_page_editor_assets(string $hook): void
{
    if (!in_array($hook, ['post.php', 'post-new.php'], true) || !byline_page_editor_screen_uses_block_editor()) {
        return;
    }

    $plugin_file = dirname(__DIR__, 2) . '/weekly-wildcat-headless.php';
    $asset_file = dirname(__DIR__, 2) . '/build/page-editor.asset.php';
    $script_file = dirname(__DIR__, 2) . '/build/page-editor.js';
    if (!file_exists($asset_file) || !file_exists($script_file)) {
        return;
    }

    $asset = include $asset_file;
    $dependencies = is_array($asset) && is_array($asset['dependencies'] ?? null) ? $asset['dependencies'] : [];
    $version = is_array($asset) && is_string($asset['version'] ?? null) ? $asset['version'] : (string) filemtime($script_file);

    wp_enqueue_script(
        BYLINE_PAGE_EDITOR_HANDLE,
        plugins_url('build/page-editor.js', $plugin_file),
        $dependencies,
        $version,
        true
    );
    if (function_exists('wp_set_script_translations')) {
        wp_set_script_translations(BYLINE_PAGE_EDITOR_HANDLE, 'weekly-wildcat-headless');
    }
}
add_action('admin_enqueue_scripts', 'byline_enqueue_page_editor_assets');
