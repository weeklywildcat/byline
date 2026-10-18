<?php

$notifications_file = dirname(__DIR__) . '/includes/editorial/notifications.php';
$plugin_file = dirname(__DIR__) . '/weekly-wildcat-headless.php';

$notifications = file_get_contents($notifications_file);
$plugin = file_get_contents($plugin_file);

if (!is_string($notifications) || !is_string($plugin)) {
    fwrite(STDERR, "Could not read notification profile UI sources.\n");
    exit(1);
}

$required_markup = [
    'byline-notification-settings',
    'byline-notification-grid',
    'byline-notification-option',
    'byline-notification-input',
    'byline-notification-switch',
    'byline-notification-description',
    'These settings affect email only.',
];

foreach ($required_markup as $needle) {
    if (strpos($notifications, $needle) === false) {
        fwrite(STDERR, "Notification settings are missing expected UI: {$needle}.\n");
        exit(1);
    }
}

$profile_start = strpos($notifications, 'function byline_editorial_notification_profile_fields');
$profile_end = strpos($notifications, 'function byline_editorial_notification_save_profile', $profile_start ?: 0);
$profile_source = $profile_start !== false && $profile_end !== false
    ? substr($notifications, $profile_start, $profile_end - $profile_start)
    : '';

if ($profile_source === '' || strpos($profile_source, '<table') !== false || strpos($profile_source, 'Email me about this event') !== false) {
    fwrite(STDERR, "Notification preferences regressed to the legacy table/list renderer.\n");
    exit(1);
}

$required_styles = [
    '.byline-notification-grid',
    '.byline-notification-option',
    '.byline-notification-input:checked + .byline-notification-switch',
    '.byline-notification-input:focus-visible + .byline-notification-switch',
];

foreach ($required_styles as $needle) {
    if (strpos($plugin, $needle) === false) {
        fwrite(STDERR, "Notification settings are missing expected profile styles: {$needle}.\n");
        exit(1);
    }
}

echo "Byline notification settings UI regression passed.\n";
