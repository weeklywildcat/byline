<?php

if (!defined('ABSPATH')) {
    exit;
}

const BYLINE_DESIGN_MAX_BYTES = 1000000;
const BYLINE_DESIGN_MAX_BLOCKS = 200;

function byline_design_conflict(int $base_revision, int $published_revision)
{
    if ($base_revision === $published_revision) {
        return null;
    }
    return new WP_Error(
        'byline_design_conflict',
        __('Another editor published this design. Reload before reapplying your changes.', 'weekly-wildcat-headless'),
        ['status' => 409, 'publishedRevision' => $published_revision]
    );
}

function byline_design_templates(): array
{
    $templates = ['home', 'section-default', 'article-default', 'author-default', 'sports-home'];
    $filtered = function_exists('apply_filters') ? apply_filters('byline_design_templates', $templates) : $templates;
    return is_array($filtered)
        ? array_values(array_unique(array_filter($filtered, static fn($template): bool => is_string($template) && preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/', $template) === 1)))
        : $templates;
}

function byline_design_block_ids(): array
{
    $blocks = [
        'story-lead', 'story-grid', 'story-list', 'latest-stories', 'featured-story', 'section-feed',
        'opinion-package', 'photo-feature', 'special-coverage', 'sports-scores', 'sports-upcoming',
        'team-feature', 'athlete-feature', 'events-list', 'poll', 'newsletter', 'section', 'columns', 'divider',
    ];
    $filtered = function_exists('apply_filters') ? apply_filters('byline_design_block_ids', $blocks) : $blocks;
    return is_array($filtered)
        ? array_values(array_unique(array_filter($filtered, static fn($block): bool => is_string($block) && preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)?$/', $block) === 1)))
        : $blocks;
}

function byline_design_feature_for_block(string $block): ?string
{
    if (in_array($block, ['sports-scores', 'sports-upcoming', 'team-feature', 'athlete-feature'], true)) {
        return 'sports';
    }
    if ($block === 'events-list') {
        return 'events';
    }
    if ($block === 'poll') {
        return 'polls';
    }
    if ($block === 'newsletter') {
        return 'newsletter';
    }
    $feature = null;
    if (function_exists('apply_filters')) {
        $filtered = apply_filters('byline_design_block_feature', $feature, $block);
        return is_string($filtered) && preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/', $filtered) === 1 ? $filtered : null;
    }
    return $feature;
}

function byline_is_design_template(string $template): bool
{
    return in_array($template, byline_design_templates(), true)
        || preg_match('/^section:[a-z0-9]+(?:-[a-z0-9]+)*$/', $template) === 1;
}

function byline_design_value_is_safe($value, int $depth = 0): bool
{
    if ($depth > 12) {
        return false;
    }
    if (is_null($value) || is_bool($value) || is_int($value) || is_float($value)) {
        return true;
    }
    if (is_string($value)) {
        return strlen($value) <= 10000 && preg_match('/<(?:script|style|iframe|object|embed)\b|javascript:/i', $value) !== 1;
    }
    if (!is_array($value)) {
        return false;
    }

    foreach ($value as $key => $child) {
        if (is_string($key) && preg_match('/^(?:html|rawHtml|css|script|code|dangerouslySetInnerHTML)$/i', $key) === 1) {
            return false;
        }
        if (!byline_design_value_is_safe($child, $depth + 1)) {
            return false;
        }
    }
    return true;
}

function byline_design_story_blocks(): array
{
    return [
        'story-lead', 'story-grid', 'story-list', 'latest-stories', 'featured-story', 'section-feed',
        'opinion-package', 'photo-feature', 'special-coverage', 'team-feature', 'athlete-feature',
    ];
}

function byline_validate_story_query($query): bool
{
    if (!is_array($query) || !is_string($query['type'] ?? null)) {
        return false;
    }
    if ($query['type'] === 'manual') {
        if (!is_array($query['postIds'] ?? null) || count($query['postIds']) > 50) {
            return false;
        }
        foreach ($query['postIds'] as $post_id) {
            if (!is_int($post_id) || $post_id <= 0) {
                return false;
            }
        }
        return true;
    }
    if (!in_array($query['type'], ['latest', 'sticky', 'category', 'tag', 'author'], true)
        || !is_int($query['limit'] ?? null)
        || $query['limit'] < 1
        || $query['limit'] > 50) {
        return false;
    }
    $source_key = ['category' => 'categoryId', 'tag' => 'tagId', 'author' => 'authorId'][$query['type']] ?? null;
    return !$source_key || (is_int($query[$source_key] ?? null) && $query[$source_key] > 0);
}

function byline_validate_design_document($document, string $template)
{
    if (!is_array($document) || !byline_is_design_template($template)) {
        return new WP_Error('byline_invalid_design', __('The design document or template is invalid.', 'weekly-wildcat-headless'), ['status' => 400]);
    }
    $encoded = wp_json_encode($document);
    if (!is_string($encoded) || strlen($encoded) > BYLINE_DESIGN_MAX_BYTES) {
        return new WP_Error('byline_design_too_large', __('The design document is too large.', 'weekly-wildcat-headless'), ['status' => 413]);
    }
    if ((int) ($document['schemaVersion'] ?? 0) !== BYLINE_DESIGN_SCHEMA_VERSION
        || ($document['template'] ?? null) !== $template
        || !is_string($document['theme'] ?? null)
        || preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/', $document['theme']) !== 1) {
        return new WP_Error('byline_invalid_design_identity', __('The design schema, template, or theme is invalid.', 'weekly-wildcat-headless'), ['status' => 400]);
    }

    $editor = is_array($document['editor'] ?? null) ? $document['editor'] : [];
    if (($editor['engine'] ?? null) !== 'puck'
        || !is_string($editor['version'] ?? null)
        || preg_match('/^[0-9]+(?:\.[0-9]+){1,2}(?:-[A-Za-z0-9.-]+)?$/', $editor['version']) !== 1) {
        return new WP_Error('byline_invalid_design_editor', __('The design editor contract is invalid.', 'weekly-wildcat-headless'), ['status' => 400]);
    }

    $layout = is_array($document['layout'] ?? null) ? $document['layout'] : [];
    $content = is_array($layout['content'] ?? null) ? $layout['content'] : null;
    if (!is_array($layout['root'] ?? null) || $content === null || count($content) > BYLINE_DESIGN_MAX_BLOCKS) {
        return new WP_Error('byline_invalid_design_layout', __('The design layout is malformed or contains too many blocks.', 'weekly-wildcat-headless'), ['status' => 400]);
    }

    $features = byline_get_publication_config()['features'];
    foreach ($content as $block) {
        if (!is_array($block) || !is_string($block['type'] ?? null) || !in_array($block['type'], byline_design_block_ids(), true)) {
            return new WP_Error('byline_unknown_design_block', __('The design contains an unsupported block.', 'weekly-wildcat-headless'), ['status' => 400]);
        }
        if (!is_array($block['props'] ?? null) || !byline_design_value_is_safe($block['props'])) {
            return new WP_Error('byline_unsafe_design_props', __('The design contains unsafe or malformed block properties.', 'weekly-wildcat-headless'), ['status' => 400]);
        }
        if (in_array($block['type'], byline_design_story_blocks(), true)
            && array_key_exists('query', $block['props'])
            && !byline_validate_story_query($block['props']['query'])) {
            return new WP_Error('byline_invalid_story_query', __('A story block contains an invalid or unbounded content query.', 'weekly-wildcat-headless'), ['status' => 400]);
        }
        if (array_key_exists('allowDuplicates', $block['props']) && !is_bool($block['props']['allowDuplicates'])) {
            return new WP_Error('byline_invalid_duplicate_setting', __('The duplicate-story setting must be true or false.', 'weekly-wildcat-headless'), ['status' => 400]);
        }
        if (isset($block['props']['focalPoint'])) {
            $point = $block['props']['focalPoint'];
            if (!is_array($point)
                || !is_numeric($point['x'] ?? null)
                || !is_numeric($point['y'] ?? null)
                || $point['x'] < 0 || $point['x'] > 100
                || $point['y'] < 0 || $point['y'] > 100) {
                return new WP_Error('byline_invalid_focal_point', __('A media focal point is outside the supported range.', 'weekly-wildcat-headless'), ['status' => 400]);
            }
        }
        $feature = byline_design_feature_for_block($block['type']);
        if ($feature && empty($features[$feature])) {
            return new WP_Error('byline_disabled_design_module', sprintf(__('The %s module is disabled for this publication.', 'weekly-wildcat-headless'), $feature), ['status' => 400]);
        }
    }

    if (!byline_design_value_is_safe($layout['root'])) {
        return new WP_Error('byline_unsafe_design_root', __('The design root contains unsafe properties.', 'weekly-wildcat-headless'), ['status' => 400]);
    }

    return true;
}

function byline_default_design_document(string $template): array
{
    $publication = byline_get_publication_config();
    $blocks = $template === 'home'
        ? ['story-lead', 'latest-stories', 'opinion-package', 'photo-feature', 'special-coverage', 'sports-scores', 'sports-upcoming', 'events-list', 'poll', 'newsletter']
        : ($template === 'sports-home' ? ['sports-scores', 'sports-upcoming', 'team-feature', 'latest-stories'] : ['section-feed']);
    $blocks = array_values(array_filter($blocks, static function (string $block) use ($publication): bool {
        $feature = byline_design_feature_for_block($block);
        return !$feature || !empty($publication['features'][$feature]);
    }));

    return [
        'schemaVersion' => BYLINE_DESIGN_SCHEMA_VERSION,
        'template' => $template,
        'theme' => $publication['appearance']['theme'],
        'editor' => ['engine' => 'puck', 'version' => '0.23.0'],
        'layout' => [
            'root' => ['props' => []],
            'content' => array_map(static fn(string $block, int $index): array => [
                'type' => $block,
                'props' => ['id' => $block . '-' . ($index + 1)],
            ], $blocks, array_keys($blocks)),
        ],
    ];
}
