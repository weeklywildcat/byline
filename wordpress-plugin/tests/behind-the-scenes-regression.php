<?php

define('ABSPATH', __DIR__);
$can_manage_categories = true;
$existing_term = false;
$insertions = [];
$updates = [];
function add_action($hook, $callback) { $GLOBALS['hooks'][$hook] = $callback; }
function current_user_can($capability) { return $capability === 'manage_categories' && $GLOBALS['can_manage_categories']; }
function get_term_by($field, $slug, $taxonomy) { return $GLOBALS['existing_term']; }
function wp_insert_term($name, $taxonomy, $args) {
    $GLOBALS['insertions'][] = [$name, $taxonomy, $args];
    $GLOBALS['existing_term'] = (object) ['term_id' => 20, 'name' => $name];
    return ['term_id' => 20];
}
function wp_update_term($id, $taxonomy, $args) {
    $GLOBALS['updates'][] = [$id, $taxonomy, $args];
    $GLOBALS['existing_term']->name = $args['name'];
    return ['term_id' => $id];
}
function check($condition, $message) { if (!$condition) { throw new RuntimeException($message); } }
require dirname(__DIR__) . '/includes/content/behind-the-scenes.php';

check(($hooks['admin_init'] ?? '') === 'byline_ensure_behind_the_scenes_category', 'Category provisioning must run in admin.');
$can_manage_categories = false;
byline_ensure_behind_the_scenes_category();
check(count($insertions) === 0, 'Users without category management must not provision terms.');
$can_manage_categories = true;
byline_ensure_behind_the_scenes_category();
check(count($insertions) === 1, 'A category manager must provision the missing category.');
check($insertions[0][0] === 'Off Deadline' && $insertions[0][1] === 'category' && $insertions[0][2]['slug'] === 'behind-the-scenes', 'Use the new label with the stable category slug.');
check($insertions[0][2]['description'] === 'Stories behind the stories', 'Use the chosen description.');
byline_ensure_behind_the_scenes_category();
check(count($insertions) === 1, 'Existing categories must be preserved without duplicate inserts.');
check(count($updates) === 0, 'An up-to-date category needs no writes.');
$existing_term = (object) ['term_id' => 12, 'name' => 'Behind the Scenes'];
byline_ensure_behind_the_scenes_category();
check(count($updates) === 1 && $updates[0][0] === 12, 'Rename the existing category in place.');
check($updates[0][2] === ['name' => 'Off Deadline', 'description' => 'Stories behind the stories'], 'Preserve the slug and term relationships when renaming.');
byline_ensure_behind_the_scenes_category();
check(count($updates) === 1, 'Renaming must be idempotent.');
$existing_term->name = 'Custom newsroom section';
byline_ensure_behind_the_scenes_category();
check(count($updates) === 1, 'Preserve intentionally customized category names.');
echo "Off Deadline category regression checks passed.\n";
