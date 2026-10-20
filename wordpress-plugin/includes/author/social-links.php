<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Social profiles accept @handles as a convenience, but the stored/public
 * representation is always an absolute http(s) URL.
 */
function wwh_normalize_author_social_link(string $key, string $value): string
{
    $value = trim($value);
    if ($value === '') {
        return '';
    }

    $handle_hosts = [
        'instagram' => 'https://www.instagram.com/',
        'tiktok' => 'https://www.tiktok.com/@',
        'x' => 'https://x.com/',
    ];

    if (isset($handle_hosts[$key])) {
        $handle = '';
        if (preg_match('/^@([a-z0-9._]{1,30})$/i', $value, $matches) === 1) {
            $handle = $matches[1];
        } elseif (preg_match('/^[a-z0-9_]{1,30}$/i', $value) === 1) {
            $handle = $value;
        }

        if ($handle !== '') {
            $value = $handle_hosts[$key] . $handle;
        }
    }

    // Pasted links often omit the scheme; never let esc_url_raw() silently
    // turn usernames, mailto: links or javascript: input into HTTP URLs.
    if (preg_match('~^https?://~i', $value) !== 1) {
        if (preg_match('~^(?:[a-z0-9-]+\\.)+[a-z]{2,}(?::[0-9]+)?(?:[/?#].*)?$~i', $value) !== 1) {
            return '';
        }
        $value = 'https://' . $value;
    }

    $parts = parse_url($value);
    if (!is_array($parts) || empty($parts['host']) || strpos($parts['host'], '.') === false ||
        !filter_var($value, FILTER_VALIDATE_URL)) {
        return '';
    }

    return esc_url_raw($value, ['http', 'https']);
}
