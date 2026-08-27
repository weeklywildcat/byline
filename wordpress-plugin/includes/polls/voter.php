<?php

/**
 * Anonymous voter identity for public polls.
 *
 * The public contract is unchanged from the retired Cloudflare implementation:
 * a signed opaque voter id in a first-party cookie, from which a one-way voter
 * key is derived. Only the derived key is ever stored. No login, email, name,
 * fingerprint, or IP address is required or recorded.
 *
 * Cookie names, the HMAC signature format, and the voter-key derivation are
 * byte-compatible with the previous Worker implementation so existing visitors
 * are not treated as new after the migration.
 */

if (!defined('ABSPATH')) {
    exit;
}

// Public cookie names are a compatibility contract. They keep their historical
// ww_ prefix on purpose; renaming them would make every existing visitor look
// like a first-time voter.
const BYLINE_POLL_VOTER_COOKIE = 'ww_voter_id';
const BYLINE_POLL_VOTED_COOKIE_PREFIX = 'ww_poll_voted_';
const BYLINE_POLL_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

const BYLINE_POLL_SECRET_OPTION = 'byline_poll_signing_secret';

/**
 * Server-side configuration sources for the poll signing secret, most explicit
 * first. POLL_COOKIE_SECRET and VOTER_COOKIE_SECRET are the names the retired
 * Cloudflare Worker used; defining one of them in wp-config.php with the same
 * value keeps already-issued cookies and already-migrated voter keys valid.
 *
 * @return array<int,string>
 */
function byline_poll_secret_constants(): array
{
    return ['BYLINE_POLL_COOKIE_SECRET', 'POLL_COOKIE_SECRET', 'VOTER_COOKIE_SECRET'];
}

/**
 * Where the active secret came from. Safe to show an administrator; it never
 * contains the secret itself.
 */
function byline_poll_signing_secret_source(): string
{
    foreach (byline_poll_secret_constants() as $constant) {
        if (defined($constant) && is_string(constant($constant)) && constant($constant) !== '') {
            return 'constant:' . $constant;
        }

        $environment = getenv($constant);
        if (is_string($environment) && $environment !== '') {
            return 'environment:' . $constant;
        }
    }

    return get_option(BYLINE_POLL_SECRET_OPTION, '') !== '' ? 'generated' : 'missing';
}

/**
 * Resolve the signing secret, generating and storing a per-site one the first
 * time it is needed.
 *
 * The generated secret lives in a non-autoloaded option so it is stable across
 * plugin upgrades, is not regenerated per request, and is never part of any
 * public payload. On multisite each site keeps its own secret, matching the
 * per-site poll content it protects.
 */
function byline_poll_signing_secret(): string
{
    foreach (byline_poll_secret_constants() as $constant) {
        if (defined($constant) && is_string(constant($constant)) && constant($constant) !== '') {
            return (string) constant($constant);
        }

        $environment = getenv($constant);
        if (is_string($environment) && $environment !== '') {
            return $environment;
        }
    }

    $stored = get_option(BYLINE_POLL_SECRET_OPTION, '');
    if (is_string($stored) && $stored !== '') {
        return $stored;
    }

    $generated = bin2hex(random_bytes(32));
    // add_option is a no-op when a concurrent request already stored one, so
    // re-read rather than trusting the value this request generated.
    add_option(BYLINE_POLL_SECRET_OPTION, $generated, '', false);
    $stored = get_option(BYLINE_POLL_SECRET_OPTION, '');

    return is_string($stored) && $stored !== '' ? $stored : $generated;
}

function byline_poll_ensure_signing_secret(): void
{
    byline_poll_signing_secret();
}

function byline_poll_base64url(string $bytes): string
{
    return rtrim(strtr(base64_encode($bytes), '+/', '-_'), '=');
}

function byline_poll_create_voter_id(): string
{
    return byline_poll_base64url(random_bytes(24));
}

function byline_poll_sign_voter_id(string $voter_id, string $secret): string
{
    return $voter_id . '.' . byline_poll_base64url(hash_hmac('sha256', $voter_id, $secret, true));
}

/**
 * @return array<string,string>
 */
function byline_poll_parse_cookie_header(?string $cookie_header): array
{
    $cookies = [];
    if (!is_string($cookie_header) || $cookie_header === '') {
        return $cookies;
    }

    foreach (explode(';', $cookie_header) as $pair) {
        $pair = trim($pair);
        if ($pair === '') {
            continue;
        }

        $parts = explode('=', $pair);
        $name = trim((string) array_shift($parts));
        if ($name === '') {
            continue;
        }

        $cookies[$name] = rawurldecode(implode('=', $parts));
    }

    return $cookies;
}

/**
 * Verify the signed voter cookie and return the opaque voter id it carries.
 */
function byline_poll_read_signed_voter_id(?string $cookie_header, string $secret): ?string
{
    $value = byline_poll_parse_cookie_header($cookie_header)[BYLINE_POLL_VOTER_COOKIE] ?? '';
    if ($value === '') {
        return null;
    }

    $parts = explode('.', $value);
    if (count($parts) !== 2 || $parts[0] === '' || $parts[1] === '') {
        return null;
    }

    $expected = explode('.', byline_poll_sign_voter_id($parts[0], $secret))[1];

    return hash_equals($expected, $parts[1]) ? $parts[0] : null;
}

/**
 * One-way voter key. The raw voter id never reaches storage.
 */
function byline_poll_voter_key(string $voter_id, string $secret): string
{
    return byline_poll_base64url(hash('sha256', $secret . ':' . $voter_id, true));
}

function byline_poll_voted_cookie_name(string $poll_id): string
{
    return BYLINE_POLL_VOTED_COOKIE_PREFIX . preg_replace('/[^A-Za-z0-9_-]/', '_', $poll_id);
}

/**
 * Build a Set-Cookie value with no Domain attribute.
 *
 * Host-agnostic cookies are what makes the same-origin Worker proxy work: the
 * browser only ever talks to the publication domain, so a domain-less cookie
 * binds to that host and the CMS hostname stays an implementation detail.
 *
 * @param array<string,mixed> $attributes
 */
function byline_poll_serialize_cookie(string $name, string $value, array $attributes = []): string
{
    $parts = [$name . '=' . rawurlencode($value)];

    if (isset($attributes['maxAge'])) {
        $parts[] = 'Max-Age=' . (int) $attributes['maxAge'];
    }
    if (!empty($attributes['path'])) {
        $parts[] = 'Path=' . $attributes['path'];
    }
    if (!empty($attributes['httpOnly'])) {
        $parts[] = 'HttpOnly';
    }
    if (!empty($attributes['secure'])) {
        $parts[] = 'Secure';
    }
    if (!empty($attributes['sameSite'])) {
        $parts[] = 'SameSite=' . $attributes['sameSite'];
    }

    return implode('; ', $parts);
}

function byline_poll_voter_cookie(string $signed_voter_id): string
{
    return byline_poll_serialize_cookie(BYLINE_POLL_VOTER_COOKIE, $signed_voter_id, [
        'httpOnly' => true,
        'secure' => true,
        'sameSite' => 'Lax',
        'path' => '/',
        'maxAge' => BYLINE_POLL_COOKIE_MAX_AGE,
    ]);
}

/**
 * The "already voted" marker is intentionally readable by the poll widget, so
 * it is not HttpOnly. It carries no identity, only the fact that this browser
 * answered this poll.
 */
function byline_poll_voted_cookie(string $poll_id): string
{
    return byline_poll_serialize_cookie(byline_poll_voted_cookie_name($poll_id), 'true', [
        'secure' => true,
        'sameSite' => 'Lax',
        'path' => '/',
        'maxAge' => BYLINE_POLL_COOKIE_MAX_AGE,
    ]);
}
