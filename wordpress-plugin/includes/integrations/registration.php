<?php

/**
 * Explicit local registration entrypoint for the optional backend slice.
 *
 * The canonical plugin bootstrap loads this adapter after the core/editorial
 * domains are available.  Keeping the file as an explicit registration seam
 * still makes focused tests and host integrations able to opt out of optional
 * integrations without creating a second implementation.
 */

if (!defined('ABSPATH')) {
    exit;
}

function byline_register_optional_backend_slice(array $options = []): void
{
    static $loaded = false;
    if (!$loaded) {
        $files = [
            __DIR__ . '/http.php',
            __DIR__ . '/distribution.php',
            __DIR__ . '/newsletter.php',
            __DIR__ . '/analytics.php',
            __DIR__ . '/search-gaps.php',
            dirname(__DIR__) . '/content-health/checks.php',
            dirname(__DIR__) . '/content-health/scanner.php',
            dirname(__DIR__) . '/content-health/rest.php',
            dirname(__DIR__) . '/commands/commands.php',
            __DIR__ . '/abilities.php',
        ];
        foreach ($files as $file) {
            if (is_string($file) && file_exists($file)) {
                require_once $file;
            }
        }
        $loaded = true;
    }

    if (function_exists('byline_register_distribution_hooks')) {
        byline_register_distribution_hooks();
    }
    if (function_exists('byline_register_newsletter_hooks')) {
        byline_register_newsletter_hooks();
    }
    if (function_exists('byline_register_analytics_hooks')) {
        byline_register_analytics_hooks();
    }
    if (function_exists('byline_register_search_gaps_hooks')) {
        byline_register_search_gaps_hooks();
    }
    if (function_exists('byline_register_content_health_hooks')) {
        byline_register_content_health_hooks();
    }
    if (($options['commands'] ?? true) && function_exists('byline_register_command_palette_hooks')) {
        byline_register_command_palette_hooks();
    }
    if (($options['abilities'] ?? true) && function_exists('byline_register_abilities_hooks')) {
        byline_register_abilities_hooks();
    }
}

// A descriptive alias makes the entrypoint easy to discover for local hosts.
function byline_register_optional_integrations(array $options = []): void
{
    byline_register_optional_backend_slice($options);
}
