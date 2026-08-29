<?php

/**
 * Authenticated article preview.
 *
 * Preview is deliberately an admin page, not a public REST or front-end draft
 * route. The current editor's `edit_post` capability is the boundary for every
 * read, and the page never calls publication/deployment code.
 */

if (!defined('ABSPATH')) {
    exit;
}

const BYLINE_EDITORIAL_PREVIEW_PAGE = 'byline-article-preview';
const BYLINE_EDITORIAL_PREVIEW_HANDLE = 'byline-article-preview';

function byline_editorial_preview_post_id(): int
{
    $value = isset($_GET['post']) && is_scalar($_GET['post']) ? wp_unslash($_GET['post']) : 0;

    return absint($value);
}

function byline_editorial_preview_can_view(int $post_id): bool
{
    $post = get_post($post_id);

    return $post instanceof WP_Post
        && $post->post_type === 'post'
        && current_user_can('edit_post', $post_id);
}

function byline_editorial_preview_public_url(string $value, string $fallback = ''): string
{
    $value = trim($value);
    if ($value === '') {
        return $fallback;
    }

    $relative = strpos($value, '/') === 0 && strpos($value, '//') !== 0;
    $absolute = preg_match('#^https?://#i', $value) === 1;

    return ($relative || $absolute) ? (string) esc_url_raw($value) : $fallback;
}

function byline_editorial_preview_date_label(string $value): string
{
    if ($value === '') {
        return '';
    }

    $timestamp = strtotime($value);
    if ($timestamp === false) {
        return $value;
    }

    return wp_date(get_option('date_format') ?: 'F j, Y', $timestamp);
}

/** @return array<string,mixed>|null */
function byline_editorial_preview_image(int $attachment_id, string $sizes = '(max-width: 900px) 100vw, 900px'): ?array
{
    if ($attachment_id <= 0 || !function_exists('wp_get_attachment_image_url')) {
        return null;
    }

    $src = wp_get_attachment_image_url($attachment_id, 'full');
    if (!is_string($src) || $src === '') {
        return null;
    }

    $metadata = wp_get_attachment_metadata($attachment_id);
    $width = is_array($metadata) ? absint($metadata['width'] ?? 0) : 0;
    $height = is_array($metadata) ? absint($metadata['height'] ?? 0) : 0;
    $alt = function_exists('wp_get_attachment_image_alt')
        ? (string) wp_get_attachment_image_alt($attachment_id)
        : (string) get_post_meta($attachment_id, '_wp_attachment_image_alt', true);
    $caption = function_exists('wp_get_attachment_caption') ? (string) wp_get_attachment_caption($attachment_id) : '';
    $srcset = function_exists('wp_get_attachment_image_srcset') ? wp_get_attachment_image_srcset($attachment_id, 'full') : false;
    $credit = (string) get_post_meta($attachment_id, '_ww_image_credit', true);

    return [
        'src' => (string) esc_url_raw($src),
        'srcSet' => is_string($srcset) ? $srcset : '',
        'sizes' => $sizes,
        'alt' => sanitize_text_field($alt),
        'width' => $width > 0 ? $width : null,
        'height' => $height > 0 ? $height : null,
        'captionHtml' => $caption !== '' ? wp_kses_post($caption) : '',
        'credit' => sanitize_text_field($credit),
    ];
}

/** @return array<string,mixed> */
function byline_editorial_preview_contributor(array $contributor, int $index): array
{
    $id = absint($contributor['id'] ?? 0);
    $type = sanitize_key((string) ($contributor['type'] ?? 'user'));
    $name = sanitize_text_field((string) ($contributor['name'] ?? $contributor['displayName'] ?? 'Contributor'));
    $slug = sanitize_title((string) ($contributor['slug'] ?? $name));
    $href = $type === 'user' && $id > 0 && function_exists('get_author_posts_url')
        ? get_author_posts_url($id, $slug)
        : byline_editorial_preview_public_url('/author/' . $slug . '/', '/authors/');
    $photo_id = absint($contributor['imageId'] ?? 0);
    $links = is_array($contributor['links'] ?? null) ? $contributor['links'] : [];
    $contact = '';
    foreach ($links as $key => $link) {
        if (is_array($link)) {
            $label = strtolower((string) ($link['label'] ?? ''));
            $link = $link['url'] ?? '';
        } else {
            $label = strtolower((string) $key);
        }
        if (in_array($label, ['email', 'contact'], true) && is_scalar($link)) {
            $candidate = (string) $link;
            if (preg_match('#^mailto:[^\s]+$#i', $candidate) === 1) {
                $contact = $candidate;
            }
        }
    }

    return [
        'id' => $type . '-' . ($id > 0 ? (string) $id : (string) $index) . '-' . $slug,
        'name' => $name !== '' ? $name : 'Contributor',
        'href' => (string) esc_url_raw($href),
        'role' => sanitize_text_field((string) ($contributor['role'] ?? 'Writer')) ?: 'Writer',
        'bio' => sanitize_textarea_field((string) ($contributor['bio'] ?? $contributor['description'] ?? '')),
        'photo' => byline_editorial_preview_image($photo_id, '132px'),
        'founder' => false,
        'contactHref' => $contact,
        'coverage' => [],
    ];
}

/** @return array<string,mixed> */
function byline_editorial_preview_story_card(WP_Post $post): array
{
    $category = '';
    $categories = get_the_category($post->ID);
    if (is_array($categories)) {
        foreach ($categories as $candidate) {
            if ($candidate instanceof WP_Term && $candidate->slug !== 'uncategorized') {
                $category = sanitize_text_field($candidate->name);
                break;
            }
        }
    }

    return [
        'id' => (int) $post->ID,
        'title' => sanitize_text_field($post->post_title),
        'href' => (string) esc_url_raw(get_permalink($post)),
        'excerptHtml' => wp_kses_post(get_the_excerpt($post)),
        'image' => byline_editorial_preview_image(absint(get_post_thumbnail_id($post->ID)), '92px'),
        'category' => $category,
        'date' => (string) ($post->post_date_gmt ?: $post->post_date),
        'dateLabel' => byline_editorial_preview_date_label((string) ($post->post_date_gmt ?: $post->post_date)),
    ];
}

/** @return array<int,array<string,mixed>> */
function byline_editorial_preview_related_stories(WP_Post $post): array
{
    $category_ids = array_map('absint', wp_get_post_categories($post->ID));
    $posts = get_posts([
        'post_type' => 'post',
        'post_status' => 'publish',
        'posts_per_page' => 3,
        'post__not_in' => [$post->ID],
        'category__in' => $category_ids,
        'orderby' => 'date',
        'order' => 'DESC',
        'no_found_rows' => true,
    ]);

    return array_values(array_filter(array_map(static function ($candidate): ?array {
        return $candidate instanceof WP_Post ? byline_editorial_preview_story_card($candidate) : null;
    }, is_array($posts) ? $posts : [])));
}

/** @return array<string,mixed> */
function byline_editorial_preview_presentation(int $post_id): array
{
    $post = get_post($post_id);
    if (!$post instanceof WP_Post) {
        return [];
    }

    $publication = byline_get_publication_config();
    $title = sanitize_text_field($post->post_title);
    $published_at = (string) ($post->post_date_gmt ?: $post->post_date);
    $modified_at = (string) ($post->post_modified_gmt ?: $post->post_modified);
    $published_timestamp = strtotime($published_at);
    $modified_timestamp = strtotime($modified_at);
    $has_update = $published_timestamp !== false && $modified_timestamp !== false && $modified_timestamp - $published_timestamp > HOUR_IN_SECONDS;
    $content = wp_kses_post(apply_filters('the_content', (string) $post->post_content));
    $excerpt = wp_kses_post(get_the_excerpt($post));
    $contributors = function_exists('byline_get_story_contributors') ? byline_get_story_contributors($post_id) : [];
    $contributor_views = [];
    foreach (is_array($contributors) ? $contributors : [] as $index => $contributor) {
        if (is_array($contributor)) {
            $contributor_views[] = byline_editorial_preview_contributor($contributor, (int) $index);
        }
    }

    $category_view = null;
    $categories = get_the_category($post_id);
    if (is_array($categories)) {
        foreach ($categories as $category) {
            if ($category instanceof WP_Term && $category->slug !== 'uncategorized') {
                $category_view = [
                    'label' => sanitize_text_field($category->name),
                    'href' => byline_editorial_preview_public_url('/category/' . sanitize_title($category->slug) . '/', '/'),
                ];
                break;
            }
        }
    }

    $topics = [];
    $terms = get_the_tags($post_id);
    if (is_array($terms)) {
        foreach ($terms as $term) {
            if ($term instanceof WP_Term && !in_array($term->slug, ['special-coverage', 'athlete-of-the-week', 'athlete-of-the-month'], true)) {
                $topics[] = ['id' => 'post_tag-' . (int) $term->term_id, 'name' => sanitize_text_field($term->name)];
            }
        }
    }

    $words = str_word_count(wp_strip_all_tags($content . ' ' . $excerpt));
    $reading_time = max(1, (int) ceil($words / 225)) . ' min read';
    $corrections = [];
    if (function_exists('byline_list_corrections')) {
        foreach (byline_list_corrections($post_id, false) as $correction) {
            if (!is_array($correction) || trim((string) ($correction['text'] ?? '')) === '') {
                continue;
            }
            $type = sanitize_key((string) ($correction['type'] ?? 'correction'));
            $labels = function_exists('byline_correction_types') ? byline_correction_types() : [];
            $corrections[] = [
                'id' => (string) absint($correction['id'] ?? 0),
                'label' => sanitize_text_field((string) ($labels[$type] ?? 'Correction')),
                'date' => (string) ($correction['recordedAt'] ?? ''),
                'dateLabel' => byline_editorial_preview_date_label((string) ($correction['recordedAt'] ?? '')),
                'text' => sanitize_textarea_field((string) ($correction['text'] ?? '')),
            ];
        }
    }

    $related = byline_editorial_preview_related_stories($post);
    $author_posts = get_posts([
        'post_type' => 'post',
        'post_status' => 'publish',
        'author' => absint($post->post_author),
        'posts_per_page' => 3,
        'post__not_in' => array_merge([$post_id], array_map(static fn(array $story): int => absint($story['id'] ?? 0), $related)),
        'orderby' => 'date',
        'order' => 'DESC',
        'no_found_rows' => true,
    ]);

    return [
        'id' => $post_id,
        'url' => (string) esc_url_raw(get_permalink($post)),
        'title' => $title,
        'titleHtml' => esc_html($title),
        'excerptHtml' => $excerpt,
        'contentHtml' => $content,
        'category' => $category_view,
        'athleteMeta' => [],
        'contributors' => $contributor_views,
        'fallbackByline' => sanitize_text_field((string) ($publication['identity']['shortName'] ?? 'Staff')) . ' Staff',
        'publishedAt' => $published_at,
        'publishedLabel' => byline_editorial_preview_date_label($published_at),
        'modifiedAt' => $has_update ? $modified_at : null,
        'modifiedLabel' => $has_update ? byline_editorial_preview_date_label($modified_at) : null,
        'readingTime' => $reading_time,
        'image' => byline_editorial_preview_image(absint(get_post_thumbnail_id($post_id))),
        'corrections' => $corrections,
        'topics' => $topics,
        'update' => $has_update ? [
            'modifiedAt' => $modified_at,
            'label' => 'This story was updated after initial publication on ' . byline_editorial_preview_date_label($modified_at) . '.',
        ] : null,
        'relatedStories' => $related,
        'moreByAuthorStories' => array_values(array_filter(array_map(static function ($candidate): ?array {
            return $candidate instanceof WP_Post ? byline_editorial_preview_story_card($candidate) : null;
        }, is_array($author_posts) ? $author_posts : []))),
        'publication' => [
            'shortName' => sanitize_text_field((string) ($publication['identity']['shortName'] ?? 'Byline')),
            'contactHref' => byline_editorial_preview_public_url((string) ($publication['urls']['contact'] ?? '/contact/'), '/contact/'),
        ],
    ];
}

function byline_register_editorial_preview_page(): void
{
    // A null parent intentionally creates an admin page with no visible menu
    // item. Preview is launched from the editor and remains capability-gated.
    add_submenu_page(
        null,
        'Preview as Byline',
        'Preview as Byline',
        'edit_posts',
        BYLINE_EDITORIAL_PREVIEW_PAGE,
        'byline_editorial_render_preview_page'
    );
}
add_action('admin_menu', 'byline_register_editorial_preview_page');

function byline_editorial_preview_page_url(int $post_id = 0): string
{
    $args = ['page' => BYLINE_EDITORIAL_PREVIEW_PAGE];
    if ($post_id > 0) {
        $args['post'] = $post_id;
    }

    return add_query_arg($args, admin_url('admin.php'));
}

function byline_editorial_render_preview_page(): void
{
    $post_id = byline_editorial_preview_post_id();
    if (!byline_editorial_preview_can_view($post_id)) {
        wp_die(esc_html__('Sorry, you are not allowed to preview this story.', 'weekly-wildcat-headless'));
    }

    $model = byline_editorial_preview_presentation($post_id);
    if ($model === []) {
        wp_die(esc_html__('This story could not be loaded for preview.', 'weekly-wildcat-headless'));
    }

    echo '<div class="wrap byline-article-preview-page">';
    echo '<h1>' . esc_html__('Preview as Byline', 'weekly-wildcat-headless') . '</h1>';
    echo '<p>' . esc_html__('This private preview uses the latest saved WordPress content. Interactive public actions are disabled.', 'weekly-wildcat-headless') . '</p>';
    echo '<div id="byline-article-preview-root"></div>';
    echo '</div>';
}

function byline_editorial_preview_enqueue_assets(string $hook): void
{
    if (!isset($_GET['page']) || !is_scalar($_GET['page']) || sanitize_key((string) wp_unslash($_GET['page'])) !== BYLINE_EDITORIAL_PREVIEW_PAGE) {
        return;
    }

    $plugin_file = dirname(__DIR__, 2) . '/weekly-wildcat-headless.php';
    $asset_file = dirname(__DIR__, 2) . '/build/article-preview.asset.php';
    $script_file = dirname(__DIR__, 2) . '/build/article-preview.js';
    if (!is_readable($asset_file) || !is_readable($script_file)) {
        return;
    }

    $asset = include $asset_file;
    $dependencies = is_array($asset['dependencies'] ?? null) ? $asset['dependencies'] : [];
    $version = is_string($asset['version'] ?? null) ? $asset['version'] : (string) filemtime($script_file);
    wp_enqueue_script(
        BYLINE_EDITORIAL_PREVIEW_HANDLE,
        plugins_url('build/article-preview.js', $plugin_file),
        $dependencies,
        $version,
        true
    );

    $style_file = dirname(__DIR__, 2) . '/build/article-preview.css';
    if (is_readable($style_file)) {
        wp_enqueue_style(
            BYLINE_EDITORIAL_PREVIEW_HANDLE,
            plugins_url('build/article-preview.css', $plugin_file),
            [],
            (string) filemtime($style_file)
        );
    }

    $post_id = byline_editorial_preview_post_id();
    $publication = byline_get_publication_config();
    $appearance = is_array($publication['appearance'] ?? null) ? $publication['appearance'] : [];
    $theme_id = sanitize_key((string) ($appearance['theme'] ?? 'byline-modern'));
    $theme_ids = function_exists('byline_publication_theme_ids') ? byline_publication_theme_ids() : [];
    if ($theme_ids !== [] && !in_array($theme_id, $theme_ids, true)) {
        $theme_id = 'byline-modern';
    }
    $token_overrides = is_array($appearance['tokenOverrides'] ?? null) ? $appearance['tokenOverrides'] : [];
    wp_localize_script(BYLINE_EDITORIAL_PREVIEW_HANDLE, 'bylineArticlePreview', [
        'model' => byline_editorial_preview_can_view($post_id) ? byline_editorial_preview_presentation($post_id) : null,
        'stylesheetUrl' => plugins_url('build/article-preview.css', $plugin_file),
        'themeId' => $theme_id,
        'tokenOverrides' => $token_overrides,
        'postId' => $post_id,
    ]);
}
add_action('admin_enqueue_scripts', 'byline_editorial_preview_enqueue_assets', 20);

function byline_editorial_preview_noindex(): void
{
    if (isset($_GET['page']) && is_scalar($_GET['page']) && sanitize_key((string) wp_unslash($_GET['page'])) === BYLINE_EDITORIAL_PREVIEW_PAGE) {
        echo '<meta name="robots" content="noindex, nofollow">';
    }
}
add_action('admin_head', 'byline_editorial_preview_noindex');
