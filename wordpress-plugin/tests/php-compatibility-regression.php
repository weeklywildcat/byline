<?php

define('ABSPATH', __DIR__ . '/../');
require __DIR__ . '/../includes/core/compatibility.php';

if (!byline_string_starts_with('WWH_SECRET', 'WWH_')
    || byline_string_starts_with('BYLINE_SECRET', 'WWH_')
    || !byline_string_ends_with('cms.weeklywildcat.com', '.weeklywildcat.com')
    || byline_string_ends_with('weeklywildcat.example', '.weeklywildcat.com')) {
    fwrite(STDERR, "PHP-compatible string helpers returned incorrect results.\n");
    exit(1);
}

$production_files = [__DIR__ . '/../weekly-wildcat-headless.php'];
$iterator = new RecursiveIteratorIterator(
    new RecursiveDirectoryIterator(__DIR__ . '/../includes', FilesystemIterator::SKIP_DOTS)
);
foreach ($iterator as $file_info) {
    if ($file_info->isFile() && $file_info->getExtension() === 'php') {
        $production_files[] = $file_info->getPathname();
    }
}
sort($production_files);

// Syntax-level PHP 8 features are caught by the 7.4 lint pass in CI; these are
// the runtime helpers a 7.4 host would only fail on when the code path runs.
$php8_only = '/\\b(?:str_starts_with|str_ends_with|str_contains|array_is_list)\\s*\\(/';
foreach ($production_files as $file) {
    $source = file_get_contents($file);
    if (!is_string($source) || preg_match($php8_only, $source) === 1) {
        fwrite(STDERR, "PHP 8-only helper found in production source: {$file}\n");
        exit(1);
    }
    if (is_string($source) && (strpos($source, '?->') !== false || preg_match('/\\bmatch\\s*\\(/', $source) === 1)) {
        fwrite(STDERR, "PHP 8-only syntax found in production source: {$file}\n");
        exit(1);
    }
}

if (count($production_files) < 20
    || !in_array(__DIR__ . '/../includes/core/upgrade.php', $production_files, true)
    || !in_array(__DIR__ . '/../includes/core/health.php', $production_files, true)) {
    fwrite(STDERR, "The complete Byline production include tree was not covered by the PHP baseline scan.\n");
    exit(1);
}

$entrypoint = file_get_contents(__DIR__ . '/../weekly-wildcat-headless.php');
if (!is_string($entrypoint)
    || strpos($entrypoint, 'Requires PHP: 7.4') === false
    || strpos($entrypoint, "includes/core/compatibility.php") === false) {
    fwrite(STDERR, "Plugin PHP baseline or early compatibility bootstrap is missing.\n");
    exit(1);
}

echo "PHP 7.4 compatibility regression passed.\n";
