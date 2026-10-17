<?php

/**
 * The Guest Contributors screen prints its photo-picker script inline, before
 * WordPress has loaded wp.media. A script that checks for wp.media while the
 * page is parsed finds nothing, never attaches its click handler, and "Choose
 * photo" silently does nothing. The check has to happen when the button is
 * clicked.
 */

define('ABSPATH', __DIR__ . '/../');

function add_action(): void
{
}
function __(string $text): string
{
    return $text;
}
function wp_json_encode($value): string
{
    return (string) json_encode($value);
}

require __DIR__ . '/../includes/editorial/guests-admin.php';

ob_start();
byline_guests_print_photo_script();
$script = (string) ob_get_clean();

$handler = strpos($script, "select.addEventListener('click'");
$media_check = strpos($script, '!wp.media');

if ($handler === false || $media_check === false) {
    fwrite(STDERR, "The photo picker script lost its click handler or its wp.media check.\n");
    exit(1);
}

if ($media_check < $handler) {
    fwrite(STDERR, "The photo picker checks for wp.media while the page is parsed, before WordPress loads it, so Choose photo would do nothing. Check at click time instead.\n");
    exit(1);
}

echo "Guest screen photo picker regression passed.\n";
