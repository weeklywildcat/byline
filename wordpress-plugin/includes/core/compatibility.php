<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * PHP 7.4-compatible string helpers used during the earliest plugin bootstrap.
 */
function byline_string_starts_with(string $value, string $prefix): bool
{
    return $prefix === '' || strncmp($value, $prefix, strlen($prefix)) === 0;
}

function byline_string_ends_with(string $value, string $suffix): bool
{
    if ($suffix === '') {
        return true;
    }

    $suffix_length = strlen($suffix);
    return $suffix_length <= strlen($value)
        && substr_compare($value, $suffix, -$suffix_length) === 0;
}
