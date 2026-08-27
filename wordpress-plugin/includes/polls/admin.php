<?php

/**
 * The Polls newsroom screens.
 *
 * Polls use the native WordPress list table and post editor rather than a
 * bespoke application: the list table provides search, paging, statuses, and
 * row actions for free, and the editor provides capability checks, nonces, and
 * authorship.
 */

if (!defined('ABSPATH')) {
    exit;
}

const BYLINE_POLL_NOTICE_TRANSIENT_PREFIX = 'byline_poll_notice_';

function byline_poll_list_url(array $args = []): string
{
    return add_query_arg(
        array_merge(['post_type' => BYLINE_POLL_POST_TYPE], $args),
        admin_url('edit.php')
    );
}

/**
 * The retired informational Polls screen keeps working as a bookmark: it now
 * hands the reader the real Polls workflow instead of duplicating a screen.
 */
function byline_poll_redirect_legacy_admin_page(): void
{
    if (wp_doing_ajax() || byline_admin_current_page() !== BYLINE_ADMIN_POLLS_PAGE) {
        return;
    }

    if (!byline_poll_feature_enabled()) {
        wp_die(esc_html__('The Polls module is not enabled for this publication.', 'weekly-wildcat-headless'));
    }

    wp_safe_redirect(byline_poll_list_url());
    exit;
}
add_action('admin_init', 'byline_poll_redirect_legacy_admin_page');

/**
 * @return array<string,string>
 */
function byline_poll_status_labels(): array
{
    return [
        BYLINE_POLL_STATUS_DRAFT => __('Draft', 'weekly-wildcat-headless'),
        BYLINE_POLL_STATUS_OPEN => __('Open', 'weekly-wildcat-headless'),
        BYLINE_POLL_STATUS_CLOSED => __('Closed', 'weekly-wildcat-headless'),
    ];
}

function byline_poll_status_label(string $status): string
{
    $labels = byline_poll_status_labels();

    return $labels[$status] ?? $labels[BYLINE_POLL_STATUS_DRAFT];
}

/**
 * Question / Status / Votes, matching how an editor thinks about a poll.
 *
 * @param array<string,string> $columns
 * @return array<string,string>
 */
function byline_poll_admin_columns(array $columns): array
{
    $reordered = [];
    foreach ($columns as $key => $label) {
        if ($key === 'date') {
            continue;
        }

        $reordered[$key] = $key === 'title' ? __('Question', 'weekly-wildcat-headless') : $label;
    }

    $reordered['byline_poll_status'] = __('Status', 'weekly-wildcat-headless');
    $reordered['byline_poll_votes'] = __('Votes', 'weekly-wildcat-headless');
    $reordered['byline_poll_window'] = __('Voting window', 'weekly-wildcat-headless');
    $reordered['date'] = $columns['date'] ?? __('Date', 'weekly-wildcat-headless');

    return $reordered;
}
add_filter('manage_' . BYLINE_POLL_POST_TYPE . '_posts_columns', 'byline_poll_admin_columns');

function byline_poll_admin_window_label(array $record): string
{
    $opens = $record['opensAt'] !== '' ? byline_poll_admin_datetime_label($record['opensAt']) : __('Immediately', 'weekly-wildcat-headless');
    $closes = $record['closesAt'] !== '' ? byline_poll_admin_datetime_label($record['closesAt']) : __('No close date', 'weekly-wildcat-headless');

    return $opens . ' &rarr; ' . $closes;
}

function byline_poll_admin_datetime_label(string $utc): string
{
    $local = byline_poll_utc_to_local_input($utc);
    if ($local === '') {
        return '&mdash;';
    }

    return str_replace('T', ' ', $local);
}

/**
 * Vote totals for the whole page are read once rather than per row.
 *
 * @return array<string,int>
 */
function byline_poll_admin_vote_totals(): array
{
    static $totals = null;

    if ($totals === null) {
        $totals = byline_poll_votes_table_exists() ? byline_poll_all_vote_totals() : [];
    }

    return $totals;
}

function byline_poll_admin_column(string $column, int $post_id): void
{
    $post = get_post($post_id);
    if (!$post instanceof WP_Post) {
        return;
    }

    $record = byline_poll_record($post);

    if ($column === 'byline_poll_status') {
        echo esc_html(byline_poll_status_label($record['status']));
        return;
    }

    if ($column === 'byline_poll_votes') {
        $totals = byline_poll_admin_vote_totals();
        $votes = (int) ($totals[$record['id']] ?? 0);
        echo $votes > 0 ? esc_html(number_format_i18n($votes)) : '&mdash;';
        return;
    }

    if ($column === 'byline_poll_window') {
        echo wp_kses_post(byline_poll_admin_window_label($record));
    }
}
add_action('manage_' . BYLINE_POLL_POST_TYPE . '_posts_custom_column', 'byline_poll_admin_column', 10, 2);

function byline_poll_action_url(string $action, int $post_id, array $args = []): string
{
    return wp_nonce_url(
        add_query_arg(
            array_merge(['action' => $action, 'poll' => $post_id], $args),
            admin_url('admin-post.php')
        ),
        $action . '_' . $post_id
    );
}

/**
 * Newsroom actions live where an editor looks for them: on the row.
 *
 * @param array<string,string> $actions
 * @return array<string,string>
 */
function byline_poll_row_actions(array $actions, WP_Post $post): array
{
    if ($post->post_type !== BYLINE_POLL_POST_TYPE || !current_user_can('edit_byline_poll', $post->ID)) {
        return $actions;
    }

    $record = byline_poll_record($post);
    $poll_actions = [];

    if ($record['postStatus'] === 'publish') {
        if ($record['status'] !== BYLINE_POLL_STATUS_OPEN) {
            $label = $record['status'] === BYLINE_POLL_STATUS_CLOSED
                ? __('Reopen', 'weekly-wildcat-headless')
                : __('Open', 'weekly-wildcat-headless');
            $poll_actions['byline_poll_open'] = sprintf(
                '<a href="%s">%s</a>',
                esc_url(byline_poll_action_url('byline_poll_status', (int) $post->ID, ['status' => BYLINE_POLL_STATUS_OPEN])),
                esc_html($label)
            );
        }

        if ($record['status'] === BYLINE_POLL_STATUS_OPEN) {
            $poll_actions['byline_poll_close'] = sprintf(
                '<a href="%s">%s</a>',
                esc_url(byline_poll_action_url('byline_poll_status', (int) $post->ID, ['status' => BYLINE_POLL_STATUS_CLOSED])),
                esc_html__('Close', 'weekly-wildcat-headless')
            );
        }
    }

    $poll_actions['byline_poll_duplicate'] = sprintf(
        '<a href="%s">%s</a>',
        esc_url(byline_poll_action_url('byline_poll_duplicate', (int) $post->ID)),
        esc_html__('Duplicate', 'weekly-wildcat-headless')
    );

    if (current_user_can(byline_poll_results_capability())) {
        $poll_actions['byline_poll_export'] = sprintf(
            '<a href="%s">%s</a>',
            esc_url(byline_poll_action_url('byline_poll_export', (int) $post->ID)),
            esc_html__('Export CSV', 'weekly-wildcat-headless')
        );
    }

    return array_merge($actions, $poll_actions);
}
add_filter('post_row_actions', 'byline_poll_row_actions', 10, 2);

function byline_poll_register_meta_boxes(): void
{
    add_meta_box(
        'byline-poll-answers',
        __('Answers', 'weekly-wildcat-headless'),
        'byline_poll_render_answers_box',
        BYLINE_POLL_POST_TYPE,
        'normal',
        'high'
    );
    add_meta_box(
        'byline-poll-voting',
        __('Voting', 'weekly-wildcat-headless'),
        'byline_poll_render_voting_box',
        BYLINE_POLL_POST_TYPE,
        'side',
        'high'
    );
    add_meta_box(
        'byline-poll-results',
        __('Results', 'weekly-wildcat-headless'),
        'byline_poll_render_results_box',
        BYLINE_POLL_POST_TYPE,
        'normal',
        'default'
    );
}
add_action('add_meta_boxes_' . BYLINE_POLL_POST_TYPE, 'byline_poll_register_meta_boxes');

function byline_poll_render_answers_box(WP_Post $post): void
{
    wp_nonce_field('byline_poll_save_' . $post->ID, 'byline_poll_nonce');

    $poll_id = byline_poll_public_id((int) $post->ID);
    $options = byline_poll_options((int) $post->ID);
    $counts = byline_poll_votes_table_exists() ? byline_poll_option_vote_counts($poll_id) : [];
    $rows = array_merge($options, [[], [], []]);

    echo '<p class="description">'
        . esc_html__('Answer identifiers are permanent. Rewording or reordering an answer keeps its recorded votes; an answer that already has votes cannot be removed.', 'weekly-wildcat-headless')
        . '</p>';
    echo '<table class="widefat striped"><thead><tr>'
        . '<th scope="col" style="width:5em">' . esc_html__('Order', 'weekly-wildcat-headless') . '</th>'
        . '<th scope="col">' . esc_html__('Answer', 'weekly-wildcat-headless') . '</th>'
        . '<th scope="col" style="width:8em">' . esc_html__('Votes', 'weekly-wildcat-headless') . '</th>'
        . '</tr></thead><tbody>';

    foreach ($rows as $index => $option) {
        $id = (string) ($option['id'] ?? '');
        $label = (string) ($option['label'] ?? '');
        $votes = $id !== '' ? (int) ($counts[$id] ?? 0) : 0;

        echo '<tr>';
        printf(
            '<td><input type="number" min="0" step="1" name="byline_poll_options[%1$d][position]" value="%2$s" class="small-text" /><input type="hidden" name="byline_poll_options[%1$d][id]" value="%3$s" /></td>',
            (int) $index,
            esc_attr((string) ($option['position'] ?? $index)),
            esc_attr($id)
        );
        printf(
            '<td><input type="text" class="large-text" maxlength="%1$d" name="byline_poll_options[%2$d][label]" value="%3$s" placeholder="%4$s" /></td>',
            (int) BYLINE_POLL_MAX_OPTION_LABEL,
            (int) $index,
            esc_attr($label),
            esc_attr__('Add an answer', 'weekly-wildcat-headless')
        );
        echo '<td>';
        if ($id === '') {
            echo '&mdash;';
        } elseif ($votes > 0) {
            echo esc_html(number_format_i18n($votes)) . '<br /><span class="description">' . esc_html__('Locked', 'weekly-wildcat-headless') . '</span>';
        } else {
            echo '0<br /><span class="description">' . esc_html__('Clear the text to remove', 'weekly-wildcat-headless') . '</span>';
        }
        echo '</td></tr>';
    }

    echo '</tbody></table>';
    echo '<p class="description">' . sprintf(
        /* translators: 1: stable public poll id, 2: WordPress post id */
        esc_html__('Poll id %1$s (WordPress post %2$d). The publication and every recorded vote reference this id.', 'weekly-wildcat-headless'),
        esc_html($poll_id),
        (int) $post->ID
    ) . '</p>';
}

function byline_poll_render_voting_box(WP_Post $post): void
{
    $record = byline_poll_record($post);
    $timezone = byline_poll_site_timezone()->getName();

    echo '<p><strong>' . esc_html__('Status', 'weekly-wildcat-headless') . '</strong></p>';
    foreach (byline_poll_status_labels() as $status => $label) {
        printf(
            '<p><label><input type="radio" name="byline_poll_status" value="%1$s" %2$s /> %3$s</label></p>',
            esc_attr($status),
            checked($record['status'], $status, false),
            esc_html($label)
        );
    }

    if ($record['postStatus'] !== 'publish') {
        echo '<p class="description">' . esc_html__('A poll must be published before it can accept votes.', 'weekly-wildcat-headless') . '</p>';
    }

    printf(
        '<p><label for="byline_poll_opens_at"><strong>%1$s</strong></label><br /><input type="datetime-local" id="byline_poll_opens_at" name="byline_poll_opens_at" value="%2$s" /></p>',
        esc_html__('Opens', 'weekly-wildcat-headless'),
        esc_attr(byline_poll_utc_to_local_input($record['opensAt']))
    );
    printf(
        '<p><label for="byline_poll_closes_at"><strong>%1$s</strong></label><br /><input type="datetime-local" id="byline_poll_closes_at" name="byline_poll_closes_at" value="%2$s" /></p>',
        esc_html__('Closes', 'weekly-wildcat-headless'),
        esc_attr(byline_poll_utc_to_local_input($record['closesAt']))
    );
    echo '<p class="description">' . sprintf(
        /* translators: %s: site timezone name */
        esc_html__('Times are %s. Leave Opens empty to open immediately and Closes empty for no closing time.', 'weekly-wildcat-headless'),
        esc_html($timezone)
    ) . '</p>';
}

function byline_poll_render_results_box(WP_Post $post): void
{
    if (!current_user_can(byline_poll_results_capability())) {
        echo '<p>' . esc_html__('You do not have permission to view poll results.', 'weekly-wildcat-headless') . '</p>';
        return;
    }

    if (!byline_poll_votes_table_exists()) {
        echo '<p>' . esc_html__('Poll vote storage has not been installed yet.', 'weekly-wildcat-headless') . '</p>';
        return;
    }

    $results = byline_poll_admin_results(byline_poll_record($post));

    printf(
        '<p><strong>%1$s</strong> %2$s</p>',
        esc_html__('Total votes:', 'weekly-wildcat-headless'),
        esc_html(number_format_i18n($results['totalVotes']))
    );

    if ($results['options'] === []) {
        echo '<p>' . esc_html__('Add answers to start collecting responses.', 'weekly-wildcat-headless') . '</p>';
    } else {
        echo '<table class="widefat striped"><thead><tr>'
            . '<th scope="col">' . esc_html__('Answer', 'weekly-wildcat-headless') . '</th>'
            . '<th scope="col">' . esc_html__('Votes', 'weekly-wildcat-headless') . '</th>'
            . '<th scope="col">' . esc_html__('Share', 'weekly-wildcat-headless') . '</th>'
            . '</tr></thead><tbody>';
        foreach ($results['options'] as $option) {
            printf(
                '<tr><td>%1$s</td><td>%2$s</td><td>%3$s%%</td></tr>',
                esc_html($option['label']),
                esc_html(number_format_i18n($option['votes'])),
                esc_html(number_format_i18n($option['percentage'], 1))
            );
        }
        echo '</tbody></table>';
    }

    printf(
        '<p><a class="button" href="%1$s">%2$s</a></p>',
        esc_url(byline_poll_action_url('byline_poll_export', (int) $post->ID)),
        esc_html__('Export results as CSV', 'weekly-wildcat-headless')
    );

    if ($results['totalVotes'] > 0 && current_user_can(byline_poll_destructive_capability())) {
        echo '<hr />';
        printf('<form method="post" action="%s">', esc_url(admin_url('admin-post.php')));
        wp_nonce_field('byline_poll_reset_' . $post->ID);
        printf('<input type="hidden" name="action" value="byline_poll_reset" /><input type="hidden" name="poll" value="%d" />', (int) $post->ID);
        echo '<p><label><input type="checkbox" name="byline_poll_reset_confirm" value="1" /> '
            . esc_html__('I understand that resetting permanently deletes every recorded vote for this poll. This cannot be undone.', 'weekly-wildcat-headless')
            . '</label></p>';
        printf('<p><button type="submit" class="button button-link-delete">%s</button></p>', esc_html__('Reset votes', 'weekly-wildcat-headless'));
        echo '</form>';
    }
}

/**
 * Persist the editor's poll fields.
 */
function byline_poll_save_post(int $post_id, WP_Post $post): void
{
    if ($post->post_type !== BYLINE_POLL_POST_TYPE) {
        return;
    }

    if ((defined('DOING_AUTOSAVE') && DOING_AUTOSAVE) || wp_is_post_revision($post_id)) {
        return;
    }

    $nonce = isset($_POST['byline_poll_nonce']) ? sanitize_text_field((string) wp_unslash($_POST['byline_poll_nonce'])) : '';
    if ($nonce === '' || !wp_verify_nonce($nonce, 'byline_poll_save_' . $post_id)) {
        return;
    }

    if (!current_user_can('edit_byline_poll', $post_id)) {
        return;
    }

    $poll_id = byline_poll_public_id($post_id);

    $submitted = isset($_POST['byline_poll_options']) && is_array($_POST['byline_poll_options'])
        ? wp_unslash($_POST['byline_poll_options'])
        : [];
    $merged = byline_poll_merge_options($poll_id, byline_poll_options($post_id), is_array($submitted) ? array_values($submitted) : []);
    byline_poll_set_options($post_id, $merged['options']);

    byline_poll_set_status(
        $post_id,
        isset($_POST['byline_poll_status']) ? sanitize_key((string) wp_unslash($_POST['byline_poll_status'])) : BYLINE_POLL_STATUS_DRAFT
    );

    byline_poll_set_schedule(
        $post_id,
        byline_poll_local_input_to_utc(isset($_POST['byline_poll_opens_at']) ? (string) wp_unslash($_POST['byline_poll_opens_at']) : ''),
        byline_poll_local_input_to_utc(isset($_POST['byline_poll_closes_at']) ? (string) wp_unslash($_POST['byline_poll_closes_at']) : '')
    );

    if ($merged['blocked'] !== []) {
        byline_poll_set_notice(
            'warning',
            sprintf(
                /* translators: %s: comma separated answer labels */
                __('These answers already have votes and were kept instead of being removed: %s.', 'weekly-wildcat-headless'),
                implode(', ', $merged['blocked'])
            )
        );
    }
}
add_action('save_post', 'byline_poll_save_post', 10, 2);

/**
 * A poll's votes are its own history; permanently deleting the poll takes them
 * with it rather than leaving rows nothing can resolve.
 */
function byline_poll_delete_votes_with_post(int $post_id): void
{
    $post = get_post($post_id);
    if (!$post instanceof WP_Post || $post->post_type !== BYLINE_POLL_POST_TYPE) {
        return;
    }

    $poll_id = (string) get_post_meta($post_id, BYLINE_POLL_ID_META, true);
    if ($poll_id !== '' && byline_poll_votes_table_exists()) {
        byline_poll_delete_votes($poll_id);
    }
}
add_action('before_delete_post', 'byline_poll_delete_votes_with_post');

function byline_poll_set_notice(string $type, string $message): void
{
    set_transient(
        BYLINE_POLL_NOTICE_TRANSIENT_PREFIX . get_current_user_id(),
        ['type' => $type, 'message' => $message],
        60
    );
}

function byline_poll_render_notice(): void
{
    $key = BYLINE_POLL_NOTICE_TRANSIENT_PREFIX . get_current_user_id();
    $notice = get_transient($key);
    if (!is_array($notice) || empty($notice['message'])) {
        return;
    }

    delete_transient($key);
    printf(
        '<div class="notice notice-%1$s is-dismissible"><p>%2$s</p></div>',
        esc_attr((string) ($notice['type'] ?? 'info')),
        esc_html((string) $notice['message'])
    );
}
add_action('admin_notices', 'byline_poll_render_notice');

/**
 * Shared guard for every poll admin action: the action's own nonce plus the
 * capability to edit that specific poll.
 */
function byline_poll_authorize_action(string $action): WP_Post
{
    $post_id = isset($_REQUEST['poll']) ? (int) $_REQUEST['poll'] : 0;
    check_admin_referer($action . '_' . $post_id);

    $post = get_post($post_id);
    if (!$post instanceof WP_Post || $post->post_type !== BYLINE_POLL_POST_TYPE) {
        wp_die(esc_html__('That poll does not exist.', 'weekly-wildcat-headless'));
    }

    if (!current_user_can('edit_byline_poll', $post_id)) {
        wp_die(esc_html__('Sorry, you are not allowed to manage this poll.', 'weekly-wildcat-headless'));
    }

    return $post;
}

function byline_poll_handle_status_action(): void
{
    $post = byline_poll_authorize_action('byline_poll_status');
    $status = isset($_REQUEST['status']) ? sanitize_key((string) wp_unslash($_REQUEST['status'])) : '';

    byline_poll_set_status((int) $post->ID, $status);
    byline_poll_set_notice('success', sprintf(
        /* translators: %s: poll status label */
        __('Poll status is now %s.', 'weekly-wildcat-headless'),
        byline_poll_status_label(byline_poll_status((int) $post->ID))
    ));

    wp_safe_redirect(byline_poll_list_url());
    exit;
}
add_action('admin_post_byline_poll_status', 'byline_poll_handle_status_action');

function byline_poll_handle_duplicate_action(): void
{
    $post = byline_poll_authorize_action('byline_poll_duplicate');

    if (!current_user_can('edit_byline_polls')) {
        wp_die(esc_html__('Sorry, you are not allowed to create polls.', 'weekly-wildcat-headless'));
    }

    $record = byline_poll_record($post);
    $duplicate_id = wp_insert_post([
        'post_type' => BYLINE_POLL_POST_TYPE,
        'post_status' => 'draft',
        'post_title' => sprintf(
            /* translators: %s: original poll question */
            __('%s (copy)', 'weekly-wildcat-headless'),
            $record['question']
        ),
        'post_author' => get_current_user_id(),
    ], true);

    if (is_wp_error($duplicate_id)) {
        wp_die(esc_html($duplicate_id->get_error_message()));
    }

    // A duplicate is a new poll: it mints its own poll id and fresh answer ids
    // so it can never share vote history with the original.
    byline_poll_public_id((int) $duplicate_id);
    byline_poll_set_options((int) $duplicate_id, array_map(static function (array $option): array {
        return ['label' => $option['label'], 'position' => $option['position']];
    }, $record['options']));
    byline_poll_set_status((int) $duplicate_id, BYLINE_POLL_STATUS_DRAFT);
    byline_poll_set_schedule((int) $duplicate_id, '', '');

    wp_safe_redirect(get_edit_post_link((int) $duplicate_id, 'redirect') ?: byline_poll_list_url());
    exit;
}
add_action('admin_post_byline_poll_duplicate', 'byline_poll_handle_duplicate_action');

/**
 * Aggregate CSV only. Voter keys are never part of an export.
 */
function byline_poll_handle_export_action(): void
{
    $post = byline_poll_authorize_action('byline_poll_export');

    if (!current_user_can(byline_poll_results_capability())) {
        wp_die(esc_html__('Sorry, you are not allowed to export poll results.', 'weekly-wildcat-headless'));
    }

    $results = byline_poll_admin_results(byline_poll_record($post));

    nocache_headers();
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="poll-' . $results['id'] . '.csv"');

    echo byline_poll_results_csv($results);
    exit;
}

/**
 * Aggregate results as CSV. Answer identifiers and labels only; a voter key is
 * never part of an export.
 *
 * @param array<string,mixed> $results
 */
function byline_poll_results_csv(array $results): string
{
    // The escape character is passed explicitly: it is required from PHP 8.4 and
    // has been accepted since long before this plugin's 7.4 floor.
    $handle = fopen('php://temp', 'r+');
    fputcsv($handle, ['option', 'label', 'votes', 'percentage'], ',', '"', '\\');

    foreach ($results['options'] as $option) {
        fputcsv($handle, [$option['id'], $option['label'], $option['votes'], $option['percentage']], ',', '"', '\\');
    }

    rewind($handle);
    $csv = (string) stream_get_contents($handle);
    fclose($handle);

    return $csv;
}
add_action('admin_post_byline_poll_export', 'byline_poll_handle_export_action');

function byline_poll_handle_reset_action(): void
{
    $post = byline_poll_authorize_action('byline_poll_reset');

    if (!current_user_can(byline_poll_destructive_capability())) {
        wp_die(esc_html__('Sorry, you are not allowed to reset poll votes.', 'weekly-wildcat-headless'));
    }

    $confirmed = isset($_POST['byline_poll_reset_confirm']) && (string) wp_unslash($_POST['byline_poll_reset_confirm']) === '1';
    if (!$confirmed) {
        byline_poll_set_notice('error', __('Confirm the reset before deleting recorded votes.', 'weekly-wildcat-headless'));
    } else {
        $deleted = byline_poll_delete_votes(byline_poll_public_id((int) $post->ID));
        byline_poll_set_notice('success', sprintf(
            /* translators: %s: number of deleted votes */
            __('Deleted %s recorded votes.', 'weekly-wildcat-headless'),
            number_format_i18n($deleted)
        ));
    }

    wp_safe_redirect(get_edit_post_link((int) $post->ID, 'redirect') ?: byline_poll_list_url());
    exit;
}
add_action('admin_post_byline_poll_reset', 'byline_poll_handle_reset_action');
