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
if (strpos($updater, "'https://github.com/weeklywildcat/byline/'") === false
    || strpos($updater, "'https://github.com/weeklywildcat/byline-plugin/'") !== false
    || strpos($updater, "'weekly-wildcat-headless'") === false
    || strpos($updater, 'weekly-wildcat-headless\\.zip') === false) {
    fwrite(STDERR, "The updater bridge no longer preserves the canonical repository, installed slug, and release asset contract.\n");
    exit(1);
}

echo "Byline updater bridge regression passed.\n";
