<?php

if (!defined('ABSPATH')) {
    exit;
}

// A scheduled execution uses this marker on the live design post. It closes
// the crash window between a successful wp_update_post() and the schedule
// record being marked complete, so a retry can return the already-published
// result instead of incrementing the design revision again.
const BYLINE_DESIGN_PUBLISH_IDEMPOTENCY_META = '_byline_design_publish_idempotency';
const BYLINE_DESIGN_PUBLISH_LOCK_SECONDS = 30;

function byline_design_publish_lock_key(string $template): string
{
    return '_byline_design_publish_lock_' . hash('sha256', $template);
}

function byline_design_publish_lock_claim(string $template): ?string
{
    $lock_value = [
        'token' => hash('sha256', uniqid('', true)),
        'at' => time(),
    ];
    $token = function_exists('wp_json_encode') ? wp_json_encode($lock_value) : json_encode($lock_value);
    if (!is_string($token) || $token === '') {
        return null;
    }

    // WordPress options provide an atomic add for the first publish of a
    // template, when no design post exists yet. The small fallback keeps the
    // helper usable in the repository's dependency-free PHP harness.
    if (!function_exists('add_option')) {
        return $token;
    }

    $key = byline_design_publish_lock_key($template);
    $existing = function_exists('get_option') ? get_option($key, '') : '';
    if ($existing !== '' && $existing !== null) {
        $decoded = is_string($existing) ? json_decode($existing, true) : null;
        $locked_at = is_array($decoded) ? (int) ($decoded['at'] ?? 0) : 0;
        if ($locked_at > 0 && $locked_at + BYLINE_DESIGN_PUBLISH_LOCK_SECONDS > time()) {
            return null;
        }
        if (function_exists('delete_option')) {
            delete_option($key);
        }
    }

    return add_option($key, $token, '', 'no') ? $token : null;
}

function byline_design_publish_lock_release(string $template, ?string $token): void
{
    if ($token === null || !function_exists('get_option') || !function_exists('delete_option')) {
        return;
    }

    $key = byline_design_publish_lock_key($template);
    if ((string) get_option($key, '') === $token) {
        delete_option($key);
    }
}

/**
 * Queue the configured deployment provider and expose a stable action for
 * other Byline modules. The modern deployment helper is preferred; the
 * legacy alias remains the compatibility path for older installations/tests.
 */
function byline_trigger_design_deployment(string $template, int $revision, string $source = 'immediate'): void
{
    if (function_exists('byline_schedule_deployment')) {
        $reason = function_exists('sanitize_key')
            ? sanitize_key($source)
            : preg_replace('/[^a-z0-9_-]/i', '-', $source);
        byline_schedule_deployment('design-' . $reason);
    } elseif (function_exists('wwh_schedule_cloudflare_deploy')) {
        wwh_schedule_cloudflare_deploy();
    }

    if (function_exists('do_action')) {
        do_action('byline_design_published', $template, $revision, $source);
    }
}

/**
 * Publish one already-decoded design document.
 *
 * REST and cron deliberately call this same helper. The optional deployment
 * flag lets scheduled execution persist its terminal result before queueing a
 * deployment, which makes the schedule itself recoverable after a PHP/cron
 * interruption. It does not change validation, conflict detection, revision
 * creation, or idempotency semantics.
 */
function byline_publish_design_document(
    string $template,
    $document,
    int $base_revision,
    ?int $author_id = null,
    string $source = 'immediate',
    bool $trigger_deployment = true,
    string $idempotency_key = ''
) {
    if (!byline_is_design_template($template)) {
        return new WP_Error(
            'byline_unknown_template',
            __('Unknown Byline template.', 'weekly-wildcat-headless'),
            ['status' => 404]
        );
    }

    $validation = byline_validate_design_document($document, $template);
    if (is_wp_error($validation)) {
        return $validation;
    }
    if (byline_design_has_unconverted_blocks($document)) {
        return new WP_Error(
            'byline_unconverted_design_blocks',
            __('This design still contains homepage blocks that have not been converted. Save it, but convert or remove the preserved blocks before publishing.', 'weekly-wildcat-headless'),
            ['status' => 409]
        );
    }

    $publish_lock = byline_design_publish_lock_claim($template);
    if ($publish_lock === null) {
        return new WP_Error(
            'byline_design_publish_busy',
            __('Another design publish is currently being committed. Try again shortly.', 'weekly-wildcat-headless'),
            ['status' => 409]
        );
    }

    try {
        $existing = byline_get_design_post($template);
        $published_revision = byline_design_revision($existing);

        // A retry after the live post was written is a successful no-op. Check
        // the marker before optimistic locking because the schedule's base
        // revision is intentionally the revision that existed before its first
        // attempt.
        if ($idempotency_key !== '' && $existing
            && (string) get_post_meta($existing->ID, BYLINE_DESIGN_PUBLISH_IDEMPOTENCY_META, true) === $idempotency_key) {
            return byline_published_design($template);
        }

        $conflict = byline_design_conflict($base_revision, $published_revision);
        if ($conflict) {
            return $conflict;
        }

        // Re-read the authoritative custom revision while holding the
        // per-template lock. This closes the optimistic-check/write window for
        // two immediate publishes or a publish racing scheduled execution.
        $latest_existing = byline_get_design_post($template);
        $latest_revision = byline_design_revision($latest_existing);
        if ($latest_revision !== $published_revision) {
            return byline_design_conflict($base_revision, $latest_revision);
        }
        $existing = $latest_existing;

        if ($existing) {
            wp_save_post_revision($existing->ID);
        }

        $post_data = [
            'post_type' => BYLINE_DESIGN_POST_TYPE,
            'post_status' => 'publish',
            'post_title' => 'Byline design: ' . $template,
            'post_content' => wp_json_encode($document),
        ];
        // Keep the helper runnable in the lightweight PHP regression harness as
        // well as WordPress, where absint() exists but is not needed here.
        $effective_author_id = $author_id !== null ? max(0, (int) $author_id) : max(0, (int) get_current_user_id());
        if ($effective_author_id > 0) {
            $post_data['post_author'] = $effective_author_id;
        }

        if ($existing) {
            $post_data['ID'] = $existing->ID;
            $post_id = wp_update_post(wp_slash($post_data), true);
        } else {
            $post_id = wp_insert_post(wp_slash($post_data), true);
        }
        if (is_wp_error($post_id)) {
            return $post_id;
        }

        $next_revision = $published_revision + 1;
        update_post_meta($post_id, BYLINE_DESIGN_TEMPLATE_META, $template);
        update_post_meta($post_id, BYLINE_DESIGN_REVISION_META, $next_revision);
        if ($idempotency_key !== '') {
            update_post_meta($post_id, BYLINE_DESIGN_PUBLISH_IDEMPOTENCY_META, $idempotency_key);
        }

        if ($effective_author_id > 0) {
            delete_user_meta($effective_author_id, byline_design_autosave_key($template));
        }
        wp_save_post_revision($post_id);

        if ($trigger_deployment) {
            byline_trigger_design_deployment($template, $next_revision, $source);
        }

        return byline_published_design($template);
    } finally {
        byline_design_publish_lock_release($template, $publish_lock);
    }
}
