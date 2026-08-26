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

$production_files = [
    __DIR__ . '/../includes/publication/config.php',
    __DIR__ . '/../includes/discord-integration.php',
];
foreach ($production_files as $file) {
    $source = file_get_contents($file);
    if (!is_string($source) || preg_match('/\\bstr_(?:starts|ends)_with\\s*\\(/', $source) === 1) {
        fwrite(STDERR, "PHP 8-only string helper found in production source: {$file}\n");
        exit(1);
    }
}

$entrypoint = file_get_contents(__DIR__ . '/../weekly-wildcat-headless.php');
if (!is_string($entrypoint)
    || strpos($entrypoint, 'Requires PHP: 7.4') === false
    || strpos($entrypoint, "includes/core/compatibility.php") === false) {
    fwrite(STDERR, "Plugin PHP baseline or early compatibility bootstrap is missing.\n");
    exit(1);
}

echo "PHP 7.4 compatibility regression passed.\n";
