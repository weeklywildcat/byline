<?php

$plugin_file = dirname(__DIR__) . '/weekly-wildcat-headless.php';
$source = file_get_contents($plugin_file);

if (!is_string($source)) {
    fwrite(STDERR, "Could not read the plugin entrypoint.\n");
    exit(1);
}

$required = [
    'wwh-author-profile-editor',
    'wwh-author-profile-card',
    'wwh-author-photo-field',
    'wwh-author-profile-fields',
    'wwh-author-socials',
    'Contact &amp; social links',
    'Short bio',
    'Biographical Info',
    "select.closest('.wwh-author-photo-field')",
    "remove.closest('.wwh-author-photo-field')",
];

foreach ($required as $needle) {
    if (strpos($source, $needle) === false) {
        fwrite(STDERR, "Author profile editor is missing expected structure: {$needle}.\n");
        exit(1);
    }
}

if (strpos($source, '<table class="form-table wwh-author-profile"') !== false) {
    fwrite(STDERR, "Author profile editor regressed to the old row-per-field table layout.\n");
    exit(1);
}

if (strpos($source, 'body.profile-php .user-profile-picture') === false) {
    fwrite(STDERR, "The duplicate WordPress profile-picture row is no longer hidden.\n");
    exit(1);
}

echo "Byline author profile editor regression passed.\n";
