<?php

if (!defined('ABSPATH')) {
    exit;
}

const BYLINE_WEEKLY_PAGE_MIGRATION_OPTION = 'byline_weekly_page_migration_version';
const BYLINE_WEEKLY_PAGE_SEED_VERSION = 2;
const BYLINE_WEEKLY_PAGE_MIGRATION_VERSION = 3;
const BYLINE_PAGE_CORRECTION_FAILURE_OPTION = 'byline_page_correction_failures';
const BYLINE_PAGE_EYEBROW_META = '_byline_page_eyebrow';
const BYLINE_PAGE_SEED_HASH_META = '_byline_legacy_seed_hash';

function byline_weekly_page_seed(): array
{
    $path = dirname(__DIR__, 2) . '/migrations/weekly-wildcat-pages.json';
    if (!is_readable($path)) {
        return [];
    }
    $seed = json_decode((string) file_get_contents($path), true);
    return is_array($seed) && (int) ($seed['version'] ?? 0) === BYLINE_WEEKLY_PAGE_SEED_VERSION && is_array($seed['pages'] ?? null)
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
    $page_buttons = byline_build_page_buttons_block($page_actions, true);
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
    // WordPress' comment serializer omits the core/ namespace in saved
    // comments (wp:paragraph, wp:buttons, ...). Keep the harness fallback
    // byte-compatible with that canonical form as well.
    $serialized_name = strpos($name, 'core/') === 0 ? substr($name, 5) : $name;
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

    if ($inner_blocks === [] && $inner_content === []) {
        return '<!-- wp:' . $serialized_name . $attributes_json . ' /-->';
    }

    return '<!-- wp:' . $serialized_name . $attributes_json . ' -->' . $content . '<!-- /wp:' . $serialized_name . ' -->';
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

function byline_build_page_buttons_block(array $buttons, bool $page_actions = false): ?array
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

    $attributes = [];
    if ($page_actions) {
        $attributes['className'] = 'is-style-page-actions';
    }

    return [
        'blockName' => 'core/buttons',
        'attrs' => $attributes,
        'innerBlocks' => $inner_blocks,
        'innerHTML' => $open . $close,
        'innerContent' => array_merge([$open], array_fill(0, count($inner_blocks), null), [$close]),
    ];
}

function byline_build_page_section_block(string $heading, bool $featured = false, array $paragraphs = [], array $buttons = []): array
{
    $attributes = ['heading' => sanitize_text_field($heading)];
    if ($featured) {
        $attributes['className'] = 'is-style-featured';
    }

    $inner_blocks = [];
    foreach ($paragraphs as $paragraph) {
        $inner_blocks[] = byline_build_page_paragraph_block($paragraph);
    }
    $buttons_block = byline_build_page_buttons_block($buttons);
    if ($buttons_block !== null) {
        $inner_blocks[] = $buttons_block;
    }

    return [
        'blockName' => 'byline/page-section',
        'attrs' => $attributes,
        'innerBlocks' => $inner_blocks,
        // Page Section is dynamic. Its saved representation contains only
        // attributes and normal InnerBlocks; render.php owns the wrapper.
        'innerHTML' => '',
        'innerContent' => array_fill(0, count($inner_blocks), null),
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

function byline_page_section_marker_count(string $content): int
{
    if (preg_match_all('/<!--\s*wp:byline\/page-section\b/', $content, $matches) === false) {
        return 0;
    }

    return count($matches[0]);
}

function byline_page_section_block_count(array $blocks): int
{
    $count = 0;
    foreach ($blocks as $block) {
        if (!is_array($block)) {
            continue;
        }
        if (($block['blockName'] ?? null) === 'byline/page-section') {
            $count++;
        }
        if (is_array($block['innerBlocks'] ?? null)) {
            $count += byline_page_section_block_count($block['innerBlocks']);
        }
    }

    return $count;
}

function byline_page_section_wrapper_fragment_is_safe(string $fragment, bool $opening, bool $closing): bool
{
    $fragment = trim($fragment);
    if ($fragment === '') {
        return true;
    }

    $section_open = '<section\\b[^>]*\\bclass\\s*=\\s*["\\\'][^"\\\']*\\bwp-block-byline-page-section\\b[^"\\\']*["\\\'][^>]*>';
    $heading = '<h[234]\\b[^>]*>.*?<\\/h[234]\\s*>';
    $body_open = '<div\\b[^>]*\\bclass\\s*=\\s*["\\\'][^"\\\']*\\bwp-block-byline-page-section__body\\b[^"\\\']*["\\\'][^>]*>';

    if ($opening && $closing && preg_match('/^' . $section_open . '\\s*' . $heading . '\\s*' . $body_open . '\\s*<\\/div>\\s*<\\/section>$/is', $fragment) === 1) {
        return true;
    }

    if ($opening && preg_match('/^' . $section_open . '\\s*' . $heading . '\\s*' . $body_open . '\\s*$/is', $fragment) === 1) {
        return true;
    }

    return $closing && preg_match('/^<\\/div>\\s*<\\/section>$/i', $fragment) === 1;
}

/**
 * Confirm that the only non-block fragments in a Page Section are the wrapper
 * generated by the old static save function. Any other raw HTML is left alone
 * and reported instead of being guessed at or discarded.
 *
 * @return array{ok:bool,innerContent:array<int,?string>,reason:string}
 */
function byline_page_section_canonical_inner_content(array $block): array
{
    if (!is_array($block['innerBlocks'] ?? null) || !is_array($block['innerContent'] ?? null)) {
        return ['ok' => false, 'innerContent' => [], 'reason' => 'Page Section has an unreadable child block tree.'];
    }

    $inner_blocks = $block['innerBlocks'];
    $inner_content = $block['innerContent'];
    $non_empty_indexes = [];
    foreach ($inner_content as $index => $piece) {
        if ($piece !== null && (!is_string($piece) || trim($piece) !== '')) {
            $non_empty_indexes[] = $index;
        }
    }
    $first_non_empty = $non_empty_indexes[0] ?? null;
    $last_non_empty = $non_empty_indexes === [] ? null : $non_empty_indexes[count($non_empty_indexes) - 1];
    $child_count = 0;

    foreach ($inner_content as $index => $piece) {
        if ($piece === null) {
            $child_count++;
            continue;
        }
        if (!is_string($piece)) {
            return ['ok' => false, 'innerContent' => [], 'reason' => 'Page Section contains a non-text wrapper fragment.'];
        }

        $is_first = $first_non_empty !== null && $index === $first_non_empty;
        $is_last = $last_non_empty !== null && $index === $last_non_empty;
        if (byline_page_section_wrapper_fragment_is_safe($piece, $is_first, $is_last)) {
            continue;
        }

        return ['ok' => false, 'innerContent' => [], 'reason' => 'Page Section contains raw HTML outside its generated wrapper.'];
    }

    if ($child_count !== count($inner_blocks)) {
        return ['ok' => false, 'innerContent' => [], 'reason' => 'Page Section child markers do not match its child blocks.'];
    }

    return [
        'ok' => true,
        'innerContent' => array_fill(0, count($inner_blocks), null),
        'reason' => '',
    ];
}

function byline_page_action_buttons_are_at_page_level(array $blocks, int $index): bool
{
    if ($index <= 0) {
        return false;
    }

    for ($previous = 0; $previous < $index; $previous++) {
        if (!is_array($blocks[$previous] ?? null) || ($blocks[$previous]['blockName'] ?? null) !== 'byline/page-section') {
            return false;
        }
    }

    return true;
}

/**
 * Convert the parsed block tree in place without changing any attributes or
 * child blocks. The only generated data this migration removes is the old
 * Page Section wrapper HTML; page-level button styling is an additive block
 * style attribute for the Core Buttons block.
 *
 * @return array{ok:bool,changed:bool,blocks:array<int,array<string,mixed>>,reason:string}
 */
function byline_transform_page_block_tree(array $blocks, bool $top_level = true): array
{
    $changed = false;
    foreach ($blocks as $index => $block) {
        if (!is_array($block)) {
            return ['ok' => false, 'changed' => false, 'blocks' => $blocks, 'reason' => 'A Page contains an unreadable block node.'];
        }

        $block_name = (string) ($block['blockName'] ?? '');
        if ($block_name === 'byline/page-section') {
            if (!is_array($block['innerBlocks'] ?? null)) {
                return ['ok' => false, 'changed' => false, 'blocks' => $blocks, 'reason' => 'Page Section is missing its child block list.'];
            }

            $children = byline_transform_page_block_tree($block['innerBlocks'], false);
            if (!$children['ok']) {
                return ['ok' => false, 'changed' => false, 'blocks' => $blocks, 'reason' => $children['reason']];
            }
            if ($children['changed']) {
                $block['innerBlocks'] = $children['blocks'];
                $changed = true;
            }

            $canonical = byline_page_section_canonical_inner_content($block);
            if (!$canonical['ok']) {
                return ['ok' => false, 'changed' => false, 'blocks' => $blocks, 'reason' => $canonical['reason']];
            }
            if (($block['innerContent'] ?? []) !== $canonical['innerContent'] || ($block['innerHTML'] ?? '') !== '') {
                $block['innerContent'] = $canonical['innerContent'];
                $block['innerHTML'] = '';
                $changed = true;
            }
        } elseif (array_key_exists('innerBlocks', $block)) {
            if (!is_array($block['innerBlocks'])) {
                return ['ok' => false, 'changed' => false, 'blocks' => $blocks, 'reason' => 'A nested block list could not be read safely.'];
            }

            $children = byline_transform_page_block_tree($block['innerBlocks'], false);
            if (!$children['ok']) {
                return ['ok' => false, 'changed' => false, 'blocks' => $blocks, 'reason' => $children['reason']];
            }
            if ($children['changed']) {
                $block['innerBlocks'] = $children['blocks'];
                $changed = true;
            }
        }

        if ($top_level && in_array($block_name, ['core/buttons', 'buttons'], true) && byline_page_action_buttons_are_at_page_level($blocks, (int) $index)) {
            $attributes = is_array($block['attrs'] ?? null) ? $block['attrs'] : [];
            $class_name = is_string($attributes['className'] ?? null) ? trim($attributes['className']) : '';
            if ($class_name === '' || preg_match('/(?:^|\\s)is-style-[^\\s]+/', $class_name) !== 1) {
                $new_class_name = trim($class_name . ' is-style-page-actions');
                if ($new_class_name !== $class_name) {
                    $attributes['className'] = $new_class_name;
                    $block['attrs'] = $attributes;
                    $changed = true;
                }
            }
        }

        $blocks[$index] = $block;
    }

    return ['ok' => true, 'changed' => $changed, 'blocks' => $blocks, 'reason' => ''];
}

function byline_page_correction_failure_for_post($post, string $reason): array
{
    $post_id = byline_weekly_page_post_id($post);
    $title = function_exists('get_the_title') ? (string) get_the_title($post_id) : '';
    if ($title === '') {
        $title = is_object($post) ? (string) ($post->post_title ?? '') : (string) ($post['post_title'] ?? '');
    }

    return [
        'id' => $post_id,
        'title' => sanitize_text_field($title),
        'editLink' => function_exists('get_edit_post_link') ? (string) get_edit_post_link($post_id, '') : '',
        'reason' => sanitize_text_field($reason),
    ];
}

/**
 * Repair static Page Section wrappers already written by the #53 migration.
 * This deliberately operates on live parsed post content rather than looking
 * up a seed page, because every migrated Page is editor-owned content now.
 */
function byline_correct_weekly_page_blocks(): bool
{
    if (!function_exists('get_posts') || !function_exists('parse_blocks') || !function_exists('serialize_blocks')) {
        return false;
    }

    $failures = [];
    $pages = get_posts([
        'post_type' => 'page',
        'post_status' => 'any',
        'posts_per_page' => -1,
        'orderby' => 'ID',
        'order' => 'ASC',
    ]);

    foreach (is_array($pages) ? $pages : [] as $post) {
        $content = byline_weekly_page_post_content($post);
        $marker_count = byline_page_section_marker_count($content);
        if ($marker_count === 0) {
            continue;
        }

        try {
            $blocks = parse_blocks($content);
            if (!is_array($blocks) || byline_page_section_block_count($blocks) !== $marker_count) {
                $failures[] = byline_page_correction_failure_for_post($post, 'The stored Page Section markers could not be matched to a parsed block tree.');
                continue;
            }

            $transformed = byline_transform_page_block_tree($blocks);
            if (!$transformed['ok']) {
                $failures[] = byline_page_correction_failure_for_post($post, $transformed['reason']);
                continue;
            }
            if (!$transformed['changed']) {
                continue;
            }

            $serialized = serialize_blocks($transformed['blocks']);
            if (!is_string($serialized)) {
                $failures[] = byline_page_correction_failure_for_post($post, 'WordPress could not serialize the corrected block tree.');
                continue;
            }

            $reparsed = parse_blocks($serialized);
            if (!is_array($reparsed) || byline_page_section_block_count($reparsed) !== $marker_count) {
                $failures[] = byline_page_correction_failure_for_post($post, 'The corrected Page content failed a structural reparse check.');
                continue;
            }

            $post_id = byline_weekly_page_post_id($post);
            $updated = wp_update_post(wp_slash([
                'ID' => $post_id,
                'post_content' => $serialized,
            ]), true);
            if (is_wp_error($updated) || (int) $updated <= 0) {
                $failures[] = byline_page_correction_failure_for_post($post, 'WordPress rejected the corrected Page content update.');
            }
        } catch (Throwable $exception) {
            $failures[] = byline_page_correction_failure_for_post($post, 'The Page content could not be safely parsed or transformed.');
        }
    }

    update_option(BYLINE_PAGE_CORRECTION_FAILURE_OPTION, $failures, false);

    return $failures === [];
}

function byline_migrate_weekly_wildcat_pages(): bool
{
    if (!byline_is_legacy_weekly_wildcat_installation()) {
        return true;
    }

    $current_version = (int) get_option(BYLINE_WEEKLY_PAGE_MIGRATION_OPTION, 0);
    if ($current_version >= BYLINE_WEEKLY_PAGE_MIGRATION_VERSION) {
        return true;
    }

    // The v1 -> v2 seed migration remains hash-gated. The corrective v3 pass
    // below is independent and never uses the seed to rewrite editor content.
    if ($current_version < BYLINE_WEEKLY_PAGE_SEED_VERSION) {
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
    }

    if (!byline_correct_weekly_page_blocks()) {
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
 * @return array{legacyPages:array<int,array<string,mixed>>,correctionFailures:array<int,array<string,mixed>>}
 */
function byline_get_weekly_page_migration_report(): array
{
    if (!byline_is_legacy_weekly_wildcat_installation() || !function_exists('get_posts')) {
        return ['legacyPages' => [], 'correctionFailures' => []];
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

    $correction_failures = get_option(BYLINE_PAGE_CORRECTION_FAILURE_OPTION, []);
    return [
        'legacyPages' => $legacy_pages,
        'correctionFailures' => is_array($correction_failures) ? $correction_failures : [],
    ];
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
