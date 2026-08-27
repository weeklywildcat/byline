<?php

$plugin_source = file_get_contents(__DIR__ . '/../weekly-wildcat-headless.php');
if (!is_string($plugin_source)) {
    fwrite(STDERR, "Could not read the installed plugin entrypoint.\n");
    exit(1);
}

$remote_entrypoint = dirname(__DIR__, 2) . '/weekly-wildcat-headless.php';
$expected_target = 'wordpress-plugin/weekly-wildcat-headless.php';
if (!is_link($remote_entrypoint)
    || readlink($remote_entrypoint) !== $expected_target
    || realpath($remote_entrypoint) !== realpath(__DIR__ . '/../weekly-wildcat-headless.php')
    || file_get_contents($remote_entrypoint) !== $plugin_source) {
    fwrite(STDERR, "The root PUC entrypoint no longer resolves to the canonical monorepo plugin source.\n");
    exit(1);
}

if (preg_match('/function wwh_register_update_checker\(\): void\s*\{(?P<body>.*?)\n\}/s', $plugin_source, $matches) !== 1) {
    fwrite(STDERR, "Could not locate the updater registration function.\n");
    exit(1);
}

$updater = $matches['body'];
if (strpos($updater, "'https://github.com/weeklywildcat/byline/'") === false
    || strpos($updater, "'https://github.com/weeklywildcat/byline-plugin/'") !== false
    || strpos($updater, "'weekly-wildcat-headless'") === false
    || strpos($updater, 'weekly-wildcat-headless\\.zip') === false) {
    fwrite(STDERR, "The updater bridge no longer preserves the canonical repository, installed slug, and release asset contract.\n");
    exit(1);
}

echo "Byline updater bridge and remote source-path regression passed.\n";
