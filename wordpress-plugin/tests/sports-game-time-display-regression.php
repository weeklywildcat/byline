<?php

define('ABSPATH', __DIR__ . '/../');
define('WP_PLUGIN_DIR', dirname(__DIR__));
define('WPMU_PLUGIN_DIR', dirname(__DIR__));
define('WP_DEBUG', false);

function add_action(...$args): void
{
}

function add_filter(...$args): void
{
}

function apply_filters(string $hook_name, $value, ...$args)
{
    return $value;
}

function did_action(string $hook_name): int
{
    return 0;
}

function register_deactivation_hook(...$args): void
{
}

function wp_parse_url(string $url, int $component = -1)
{
    return $component === -1 ? parse_url($url) : parse_url($url, $component);
}

function plugin_basename(string $file): string
{
    return basename($file);
}

function wp_next_scheduled(...$args)
{
    return false;
}

function wp_schedule_event(...$args): bool
{
    return true;
}

function wp_timezone(): DateTimeZone
{
    return new DateTimeZone('America/New_York');
}

function wp_date(string $format, int $timestamp, ?DateTimeZone $timezone = null): string
{
    return (new DateTimeImmutable('@' . $timestamp))
        ->setTimezone($timezone ?? wp_timezone())
        ->format($format);
}

require __DIR__ . '/../weekly-wildcat-headless.php';

$date = wwh_format_date_text('2026-04-24T18:00');
$time = wwh_format_time_text('2026-04-24T18:00', '', false);

if ($date !== 'Apr 24, 2026 6:00 PM') {
    fwrite(STDERR, sprintf("Expected date text to stay local, got: %s\n", $date));
    exit(1);
}

if ($time !== '6:00 PM') {
    fwrite(STDERR, sprintf("Expected time text to stay local, got: %s\n", $time));
    exit(1);
}

echo "Sports game local time display regression passed.\n";
