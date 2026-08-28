<?php

define('ABSPATH', __DIR__ . '/../');
define('OBJECT', 'OBJECT');

$page_options = [];
$page_posts = [];
$page_meta = [];

class WP_Error {}

function add_action(...$args): void {}
function register_rest_field(...$args): void {}
function byline_is_legacy_weekly_wildcat_installation(): bool { return true; }
function get_option($key, $fallback = false) { global $page_options; return $page_options[$key] ?? $fallback; }
function update_option($key, $value, ...$args): void { global $page_options; $page_options[$key] = $value; }
function sanitize_title($value): string { return strtolower(trim(preg_replace('/[^a-z0-9]+/i', '-', (string) $value), '-')); }
function sanitize_text_field($value): string { return trim(strip_tags((string) $value)); }
function byline_sanitize_public_url($value, string $fallback = ''): string { return is_string($value) && strpos($value, '/') === 0 ? $value : $fallback; }
function absint($value): int { return abs((int) $value); }
function esc_url($value): string { return htmlspecialchars((string) $value, ENT_QUOTES); }
function esc_attr($value): string { return htmlspecialchars((string) $value, ENT_QUOTES); }
function esc_html($value): string { return htmlspecialchars((string) $value, ENT_QUOTES); }
function wp_kses_post($value): string { return (string) $value; }
function wp_slash($value) { return $value; }
function is_wp_error($value): bool { return $value instanceof WP_Error; }
function get_page_by_path($slug, ...$args) { global $page_posts; return $page_posts[$slug] ?? null; }
function get_posts($args = []) { global $page_posts; return array_values($page_posts); }
function get_the_title($post_id): string
{
    global $page_posts;
    foreach ($page_posts as $post) {
        if ((int) ($post['ID'] ?? 0) === (int) $post_id) {
            return (string) ($post['post_title'] ?? '');
        }
    }
    return '';
}
function get_edit_post_link($post_id, $context = ''): string { return '/wp-admin/post.php?post=' . (int) $post_id . '&action=edit'; }
function wp_insert_post($post, $wp_error = false) {
    global $page_posts;
    $id = count($page_posts) + 1;
    $post['ID'] = $id;
    $page_posts[$post['post_name']] = $post;
    return $id;
}
function wp_update_post($post, $wp_error = false) {
    global $page_posts;
    foreach ($page_posts as $slug => $existing) {
        if ((int) ($existing['ID'] ?? 0) !== (int) ($post['ID'] ?? 0)) {
            continue;
        }
        $page_posts[$slug] = array_merge($existing, $post);
        return (int) $post['ID'];
    }
    return 0;
}
function update_post_meta($post_id, $key, $value): void { global $page_meta; $page_meta[$post_id][$key] = $value; }
function get_post_meta($post_id, $key, $single = false) { global $page_meta; return $page_meta[$post_id][$key] ?? ''; }

/**
 * Small block-tree adapter for the PHP migration harness. The production path
 * uses WordPress parse_blocks()/serialize_blocks(); this only supplies the
 * same parsed shape so the structural preservation cases can run without a
 * WordPress database.
 */
function page_test_next_block_token(string $content, int $offset): ?array
{
    $match = [];
    if (preg_match('~<!--\s*(/?)wp:([^\s]+?)(?:\s+(\{.*?\}))?\s*(/?)-->~s', $content, $match, PREG_OFFSET_CAPTURE, $offset) !== 1) {
        return null;
    }

    return [
        'start' => (int) $match[0][1],
        'end' => (int) $match[0][1] + strlen($match[0][0]),
        'closing' => ($match[1][0] ?? '') === '/',
        'name' => (string) ($match[2][0] ?? ''),
        'attrs' => isset($match[3][0]) && $match[3][0] !== '' ? json_decode($match[3][0], true) : [],
        'selfClosing' => ($match[4][0] ?? '') === '/',
    ];
}

function page_test_parse_block_at(string $content, int &$offset): array
{
    $opening = page_test_next_block_token($content, $offset);
    if ($opening === null || $opening['closing']) {
        throw new RuntimeException('Expected an opening block token.');
    }

    $offset = $opening['end'];
    if ($opening['selfClosing']) {
        return [
            'blockName' => $opening['name'],
            'attrs' => is_array($opening['attrs']) ? $opening['attrs'] : [],
            'innerBlocks' => [],
            'innerHTML' => '',
            'innerContent' => [],
        ];
    }

    $inner_blocks = [];
    $inner_content = [];
    $inner_html = '';
    $cursor = $offset;
    while (true) {
        $token = page_test_next_block_token($content, $cursor);
        if ($token === null) {
            throw new RuntimeException('Unclosed block in fixture content.');
        }

        $raw = substr($content, $cursor, $token['start'] - $cursor);
        if ($raw !== '') {
            $inner_content[] = $raw;
            $inner_html .= $raw;
        }

        if ($token['closing']) {
            if ($token['name'] !== $opening['name']) {
                throw new RuntimeException('Mismatched block closing token.');
            }
            $offset = $token['end'];
            return [
                'blockName' => $opening['name'],
                'attrs' => is_array($opening['attrs']) ? $opening['attrs'] : [],
                'innerBlocks' => $inner_blocks,
                'innerHTML' => $inner_html,
                'innerContent' => $inner_content,
            ];
        }

        $child_offset = $token['start'];
        $inner_blocks[] = page_test_parse_block_at($content, $child_offset);
        $inner_content[] = null;
        $cursor = $child_offset;
    }
}

function parse_blocks(string $content): array
{
    $blocks = [];
    $offset = 0;
    while (($token = page_test_next_block_token($content, $offset)) !== null) {
        if ($token['closing']) {
            throw new RuntimeException('Unexpected closing block token.');
        }
        $block_offset = $token['start'];
        $blocks[] = page_test_parse_block_at($content, $block_offset);
        $offset = $block_offset;
    }
    return $blocks;
}

function serialize_blocks(array $blocks): string
{
    return implode("\n\n", array_map('byline_serialize_page_block', $blocks));
}

require __DIR__ . '/../includes/content/pages.php';

function page_migration_assert(bool $condition, string $message): void
{
    if (!$condition) {
        fwrite(STDERR, $message . "\n");
        exit(1);
    }
}

function legacy_escape(string $value): string
{
    return str_replace(['&', '<', '>', '"'], ['&amp;', '&lt;', '&gt;', '&quot;'], $value);
}

/** Reproduce the v1 exporter so the upgrade test exercises the hash gate. */
function legacy_page_content(array $page): string
{
    $sections = [];
    foreach (($page['sections'] ?? []) as $section) {
        $paragraphs = [];
        foreach (($section['paragraphs'] ?? []) as $paragraph) {
            $paragraphs[] = '<p>' . legacy_escape((string) $paragraph) . '</p>';
        }

        $actions = '';
        foreach (($section['actions'] ?? []) as $action) {
            $actions .= '<a href="' . legacy_escape((string) ($action['href'] ?? '')) . '">' . legacy_escape((string) ($action['label'] ?? '')) . '</a>';
        }
        $actions_markup = $actions === '' ? '' : "\n<div class=\"byline-page-section-actions\">{$actions}</div>";
        $sections[] = '<section class="byline-page-section"><h2>' . legacy_escape((string) ($section['heading'] ?? '')) . "</h2>\n"
            . '<div class="byline-page-section-body">' . implode("\n", $paragraphs) . $actions_markup . '</div></section>';
    }

    $content = implode("\n\n", $sections);
    $links = [];
    foreach (($page['actions'] ?? []) as $action) {
        $links[] = '<a href="' . legacy_escape((string) ($action['href'] ?? '')) . '">' . legacy_escape((string) ($action['label'] ?? '')) . '</a>';
    }
    if ($links !== []) {
        $content .= "\n\n<p>" . implode(' · ', $links) . '</p>';
    }

    return $content;
}

/** A #53-shaped custom block with user edits and a top-level action block. */
function migrated_page_section_fixture(): string
{
    return '<!-- wp:byline/page-section {"heading":"Accessibility","headingLevel":3,"className":"is-style-featured","align":"wide","anchor":"accessibility"} -->'
        . '<section class="wp-block-byline-page-section is-style-featured alignwide" id="accessibility"><h3 class="wp-block-heading">Accessibility</h3><div class="wp-block-byline-page-section__body">'
        . '<!-- wp:paragraph --><p>Editor-authored paragraph.</p><!-- /wp:paragraph -->'
        . '<!-- wp:core/html --><div data-editor-note="preserve">Keep this child.</div><!-- /wp:core/html -->'
        . '<!-- wp:core/buttons --><div class="wp-block-buttons"><!-- wp:core/button {"url":"/feedback/"} --><div class="wp-block-button"><a class="wp-block-button__link wp-element-button" href="/feedback/">Share Feedback</a></div><!-- /wp:core/button --></div><!-- /wp:core/buttons -->'
        . '</div></section><!-- /wp:byline/page-section -->'
        . '\n\n<!-- wp:core/buttons --><div class="wp-block-buttons"><!-- wp:core/button {"url":"/writers/"} --><div class="wp-block-button"><a class="wp-block-button__link wp-element-button" href="/writers/">Meet Our Writers</a></div><!-- /wp:core/button --></div><!-- /wp:core/buttons -->';
}

function reset_page_migration_harness(): void
{
    global $page_options, $page_posts, $page_meta;
    $page_options = [];
    $page_posts = [];
    $page_meta = [];
}

$seed = byline_weekly_page_seed();
page_migration_assert(count($seed) === 9, 'The Weekly Wildcat page migration seed is incomplete.');

$about_seed = null;
$diversity_seed = null;
foreach ($seed as $page) {
    if (($page['slug'] ?? '') === 'about') {
        $about_seed = $page;
    }
    if (($page['slug'] ?? '') === 'diversity-inclusion') {
        $diversity_seed = $page;
    }
}
page_migration_assert(is_array($about_seed) && is_array($diversity_seed), 'Expected regression pages are missing from the migration seed.');
page_migration_assert(hash('sha256', legacy_page_content($about_seed)) === $about_seed['legacySeedHash'], 'The v1 compatibility fixture no longer matches the recorded seed hash.');
page_migration_assert(byline_weekly_page_has_legacy_markup(legacy_page_content($about_seed)), 'The legacy markup detector should recognize v1 page sections.');
page_migration_assert(!byline_weekly_page_has_legacy_markup('<section class="wp-block-byline-page-section">'), 'The legacy markup detector must ignore new page-section blocks.');

// Fresh installs receive actual Gutenberg block markup, including featured
// sections and core buttons, rather than another opaque HTML template.
byline_migrate_weekly_wildcat_pages();
global $page_options, $page_posts, $page_meta;
page_migration_assert(count($page_posts) === 9, 'The controlled page migration did not create all missing pages.');
page_migration_assert((int) ($page_options[BYLINE_WEEKLY_PAGE_MIGRATION_OPTION] ?? 0) === BYLINE_WEEKLY_PAGE_MIGRATION_VERSION, 'The corrective page migration marker was not recorded.');

$about = $page_posts['about'] ?? null;
page_migration_assert(
    is_array($about)
        && $about['post_status'] === 'publish'
        && strpos($about['post_content'], '<!-- wp:byline/page-section') !== false
        && strpos($about['post_content'], '<!-- wp:buttons') !== false
        && strpos($about['post_content'], 'What We Do') !== false
        && strpos($about['post_content'], '/authors/') !== false
        && strpos($about['post_content'], '<section class="byline-page-section">') === false,
    'The fresh About page was not serialized as native block markup.'
);
$about_id = (int) $about['ID'];
page_migration_assert(
    ($page_meta[$about_id][BYLINE_PAGE_SEED_HASH_META] ?? '') === hash('sha256', $about['post_content']),
    'Fresh pages must store the hash of their new block content.'
);
$first_about_content = $about['post_content'];
$diversity = $page_posts['diversity-inclusion'] ?? null;
page_migration_assert(
    is_array($diversity)
        && strpos($diversity['post_content'], 'is-style-featured') !== false
        && substr_count($diversity['post_content'], '<!-- wp:byline/page-section') === 4,
    'The featured migration sections were not preserved.'
);

byline_migrate_weekly_wildcat_pages();
page_migration_assert(count($page_posts) === 9, 'The page migration created duplicates on a second run.');
page_migration_assert(($page_posts['about']['post_content'] ?? '') === $first_about_content, 'A completed migration must be idempotent.');

// Existing #53 installs are corrected structurally. The seed is deliberately
// absent from this test case: heading edits, support attrs, child ordering,
// unknown/core child blocks, and nested CTAs all belong to the editor now.
reset_page_migration_harness();
$migrated_content = migrated_page_section_fixture();
$page_posts['diversity-inclusion'] = [
    'ID' => 701,
    'post_status' => 'publish',
    'post_name' => 'diversity-inclusion',
    'post_title' => 'Diversity & Inclusion',
    'post_content' => $migrated_content,
];
$page_options[BYLINE_WEEKLY_PAGE_MIGRATION_OPTION] = 2;
page_migration_assert(byline_migrate_weekly_wildcat_pages() === true, 'The corrective migration should repair an existing #53 Page.');
page_migration_assert((int) $page_options[BYLINE_WEEKLY_PAGE_MIGRATION_OPTION] === BYLINE_WEEKLY_PAGE_MIGRATION_VERSION, 'The corrective migration marker should advance only after repair succeeds.');
$corrected_content = $page_posts['diversity-inclusion']['post_content'];
page_migration_assert(
    strpos($corrected_content, '<section class="wp-block-byline-page-section') === false
        && strpos($corrected_content, 'Editor-authored paragraph.') !== false
        && strpos($corrected_content, 'Keep this child.') !== false
        && strpos($corrected_content, '"headingLevel":3') !== false
        && strpos($corrected_content, '"align":"wide"') !== false
        && strpos($corrected_content, '"anchor":"accessibility"') !== false,
    'The corrective migration should remove only the generated wrapper and preserve editor content and attributes.'
);
page_migration_assert(strpos($corrected_content, '"className":"is-style-page-actions"') !== false, 'Top-level page actions should receive the native Page Actions style.');
page_migration_assert(substr_count($corrected_content, '"className":"is-style-page-actions"') === 1, 'Nested section CTAs must not receive the Page Actions style.');
$corrected_once = $corrected_content;
page_migration_assert(byline_migrate_weekly_wildcat_pages() === true, 'A second corrective migration run should succeed.');
page_migration_assert($page_posts['diversity-inclusion']['post_content'] === $corrected_once, 'The corrective migration must be idempotent.');

// A malformed section is never guessed at or overwritten, and the completion
// marker remains pending so a later admin request can retry after repair.
reset_page_migration_harness();
$malformed_content = '<!-- wp:byline/page-section {"heading":"Unsafe"} --><div class="editor-authored-fragment">Do not discard me.</div><!-- /wp:byline/page-section -->';
$page_posts['unsafe'] = [
    'ID' => 702,
    'post_status' => 'publish',
    'post_name' => 'unsafe',
    'post_title' => 'Unsafe Page',
    'post_content' => $malformed_content,
];
$page_options[BYLINE_WEEKLY_PAGE_MIGRATION_OPTION] = 2;
page_migration_assert(byline_migrate_weekly_wildcat_pages() === false, 'Malformed Page content should fail safely.');
page_migration_assert((int) $page_options[BYLINE_WEEKLY_PAGE_MIGRATION_OPTION] === 2, 'A failed corrective migration must not advance its marker.');
page_migration_assert($page_posts['unsafe']['post_content'] === $malformed_content, 'Malformed Page content must remain untouched.');
$correction_report = byline_get_weekly_page_migration_report();
page_migration_assert(count($correction_report['correctionFailures'] ?? []) === 1, 'Malformed Page content should be visible in the correction diagnostics report.');

// A clean page created by v1 is upgraded in place when its content and marker
// still match exactly. It must not be duplicated or republished.
reset_page_migration_harness();
$page_posts['about'] = [
    'ID' => 501,
    'post_status' => 'publish',
    'post_name' => 'about',
    'post_title' => 'About Us',
    'post_content' => legacy_page_content($about_seed),
];
$page_meta[501][BYLINE_PAGE_SEED_HASH_META] = $about_seed['legacySeedHash'];
$page_options[BYLINE_WEEKLY_PAGE_MIGRATION_OPTION] = 1;
byline_migrate_weekly_wildcat_pages();
page_migration_assert(count($page_posts) === 9 && (int) $page_posts['about']['ID'] === 501, 'A clean legacy page must be upgraded in place.');
page_migration_assert(strpos($page_posts['about']['post_content'], '<!-- wp:byline/page-section') !== false, 'A clean legacy page was not converted to blocks.');
page_migration_assert(($page_meta[501][BYLINE_PAGE_SEED_HASH_META] ?? '') === hash('sha256', $page_posts['about']['post_content']), 'The upgraded page hash was not refreshed.');
page_migration_assert((int) $page_options[BYLINE_WEEKLY_PAGE_MIGRATION_OPTION] === BYLINE_WEEKLY_PAGE_MIGRATION_VERSION, 'The clean-page migration marker was not advanced.');

// Changed pages and pages without a marker are editor-owned. They remain
// byte-for-byte untouched while the global migration completes.
reset_page_migration_harness();
$edited_content = legacy_page_content($about_seed) . "\n<p>Editor addition</p>";
$page_posts['about'] = [
    'ID' => 601,
    'post_status' => 'publish',
    'post_name' => 'about',
    'post_title' => 'About Us',
    'post_content' => $edited_content,
];
$page_meta[601][BYLINE_PAGE_SEED_HASH_META] = $about_seed['legacySeedHash'];
$page_options[BYLINE_WEEKLY_PAGE_MIGRATION_OPTION] = 1;
byline_migrate_weekly_wildcat_pages();
page_migration_assert(($page_posts['about']['post_content'] ?? '') === $edited_content, 'User-edited legacy content must never be overwritten.');
page_migration_assert((int) $page_options[BYLINE_WEEKLY_PAGE_MIGRATION_OPTION] === BYLINE_WEEKLY_PAGE_MIGRATION_VERSION, 'The migration should finish after skipping edited content.');

reset_page_migration_harness();
$unmarked_content = legacy_page_content($about_seed);
$page_posts['about'] = [
    'ID' => 602,
    'post_status' => 'publish',
    'post_name' => 'about',
    'post_title' => 'About Us',
    'post_content' => $unmarked_content,
];
$page_options[BYLINE_WEEKLY_PAGE_MIGRATION_OPTION] = 1;
byline_migrate_weekly_wildcat_pages();
page_migration_assert(($page_posts['about']['post_content'] ?? '') === $unmarked_content, 'A legacy page without a seed marker must remain untouched.');
$report = byline_get_weekly_page_migration_report();
page_migration_assert(count($report['legacyPages'] ?? []) === 1, 'The legacy-page report should list only the untouched legacy page.');
page_migration_assert((int) ($report['legacyPages'][0]['id'] ?? 0) === 602, 'The legacy-page report listed the wrong page.');

page_migration_assert(byline_weekly_page_content(['sections' => [], 'actions' => []]) === '', 'Empty optional page content should serialize safely.');

echo "Byline page migration regression passed.\n";
