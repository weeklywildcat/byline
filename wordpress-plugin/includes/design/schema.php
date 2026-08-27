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

function byline_design_package_types(): array
{
    // Semantic schema 2 packages. A type only appears here once a resolver and a
    // renderer exist for it on the frontend.
    return ['lead-package', 'sports-package'];
}

// Schema 2 splits "which stories" from "how many", so a source carries no limit.
function byline_validate_story_source($source): bool
{
    if (!is_array($source) || !is_string($source['type'] ?? null)) {
        return false;
    }
    if ($source['type'] === 'manual') {
        if (!is_array($source['storyIds'] ?? null) || count($source['storyIds']) > 50) {
            return false;
        }
        foreach ($source['storyIds'] as $story_id) {
            if (!is_int($story_id) || $story_id <= 0) {
                return false;
            }
        }
        return true;
    }
    // "the current athlete spotlight" is a standing editorial convention rather
    // than a query, so it carries no key of its own.
    if ($source['type'] === 'athlete-spotlight') {
        return true;
    }
    if ($source['type'] === 'section') {
        return is_string($source['slug'] ?? null)
            && preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/', $source['slug']) === 1;
    }
    if (!in_array($source['type'], ['latest', 'sticky', 'category', 'tag', 'author'], true)) {
        return false;
    }
    $source_key = ['category' => 'categoryId', 'tag' => 'tagId', 'author' => 'authorId'][$source['type']] ?? null;
    return !$source_key || (is_int($source[$source_key] ?? null) && $source[$source_key] > 0);
}

/**
 * Validates a schema 2 design document.
 *
 * Storage accepts both schema 1 and schema 2 while the homepage is being moved
 * package by package: schema 1 designs still exist and must remain loadable so
 * they can be migrated rather than discarded. This is transitional, not a second
 * permanent schema -- the advertised BYLINE_DESIGN_SCHEMA_VERSION stays at 1
 * until every package has been extracted and schema 1 can be dropped in one
 * coordinated release.
 */
function byline_validate_design_document_v2(array $document, string $template)
{
    if (!is_array($document['packages'] ?? null)) {
        return new WP_Error('byline_invalid_design_layout', __('The design has no package list.', 'weekly-wildcat-headless'), ['status' => 400]);
    }
    if (count($document['packages']) > BYLINE_DESIGN_MAX_BLOCKS) {
        return new WP_Error('byline_invalid_design_layout', __('The design contains too many packages.', 'weekly-wildcat-headless'), ['status' => 400]);
    }

    // Preserved schema 1 blocks travel with a schema 2 document so a migrated
    // design does not lose sections that have no package yet. They are inert --
    // never rendered, never edited -- but they are still persisted data, so they
    // are held to the same safety rules as package props.
    if (array_key_exists('legacy', $document)) {
        $legacy = $document['legacy'];
        if (!is_array($legacy)
            || !is_array($legacy['unconvertedBlocks'] ?? null)
            || count($legacy['unconvertedBlocks']) > BYLINE_DESIGN_MAX_BLOCKS
            || !byline_design_value_is_safe($legacy)) {
            return new WP_Error('byline_unsafe_design_props', __('The design contains unsafe or malformed legacy data.', 'weekly-wildcat-headless'), ['status' => 400]);
        }
        foreach ($legacy['unconvertedBlocks'] as $block) {
            if (!is_array($block) || !is_string($block['type'] ?? null) || !is_array($block['props'] ?? null)) {
                return new WP_Error('byline_unsafe_design_props', __('The design contains malformed legacy data.', 'weekly-wildcat-headless'), ['status' => 400]);
            }
        }
    }

    $seen_ids = [];
    foreach ($document['packages'] as $design_package) {
        if (!is_array($design_package)
            || !is_string($design_package['id'] ?? null)
            || preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/', $design_package['id']) !== 1) {
            return new WP_Error('byline_invalid_design_package', __('A design package has an invalid identifier.', 'weekly-wildcat-headless'), ['status' => 400]);
        }
        if (in_array($design_package['id'], $seen_ids, true)) {
            return new WP_Error('byline_invalid_design_package', __('A design package identifier is repeated.', 'weekly-wildcat-headless'), ['status' => 400]);
        }
        $seen_ids[] = $design_package['id'];

        if (!is_string($design_package['type'] ?? null)
            || !in_array($design_package['type'], byline_design_package_types(), true)) {
            return new WP_Error('byline_unknown_design_block', __('The design contains an unsupported package.', 'weekly-wildcat-headless'), ['status' => 400]);
        }
        if (!is_array($design_package['props'] ?? null) || !byline_design_value_is_safe($design_package['props'])) {
            return new WP_Error('byline_unsafe_design_props', __('The design contains unsafe or malformed package properties.', 'weekly-wildcat-headless'), ['status' => 400]);
        }

        // Every slot that can carry a content source is checked, whichever
        // package it belongs to. Storage validates the shape; the frontend
        // parsers are what give a malformed value its safe default.
        foreach (['lead', 'latest', 'stories', 'athleteSpotlight'] as $slot) {
            $config = $design_package['props'][$slot] ?? null;
            if (is_array($config)
                && array_key_exists('source', $config)
                && !byline_validate_story_source($config['source'])) {
                return new WP_Error('byline_invalid_story_query', __('A package contains an invalid content source.', 'weekly-wildcat-headless'), ['status' => 400]);
            }
        }
    }

    return true;
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
    // Storage reads both schemas during the transition: 1 because stored designs
    // still exist, 2 because that is what Studio now writes. This is separate
    // from BYLINE_DESIGN_ADVERTISED_SCHEMA_VERSION, which is the compatibility
    // number frontends check.
    $schema_version = (int) ($document['schemaVersion'] ?? 0);
    if (!in_array($schema_version, [1, 2], true)
        || ($document['template'] ?? null) !== $template
        || !is_string($document['theme'] ?? null)
        || preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/', $document['theme']) !== 1) {
        return new WP_Error('byline_invalid_design_identity', __('The design schema, template, or theme is invalid.', 'weekly-wildcat-headless'), ['status' => 400]);
    }

    // Schema 2 carries semantic packages and no editor block; it is validated
    // separately rather than being forced through the schema 1 layout checks.
    if ($schema_version === 2) {
        return byline_validate_design_document_v2($document, $template);
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
