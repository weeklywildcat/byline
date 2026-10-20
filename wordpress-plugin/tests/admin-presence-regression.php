<?php

define('ABSPATH', __DIR__ . '/../');
const BYLINE_ADMIN_PAGE = 'byline';
const BYLINE_ADMIN_PLANNING_PAGE = 'byline-planning';
const BYLINE_ADMIN_SETTINGS_PAGE = 'byline-settings';
const BYLINE_ADMIN_NEWSLETTERS_PAGE = 'byline-newsletters';
const BYLINE_PLUGIN_VERSION = 'test';

class WP_User
{
    public int $ID;
    public string $display_name;
    public function __construct(int $id, string $name) { $this->ID = $id; $this->display_name = $name; }
}

$actions = [];
$filters = [];
$user_meta = [];
$current_user_id = 1;
$can_edit = true;
$users = [new WP_User(1, 'Gibson Bell'), new WP_User(2, 'Caroline Elrod'), new WP_User(3, 'Adam Boyd')];

function fail(string $message): void { fwrite(STDERR, $message . "\n"); exit(1); }
function add_action(string $tag, $callback, int $priority = 10, int $accepted_args = 1): void { global $actions; $actions[$tag][] = [$callback, $priority, $accepted_args]; }
function add_filter(string $tag, $callback, int $priority = 10, int $accepted_args = 1): bool { global $filters; $filters[$tag][] = [$callback, $priority, $accepted_args]; return true; }
function is_admin(): bool { return true; }
function is_user_logged_in(): bool { return true; }
function current_user_can(string $capability): bool { global $can_edit; return $capability === 'edit_posts' ? $can_edit : false; }
function get_current_user_id(): int { global $current_user_id; return $current_user_id; }
function user_can($user, string $capability): bool { return $user instanceof WP_User && $capability === 'edit_posts'; }
function get_users(array $args = []): array { global $users; return $users; }
function get_user_by(string $field, $value) { global $users; foreach ($users as $user) if ($field === 'id' && $user->ID === (int) $value) return $user; return false; }
function get_user_meta(int $user_id, string $key, bool $single = false) { global $user_meta; return $user_meta[$user_id][$key] ?? ''; }
function update_user_meta(int $user_id, string $key, $value): bool { global $user_meta; $user_meta[$user_id][$key] = $value; return true; }
function sanitize_text_field(string $value): string { return trim(strip_tags($value)); }
function sanitize_key(string $value): string { return strtolower((string) preg_replace('/[^a-z0-9_-]/i', '', $value)); }
function absint($value): int { return abs((int) $value); }
function esc_url_raw(string $value): string { return filter_var($value, FILTER_VALIDATE_URL) ? $value : ''; }
function untrailingslashit(string $value): string { return rtrim($value, '/'); }
function admin_url(string $path = ''): string { return 'https://cms.example.test/wp-admin/' . ltrim($path, '/'); }
function get_avatar_url(int $user_id, array $args = []): string { return 'https://img.example.test/' . $user_id . '.jpg'; }
function esc_html__(string $value, string $domain = ''): string { return $value; }
function __(string $value, string $domain = ''): string { return $value; }
function wp_strip_all_tags(string $value): string { return strip_tags($value); }
function get_current_screen() { return null; }
function get_admin_page_title(): string { return 'Dashboard'; }
function wp_unslash($value) { return $value; }

require __DIR__ . '/../includes/admin/presence.php';

if (!isset($filters['heartbeat_received']) || ($filters['heartbeat_received'][0][2] ?? 0) !== 3) fail('Presence must register a three-argument heartbeat filter.');
if (!isset($actions['admin_bar_menu']) || !isset($actions['admin_enqueue_scripts'])) fail('Presence must register toolbar and enqueue hooks.');

$clean = byline_presence_sanitize_location([
    'kind' => 'Story<script>',
    'label' => '<b>Garden</b>',
    'detail' => 'Story workspace',
    'storyId' => 42,
    'href' => 'https://evil.example.test/steal?nonce=1',
]);
if (($clean['kind'] ?? '') !== 'storyscript' || ($clean['label'] ?? '') !== 'Garden' || isset($clean['href'])) fail('Presence location sanitization should strip markup and reject external hrefs.');
$safe = byline_presence_sanitize_location(['label' => 'Garden', 'href' => 'https://cms.example.test/wp-admin/admin.php?page=byline-planning&story=42']);
if (($safe['href'] ?? '') === '') fail('Same-admin presence links should survive sanitization.');

byline_presence_touch(1, 'active', ['label' => 'Stories'], 'tab-a', 1000);
$first = get_user_meta(1, BYLINE_PRESENCE_META, true);
if (($first['state'] ?? '') !== 'active' || ($first['lastSeen'] ?? 0) !== 1000) fail('Active heartbeat was not stored.');
$ignored = byline_presence_touch(1, 'away', ['label' => 'Media'], 'tab-b', 1020);
if (($ignored['state'] ?? '') !== 'active' || ($ignored['location']['label'] ?? '') !== 'Stories') fail('A hidden second tab must not overwrite a different active tab.');
$same_tab = byline_presence_touch(1, 'away', ['label' => 'Stories'], 'tab-a', 1020);
if (($same_tab['state'] ?? '') !== 'away') fail('The active tab must be able to mark itself away.');
byline_presence_touch(1, 'active', ['label' => 'Garden', 'storyId' => 42], 'tab-b', 1030);
if (byline_presence_status(get_user_meta(1, BYLINE_PRESENCE_META, true), 1040) !== 'active') fail('Fresh active presence should be active.');
if (byline_presence_status(get_user_meta(1, BYLINE_PRESENCE_META, true), 1130) !== 'away') fail('A stale active heartbeat should decay to away before offline.');
if (byline_presence_status(get_user_meta(1, BYLINE_PRESENCE_META, true), 1400) !== 'offline') fail('Old presence should decay to offline.');

byline_presence_touch(2, 'away', ['label' => 'Planning'], 'tab-c', 995);
byline_presence_touch(3, 'active', ['label' => 'Article'], 'tab-d', 100);
$people = byline_presence_people(1040);
if (array_column($people, 'id') !== [1, 2, 3]) fail('Presence people should sort active, away, then offline.');
if (($people[0]['avatarUrl'] ?? '') !== 'https://img.example.test/1.jpg') fail('Presence should include staff avatars.');
if (($people[2]['location'] ?? null) !== null) fail('Offline users should not advertise stale locations.');

class FakeAdminBar { public array $nodes = []; public function add_node(array $node): void { $this->nodes[] = $node; } }
$bar = new FakeAdminBar();
byline_presence_add_toolbar_mount($bar);
if (!isset($bar->nodes[0]['title']) || strpos($bar->nodes[0]['title'], 'byline-presence-root') === false) fail('The admin bar should receive the React presence mount.');

$heartbeat = byline_presence_heartbeat_received([], [
    'bylinePresence' => [
        'state' => 'active',
        'sessionId' => 'tab-live',
        'location' => ['label' => 'Calendar', 'href' => 'https://cms.example.test/wp-admin/admin.php?page=byline-planning&tab=calendar'],
    ],
], 'dashboard');
if (!isset($heartbeat['bylinePresence']['people']) || count($heartbeat['bylinePresence']['people']) !== 3) fail('Heartbeat response should return the newsroom presence snapshot.');
if ((get_user_meta(1, BYLINE_PRESENCE_META, true)['location']['label'] ?? '') !== 'Calendar') fail('Heartbeat should update the current user location.');

$can_edit = false;
$bar = new FakeAdminBar();
byline_presence_add_toolbar_mount($bar);
if ($bar->nodes) fail('Users without edit_posts should not see newsroom presence.');

echo "Admin presence regression checks passed.\n";
