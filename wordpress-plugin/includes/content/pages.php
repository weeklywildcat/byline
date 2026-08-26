<?php

if (!defined('ABSPATH')) {
    exit;
}

const BYLINE_WEEKLY_PAGE_MIGRATION_OPTION = 'byline_weekly_page_migration_version';
const BYLINE_WEEKLY_PAGE_MIGRATION_VERSION = 1;
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
    $content = is_string($page['content'] ?? null) ? $page['content'] : '';
    $actions = is_array($page['actions'] ?? null) ? $page['actions'] : [];
    $links = [];
    foreach ($actions as $action) {
        if (!is_array($action)) {
            continue;
        }
        $label = sanitize_text_field((string) ($action['label'] ?? ''));
        $href = byline_sanitize_public_url($action['href'] ?? null);
        if ($label !== '' && $href !== '') {
            $links[] = sprintf('<a href="%s">%s</a>', esc_url($href), esc_html($label));
        }
    }
    if ($links !== []) {
        $content .= "\n\n<p>" . implode(' · ', $links) . '</p>';
    }
    return wp_kses_post($content);
}

function byline_migrate_weekly_wildcat_pages(): void
{
    if (!byline_is_legacy_weekly_wildcat_installation()
        || (int) get_option(BYLINE_WEEKLY_PAGE_MIGRATION_OPTION, 0) >= BYLINE_WEEKLY_PAGE_MIGRATION_VERSION) {
        return;
    }

    $pages = byline_weekly_page_seed();
    if ($pages === []) {
        return;
    }

    foreach ($pages as $page) {
        if (!is_array($page)) {
            continue;
        }
        $slug = sanitize_title((string) ($page['slug'] ?? ''));
        $title = sanitize_text_field((string) ($page['title'] ?? ''));
        if ($slug === '' || $title === '' || get_page_by_path($slug, OBJECT, 'page')) {
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
        if (is_wp_error($post_id)) {
            continue;
        }
        update_post_meta($post_id, BYLINE_PAGE_EYEBROW_META, sanitize_text_field((string) ($page['eyebrow'] ?? '')));
        update_post_meta($post_id, BYLINE_PAGE_SEED_HASH_META, hash('sha256', $content));
    }

    update_option(BYLINE_WEEKLY_PAGE_MIGRATION_OPTION, BYLINE_WEEKLY_PAGE_MIGRATION_VERSION, false);
}
add_action('admin_init', 'byline_migrate_weekly_wildcat_pages', 20);

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

