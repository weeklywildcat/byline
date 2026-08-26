<?php

$plugin_source = file_get_contents(__DIR__ . '/../weekly-wildcat-headless.php');
if (!is_string($plugin_source)) {
    fwrite(STDERR, "Could not read the installed plugin entrypoint.\n");
    exit(1);
}

if (preg_match('/function wwh_register_update_checker\(\): void\s*\{(?P<body>.*?)\n\}/s', $plugin_source, $matches) !== 1) {
    fwrite(STDERR, "Could not locate the updater registration function.\n");
    exit(1);
}

$updater = $matches['body'];
if (!str_contains($updater, "'https://github.com/weeklywildcat/byline/'")
    || str_contains($updater, "'https://github.com/weeklywildcat/byline-plugin/'")
    || !str_contains($updater, "'weekly-wildcat-headless'")
    || !str_contains($updater, 'weekly-wildcat-headless\\.zip')) {
    fwrite(STDERR, "The updater bridge no longer preserves the canonical repository, installed slug, and release asset contract.\n");
    exit(1);
}

echo "Byline updater bridge regression passed.\n";
