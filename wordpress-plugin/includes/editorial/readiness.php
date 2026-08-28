<?php

/**
 * Server-side story readiness checks.
 *
 * Readiness is intentionally advisory in most cases.  The service returns
 * structured checks for the editor, while only genuinely invalid content (no
 * headline/body/author) is marked as an error.  It has no public REST hook and
 * never serialises private editorial values into a public response.
 */

if (!defined('ABSPATH')) {
    exit;
}

// Planning owns the canonical key. Keep a guarded fallback for installations
// that load this file independently in a test harness or legacy include path.
if (!defined('BYLINE_EDITORIAL_PLANNED_PUBLISH_META')) {
    define('BYLINE_EDITORIAL_PLANNED_PUBLISH_META', '_byline_story_planned_publish_at');
}

function byline_readiness_text($value, int $maximum = 320): string
{
    $value = sanitize_text_field((string) $value);

    return function_exists('mb_substr') ? mb_substr($value, 0, $maximum) : substr($value, 0, $maximum);
}

/** @return array<string,mixed> */
function byline_readiness_check(string $id, string $label, string $status, string $explanation, string $fix_url = ''): array
{
    $status = in_array($status, ['pass', 'warning', 'error'], true) ? $status : 'warning';

    return [
        'id' => sanitize_key($id),
        'label' => byline_readiness_text($label, 120),
        'status' => $status,
        'severity' => $status === 'error' ? 'error' : ($status === 'warning' ? 'warning' : 'info'),
        'explanation' => byline_readiness_text($explanation),
        'fix' => $fix_url !== '' && function_exists('esc_url_raw')
            ? ['url' => esc_url_raw($fix_url), 'label' => 'Open story']
            : null,
    ];
}

function byline_readiness_fix_url(int $post_id): string
{
    if (!function_exists('get_edit_post_link')) {
        return '';
    }

    $url = get_edit_post_link($post_id, 'raw');

    return is_string($url) ? $url : '';
}

function byline_readiness_featured_image_id(int $post_id): int
{
    if (function_exists('get_post_thumbnail_id')) {
        return absint(get_post_thumbnail_id($post_id));
    }

    return absint(get_post_meta($post_id, '_thumbnail_id', true));
}

function byline_readiness_image_alt(int $attachment_id): string
{
    if ($attachment_id <= 0) {
        return '';
    }
    if (function_exists('wp_get_attachment_image_alt')) {
        $alt = wp_get_attachment_image_alt($attachment_id);
        if (is_string($alt) && trim($alt) !== '') {
            return trim($alt);
        }
    }

    return trim((string) get_post_meta($attachment_id, '_wp_attachment_image_alt', true));
}

function byline_readiness_image_credit(int $attachment_id): string
{
    if ($attachment_id <= 0) {
        return '';
    }

    if (function_exists('wwh_image_meta_value')) {
        $credit = wwh_image_meta_value($attachment_id, 'credit_text');
        if ($credit !== '') {
            return $credit;
        }
    }

    foreach (['_ww_image_credit_text', '_byline_image_credit_text', '_byline_story_image_credit'] as $key) {
        $credit = trim((string) get_post_meta($attachment_id, $key, true));
        if ($credit !== '') {
            return $credit;
        }
    }

    if (function_exists('wp_get_attachment_metadata')) {
        $metadata = wp_get_attachment_metadata($attachment_id);
        $credit = is_array($metadata) && is_array($metadata['image_meta'] ?? null)
            ? ($metadata['image_meta']['credit'] ?? $metadata['image_meta']['copyright'] ?? '')
            : '';
        if (is_string($credit) && trim($credit) !== '') {
            return trim($credit);
        }
    }

    return '';
}

function byline_readiness_has_section(int $post_id): bool
{
    if (function_exists('get_the_category')) {
        $categories = get_the_category($post_id);
        if (is_array($categories) && $categories !== []) {
            return true;
        }
    }

    foreach (['_byline_story_section', 'byline_section', 'section'] as $key) {
        if (trim((string) get_post_meta($post_id, $key, true)) !== '') {
            return true;
        }
    }

    return false;
}

function byline_readiness_parse_datetime($value): ?DateTimeImmutable
{
    if (!is_string($value) || trim($value) === '') {
        return null;
    }

    try {
        return new DateTimeImmutable($value, new DateTimeZone('UTC'));
    } catch (Exception $exception) {
        return null;
    }
}

/**
 * Allow the task/content-health modules to contribute their own cached data
 * without making readiness depend on those optional modules being loaded.
 *
 * @return array<int,mixed>
 */
function byline_readiness_optional_records(string $filter, int $post_id): array
{
    if (!function_exists('apply_filters')) {
        return [];
    }

    $records = apply_filters($filter, [], $post_id);

    return is_array($records) ? $records : [];
}

/** @return array<int,array<string,mixed>> */
function byline_story_readiness_checks(int $post_id, array $context = []): array
{
    $post = get_post($post_id);
    if (!$post instanceof WP_Post || $post->post_type !== 'post') {
        return [byline_readiness_check('story', 'Story', 'error', 'This story could not be found.')];
    }

    $fix_url = byline_readiness_fix_url($post_id);
    $checks = [];
    $strip_tags = static function (string $value): string {
        return function_exists('wp_strip_all_tags') ? wp_strip_all_tags($value) : strip_tags($value);
    };
    $headline = trim($strip_tags((string) ($post->post_title ?? '')));
    $checks[] = $headline !== ''
        ? byline_readiness_check('headline', 'Headline', 'pass', 'A headline is present.')
        : byline_readiness_check('headline', 'Headline', 'error', 'Add a headline before publishing.', $fix_url);

    $body = (string) ($post->post_content ?? '');
    if (function_exists('strip_shortcodes')) {
        $body = strip_shortcodes($body);
    }
    $body = trim($strip_tags($body));
    $body_length = function_exists('mb_strlen') ? mb_strlen($body) : strlen($body);
    $checks[] = $body_length >= 20
        ? byline_readiness_check('body', 'Story body', 'pass', 'The story has meaningful body copy.')
        : byline_readiness_check('body', 'Story body', 'error', 'Add meaningful body copy before publishing.', $fix_url);

    $excerpt = trim((string) ($post->post_excerpt ?? ''));
    if ($excerpt === '' && function_exists('get_the_excerpt')) {
        $excerpt = trim((string) get_the_excerpt($post));
    }
    $checks[] = $excerpt !== ''
        ? byline_readiness_check('excerpt', 'Excerpt or deck', 'pass', 'An excerpt or deck is available.')
        : byline_readiness_check('excerpt', 'Excerpt or deck', 'warning', 'Add an excerpt or deck to improve cards and social previews.', $fix_url);

    $author_id = absint($post->post_author ?? 0);
    $author = $author_id > 0 && function_exists('get_user_by') ? get_user_by('id', $author_id) : false;
    $checks[] = $author instanceof WP_User
        ? byline_readiness_check('author', 'Author/byline', 'pass', 'A valid WordPress author is assigned.')
        : byline_readiness_check('author', 'Author/byline', 'error', 'Assign a valid author before publishing.', $fix_url);

    $checks[] = byline_readiness_has_section($post_id)
        ? byline_readiness_check('section', 'Section', 'pass', 'A section/category is selected.')
        : byline_readiness_check('section', 'Section', 'warning', 'Choose a section so readers can find this story.', $fix_url);

    $featured_id = byline_readiness_featured_image_id($post_id);
    $checks[] = $featured_id > 0
        ? byline_readiness_check('featured-image', 'Featured image', 'pass', 'A featured image is selected.')
        : byline_readiness_check('featured-image', 'Featured image', 'warning', 'Add a featured image if this story should appear prominently.', $fix_url);
    if ($featured_id > 0) {
        $checks[] = byline_readiness_image_alt($featured_id) !== ''
            ? byline_readiness_check('featured-image-alt', 'Featured image alt text', 'pass', 'The featured image has alt text.')
            : byline_readiness_check('featured-image-alt', 'Featured image alt text', 'warning', 'Add descriptive alt text for readers using assistive technology.', $fix_url);
        $checks[] = byline_readiness_image_credit($featured_id) !== ''
            ? byline_readiness_check('image-credit', 'Image credit', 'pass', 'The featured image has a credit.')
            : byline_readiness_check('image-credit', 'Image credit', 'warning', 'Add an image credit or confirm the publication-wide default.', $fix_url);
    } else {
        $checks[] = byline_readiness_check('featured-image-alt', 'Featured image alt text', 'warning', 'Alt text can be checked after a featured image is selected.', $fix_url);
        $checks[] = byline_readiness_check('image-credit', 'Image credit', 'warning', 'A credit can be checked after a featured image is selected.', $fix_url);
    }

    $workflow = function_exists('byline_get_effective_editorial_status') ? byline_get_effective_editorial_status($post_id) : '';
    if ($post->post_status === 'publish' || $workflow === 'ready' || $workflow === 'editing') {
        $checks[] = byline_readiness_check('workflow-stage', 'Workflow stage', 'pass', 'The story is in a review-ready workflow stage.');
    } else {
        $checks[] = byline_readiness_check('workflow-stage', 'Workflow stage', 'warning', 'Move the story to Editing or Ready for Review before handoff.', $fix_url);
    }

    $visual_text = function_exists('byline_get_editorial_visuals') ? byline_get_editorial_visuals($post_id) : '';
    $visual_records = [];
    foreach (['byline_get_story_visual_requests', 'byline_get_story_media_requests', 'byline_get_editorial_media_requests', 'byline_get_editorial_media_request'] as $provider) {
        if (function_exists($provider)) {
            $candidate = $provider($post_id);
            if (is_array($candidate)) {
                $visual_records = isset($candidate['status']) || isset($candidate['type'])
                    ? [$candidate]
                    : $candidate;
            }
            break;
        }
    }
    $visual_open = $visual_text !== '';
    foreach ($visual_records as $visual) {
        if (!is_array($visual)) {
            continue;
        }
        $status = sanitize_key((string) ($visual['status'] ?? 'needed'));
        if (in_array($status, ['needed', 'assigned', 'in-progress'], true)) {
            $visual_open = true;
            break;
        }
    }
    $checks[] = !$visual_open
        ? byline_readiness_check('visual-requirement', 'Visual requirement', 'pass', 'There are no unresolved visual requirements.')
        : byline_readiness_check('visual-requirement', 'Visual requirement', 'warning', 'A visual request is still open; confirm the story can publish without it.', $fix_url);

    $tasks = [];
    foreach (['byline_get_story_tasks', 'byline_list_story_tasks'] as $provider) {
        if (function_exists($provider)) {
            $candidate = $provider($post_id);
            if (is_array($candidate)) {
                $tasks = $candidate;
            }
            break;
        }
    }
    $tasks = array_merge($tasks, byline_readiness_optional_records('byline_story_readiness_tasks', $post_id));
    $high_priority_open = 0;
    foreach ($tasks as $task) {
        if (!is_array($task)) {
            continue;
        }
        $state = sanitize_key((string) ($task['status'] ?? $task['state'] ?? 'open'));
        $priority = sanitize_key((string) ($task['priority'] ?? 'normal'));
        if (!in_array($state, ['completed', 'complete', 'done', 'closed'], true) && in_array($priority, ['high', 'urgent', 'critical'], true)) {
            $high_priority_open++;
        }
    }
    $checks[] = $high_priority_open === 0
        ? byline_readiness_check('high-priority-tasks', 'High-priority tasks', 'pass', 'No incomplete high-priority tasks are recorded.')
        : byline_readiness_check('high-priority-tasks', 'High-priority tasks', 'warning', sprintf('%d high-priority task%s remain open.', $high_priority_open, $high_priority_open === 1 ? '' : 's'), $fix_url);

    $planned = get_post_meta($post_id, BYLINE_EDITORIAL_PLANNED_PUBLISH_META, true);
    $planned_date = byline_readiness_parse_datetime($planned);
    if ((string) $planned !== '' && !$planned_date instanceof DateTimeImmutable) {
        $checks[] = byline_readiness_check('publication-date', 'Publication dates', 'warning', 'The planned publication value is not a valid date.', $fix_url);
    } elseif ($post->post_status === 'future') {
        $scheduled = byline_readiness_parse_datetime((string) ($post->post_date_gmt ?? $post->post_date ?? ''));
        $checks[] = $scheduled instanceof DateTimeImmutable && $scheduled->getTimestamp() > time()
            ? byline_readiness_check('publication-date', 'Publication dates', 'pass', 'The WordPress schedule is in the future.')
            : byline_readiness_check('publication-date', 'Publication dates', 'warning', 'Review the WordPress scheduled publication date.', $fix_url);
    } else {
        $checks[] = byline_readiness_check('publication-date', 'Publication dates', 'pass', 'No conflicting publication date is recorded.');
    }

    $seo_records = byline_readiness_optional_records('byline_story_readiness_seo', $post_id);
    $seo_issue = '';
    foreach ($seo_records as $record) {
        if (is_array($record) && in_array((string) ($record['status'] ?? ''), ['warning', 'error'], true)) {
            $seo_issue = (string) ($record['explanation'] ?? 'Review the social preview.');
            break;
        }
    }
    $checks[] = $seo_issue === ''
        ? byline_readiness_check('seo-social-preview', 'SEO/social preview', 'pass', 'The available social-preview checks passed.')
        : byline_readiness_check('seo-social-preview', 'SEO/social preview', 'warning', $seo_issue, $fix_url);

    $health_records = byline_readiness_optional_records('byline_story_readiness_health', $post_id);
    $health_issue = '';
    foreach ($health_records as $record) {
        if (is_array($record) && in_array((string) ($record['severity'] ?? $record['status'] ?? ''), ['error', 'high', 'critical'], true)) {
            $health_issue = (string) ($record['explanation'] ?? $record['message'] ?? 'A cached content-health issue needs attention.');
            break;
        }
    }
    $checks[] = $health_issue === ''
        ? byline_readiness_check('content-health', 'Content Health', 'pass', 'No cached high-severity content-health problem is recorded.')
        : byline_readiness_check('content-health', 'Content Health', 'warning', $health_issue, $fix_url);

    return $checks;
}

/** @return array<string,mixed> */
function byline_get_story_readiness(int $post_id, array $context = []): array
{
    $checks = byline_story_readiness_checks($post_id, $context);
    $passed = count(array_filter($checks, static fn(array $check): bool => $check['status'] === 'pass'));
    $warnings = count(array_filter($checks, static fn(array $check): bool => $check['status'] === 'warning'));
    $errors = count(array_filter($checks, static fn(array $check): bool => $check['status'] === 'error'));

    return [
        'storyId' => absint($post_id),
        'checks' => $checks,
        'passed' => $passed,
        'warnings' => $warnings,
        'errors' => $errors,
        'total' => count($checks),
        'ready' => $errors === 0,
        'canPublish' => $errors === 0,
    ];
}

function byline_story_readiness(int $post_id, array $context = []): array
{
    return byline_get_story_readiness($post_id, $context);
}
