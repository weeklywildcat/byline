<?php

/**
 * Every hook and REST callback the plugin registers by name must resolve to a
 * function the plugin actually defines. WordPress calls these through
 * call_user_func(), so a registration left pointing at a deleted function is a
 * fatal error on the request that fires it — a dangling attachment REST field
 * callback once broke every /wp/v2/media response, which the block editor
 * surfaces as "Could not retrieve the featured image data."
 */

$plugin_root = dirname(__DIR__);

$sources = [$plugin_root . '/weekly-wildcat-headless.php'];
$iterator = new RecursiveIteratorIterator(
    new RecursiveDirectoryIterator($plugin_root . '/includes', FilesystemIterator::SKIP_DOTS)
);
foreach ($iterator as $file_info) {
    if ($file_info->isFile() && $file_info->getExtension() === 'php') {
        $sources[] = $file_info->getPathname();
    }
}
sort($sources);

if (count($sources) < 20) {
    fwrite(STDERR, "The Byline production include tree was not discovered for the callback scan.\n");
    exit(1);
}

// Only plugin-owned callbacks are checked. WordPress core callbacks such as
// absint or __return_true are not defined in this tree by design.
$plugin_callback = '(?:wwh|byline)_[A-Za-z0-9_]+';
$callback_patterns = [
    '/add_(?:action|filter|shortcode)\(\s*[\'"][^\'"]*[\'"]\s*,\s*[\'"](' . $plugin_callback . ')[\'"]/',
    '/[\'"](?:get_callback|update_callback|callback|permission_callback|sanitize_callback|validate_callback|auth_callback|render_callback)[\'"]\s*=>\s*[\'"](' . $plugin_callback . ')[\'"]/',
];

$defined = [];
$references = [];

foreach ($sources as $source_path) {
    $source = file_get_contents($source_path);
    if (!is_string($source)) {
        fwrite(STDERR, "Unable to read production source: {$source_path}\n");
        exit(1);
    }

    if (preg_match_all('/^\s*function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/m', $source, $matches) > 0) {
        foreach ($matches[1] as $name) {
            $defined[$name] = true;
        }
    }

    foreach ($callback_patterns as $pattern) {
        if (preg_match_all($pattern, $source, $matches, PREG_OFFSET_CAPTURE) < 1) {
            continue;
        }
        foreach ($matches[1] as $match) {
            $references[] = [
                'file' => $source_path,
                'line' => substr_count(substr($source, 0, $match[1]), "\n") + 1,
                'callback' => $match[0],
            ];
        }
    }
}

$dangling = [];
foreach ($references as $reference) {
    if (!isset($defined[$reference['callback']])) {
        $dangling[] = sprintf(
            '%s:%d references undefined callback %s()',
            str_replace($plugin_root . '/', '', $reference['file']),
            $reference['line'],
            $reference['callback']
        );
    }
}

if ($dangling !== []) {
    fwrite(STDERR, "Registered callbacks are missing their functions:\n  " . implode("\n  ", $dangling) . "\n");
    exit(1);
}

if (count($references) < 100) {
    fwrite(STDERR, sprintf("The callback scan only found %d registrations; the patterns no longer match production code.\n", count($references)));
    exit(1);
}

// The attachment REST fields the public site reads for image credit and
// license metadata must stay wired to a real callback.
$entrypoint = file_get_contents($plugin_root . '/weekly-wildcat-headless.php');
foreach (['weeklyWildcatImage', 'bylineImage'] as $field) {
    if (!is_string($entrypoint) || strpos($entrypoint, "register_rest_field('attachment', '{$field}'") === false) {
        fwrite(STDERR, "The {$field} attachment REST field registration is missing.\n");
        exit(1);
    }
}

if (!isset($defined['wwh_rest_image_credit'])) {
    fwrite(STDERR, "wwh_rest_image_credit() is missing; /wp/v2/media responses would fatal.\n");
    exit(1);
}

echo sprintf("Callback registration regression passed (%d registrations checked).\n", count($references));
