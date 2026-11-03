<?php
/**
 * Seeds Core Notes for Article Notes visual QA, written exactly as Gutenberg
 * writes them (the Core comments REST controller, type=note, status hold for
 * open and approved for resolved), by several real users.
 *
 *   Canteen could return to Ninety Six High School   4 open (one with 2 replies), 5 resolved
 *   Debate team's streak ends                         1 open
 *   Homecoming photo gallery                          no Notes
 *
 * Re-running adds nothing for a story that already has Notes.
 *
 *   wp eval-file wp-content/plugins/wordpress-plugin/tests/fixtures/seed-article-notes.php
 */
if (!defined('ABSPATH')) {
    exit;
}
require_once ABSPATH . 'wp-admin/includes/user.php';

$user = static function (string $login, string $name, string $role): int {
    $existing = get_user_by('login', $login);
    if ($existing) {
        return (int) $existing->ID;
    }
    $id = wp_insert_user(['user_login' => $login, 'user_pass' => wp_generate_password(32), 'role' => $role, 'display_name' => $name, 'user_email' => $login . '@example.test']);
    return is_wp_error($id) ? 1 : (int) $id;
};
$caroline = $user('qa-caroline', 'Caroline Elrod', 'author');
$gibson = $user('qa-gibson', 'Gibson Bell', 'editor');
$dana = $user('qa-dana', 'Dana Reyes', 'editor');

$story = static function (string $title, string $status = 'editing', ?int $author = null) use ($gibson): int {
    $found = get_posts(['post_type' => 'post', 'post_status' => 'any', 'title' => $title, 'posts_per_page' => 1, 'fields' => 'ids']);
    if ($found) {
        if ($author !== null) {
            wp_update_post(['ID' => (int) $found[0], 'post_author' => $author]);
        }
        return (int) $found[0];
    }
    wp_set_current_user($gibson);
    $id = wp_insert_post(['post_type' => 'post', 'post_status' => 'draft', 'post_title' => $title, 'post_author' => $author ?? $gibson, 'post_content' => '<!-- wp:paragraph --><p>Draft.</p><!-- /wp:paragraph -->']);
    update_post_meta($id, BYLINE_EDITORIAL_STATUS_META, $status);
    return (int) $id;
};
$note = static function (int $post, int $as, string $html, int $parent = 0, string $status = 'hold'): int {
    wp_set_current_user($as);
    $request = new WP_REST_Request('POST', '/wp/v2/comments');
    foreach (['post' => $post, 'content' => $html, 'type' => 'note', 'status' => $status, 'parent' => $parent] as $key => $value) {
        $request->set_param($key, $value);
    }
    $response = rest_do_request($request);
    if ($response->is_error()) {
        throw new RuntimeException('Note failed: ' . wp_json_encode($response->get_data()));
    }
    return (int) $response->get_data()['id'];
};
$resolve = static function (int $post, int $as, int $id) use ($note): void {
    wp_set_current_user($as);
    $request = new WP_REST_Request('POST', '/wp/v2/comments/' . $id);
    $request->set_param('status', 'approved');
    rest_do_request($request);
    $marker = new WP_REST_Request('POST', '/wp/v2/comments');
    foreach (['post' => $post, 'content' => '', 'type' => 'note', 'status' => 'approved', 'parent' => $id, 'meta' => ['_wp_note_status' => 'resolved']] as $key => $value) {
        $marker->set_param($key, $value);
    }
    rest_do_request($marker);
};
$has_notes = static function (int $post): bool {
    return count(get_comments(['post_id' => $post, 'type' => 'note', 'status' => 'all', 'number' => 1])) > 0;
};

// Core lets only people who can edit a post write Notes on it, so the writer owns the story.
$canteen = $story('Canteen could return to Ninety Six High School', 'editing', $caroline);
if (!$has_notes($canteen)) {
    $note($canteen, $gibson, '<p>This number needs a source.</p>');
    $verify = $note($canteen, $caroline, '<p>Can we verify when this actually happened? The principal said spring, the district office said fall.</p>');
    $note($canteen, $gibson, '<p>I&#8217;ll ask Mrs. Hamby on Tuesday.</p>', $verify);
    $note($canteen, $caroline, '<p>Thanks &#8212; flagging for the Tuesday interview.</p>', $verify);
    $note($canteen, $dana, '<p>&ldquo;Competitive foods&rdquo; needs a short explanation for readers.</p>');
    $note($canteen, $gibson, '<p>Should the lede lead with the vote, or with the students?</p>');
    foreach (['Fix the typo in the second paragraph.', 'Tighten the nut graf.', 'AP style: &ldquo;percent&rdquo;.', 'Cut the repeated quote.', 'Add the school&#8217;s full name on first reference.'] as $index => $text) {
        $resolve($canteen, $gibson, $note($canteen, $index % 2 ? $dana : $caroline, '<p>' . $text . '</p>'));
    }
}
$debate = $story('Debate team streak ends at 31 wins', 'writing');
if (!$has_notes($debate)) {
    $note($debate, $dana, '<p>Which tournament? Name it on first reference.</p>');
}
$story('Homecoming photo gallery', 'writing');
wp_set_current_user(1);
echo "Seeded Article Notes QA stories: Canteen #$canteen, Debate #$debate.\n";
