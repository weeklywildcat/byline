<?php

if (!defined('ABSPATH')) {
    exit;
}

const WWH_ROSTER_TEAM_META = '_ww_roster_team_key';
const WWH_ROSTER_SEASON_META = '_ww_roster_season';
const WWH_ROSTER_PLAYERS_META = '_ww_roster_players';
const WWH_ROSTER_STAFF_META = '_ww_roster_staff';

function wwh_register_sports_roster_post_type(): void
{
    register_post_type(
        WWH_SPORTS_ROSTER_POST_TYPE,
        [
            'labels' => [
                'name' => 'Team Rosters',
                'singular_name' => 'Team Roster',
                'add_new_item' => 'Add Team Roster',
                'edit_item' => 'Edit Team Roster',
                'new_item' => 'New Team Roster',
                'view_item' => 'View Team Roster',
                'search_items' => 'Search Team Rosters',
                'not_found' => 'No team rosters found',
                'menu_name' => 'Team Rosters',
            ],
            'public' => false,
            'show_ui' => true,
            'show_in_menu' => 'edit.php?post_type=' . WWH_SPORTS_GAME_POST_TYPE,
            'show_in_rest' => false,
            'supports' => [],
            'capability_type' => 'post',
        ]
    );
}
add_action('init', 'wwh_register_sports_roster_post_type');

function wwh_register_sports_roster_meta(): void
{
    foreach ([WWH_ROSTER_TEAM_META, WWH_ROSTER_SEASON_META] as $key) {
        register_post_meta(
            WWH_SPORTS_ROSTER_POST_TYPE,
            $key,
            [
                'single' => true,
                'type' => 'string',
                'show_in_rest' => false,
                'auth_callback' => static fn() => current_user_can('edit_posts'),
            ]
        );
    }

    foreach ([WWH_ROSTER_PLAYERS_META, WWH_ROSTER_STAFF_META] as $key) {
        register_post_meta(
            WWH_SPORTS_ROSTER_POST_TYPE,
            $key,
            [
                'single' => true,
                'type' => 'array',
                'show_in_rest' => false,
                'auth_callback' => static fn() => current_user_can('edit_posts'),
            ]
        );
    }
}
add_action('init', 'wwh_register_sports_roster_meta');

function wwh_sanitize_roster_season($value): string
{
    $season = sanitize_text_field((string) $value);

    if (preg_match('/^(\d{4})-(\d{2})$/', $season, $matches) !== 1) {
        return '';
    }

    $expected_suffix = str_pad((string) (((int) $matches[1] + 1) % 100), 2, '0', STR_PAD_LEFT);

    return $matches[2] === $expected_suffix ? $season : '';
}

function wwh_sanitize_roster_players($rows): array
{
    if (!is_array($rows)) {
        return [];
    }

    $players = [];

    foreach (array_slice($rows, 0, 200) as $row) {
        if (!is_array($row)) {
            continue;
        }

        $name = sanitize_text_field((string) ($row['name'] ?? ''));

        if ($name === '') {
            continue;
        }

        $players[] = [
            'name' => $name,
            'number' => sanitize_text_field((string) ($row['number'] ?? '')),
            'position' => sanitize_text_field((string) ($row['position'] ?? '')),
            'grade' => sanitize_text_field((string) ($row['grade'] ?? '')),
        ];
    }

    return $players;
}

function wwh_sanitize_roster_staff($rows): array
{
    if (!is_array($rows)) {
        return [];
    }

    $staff = [];

    foreach (array_slice($rows, 0, 100) as $row) {
        if (!is_array($row)) {
            continue;
        }

        $name = sanitize_text_field((string) ($row['name'] ?? ''));

        if ($name === '') {
            continue;
        }

        $staff[] = [
            'name' => $name,
            'role' => sanitize_text_field((string) ($row['role'] ?? '')),
        ];
    }

    return $staff;
}

function wwh_roster_rows(int $post_id, string $meta_key): array
{
    $rows = get_post_meta($post_id, $meta_key, true);

    if ($meta_key === WWH_ROSTER_PLAYERS_META) {
        return wwh_sanitize_roster_players($rows);
    }

    return wwh_sanitize_roster_staff($rows);
}

function wwh_add_sports_roster_meta_box(): void
{
    add_meta_box(
        'wwh_sports_roster_details',
        'Roster Details',
        'wwh_render_sports_roster_meta_box',
        WWH_SPORTS_ROSTER_POST_TYPE,
        'normal',
        'high'
    );
}
add_action('add_meta_boxes', 'wwh_add_sports_roster_meta_box');

function wwh_roster_team_options(): array
{
    $options = ['' => 'Select a sport / team'];

    foreach (wwh_sports_team_options() as $key => $team) {
        $options[$key] = (string) $team['label'];
    }

    return $options;
}

function wwh_render_sports_roster_meta_box(WP_Post $post): void
{
    wp_nonce_field('wwh_save_sports_roster', 'wwh_sports_roster_nonce');
    $team_key = wwh_meta_value($post->ID, WWH_ROSTER_TEAM_META);
    $season = wwh_meta_value($post->ID, WWH_ROSTER_SEASON_META);
    $players = wwh_roster_rows($post->ID, WWH_ROSTER_PLAYERS_META);
    $staff = wwh_roster_rows($post->ID, WWH_ROSTER_STAFF_META);

    echo '<div class="wwh-roster-fields">';
    wwh_select('Sport / Team', 'ww_roster_team_key', $team_key, wwh_roster_team_options());
    wwh_field('School Year', 'ww_roster_season', $season, 'text', ['placeholder' => '2025-26', 'pattern' => '\\d{4}-\\d{2}', 'required' => 'required']);
    echo '</div>';
    echo '<p class="description">Publish one roster per controlled team and school year. Player and staff order is preserved publicly.</p>';

    wwh_render_roster_player_editor($players);
    wwh_render_roster_staff_editor($staff);
}

function wwh_render_roster_player_editor(array $players): void
{
    ?>
    <section class="wwh-roster-editor" data-roster-editor="players">
        <div class="wwh-roster-editor-heading">
            <h3>Student-Athletes</h3>
            <button type="button" class="button wwh-roster-add-row">Add Athlete</button>
        </div>
        <div class="wwh-roster-table-wrap">
            <table class="widefat striped wwh-roster-table">
                <thead><tr><th>Name</th><th>Number</th><th>Position / Event</th><th>Grade</th><th>Order</th></tr></thead>
                <tbody class="wwh-roster-rows">
                    <?php foreach ($players as $index => $player) : ?>
                        <?php wwh_render_roster_player_row((int) $index, $player); ?>
                    <?php endforeach; ?>
                </tbody>
            </table>
        </div>
        <template class="wwh-roster-row-template"><?php wwh_render_roster_player_row(999999, []); ?></template>
    </section>
    <?php
}

function wwh_render_roster_player_row(int $index, array $player): void
{
    ?>
    <tr class="wwh-roster-row">
        <td><input type="text" name="ww_roster_players[<?php echo esc_attr((string) $index); ?>][name]" value="<?php echo esc_attr((string) ($player['name'] ?? '')); ?>" aria-label="Athlete name"></td>
        <td><input type="text" name="ww_roster_players[<?php echo esc_attr((string) $index); ?>][number]" value="<?php echo esc_attr((string) ($player['number'] ?? '')); ?>" aria-label="Jersey number"></td>
        <td><input type="text" name="ww_roster_players[<?php echo esc_attr((string) $index); ?>][position]" value="<?php echo esc_attr((string) ($player['position'] ?? '')); ?>" aria-label="Position or event"></td>
        <td><input type="text" name="ww_roster_players[<?php echo esc_attr((string) $index); ?>][grade]" value="<?php echo esc_attr((string) ($player['grade'] ?? '')); ?>" aria-label="Grade"></td>
        <td class="wwh-roster-row-actions">
            <button type="button" class="button-link wwh-roster-move-up" aria-label="Move athlete up">↑</button>
            <button type="button" class="button-link wwh-roster-move-down" aria-label="Move athlete down">↓</button>
            <button type="button" class="button-link-delete wwh-roster-remove-row">Remove</button>
        </td>
    </tr>
    <?php
}

function wwh_render_roster_staff_editor(array $staff): void
{
    ?>
    <section class="wwh-roster-editor" data-roster-editor="staff">
        <div class="wwh-roster-editor-heading">
            <h3>Coaches and Student Managers</h3>
            <button type="button" class="button wwh-roster-add-row">Add Staff Member</button>
        </div>
        <div class="wwh-roster-table-wrap">
            <table class="widefat striped wwh-roster-table">
                <thead><tr><th>Name</th><th>Role</th><th>Order</th></tr></thead>
                <tbody class="wwh-roster-rows">
                    <?php foreach ($staff as $index => $member) : ?>
                        <?php wwh_render_roster_staff_row((int) $index, $member); ?>
                    <?php endforeach; ?>
                </tbody>
            </table>
        </div>
        <template class="wwh-roster-row-template"><?php wwh_render_roster_staff_row(999999, []); ?></template>
    </section>
    <?php
}

function wwh_render_roster_staff_row(int $index, array $member): void
{
    ?>
    <tr class="wwh-roster-row">
        <td><input type="text" name="ww_roster_staff[<?php echo esc_attr((string) $index); ?>][name]" value="<?php echo esc_attr((string) ($member['name'] ?? '')); ?>" aria-label="Staff name"></td>
        <td><input type="text" name="ww_roster_staff[<?php echo esc_attr((string) $index); ?>][role]" value="<?php echo esc_attr((string) ($member['role'] ?? '')); ?>" aria-label="Staff role"></td>
        <td class="wwh-roster-row-actions">
            <button type="button" class="button-link wwh-roster-move-up" aria-label="Move staff member up">↑</button>
            <button type="button" class="button-link wwh-roster-move-down" aria-label="Move staff member down">↓</button>
            <button type="button" class="button-link-delete wwh-roster-remove-row">Remove</button>
        </td>
    </tr>
    <?php
}

function wwh_save_sports_roster(int $post_id): void
{
    if (!wwh_can_save_post($post_id, 'wwh_sports_roster_nonce', 'wwh_save_sports_roster')) {
        return;
    }

    $team_key = wwh_sanitize_sport_key(wwh_request_value('ww_roster_team_key'));
    $season = wwh_sanitize_roster_season(wwh_request_value('ww_roster_season'));
    $players_raw = isset($_POST['ww_roster_players']) && is_array($_POST['ww_roster_players']) ? wp_unslash($_POST['ww_roster_players']) : [];
    $staff_raw = isset($_POST['ww_roster_staff']) && is_array($_POST['ww_roster_staff']) ? wp_unslash($_POST['ww_roster_staff']) : [];

    wwh_update_meta($post_id, WWH_ROSTER_TEAM_META, $team_key);
    wwh_update_meta($post_id, WWH_ROSTER_SEASON_META, $season);
    update_post_meta($post_id, WWH_ROSTER_PLAYERS_META, wwh_sanitize_roster_players($players_raw));
    update_post_meta($post_id, WWH_ROSTER_STAFF_META, wwh_sanitize_roster_staff($staff_raw));
}
add_action('save_post_' . WWH_SPORTS_ROSTER_POST_TYPE, 'wwh_save_sports_roster');

function wwh_roster_title(string $team_key, string $season): string
{
    $team = wwh_sports_team_options()[$team_key] ?? null;
    $team_label = is_array($team) ? (string) ($team['label'] ?? $team_key) : $team_key;

    return trim($team_label . ($season !== '' ? ' — ' . $season : '') . ' Roster');
}

function wwh_prepare_sports_roster_post(array $data, array $postarr): array
{
    if (($data['post_type'] ?? '') !== WWH_SPORTS_ROSTER_POST_TYPE || !isset($_POST['wwh_sports_roster_nonce'])) {
        return $data;
    }

    $team_key = wwh_sanitize_sport_key(wwh_request_value('ww_roster_team_key'));
    $season = wwh_sanitize_roster_season(wwh_request_value('ww_roster_season'));

    if ($team_key !== '' && $season !== '') {
        $data['post_title'] = wwh_roster_title($team_key, $season);
    }

    if (($data['post_status'] ?? '') === 'publish' && ($team_key === '' || $season === '')) {
        $data['post_status'] = 'draft';
        set_transient(
            'wwh_roster_notice_' . get_current_user_id(),
            'Choose a valid team and school year before publishing this roster.',
            60
        );
    }

    if (($data['post_status'] ?? '') === 'publish' && wwh_find_sports_roster($team_key, $season, absint($postarr['ID'] ?? 0), ['publish'])) {
        $data['post_status'] = 'draft';
        set_transient(
            'wwh_roster_notice_' . get_current_user_id(),
            'A published roster already exists for that team and school year. This duplicate was saved as a draft.',
            60
        );
    }

    return $data;
}
add_filter('wp_insert_post_data', 'wwh_prepare_sports_roster_post', 10, 2);

function wwh_find_sports_roster(string $team_key, string $season, int $exclude_id = 0, array $statuses = ['publish', 'draft', 'pending', 'private', 'future']): int
{
    if ($team_key === '' || $season === '') {
        return 0;
    }

    foreach ($statuses as $status) {
        $posts = get_posts([
            'post_type' => WWH_SPORTS_ROSTER_POST_TYPE,
            'post_status' => $status,
            'posts_per_page' => 1,
            'fields' => 'ids',
            'post__not_in' => $exclude_id > 0 ? [$exclude_id] : [],
            'meta_query' => [
                'relation' => 'AND',
                ['key' => WWH_ROSTER_TEAM_META, 'value' => $team_key],
                ['key' => WWH_ROSTER_SEASON_META, 'value' => $season],
            ],
        ]);

        if (isset($posts[0])) {
            return absint($posts[0]);
        }
    }

    return 0;
}

function wwh_sports_roster_admin_notice(): void
{
    $key = 'wwh_roster_notice_' . get_current_user_id();
    $message = get_transient($key);

    if (!is_string($message) || $message === '') {
        return;
    }

    delete_transient($key);
    printf('<div class="notice notice-warning is-dismissible"><p>%s</p></div>', esc_html($message));
}
add_action('admin_notices', 'wwh_sports_roster_admin_notice');

function wwh_sports_roster_admin_columns(array $columns): array
{
    return [
        'cb' => $columns['cb'] ?? '<input type="checkbox">',
        'title' => 'Roster',
        'wwh_roster_team' => 'Sport / Team',
        'wwh_roster_season' => 'School Year',
        'wwh_roster_players' => 'Athletes',
        'date' => $columns['date'] ?? 'Date',
    ];
}
add_filter('manage_' . WWH_SPORTS_ROSTER_POST_TYPE . '_posts_columns', 'wwh_sports_roster_admin_columns');

function wwh_render_sports_roster_admin_column(string $column, int $post_id): void
{
    if ($column === 'wwh_roster_team') {
        $team_key = wwh_meta_value($post_id, WWH_ROSTER_TEAM_META);
        $team_label = (string) (wwh_sports_team_options()[$team_key]['label'] ?? $team_key);
        echo esc_html($team_label !== '' ? $team_label : '—');
        return;
    }

    if ($column === 'wwh_roster_season') {
        echo esc_html(wwh_meta_value($post_id, WWH_ROSTER_SEASON_META, '—'));
        return;
    }

    if ($column === 'wwh_roster_players') {
        echo esc_html((string) count(wwh_roster_rows($post_id, WWH_ROSTER_PLAYERS_META)));
    }
}
add_action('manage_' . WWH_SPORTS_ROSTER_POST_TYPE . '_posts_custom_column', 'wwh_render_sports_roster_admin_column', 10, 2);

function wwh_render_sports_roster_admin_filters(string $post_type): void
{
    if ($post_type !== WWH_SPORTS_ROSTER_POST_TYPE) {
        return;
    }

    $selected_team = wwh_sanitize_sport_key(wwh_admin_filter_value('wwh_roster_team_key'));
    $selected_season = wwh_sanitize_roster_season(wwh_admin_filter_value('wwh_roster_season'));
    echo '<select name="wwh_roster_team_key"><option value="">All sports / teams</option>';

    foreach (wwh_sports_team_options() as $key => $team) {
        printf('<option value="%s"%s>%s</option>', esc_attr($key), selected($selected_team, $key, false), esc_html((string) $team['label']));
    }

    echo '</select>';
    $season_options = [];

    foreach (wwh_distinct_meta_values(WWH_SPORTS_ROSTER_POST_TYPE, WWH_ROSTER_SEASON_META) as $season) {
        $season_options[$season] = $season;
    }

    wwh_admin_filter_select('wwh_roster_season', $selected_season, 'All school years', $season_options);
}
add_action('restrict_manage_posts', 'wwh_render_sports_roster_admin_filters');

function wwh_filter_sports_roster_admin_posts(WP_Query $query): void
{
    global $pagenow;

    if (!is_admin() || $pagenow !== 'edit.php' || !$query->is_main_query() || $query->get('post_type') !== WWH_SPORTS_ROSTER_POST_TYPE) {
        return;
    }

    $meta_query = [];
    $team_key = wwh_sanitize_sport_key(wwh_admin_filter_value('wwh_roster_team_key'));
    $season = wwh_sanitize_roster_season(wwh_admin_filter_value('wwh_roster_season'));

    if ($team_key !== '') {
        $meta_query[] = ['key' => WWH_ROSTER_TEAM_META, 'value' => $team_key];
    }

    if ($season !== '') {
        $meta_query[] = ['key' => WWH_ROSTER_SEASON_META, 'value' => $season];
    }

    if ($meta_query !== []) {
        $query->set('meta_query', $meta_query);
    }
}
add_action('pre_get_posts', 'wwh_filter_sports_roster_admin_posts', 20);

function wwh_enqueue_sports_roster_assets(string $hook): void
{
    $screen = get_current_screen();

    if (!$screen || ($screen->post_type !== WWH_SPORTS_ROSTER_POST_TYPE && $screen->id !== WWH_SPORTS_GAME_POST_TYPE . '_page_wwh-sports-roster-import')) {
        return;
    }

    $script_path = dirname(__DIR__) . '/assets/sports-rosters.js';
    $style_path = dirname(__DIR__) . '/assets/sports-rosters.css';

    wp_enqueue_script('wwh-sports-rosters', plugins_url('assets/sports-rosters.js', dirname(__DIR__) . '/weekly-wildcat-headless.php'), [], file_exists($script_path) ? (string) filemtime($script_path) : '1', true);
    wp_enqueue_style('wwh-sports-rosters', plugins_url('assets/sports-rosters.css', dirname(__DIR__) . '/weekly-wildcat-headless.php'), [], file_exists($style_path) ? (string) filemtime($style_path) : '1');
}
add_action('admin_enqueue_scripts', 'wwh_enqueue_sports_roster_assets');

function wwh_roster_cloudflare_post_types(array $post_types): array
{
    $post_types[] = WWH_SPORTS_ROSTER_POST_TYPE;

    return array_values(array_unique($post_types));
}
add_filter('wwh_cloudflare_deploy_post_types', 'wwh_roster_cloudflare_post_types');

function wwh_register_sports_roster_rest_route(): void
{
    register_rest_route(WWH_REST_NAMESPACE, '/sports-rosters', [
        'methods' => WP_REST_Server::READABLE,
        'callback' => 'wwh_rest_sports_rosters',
        'permission_callback' => '__return_true',
        'args' => [
            'teamKey' => ['type' => 'string', 'sanitize_callback' => 'sanitize_key'],
            'season' => ['type' => 'string', 'sanitize_callback' => 'sanitize_text_field'],
            'per_page' => ['type' => 'integer', 'default' => 100, 'sanitize_callback' => 'absint'],
            'page' => ['type' => 'integer', 'default' => 1, 'sanitize_callback' => 'absint'],
        ],
    ]);
}
add_action('rest_api_init', 'wwh_register_sports_roster_rest_route');

function wwh_format_sports_roster(WP_Post $post): array
{
    $team_key = wwh_meta_value($post->ID, WWH_ROSTER_TEAM_META);
    $team = wwh_sports_team_options()[$team_key] ?? [];

    return [
        'id' => $post->ID,
        'teamKey' => $team_key,
        'season' => wwh_meta_value($post->ID, WWH_ROSTER_SEASON_META),
        'team' => [
            'key' => $team_key,
            'sport' => (string) ($team['sport'] ?? ''),
            'level' => (string) ($team['level'] ?? ''),
            'teamLabel' => (string) ($team['teamLabel'] ?? ''),
            'label' => (string) ($team['label'] ?? $team_key),
        ],
        'players' => wwh_roster_rows($post->ID, WWH_ROSTER_PLAYERS_META),
        'staff' => wwh_roster_rows($post->ID, WWH_ROSTER_STAFF_META),
    ];
}

function wwh_rest_sports_rosters(WP_REST_Request $request): WP_REST_Response
{
    $team_key_raw = (string) $request->get_param('teamKey');
    $team_key = wwh_sanitize_sport_key($team_key_raw);
    $season_raw = (string) $request->get_param('season');
    $season = $season_raw !== '' ? wwh_sanitize_roster_season($season_raw) : '';
    $per_page = max(1, min(100, absint($request->get_param('per_page') ?: 100)));
    $page = max(1, absint($request->get_param('page') ?: 1));
    $meta_query = [];

    if (($team_key_raw !== '' && $team_key === '') || ($season_raw !== '' && $season === '')) {
        $response = rest_ensure_response([]);
        $response->header('X-WP-Total', '0');
        $response->header('X-WP-TotalPages', '0');
        return $response;
    }

    if ($team_key !== '') {
        $meta_query[] = ['key' => WWH_ROSTER_TEAM_META, 'value' => $team_key];
    }

    if ($season !== '') {
        $meta_query[] = ['key' => WWH_ROSTER_SEASON_META, 'value' => $season];
    }

    $query = new WP_Query([
        'post_type' => WWH_SPORTS_ROSTER_POST_TYPE,
        'post_status' => 'publish',
        'posts_per_page' => $per_page,
        'paged' => $page,
        'orderby' => 'title',
        'order' => 'ASC',
        'meta_query' => $meta_query,
    ]);
    $data = array_map('wwh_format_sports_roster', $query->posts);
    $response = rest_ensure_response($data);
    $response->header('X-WP-Total', (string) $query->found_posts);
    $response->header('X-WP-TotalPages', (string) $query->max_num_pages);
    wp_reset_postdata();

    return $response;
}

function wwh_register_sports_roster_admin_pages(): void
{
    add_submenu_page(
        'edit.php?post_type=' . WWH_SPORTS_GAME_POST_TYPE,
        'Import and Export Team Rosters',
        'Roster Import / Export',
        'edit_posts',
        'wwh-sports-roster-import',
        'wwh_render_sports_roster_import_page'
    );
}
add_action('admin_menu', 'wwh_register_sports_roster_admin_pages');
add_action('admin_post_wwh_export_sports_rosters', 'wwh_export_sports_rosters');

function wwh_roster_csv_columns(): array
{
    return ['team_key', 'season', 'row_type', 'name', 'number', 'position', 'grade', 'role', 'sort_order'];
}

function wwh_normalize_roster_csv_header(string $value): string
{
    $value = preg_replace('/^\xEF\xBB\xBF/', '', $value) ?? $value;
    $value = strtolower(trim($value));
    $value = preg_replace('/[^a-z0-9]+/', '_', $value);

    return is_string($value) ? trim($value, '_') : '';
}

function wwh_parse_sports_roster_csv(string $raw_data): array
{
    $result = ['groups' => [], 'errors' => [], 'rows' => 0];
    $raw_data = trim($raw_data);

    if ($raw_data === '') {
        $result['errors'][] = 'Upload or paste roster CSV data.';
        return $result;
    }

    $lines = preg_split('/\r\n|\r|\n/', $raw_data) ?: [];
    $lines = array_values(array_filter($lines, static fn($line): bool => trim((string) $line) !== ''));

    if ($lines === []) {
        $result['errors'][] = 'The roster CSV does not contain any rows.';
        return $result;
    }

    $delimiter = substr_count((string) $lines[0], "\t") > substr_count((string) $lines[0], ',') ? "\t" : ',';
    $headers = array_map('wwh_normalize_roster_csv_header', str_getcsv((string) array_shift($lines), $delimiter, '"', ''));
    $required = ['team_key', 'season', 'row_type', 'name'];

    foreach ($required as $header) {
        if (!in_array($header, $headers, true)) {
            $result['errors'][] = sprintf('Missing required CSV column: %s.', $header);
        }
    }

    if ($result['errors'] !== []) {
        return $result;
    }

    foreach ($lines as $line_index => $line) {
        $line_number = $line_index + 2;
        $columns = str_getcsv((string) $line, $delimiter, '"', '');
        $row = [];

        foreach ($headers as $index => $header) {
            if ($header !== '') {
                $row[$header] = trim((string) ($columns[$index] ?? ''));
            }
        }

        $team_key = wwh_sanitize_sport_key(strtolower((string) ($row['team_key'] ?? '')));
        $season = wwh_sanitize_roster_season((string) ($row['season'] ?? ''));
        $row_type = strtolower((string) ($row['row_type'] ?? ''));
        $row_type = $row_type === 'player' ? 'athlete' : $row_type;
        $name = sanitize_text_field((string) ($row['name'] ?? ''));

        if ($team_key === '') {
            $result['errors'][] = sprintf('Row %d has an unknown team_key.', $line_number);
            continue;
        }

        if ($season === '') {
            $result['errors'][] = sprintf('Row %d has an invalid season; use YYYY-YY.', $line_number);
            continue;
        }

        if (!in_array($row_type, ['athlete', 'staff'], true)) {
            $result['errors'][] = sprintf('Row %d row_type must be athlete or staff.', $line_number);
            continue;
        }

        if ($name === '') {
            $result['errors'][] = sprintf('Row %d is missing a name.', $line_number);
            continue;
        }

        $sort_order = isset($row['sort_order']) && is_numeric($row['sort_order']) ? (int) $row['sort_order'] : $line_number;
        $group_key = $team_key . '|' . $season;

        if (!isset($result['groups'][$group_key])) {
            $result['groups'][$group_key] = [
                'teamKey' => $team_key,
                'season' => $season,
                'players' => [],
                'staff' => [],
            ];
        }

        if ($row_type === 'athlete') {
            $result['groups'][$group_key]['players'][] = [
                'name' => $name,
                'number' => sanitize_text_field((string) ($row['number'] ?? '')),
                'position' => sanitize_text_field((string) ($row['position'] ?? '')),
                'grade' => sanitize_text_field((string) ($row['grade'] ?? '')),
                '_sort' => $sort_order,
                '_line' => $line_number,
            ];
        } else {
            $result['groups'][$group_key]['staff'][] = [
                'name' => $name,
                'role' => sanitize_text_field((string) ($row['role'] ?? '')),
                '_sort' => $sort_order,
                '_line' => $line_number,
            ];
        }

        $result['rows']++;
    }

    foreach ($result['groups'] as &$group) {
        foreach (['players', 'staff'] as $collection) {
            usort($group[$collection], static function (array $left, array $right): int {
                return ($left['_sort'] <=> $right['_sort']) ?: ($left['_line'] <=> $right['_line']);
            });
            $group[$collection] = array_map(static function (array $row): array {
                unset($row['_sort'], $row['_line']);
                return $row;
            }, $group[$collection]);
        }
    }
    unset($group);

    if ($result['rows'] === 0 && $result['errors'] === []) {
        $result['errors'][] = 'The roster CSV does not contain any data rows.';
    }

    return $result;
}

function wwh_import_sports_roster_groups(array $groups): array
{
    $result = ['created' => 0, 'updated' => 0, 'errors' => []];

    foreach ($groups as $group) {
        $team_key = wwh_sanitize_sport_key((string) ($group['teamKey'] ?? ''));
        $season = wwh_sanitize_roster_season((string) ($group['season'] ?? ''));

        if ($team_key === '' || $season === '') {
            $result['errors'][] = 'Skipped an invalid roster group.';
            continue;
        }

        $post_id = wwh_find_sports_roster($team_key, $season);
        $post_data = [
            'post_type' => WWH_SPORTS_ROSTER_POST_TYPE,
            'post_status' => 'publish',
            'post_title' => wwh_roster_title($team_key, $season),
        ];

        if ($post_id > 0) {
            $post_data['ID'] = $post_id;
            $saved_id = wp_update_post($post_data, true);
        } else {
            $saved_id = wp_insert_post($post_data, true);
        }

        if (is_wp_error($saved_id)) {
            $result['errors'][] = sprintf('%s %s: %s', $team_key, $season, $saved_id->get_error_message());
            continue;
        }

        $saved_id = absint($saved_id);
        update_post_meta($saved_id, WWH_ROSTER_TEAM_META, $team_key);
        update_post_meta($saved_id, WWH_ROSTER_SEASON_META, $season);
        update_post_meta($saved_id, WWH_ROSTER_PLAYERS_META, wwh_sanitize_roster_players($group['players'] ?? []));
        update_post_meta($saved_id, WWH_ROSTER_STAFF_META, wwh_sanitize_roster_staff($group['staff'] ?? []));

        if ($post_id > 0) {
            $result['updated']++;
        } else {
            $result['created']++;
        }
    }

    if ($result['created'] > 0 || $result['updated'] > 0) {
        wwh_schedule_cloudflare_deploy();
    }

    return $result;
}

function wwh_roster_import_raw_data(): string
{
    $raw_data = isset($_POST['wwh_roster_csv_data']) ? (string) wp_unslash($_POST['wwh_roster_csv_data']) : '';

    if (trim($raw_data) === '' && isset($_FILES['wwh_roster_csv_file']['tmp_name'], $_FILES['wwh_roster_csv_file']['error']) && $_FILES['wwh_roster_csv_file']['error'] === UPLOAD_ERR_OK) {
        $uploaded = file_get_contents((string) $_FILES['wwh_roster_csv_file']['tmp_name']);
        $raw_data = is_string($uploaded) ? $uploaded : '';
    }

    return $raw_data;
}

function wwh_render_sports_roster_import_page(): void
{
    if (!current_user_can('edit_posts')) {
        wp_die(esc_html__('Sorry, you are not allowed to import team rosters.', 'weekly-wildcat-headless'));
    }

    $raw_data = '';
    $parsed = null;
    $import_result = null;

    if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['wwh_roster_import_action'])) {
        check_admin_referer('wwh_import_sports_rosters', 'wwh_roster_import_nonce');
        $raw_data = wwh_roster_import_raw_data();
        $parsed = wwh_parse_sports_roster_csv($raw_data);
        $action = sanitize_text_field(wp_unslash((string) $_POST['wwh_roster_import_action']));

        if ($action === 'commit') {
            if (!isset($_POST['wwh_roster_confirm'])) {
                $parsed['errors'][] = 'Confirm that included rosters should be replaced.';
            } elseif ($parsed['errors'] === []) {
                $import_result = wwh_import_sports_roster_groups($parsed['groups']);
                $raw_data = '';
                $parsed = null;
            }
        }
    }

    $export_url = wp_nonce_url(
        admin_url('admin-post.php?action=wwh_export_sports_rosters'),
        'wwh_export_sports_rosters',
        'wwh_roster_export_nonce'
    );
    ?>
    <div class="wrap wwh-roster-import-page">
        <h1>Roster Import / Export</h1>
        <p>Preview a CSV before replacing the ordered athletes and staff for every included team and school year.</p>

        <?php if (is_array($import_result)) : ?>
            <div class="notice <?php echo $import_result['errors'] === [] ? 'notice-success' : 'notice-warning'; ?> is-dismissible">
                <p><strong><?php echo esc_html(sprintf('Created %d rosters and updated %d rosters.', $import_result['created'], $import_result['updated'])); ?></strong></p>
                <?php if ($import_result['errors'] !== []) : ?><ul><?php foreach ($import_result['errors'] as $error) : ?><li><?php echo esc_html($error); ?></li><?php endforeach; ?></ul><?php endif; ?>
            </div>
        <?php endif; ?>

        <?php if (is_array($parsed)) : ?>
            <div class="notice <?php echo $parsed['errors'] === [] ? 'notice-info' : 'notice-warning'; ?>">
                <p><strong><?php echo esc_html(sprintf('Preview: %d valid rows across %d rosters.', $parsed['rows'], count($parsed['groups']))); ?></strong></p>
                <?php if ($parsed['errors'] !== []) : ?><ul><?php foreach ($parsed['errors'] as $error) : ?><li><?php echo esc_html($error); ?></li><?php endforeach; ?></ul><?php endif; ?>
            </div>
            <?php if ($parsed['errors'] === []) : ?>
                <table class="widefat striped wwh-roster-import-preview">
                    <thead><tr><th>Team</th><th>Season</th><th>Athletes</th><th>Staff</th></tr></thead>
                    <tbody><?php foreach ($parsed['groups'] as $group) : ?>
                        <tr>
                            <td><?php echo esc_html((string) (wwh_sports_team_options()[$group['teamKey']]['label'] ?? $group['teamKey'])); ?></td>
                            <td><?php echo esc_html($group['season']); ?></td>
                            <td><?php echo esc_html((string) count($group['players'])); ?></td>
                            <td><?php echo esc_html((string) count($group['staff'])); ?></td>
                        </tr>
                    <?php endforeach; ?></tbody>
                </table>
                <form method="post" class="wwh-roster-import-confirm">
                    <?php wp_nonce_field('wwh_import_sports_rosters', 'wwh_roster_import_nonce'); ?>
                    <input type="hidden" name="wwh_roster_import_action" value="commit">
                    <textarea name="wwh_roster_csv_data" hidden><?php echo esc_textarea($raw_data); ?></textarea>
                    <label><input type="checkbox" name="wwh_roster_confirm" value="1" required> Replace the complete roster contents for the team-years listed above.</label>
                    <?php submit_button('Import and Replace Rosters', 'primary', 'submit', false); ?>
                </form>
            <?php endif; ?>
        <?php endif; ?>

        <form method="post" enctype="multipart/form-data">
            <?php wp_nonce_field('wwh_import_sports_rosters', 'wwh_roster_import_nonce'); ?>
            <input type="hidden" name="wwh_roster_import_action" value="preview">
            <table class="form-table" role="presentation">
                <tr><th scope="row"><label for="wwh_roster_csv_file">Upload CSV or TSV</label></th><td><input type="file" id="wwh_roster_csv_file" name="wwh_roster_csv_file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"></td></tr>
                <tr><th scope="row"><label for="wwh_roster_csv_data">Paste Data</label></th><td><textarea id="wwh_roster_csv_data" name="wwh_roster_csv_data" rows="12" class="large-text code" placeholder="team_key,season,row_type,name,number,position,grade,role,sort_order"><?php echo esc_textarea($raw_data); ?></textarea></td></tr>
            </table>
            <p class="description">Columns: <code><?php echo esc_html(implode(',', wwh_roster_csv_columns())); ?></code>. Row type must be <code>athlete</code> or <code>staff</code>.</p>
            <?php submit_button('Preview Roster Import'); ?>
        </form>

        <hr>
        <h2>Export Published Rosters</h2>
        <p><a class="button" href="<?php echo esc_url($export_url); ?>">Download All Rosters CSV</a></p>
    </div>
    <?php
}

function wwh_export_sports_rosters(): void
{
    if (!current_user_can('edit_posts')) {
        wp_die(esc_html__('Sorry, you are not allowed to export team rosters.', 'weekly-wildcat-headless'));
    }

    check_admin_referer('wwh_export_sports_rosters', 'wwh_roster_export_nonce');
    nocache_headers();
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="weekly-wildcat-rosters-' . wp_date('Y-m-d') . '.csv"');
    $output = fopen('php://output', 'w');

    if (!$output) {
        exit;
    }

    fputcsv($output, wwh_roster_csv_columns(), ',', '"', '');
    $query = new WP_Query([
        'post_type' => WWH_SPORTS_ROSTER_POST_TYPE,
        'post_status' => 'publish',
        'posts_per_page' => -1,
        'orderby' => 'title',
        'order' => 'ASC',
        'no_found_rows' => true,
    ]);

    foreach ($query->posts as $post) {
        $team_key = wwh_meta_value($post->ID, WWH_ROSTER_TEAM_META);
        $season = wwh_meta_value($post->ID, WWH_ROSTER_SEASON_META);

        foreach (wwh_roster_rows($post->ID, WWH_ROSTER_PLAYERS_META) as $index => $player) {
            fputcsv($output, [$team_key, $season, 'athlete', $player['name'], $player['number'], $player['position'], $player['grade'], '', $index + 1], ',', '"', '');
        }

        foreach (wwh_roster_rows($post->ID, WWH_ROSTER_STAFF_META) as $index => $member) {
            fputcsv($output, [$team_key, $season, 'staff', $member['name'], '', '', '', $member['role'], $index + 1], ',', '"', '');
        }
    }

    wp_reset_postdata();
    fclose($output);
    exit;
}
