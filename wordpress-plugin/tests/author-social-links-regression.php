<?php

/**
 * Focused normalization coverage without a running WordPress installation.
 */

define('ABSPATH', dirname(__DIR__) . '/');

function esc_url_raw(string $value, array $protocols = ['http', 'https']): string
{
    return in_array(strtolower((string) parse_url($value, PHP_URL_SCHEME)), $protocols, true) ? $value : '';
}

require_once dirname(__DIR__) . '/includes/author/social-links.php';

$cases = [
    ['instagram', '@weeklywildcat', 'https://www.instagram.com/weeklywildcat'],
    ['instagram', 'weeklywildcat', 'https://www.instagram.com/weeklywildcat'],
    ['instagram', 'https://instagram.com/weeklywildcat/', 'https://instagram.com/weeklywildcat/'],
    ['tiktok', '@weeklywildcat', 'https://www.tiktok.com/@weeklywildcat'],
    ['x', '@weeklywildcat', 'https://x.com/weeklywildcat'],
    ['linkedin', 'linkedin.com/in/example', 'https://linkedin.com/in/example'],
    ['website', 'weeklywildcat.com/about', 'https://weeklywildcat.com/about'],
    ['website', 'https://example.org/', 'https://example.org/'],
    ['instagram', ' ', ''],
    ['instagram', '@', ''],
    ['linkedin', 'john-doe', ''],
    ['website', 'javascript:alert(1)', ''],
    ['instagram', 'mailto:person@example.org', ''],
    ['website', '//example.org', ''],
    ['website', 'https://', ''],
];

foreach ($cases as [$key, $input, $expected]) {
    $actual = wwh_normalize_author_social_link($key, $input);
    if ($actual !== $expected) {
        fwrite(STDERR, "Invalid {$key} normalization for " . var_export($input, true)
            . ": expected " . var_export($expected, true) . ", got " . var_export($actual, true) . "\n");
        exit(1);
    }
}

echo "Author social-link normalization regression passed.\n";
