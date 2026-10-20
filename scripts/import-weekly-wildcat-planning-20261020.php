<?php
/**
 * One-time migration of the October 20, 2026 Weekly Wildcat planning tracker
 * into Byline's WordPress-native Story Workspace.
 *
 * Run from a WordPress root with the current Byline plugin active:
 *
 *   wp eval-file /path/to/import-weekly-wildcat-planning-20261020.php
 *   wp eval-file /path/to/import-weekly-wildcat-planning-20261020.php apply
 *
 * The first command is a dry run. The second applies the migration.
 *
 * Safety:
 * - The three stories that already existed in WordPress are intentionally not
 *   part of this dataset.
 * - Any other exact-title WordPress match is left untouched.
 * - Stories created by this script receive a private pending/complete marker,
 *   so an interrupted run can safely resume without duplicating tasks or links.
 */

if (!defined('ABSPATH')) {
    fwrite(STDERR, "Run this through WP-CLI: wp eval-file <script> [apply]\n");
    exit(1);
}

if (!class_exists('WP_CLI')) {
    throw new RuntimeException('This migration must be run with WP-CLI.');
}

const WW_BYLINE_TRACKER_IMPORT_META = '_byline_tracker_import_20261020';
const WW_BYLINE_TRACKER_IMPORT_PENDING = 'pending';
const WW_BYLINE_TRACKER_IMPORT_COMPLETE = 'complete';

$apply = isset($args) && is_array($args) && in_array('apply', $args, true);

$stories = [
    [
        'title' => 'Town Council / Different Race',
        'status' => 'on-hold',
        'writers' => ['Maycie Krajewski'],
        'deadline' => null,
        'brief' => '',
        'tasks' => [
            ['title' => 'Confirm details for this story', 'assignee' => 'Maycie Krajewski'],
        ],
        'resources' => [],
    ],
    [
        'title' => 'EMS Garden',
        'status' => 'pitch',
        'writers' => ['Gibson Bell'],
        'deadline' => null,
        'brief' => 'The garden Mrs. Figs supports.',
        'tasks' => [
            ['title' => 'Come up with questions for the interview with Mrs. Figs and Caroline', 'assignee' => 'Gibson Bell'],
        ],
        'resources' => [
            [
                'label' => 'EMS Community Garden Notes',
                'url' => 'https://docs.google.com/document/d/1-TkGpk0CQLhEk2pyxanJP4HCGTFhBp_uPb-YXjVMe_s/edit?tab=t.0',
                'purpose' => 'research',
            ],
        ],
    ],
    [
        'title' => 'Hurricane Helene',
        'status' => 'reporting',
        'writers' => ['Adam Boyd'],
        'deadline' => null,
        'brief' => 'A follow-up on Hurricane Helene about two years later.',
        'tasks' => [
            ['title' => 'Find people impacted by Hurricane Helene to interview', 'assignee' => 'Adam Boyd'],
        ],
        'resources' => [],
    ],
    [
        'title' => 'Patriot Games',
        'status' => 'reporting',
        'writers' => ['Matt Cebedo'],
        'deadline' => '2026-10-22',
        'brief' => 'Owen competed in the Patriot Games.',
        'tasks' => [
            ['title' => 'Schedule an interview with Owen over Google Meet with Gibson', 'assignee' => 'Matt Cebedo'],
        ],
        'resources' => [],
    ],
    [
        'title' => 'Cross Country Scholarship $10k',
        'status' => 'on-hold',
        'writers' => ['Caroline Elrod'],
        'deadline' => null,
        'brief' => '',
        'tasks' => [
            ['title' => 'Gather details, then get interviews', 'assignee' => 'Caroline Elrod'],
        ],
        'resources' => [],
    ],
    [
        'title' => 'Missing sidewalk article',
        'status' => 'reporting',
        'writers' => ['Gibson Bell'],
        'deadline' => null,
        'brief' => '',
        'tasks' => [],
        'resources' => [],
    ],
    [
        'title' => 'Canteen',
        'status' => 'reporting',
        'writers' => ['Caroline Elrod'],
        'deadline' => null,
        'brief' => 'Interview with Mr. Sprowl completed.',
        'tasks' => [
            ['title' => 'Interview students about canteen', 'assignee' => 'Caroline Elrod'],
            ['title' => 'Research canteen rules and regulations', 'assignee' => 'Caroline Elrod'],
        ],
        'resources' => [
            [
                'label' => 'Canteen (Caroline)',
                'url' => 'https://drive.google.com/drive/folders/1QByr7Q6HnVicbDOhZtTy3o5jcPijKn-L',
                'purpose' => 'folder',
            ],
        ],
    ],
    [
        'title' => 'Senate Follow-Up',
        'status' => 'reporting',
        'writers' => ['Jeremy Lauten'],
        'deadline' => null,
        'brief' => 'Target smart high school students as sources.',
        'tasks' => [],
        'resources' => [],
    ],
    [
        'title' => 'Community Shrek Project',
        'status' => 'reporting',
        'writers' => ['Gibson Bell'],
        'deadline' => '2026-10-22',
        'brief' => 'Special needs theatre play.',
        'tasks' => [
            ['title' => 'Interview Mrs. Whitaker', 'assignee' => 'Gibson Bell'],
        ],
        'resources' => [],
    ],
    [
        'title' => 'Town Mismanagement',
        'status' => 'pitch',
        'writers' => [],
        'deadline' => '2026-10-30',
        'brief' => '',
        'tasks' => [
            ['title' => 'Confirm writer / assign owner', 'assignee' => null],
        ],
        'resources' => [],
    ],
    [
        'title' => 'PA System',
        'status' => 'reporting',
        'writers' => ['Gibson Bell'],
        'deadline' => '2026-10-22',
        'brief' => '',
        'tasks' => [
            ['title' => 'Continue reporting / writing', 'assignee' => 'Gibson Bell'],
        ],
        'resources' => [],
    ],
    [
        'title' => 'Death of the Locker',
        'status' => 'pitch',
        'writers' => ['Gibson Bell'],
        'deadline' => null,
        'brief' => 'No one uses lockers anymore; why?',
        'tasks' => [],
        'resources' => [],
    ],
    [
        'title' => 'Athlete of the Football season (breakout)',
        'status' => 'assigned',
        'writers' => ['Gibson Bell', "Sy'Reanna Partlow"],
        'deadline' => null,
        'brief' => '',
        'tasks' => [],
        'resources' => [],
    ],
    [
        'title' => 'YouTube blocked',
        'status' => 'reporting',
        'writers' => ['Gibson Bell'],
        'deadline' => null,
        'brief' => 'Talked to Abby and Jenna about the YouTube block.',
        'tasks' => [
            ['title' => 'Talk to school or district administration about the YouTube block', 'assignee' => 'Gibson Bell'],
            ['title' => 'Talk to someone at RTC about the impact of account restrictions', 'assignee' => 'Gibson Bell'],
        ],
        'resources' => [
            [
                'label' => 'YouTube blocked interviews',
                'url' => 'https://docs.google.com/document/d/1uxzYKF3BdertVnOHMb_-XUWJXXe5iVbnqBRzJLRW4Nk/edit?tab=t.0',
                'purpose' => 'interview-notes',
            ],
        ],
    ],
];

$required_functions = [
    'rest_do_request',
    'get_post_type_object',
    'wp_update_post',
    'get_users',
    'get_posts',
    'update_post_meta',
    'get_post_meta',
];
foreach ($required_functions as $function) {
    if (!function_exists($function)) {
        WP_CLI::error("Required WordPress function {$function}() is unavailable.");
    }
}
if (!defined('BYLINE_REST_NAMESPACE')) {
    WP_CLI::error('Byline is not active or is too old: BYLINE_REST_NAMESPACE is unavailable.');
}

$normalize_name = static function (string $value): string {
    $value = str_replace(["’", "‘", '`'], "'", trim($value));
    $value = preg_replace('/\s+/u', ' ', $value) ?: $value;
    return function_exists('mb_strtolower') ? mb_strtolower($value, 'UTF-8') : strtolower($value);
};

$all_users = get_users();
$users_by_name = [];
foreach ($all_users as $user) {
    if (!$user instanceof WP_User) {
        continue;
    }
    $key = $normalize_name((string) $user->display_name);
    $users_by_name[$key][] = $user;
}

$find_user = static function (string $display_name) use ($users_by_name, $normalize_name): ?WP_User {
    $matches = $users_by_name[$normalize_name($display_name)] ?? [];
    if (count($matches) === 1 && $matches[0] instanceof WP_User) {
        return $matches[0];
    }
    return null;
};

$needed_names = [];
foreach ($stories as $story) {
    foreach ($story['writers'] as $name) {
        $needed_names[$normalize_name($name)] = $name;
    }
    foreach ($story['tasks'] as $task) {
        if (!empty($task['assignee'])) {
            $needed_names[$normalize_name((string) $task['assignee'])] = (string) $task['assignee'];
        }
    }
}
$needed_names[$normalize_name('Gibson Bell')] = 'Gibson Bell';

$people = [];
$missing = [];
foreach ($needed_names as $name) {
    $user = $find_user($name);
    if (!$user instanceof WP_User) {
        $missing[] = $name;
        continue;
    }
    $people[$normalize_name($name)] = $user;
}
if ($missing !== []) {
    WP_CLI::error('Could not uniquely resolve these WordPress users by display name: ' . implode(', ', $missing) . '. Fix the display names or edit the migration mapping before applying.');
}

$actor = null;
$current_id = get_current_user_id();
if ($current_id > 0) {
    $candidate = get_user_by('id', $current_id);
    if ($candidate instanceof WP_User && user_can($candidate, 'edit_others_posts') && user_can($candidate, 'edit_posts')) {
        $actor = $candidate;
    }
}
if (!$actor) {
    $gibson = $people[$normalize_name('Gibson Bell')] ?? null;
    if ($gibson instanceof WP_User && user_can($gibson, 'edit_others_posts') && user_can($gibson, 'edit_posts')) {
        $actor = $gibson;
    }
}
if (!$actor) {
    foreach ($all_users as $candidate) {
        if ($candidate instanceof WP_User && user_can($candidate, 'edit_others_posts') && user_can($candidate, 'edit_posts')) {
            $actor = $candidate;
            break;
        }
    }
}
if (!$actor instanceof WP_User) {
    WP_CLI::error('No editor/administrator account with edit_others_posts and edit_posts is available to run the migration.');
}
wp_set_current_user((int) $actor->ID);

$post_statuses = array_values(get_post_stati([], 'names'));
$find_exact_story = static function (string $title) use ($post_statuses): int {
    $ids = get_posts([
        'post_type' => 'post',
        'post_status' => $post_statuses,
        'posts_per_page' => 2,
        'fields' => 'ids',
        'title' => $title,
        'orderby' => 'ID',
        'order' => 'ASC',
        'suppress_filters' => false,
    ]);
    return count($ids) === 1 ? (int) $ids[0] : (count($ids) > 1 ? -1 : 0);
};

$rest = static function (string $method, string $route, array $data = []): array {
    $request = new WP_REST_Request($method, $route);
    $request->set_header('content-type', 'application/json');
    if ($data !== []) {
        $request->set_body(wp_json_encode($data));
        foreach ($data as $key => $value) {
            $request->set_param($key, $value);
        }
    }
    $response = rest_do_request($request);
    if ($response->is_error()) {
        $error = $response->as_error();
        throw new RuntimeException($route . ': ' . $error->get_error_message());
    }
    $payload = $response->get_data();
    return is_array($payload) ? $payload : [];
};

$person_id = static function (?string $name) use ($people, $normalize_name): int {
    if ($name === null || $name === '') {
        return 0;
    }
    $user = $people[$normalize_name($name)] ?? null;
    return $user instanceof WP_User ? (int) $user->ID : 0;
};

$story_plan_line = static function (array $story): string {
    $writers = $story['writers'] === [] ? 'unassigned' : implode(' + ', $story['writers']);
    $deadline = $story['deadline'] ?: 'none';
    return sprintf('%s | %s | %s | deadline %s', $story['title'], $story['status'], $writers, $deadline);
};

WP_CLI::log('Weekly Wildcat → Byline planning migration (2026-10-20)');
WP_CLI::log('Mode: ' . ($apply ? 'APPLY' : 'DRY RUN'));
WP_CLI::log('Actor: ' . $actor->display_name . ' (#' . $actor->ID . ')');
WP_CLI::log('');

$dry_counts = ['create' => 0, 'resume' => 0, 'skip' => 0, 'ambiguous' => 0];
foreach ($stories as $story) {
    $existing_id = $find_exact_story($story['title']);
    if ($existing_id === -1) {
        $dry_counts['ambiguous']++;
        WP_CLI::warning('[AMBIGUOUS] More than one WordPress post exactly matches: ' . $story['title']);
        continue;
    }
    if ($existing_id > 0) {
        $marker = (string) get_post_meta($existing_id, WW_BYLINE_TRACKER_IMPORT_META, true);
        if ($marker === WW_BYLINE_TRACKER_IMPORT_PENDING) {
            $dry_counts['resume']++;
            WP_CLI::log('[RESUME #' . $existing_id . '] ' . $story_plan_line($story));
        } else {
            $dry_counts['skip']++;
            WP_CLI::log('[SKIP EXISTING #' . $existing_id . '] ' . $story['title']);
        }
        continue;
    }
    $dry_counts['create']++;
    WP_CLI::log('[CREATE] ' . $story_plan_line($story));
}

WP_CLI::log('');
WP_CLI::log(sprintf('Plan: %d create, %d resume, %d skip existing, %d ambiguous.', $dry_counts['create'], $dry_counts['resume'], $dry_counts['skip'], $dry_counts['ambiguous']));

if (!$apply) {
    WP_CLI::success('Dry run only. Re-run with positional argument "apply" to make changes.');
    return;
}
if ($dry_counts['ambiguous'] > 0) {
    WP_CLI::error('Resolve duplicate exact-title posts before applying the migration.');
}

$created = 0;
$resumed = 0;
$skipped = 0;

foreach ($stories as $story) {
    $story_id = $find_exact_story($story['title']);
    if ($story_id === -1) {
        WP_CLI::error('Ambiguous exact-title match while applying: ' . $story['title']);
    }

    if ($story_id > 0) {
        $marker = (string) get_post_meta($story_id, WW_BYLINE_TRACKER_IMPORT_META, true);
        if ($marker !== WW_BYLINE_TRACKER_IMPORT_PENDING) {
            $skipped++;
            WP_CLI::log('[skip] ' . $story['title'] . ' already exists as #' . $story_id . '; left untouched.');
            continue;
        }
        $resumed++;
        WP_CLI::log('[resume] ' . $story['title'] . ' (#' . $story_id . ')');
    } else {
        $created_payload = $rest('POST', '/byline/v1/editorial/stories', ['title' => $story['title']]);
        $story_id = absint($created_payload['story']['id'] ?? $created_payload['story']['postId'] ?? 0);
        if ($story_id <= 0) {
            throw new RuntimeException('Byline created a story but did not return its ID for: ' . $story['title']);
        }
        update_post_meta($story_id, WW_BYLINE_TRACKER_IMPORT_META, WW_BYLINE_TRACKER_IMPORT_PENDING);
        $created++;
        WP_CLI::log('[create #' . $story_id . '] ' . $story['title']);
    }

    try {
        $writer_ids = array_map($person_id, $story['writers']);
        $writer_ids = array_values(array_filter($writer_ids, static fn (int $id): bool => $id > 0));
        $primary_writer_id = $writer_ids[0] ?? 0;

        // Byline intentionally treats native post_author as the primary writer.
        $updated = wp_update_post([
            'ID' => $story_id,
            'post_author' => $primary_writer_id,
        ], true);
        if (is_wp_error($updated)) {
            throw new RuntimeException('Could not set primary writer: ' . $updated->get_error_message());
        }

        $contributors = array_map(static fn (int $id): array => ['id' => $id, 'kind' => 'user'], $writer_ids);
        $rest('POST', "/byline/v1/editorial/stories/{$story_id}/contributors", ['contributors' => $contributors]);

        $workflow = ['status' => $story['status']];
        if ($story['deadline'] !== null) {
            $workflow['deadline'] = $story['deadline'];
        }
        $rest('POST', "/byline/v1/editorial/stories/{$story_id}", $workflow);

        $workspace = $rest('GET', "/byline/v1/editorial/stories/{$story_id}/workspace");

        $desired_brief = trim((string) $story['brief']);
        if ($desired_brief !== '') {
            $existing_brief = trim((string) ($workspace['brief'] ?? ''));
            if ($existing_brief === '' || $existing_brief === $desired_brief) {
                $rest('POST', "/byline/v1/editorial/stories/{$story_id}/brief", ['brief' => $desired_brief]);
            } else {
                WP_CLI::warning("{$story['title']}: existing Story Brief differs; leaving it untouched.");
            }
        }

        $workspace = $rest('GET', "/byline/v1/editorial/stories/{$story_id}/workspace");
        $task_titles = [];
        foreach ((array) ($workspace['tasks'] ?? []) as $task) {
            if (is_array($task)) {
                $task_titles[trim((string) ($task['title'] ?? ''))] = true;
            }
        }
        foreach ($story['tasks'] as $task) {
            $title = trim((string) $task['title']);
            if ($title === '' || isset($task_titles[$title])) {
                continue;
            }
            $rest('POST', "/byline/v1/editorial/stories/{$story_id}/tasks", [
                'title' => $title,
                'assigneeId' => $person_id($task['assignee'] ?? null),
                'priority' => 'normal',
                'storyId' => $story_id,
            ]);
            $task_titles[$title] = true;
        }

        $workspace = $rest('GET', "/byline/v1/editorial/stories/{$story_id}/workspace");
        $resource_urls = [];
        foreach ((array) ($workspace['resources'] ?? []) as $resource) {
            if (is_array($resource)) {
                $resource_urls[trim((string) ($resource['url'] ?? ''))] = true;
            }
        }
        foreach ($story['resources'] as $resource) {
            $url = trim((string) $resource['url']);
            if ($url === '' || isset($resource_urls[$url])) {
                continue;
            }
            $rest('POST', "/byline/v1/editorial/stories/{$story_id}/resources", [
                'label' => (string) $resource['label'],
                'url' => $url,
                'purpose' => (string) $resource['purpose'],
            ]);
            $resource_urls[$url] = true;
        }

        update_post_meta($story_id, WW_BYLINE_TRACKER_IMPORT_META, WW_BYLINE_TRACKER_IMPORT_COMPLETE);
        WP_CLI::success('Imported ' . $story['title'] . ' (#' . $story_id . ')');
    } catch (Throwable $exception) {
        WP_CLI::warning('Migration stopped with ' . $story['title'] . ' (#' . $story_id . ') still marked pending.');
        WP_CLI::warning('Fix the error and rerun with "apply"; completed stories will be skipped and this one will resume.');
        throw $exception;
    }
}

WP_CLI::success(sprintf('Migration complete: %d created, %d resumed, %d existing stories skipped.', $created, $resumed, $skipped));
