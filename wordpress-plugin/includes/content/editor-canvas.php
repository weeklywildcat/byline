<?php

/**
 * Makes the Post editing canvas look like the public article.
 *
 * Presentation lives in src/editor-canvas (built to build/editor-canvas.*). This
 * file only decides where it loads: the block editor for Posts, nothing else.
 * Pages keep their own page-blocks styling, and the public site is unaffected.
 */

if (!defined('ABSPATH')) {
    exit;
}

const BYLINE_EDITOR_CANVAS_HANDLE = 'byline-editor-canvas';

function byline_editor_canvas_screen_applies($screen = null): bool
{
    $screen = $screen instanceof WP_Screen ? $screen : (function_exists('get_current_screen') ? get_current_screen() : null);

    return $screen instanceof WP_Screen
        && $screen->base === 'post'
        && $screen->post_type === 'post'
        && method_exists($screen, 'is_block_editor')
        && $screen->is_block_editor();
}

/**
 * Theme variables are added from script, so the canvas tracks the theme package.
 */
function byline_enqueue_editor_canvas_script(): void
{
    if (!byline_editor_canvas_screen_applies()) {
        return;
    }

    $plugin_file = dirname(__DIR__, 2) . '/weekly-wildcat-headless.php';
    $asset_file = dirname(__DIR__, 2) . '/build/editor-canvas.asset.php';
    $script_file = dirname(__DIR__, 2) . '/build/editor-canvas.js';
    if (!file_exists($asset_file) || !file_exists($script_file)) {
        return;
    }

    $asset = include $asset_file;
    $dependencies = is_array($asset) && is_array($asset['dependencies'] ?? null) ? $asset['dependencies'] : [];
    $version = is_array($asset) && is_string($asset['version'] ?? null) ? $asset['version'] : (string) filemtime($script_file);

    wp_enqueue_script(
        BYLINE_EDITOR_CANVAS_HANDLE,
        plugins_url('build/editor-canvas.js', $plugin_file),
        $dependencies,
        $version,
        true
    );
}
add_action('enqueue_block_editor_assets', 'byline_enqueue_editor_canvas_script');

/**
 * Styles enqueued here are copied into the editor's iframe, which is why this is
 * not admin_enqueue_scripts.
 */
function byline_enqueue_editor_canvas_style(): void
{
    if (!is_admin() || !byline_editor_canvas_screen_applies()) {
        return;
    }

    $plugin_file = dirname(__DIR__, 2) . '/weekly-wildcat-headless.php';
    $style_file = dirname(__DIR__, 2) . '/build/editor-canvas.css';
    if (!file_exists($style_file)) {
        return;
    }

    wp_enqueue_style(
        BYLINE_EDITOR_CANVAS_HANDLE,
        plugins_url('build/editor-canvas.css', $plugin_file),
        [],
        (string) filemtime($style_file)
    );
}
add_action('enqueue_block_assets', 'byline_enqueue_editor_canvas_style');
