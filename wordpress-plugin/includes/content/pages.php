<?php

if (!defined('ABSPATH')) {
    exit;
}

const BYLINE_WEEKLY_PAGE_MIGRATION_OPTION = 'byline_weekly_page_migration_version';
const BYLINE_WEEKLY_PAGE_MIGRATION_VERSION = 2;
const BYLINE_PAGE_EYEBROW_META = '_byline_page_eyebrow';
const BYLINE_PAGE_SEED_HASH_META = '_byline_legacy_seed_hash';

function byline_weekly_page_seed(): array
{
    $path = dirname(__DIR__, 2) . '/migrations/weekly-wildcat-pages.json';
    if (!is_readable($path)) {
        return [];
    }
    $seed = json_decode((string) file_get_contents($path), true);
    return is_array($seed) && (int) ($seed['version'] ?? 0) === BYLINE_WEEKLY_PAGE_MIGRATION_VERSION && is_array($seed['pages'] ?? null)
        ? $seed['pages']
        : [];
}

function byline_weekly_page_content(array $page): string
{
    if (!is_array($page['sections'] ?? null)) {
        // This fallback keeps the reader tolerant of an older/custom seed file,
        // while the checked-in v2 seed below always takes the block path.
        return is_string($page['content'] ?? null) ? trim($page['content']) : '';
    }

    $blocks = [];
    foreach ($page['sections'] as $section) {
        if (!is_array($section)) {
            continue;
        }

        $heading = sanitize_text_field((string) ($section['heading'] ?? $section['title'] ?? ''));
        if ($heading === '') {
            continue;
        }

        $paragraphs = is_array($section['paragraphs'] ?? null)
            ? $section['paragraphs']
            : (is_array($section['body'] ?? null) ? $section['body'] : [$section['body'] ?? '']);
        $buttons = is_array($section['actions'] ?? null) ? $section['actions'] : [];
        $blocks[] = byline_build_page_section_block($heading, !empty($section['featured']), $paragraphs, $buttons);
    }

    $page_actions = is_array($page['actions'] ?? null) ? $page['actions'] : [];
    $page_buttons = byline_build_page_buttons_block($page_actions);
    if ($page_buttons !== null) {
        $blocks[] = $page_buttons;
    }

    $blocks = array_values(array_filter($blocks, static fn($block): bool => is_array($block)));
    if (function_exists('serialize_blocks')) {
        return serialize_blocks($blocks);
    }

    return implode("\n\n", array_map('byline_serialize_page_block', $blocks));
}

/**
 * Build a normal Gutenberg block array and let WordPress serialize it. The
 * fallback is only for the repository's lightweight PHP harnesses; production
 * WordPress 6.6+ always uses serialize_block().
 */
function byline_serialize_page_block(array $block): string
{
    if (function_exists('serialize_block')) {
        return serialize_block($block);
    }

    $name = (string) ($block['blockName'] ?? '');
    $attributes = is_array($block['attrs'] ?? null) ? $block['attrs'] : [];
    $attributes_json = $attributes !== []
        ? ' ' . (function_exists('wp_json_encode') ? wp_json_encode($attributes) : json_encode($attributes))
        : '';
    $inner_blocks = is_array($block['innerBlocks'] ?? null) ? $block['innerBlocks'] : [];
    $inner_content = is_array($block['innerContent'] ?? null) ? $block['innerContent'] : [];
    $content = '';
    $child_index = 0;
    foreach ($inner_content as $piece) {
        if ($piece === null) {
            $content .= isset($inner_blocks[$child_index]) ? byline_serialize_page_block($inner_blocks[$child_index]) : '';
            $child_index++;
        } else {
            $content .= (string) $piece;
        }
    }

    return '<!-- wp:' . $name . $attributes_json . ' -->' . $content . '<!-- /wp:' . $name . ' -->';
}

function byline_build_page_paragraph_block($paragraph): array
{
    $html = '<p>' . wp_kses_post((string) $paragraph) . '</p>';

    return [
        'blockName' => 'core/paragraph',
        'attrs' => [],
        'innerBlocks' => [],
        'innerHTML' => $html,
        'innerContent' => [$html],
    ];
}

function byline_build_page_buttons_block(array $buttons): ?array
{
    $inner_blocks = [];
    foreach ($buttons as $button) {
        if (!is_array($button)) {
            continue;
        }

        $label = sanitize_text_field((string) ($button['label'] ?? ''));
        $href = byline_sanitize_public_url($button['href'] ?? null);
        if ($label === '' || $href === '') {
            continue;
        }

        $html = '<div class="wp-block-button"><a class="wp-block-button__link wp-element-button" href="' . esc_url($href) . '">' . esc_html($label) . '</a></div>';
        $inner_blocks[] = [
            'blockName' => 'core/button',
            'attrs' => ['url' => $href],
            'innerBlocks' => [],
            'innerHTML' => $html,
            'innerContent' => [$html],
        ];
    }

    if ($inner_blocks === []) {
        return null;
    }

    $open = '<div class="wp-block-buttons">';
    $close = '</div>';

    return [
        'blockName' => 'core/buttons',
        'attrs' => [],
        'innerBlocks' => $inner_blocks,
        'innerHTML' => $open . $close,
        'innerContent' => array_merge([$open], array_fill(0, count($inner_blocks), null), [$close]),
    ];
}

function byline_build_page_section_block(string $heading, bool $featured = false, array $paragraphs = [], array $buttons = []): array
{
    $attributes = ['heading' => $heading];
    $classes = 'wp-block-byline-page-section';
    if ($featured) {
        $attributes['className'] = 'is-style-featured';
        $classes .= ' is-style-featured';
    }

    $inner_blocks = [];
    foreach ($paragraphs as $paragraph) {
        $inner_blocks[] = byline_build_page_paragraph_block($paragraph);
    }
    $buttons_block = byline_build_page_buttons_block($buttons);
    if ($buttons_block !== null) {
        $inner_blocks[] = $buttons_block;
    }

    $open = '<section class="' . esc_attr($classes) . '"><h2 class="wp-block-heading">' . esc_html($heading) . '</h2><div class="wp-block-byline-page-section__body">';
    $close = '</div></section>';

    return [
        'blockName' => 'byline/page-section',
        'attrs' => $attributes,
        'innerBlocks' => $inner_blocks,
        'innerHTML' => $open . $close,
        'innerContent' => array_merge([$open], array_fill(0, count($inner_blocks), null), [$close]),
    ];
}

function byline_weekly_page_legacy_seed_hash(array $page): string
{
    $hash = strtolower(trim((string) ($page['legacySeedHash'] ?? '')));

    return preg_match('/^[a-f0-9]{64}$/', $hash) === 1 ? $hash : '';
}

function byline_weekly_page_post_id($post): int
{
    if (is_object($post)) {
        return absint($post->ID ?? 0);
    }

    return is_array($post) ? absint($post['ID'] ?? 0) : 0;
}

function byline_weekly_page_post_content($post): string
{
    if (is_object($post)) {
        return is_string($post->post_content ?? null) ? $post->post_content : '';
    }

    return is_array($post) && is_string($post['post_content'] ?? null) ? $post['post_content'] : '';
}

function byline_weekly_page_has_legacy_markup(string $content): bool
{
    return preg_match('/class=("|\')[^"\']*(?<![A-Za-z0-9_-])byline-page-section(?![A-Za-z0-9_-])[^"\']*\1/', $content) === 1;
}

/**
 * A page can be rewritten only when both WordPress's stored seed marker and
 * the current body still match the original v1 seed. A missing marker is
 * intentionally treated as user-owned content, even if the HTML looks close.
 */
function byline_weekly_page_is_untouched_legacy_seed($post, array $page): bool
{
    $post_id = byline_weekly_page_post_id($post);
    $stored_hash = strtolower(trim((string) get_post_meta($post_id, BYLINE_PAGE_SEED_HASH_META, true)));
    $expected_hash = byline_weekly_page_legacy_seed_hash($page);
    $content_hash = hash('sha256', byline_weekly_page_post_content($post));

    if ($post_id <= 0 || $expected_hash === '' || $stored_hash === '') {
        return false;
    }

    return hash_equals($expected_hash, $stored_hash) && hash_equals($stored_hash, $content_hash);
}

function byline_migrate_weekly_wildcat_pages(): bool
{
    if (!byline_is_legacy_weekly_wildcat_installation()
        || (int) get_option(BYLINE_WEEKLY_PAGE_MIGRATION_OPTION, 0) >= BYLINE_WEEKLY_PAGE_MIGRATION_VERSION) {
        return true;
    }

    $pages = byline_weekly_page_seed();
    if ($pages === []) {
        return false;
    }

    $failed = false;
    foreach ($pages as $page) {
        if (!is_array($page)) {
            continue;
        }
        $slug = sanitize_title((string) ($page['slug'] ?? ''));
        $title = sanitize_text_field((string) ($page['title'] ?? ''));
        if ($slug === '' || $title === '') {
            continue;
        }

        $existing = get_page_by_path($slug, OBJECT, 'page');
        if ($existing) {
            if (byline_weekly_page_is_untouched_legacy_seed($existing, $page)) {
                $post_id = byline_weekly_page_post_id($existing);
                $content = byline_weekly_page_content($page);
                $updated = wp_update_post(wp_slash([
                    'ID' => $post_id,
                    'post_content' => $content,
                ]), true);

                if (is_wp_error($updated) || (int) $updated <= 0) {
                    $failed = true;
                    continue;
                }

                update_post_meta($post_id, BYLINE_PAGE_SEED_HASH_META, hash('sha256', $content));
            }

            // Existing pages with a missing or changed seed hash belong to the
            // editor. Never replace, duplicate, or publish a second copy.
            continue;
        }

        $content = byline_weekly_page_content($page);
        $post_id = wp_insert_post(wp_slash([
            'post_type' => 'page',
            'post_status' => 'publish',
            'post_name' => $slug,
            'post_title' => $title,
            'post_excerpt' => sanitize_text_field((string) ($page['description'] ?? '')),
            'post_content' => $content,
        ]), true);
        if (is_wp_error($post_id) || (int) $post_id <= 0) {
            $failed = true;
            continue;
        }
        update_post_meta($post_id, BYLINE_PAGE_EYEBROW_META, sanitize_text_field((string) ($page['eyebrow'] ?? '')));
        update_post_meta($post_id, BYLINE_PAGE_SEED_HASH_META, hash('sha256', $content));
    }

    if ($failed) {
        return false;
    }

    update_option(BYLINE_WEEKLY_PAGE_MIGRATION_OPTION, BYLINE_WEEKLY_PAGE_MIGRATION_VERSION, false);

    return (int) get_option(BYLINE_WEEKLY_PAGE_MIGRATION_OPTION, 0) >= BYLINE_WEEKLY_PAGE_MIGRATION_VERSION;
}

/**
 * Report user-owned pages that still contain the pre-block markup. This is
 * intentionally computed from live page content so the recommendation clears
 * as soon as an editor converts or replaces the page.
 *
 * @return array{legacyPages:array<int,array<string,mixed>>}
 */
function byline_get_weekly_page_migration_report(): array
{
    if (!byline_is_legacy_weekly_wildcat_installation() || !function_exists('get_posts')) {
        return ['legacyPages' => []];
    }

    $legacy_pages = [];
    $pages = get_posts([
        'post_type' => 'page',
        'post_status' => 'any',
        'posts_per_page' => -1,
        'orderby' => 'ID',
        'order' => 'ASC',
    ]);

    foreach (is_array($pages) ? $pages : [] as $post) {
        $post_id = byline_weekly_page_post_id($post);
        $content = byline_weekly_page_post_content($post);
        if ($post_id <= 0 || !byline_weekly_page_has_legacy_markup($content)) {
            continue;
        }

        $title = function_exists('get_the_title') ? (string) get_the_title($post_id) : '';
        if ($title === '') {
            $title = is_object($post) ? (string) ($post->post_title ?? '') : (string) ($post['post_title'] ?? '');
        }
        $edit_link = function_exists('get_edit_post_link') ? (string) get_edit_post_link($post_id, '') : '';
        $legacy_pages[] = [
            'id' => $post_id,
            'title' => sanitize_text_field($title),
            'editLink' => $edit_link,
        ];
    }

    return ['legacyPages' => $legacy_pages];
}

function byline_register_page_rest_fields(): void
{
    register_rest_field('page', 'bylinePage', [
        'get_callback' => static fn(array $object): array => [
            'eyebrow' => sanitize_text_field((string) get_post_meta((int) $object['id'], BYLINE_PAGE_EYEBROW_META, true)),
        ],
        'schema' => [
            'description' => 'Byline presentation metadata for a WordPress Page.',
            'type' => 'object',
            'context' => ['view', 'edit'],
            'readonly' => true,
        ],
    ]);
}
add_action('rest_api_init', 'byline_register_page_rest_fields');
