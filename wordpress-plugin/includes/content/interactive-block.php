<?php
/**
 * Interactive: one self-contained HTML file (a chart, calculator, quiz, map or
 * small data explorer) shown inside an article, isolated from it.
 *
 * The file is stored base64-encoded in the block's `document` attribute (kses
 * would otherwise strip its scripts whenever someone without `unfiltered_html`
 * saves the post) and printed as the `srcdoc` of an iframe sandboxed with
 * `allow-scripts` only. The frame's origin is opaque: it cannot read the
 * article, cookies or storage, navigate the page, open windows, submit forms
 * or show dialogs. Nothing new is hosted; the static site prints what this
 * renders. The frame contract (sandbox, resize script, heights) is shared with
 * packages/ui/src/interactive.ts.
 *
 * Only users who can publish unfiltered HTML (editors and administrators) may
 * add an interactive or change its file; anyone may keep, move or caption one
 * that is already in the post.
 */

if (!defined('ABSPATH')) {
    exit;
}

/** Byte-identical to INTERACTIVE_RESIZE_SCRIPT in packages/ui/src/interactive.ts. */
const BYLINE_INTERACTIVE_RESIZE_SCRIPT = '<script>(function(){var last=0;function post(force){var h=Math.ceil(document.documentElement.getBoundingClientRect().height);if(force||h!==last){last=h;parent.postMessage({bylineInteractive:"height",height:h},"*");}}if(window.ResizeObserver){new ResizeObserver(function(){post(false);}).observe(document.documentElement);}addEventListener("load",function(){post(false);});addEventListener("message",function(e){if(e.source===parent&&e.data==="bylineInteractive:measure"){post(true);}});post(true);})();</script>';
const BYLINE_INTERACTIVE_SANDBOX = 'allow-scripts';
const BYLINE_INTERACTIVE_MAX_BYTES = 524288;
const BYLINE_INTERACTIVE_HEIGHTS = ['compact', 'standard', 'tall', 'map'];
/** A `byline/interactive` delimiter with its attributes, matched the way WordPress's block parser reads them. */
const BYLINE_INTERACTIVE_DELIMITER = '#<!--\s+wp:byline/interactive\s+(?:(\{(?:(?:[^}]+|}+(?=})|(?!}\s+/?-->).)*+)?\})\s+)?/?-->#s';

/** The uploaded HTML, or null when the attribute is missing, malformed, too large or not UTF-8. */
function byline_interactive_decode(string $encoded): ?string
{
    if ($encoded === '') {
        return null;
    }
    $html = base64_decode($encoded, true);
    if ($html === false || trim($html) === '' || strlen($html) > BYLINE_INTERACTIVE_MAX_BYTES || preg_match('//u', $html) !== 1) {
        return null;
    }
    return $html;
}

/**
 * The public figure. An unfinished block (no usable file, title or
 * description) prints nothing, like the other story blocks.
 *
 * @param array<string, mixed> $attributes
 */
function byline_interactive_render(array $attributes): string
{
    $html = byline_interactive_decode((string) ($attributes['document'] ?? ''));
    $title = trim(wp_strip_all_tags((string) ($attributes['title'] ?? '')));
    $description = trim(wp_strip_all_tags((string) ($attributes['description'] ?? '')));
    if ($html === null || $title === '' || $description === '') {
        return '';
    }
    $credit = trim(wp_strip_all_tags((string) ($attributes['credit'] ?? '')));
    $height = in_array($attributes['heightPreset'] ?? '', BYLINE_INTERACTIVE_HEIGHTS, true) ? (string) $attributes['heightPreset'] : 'standard';
    $align = in_array($attributes['align'] ?? 'wide', ['wide', 'full'], true) ? ' align' . ($attributes['align'] ?? 'wide') : '';
    $description_id = 'byline-interactive-' . substr(md5($title . "\n" . $html), 0, 10);
    // Escape every entity anew (WordPress's esc_attr would keep "&amp;" as is,
    // and the frame would receive "&"), and keep shortcode brackets inert.
    $srcdoc = str_replace('[', '&#91;', htmlspecialchars($html . BYLINE_INTERACTIVE_RESIZE_SCRIPT, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8', true));

    return '<figure class="wp-block-byline-interactive byline-interactive' . $align . '" data-height="' . $height . '">'
        . '<h3 class="byline-interactive-title">' . esc_html($title) . '</h3>'
        . '<p class="byline-interactive-description" id="' . $description_id . '">' . esc_html($description) . '</p>'
        . '<iframe class="byline-interactive-frame" title="' . esc_attr($title) . '" aria-describedby="' . $description_id . '" sandbox="' . BYLINE_INTERACTIVE_SANDBOX . '" referrerpolicy="no-referrer" loading="lazy" srcdoc="' . $srcdoc . '"></iframe>'
        . '<noscript><p class="byline-interactive-noscript">This interactive needs JavaScript. The description above says what it shows.</p></noscript>'
        . ($credit !== '' ? '<figcaption><p class="photo-credit">Credit: ' . esc_html($credit) . '</p></figcaption>' : '')
        . '</figure>';
}

/**
 * Every interactive file in some post content.
 *
 * @return list<string>
 */
function byline_interactive_documents(string $content): array
{
    if (strpos($content, 'wp:byline/interactive') === false || !preg_match_all(BYLINE_INTERACTIVE_DELIMITER, $content, $matches)) {
        return [];
    }
    $documents = [];
    foreach ($matches[1] as $json) {
        $attributes = $json !== '' ? json_decode($json, true) : [];
        $document = is_array($attributes) ? (string) ($attributes['document'] ?? '') : '';
        if ($document !== '') {
            $documents[] = $document;
        }
    }
    return $documents;
}

/**
 * A save by someone without `unfiltered_html` keeps the interactives already
 * in the post (an autosave or revision compares with its parent) and drops any
 * new or changed one.
 *
 * @param array<string, mixed> $data Slashed post data.
 * @param array<string, mixed> $postarr
 * @return array<string, mixed>
 */
function byline_interactive_guard_post_data(array $data, array $postarr = []): array
{
    $content = wp_unslash((string) ($data['post_content'] ?? ''));
    if (strpos($content, 'wp:byline/interactive') === false || current_user_can('unfiltered_html')) {
        return $data;
    }
    $source_id = ($data['post_type'] ?? '') === 'revision' ? (int) ($data['post_parent'] ?? 0) : (int) ($postarr['ID'] ?? 0);
    $source = $source_id > 0 ? get_post($source_id) : null;
    $allowed = $source ? byline_interactive_documents((string) $source->post_content) : [];
    $removed = false;
    $content = (string) preg_replace_callback(BYLINE_INTERACTIVE_DELIMITER, static function (array $match) use ($allowed, &$removed): string {
        $attributes = ($match[1] ?? '') !== '' ? json_decode($match[1], true) : [];
        $document = is_array($attributes) ? (string) ($attributes['document'] ?? '') : '';
        if ($document === '' || in_array($document, $allowed, true)) {
            return $match[0];
        }
        $removed = true;
        return '';
    }, $content);
    if ($removed) {
        $data['post_content'] = wp_slash($content);
    }
    return $data;
}
add_filter('wp_insert_post_data', 'byline_interactive_guard_post_data', 20, 2);

/** Tells the editor whether to offer the block in the inserter. The save guard is what enforces it. */
function byline_interactive_editor_settings(): void
{
    if (!function_exists('wp_add_inline_script') || !function_exists('generate_block_asset_handle')) {
        return;
    }
    $settings = wp_json_encode(['canAdd' => current_user_can('unfiltered_html')]);
    wp_add_inline_script(generate_block_asset_handle('byline/interactive', 'editorScript'), 'window.bylineInteractive = ' . $settings . ';', 'before');
}
add_action('enqueue_block_editor_assets', 'byline_interactive_editor_settings');
