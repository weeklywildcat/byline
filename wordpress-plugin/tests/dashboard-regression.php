<?php

$dashboard_file = dirname(__DIR__) . '/includes/admin/dashboard.php';
$source = file_get_contents($dashboard_file);
if (!is_string($source)) {
    fwrite(STDERR, "Could not read the newsroom dashboard module.\n");
    exit(1);
}

foreach (['My stories', 'Needs review', 'Deadlines', 'Scheduled', 'Recently published', 'Site status', 'Quick actions'] as $widget) {
    if (strpos($source, $widget) === false) {
        fwrite(STDERR, "Dashboard widget is missing: {$widget}.\n");
        exit(1);
    }
}
if (strpos($source, "current_user_can('edit_post'") === false || strpos($source, 'BYLINE_MANAGE_INTEGRATIONS_CAPABILITY') === false) {
    fwrite(STDERR, "Dashboard permission checks are missing.\n");
    exit(1);
}

fwrite(STDOUT, "Byline newsroom dashboard regression passed.\n");
