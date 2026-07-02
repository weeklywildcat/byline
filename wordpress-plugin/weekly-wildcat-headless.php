<?php
/**
 * Plugin Name: Weekly Wildcat Headless
 * Description: Headless CMS extensions for Weekly Wildcat sports schedules, scores, and school events.
 * Version: 0.1.12
 * Author: Weekly Wildcat
 * License: GPL-2.0-or-later
 */

if (!defined('ABSPATH')) {
    exit;
}

const WWH_SPORTS_GAME_POST_TYPE = 'ww_sports_game';
const WWH_SCHOOL_EVENT_POST_TYPE = 'ww_school_event';
const WWH_REST_NAMESPACE = 'weekly-wildcat/v1';

function wwh_author_social_fields(): array
{
    return [
        'website' => 'Website',
        'email' => 'Email',
        'instagram' => 'Instagram',
        'tiktok' => 'TikTok',
        'linkedin' => 'LinkedIn',
        'x' => 'X',
    ];
}

function wwh_image_credit_fields(): array
{
    return [
        'creator' => 'Image Creator',
        'credit_text' => 'Credit Text',
        'copyright_notice' => 'Copyright Notice',
        'license_url' => 'License URL',
        'acquire_license_url' => 'Acquire License URL',
    ];
}

function wwh_string_ends_with(string $value, string $suffix): bool
{
    return $suffix === '' || substr($value, -strlen($suffix)) === $suffix;
}

function wwh_register_update_checker(): void
{
    $update_checker_path = __DIR__ . '/plugin-update-checker/plugin-update-checker.php';

    if (!is_readable($update_checker_path)) {
        return;
    }

    require_once $update_checker_path;

    $update_checker = \YahnisElsts\PluginUpdateChecker\v5\PucFactory::buildUpdateChecker(
        'https://github.com/weeklywildcat/byline-plugin/',
        __FILE__,
        'weekly-wildcat-headless'
    );

    $update_checker->getVcsApi()->enableReleaseAssets(
        '/^weekly-wildcat-headless\.zip$/i',
        \YahnisElsts\PluginUpdateChecker\v5p7\Vcs\Api::REQUIRE_RELEASE_ASSETS
    );
}
wwh_register_update_checker();

function wwh_sports_team_options(): array
{
    return [
        'baseball-varsity' => ['sport' => 'Baseball', 'level' => 'Varsity', 'teamLabel' => 'Baseball', 'label' => 'Baseball - Varsity'],
        'baseball-jv' => ['sport' => 'Baseball', 'level' => 'JV', 'teamLabel' => 'Baseball', 'label' => 'Baseball - JV'],
        'baseball-c-team' => ['sport' => 'Baseball', 'level' => 'C-Team', 'teamLabel' => 'Baseball', 'label' => 'Baseball - C-Team'],
        'boys-basketball-varsity' => ['sport' => 'Boys Basketball', 'level' => 'Varsity', 'teamLabel' => 'Boys', 'label' => 'Boys Basketball - Varsity'],
        'boys-basketball-jv' => ['sport' => 'Boys Basketball', 'level' => 'JV', 'teamLabel' => 'Boys', 'label' => 'Boys Basketball - JV'],
        'boys-soccer' => ['sport' => 'Boys Soccer', 'level' => 'Varsity', 'teamLabel' => 'Boys', 'label' => 'Boys Soccer'],
        'boys-soccer-jv' => ['sport' => 'Boys Soccer', 'level' => 'JV', 'teamLabel' => 'Boys', 'label' => 'Boys Soccer - JV'],
        'cheer-competition' => ['sport' => 'Cheer', 'level' => 'Competition', 'teamLabel' => 'Cheer', 'label' => 'Cheer - Competition'],
        'cheer-sideline' => ['sport' => 'Cheer', 'level' => 'Sideline', 'teamLabel' => 'Cheer', 'label' => 'Cheer - Sideline'],
        'cross-country' => ['sport' => 'Cross Country', 'level' => 'Varsity', 'teamLabel' => 'Cross Country', 'label' => 'Cross Country'],
        'football-varsity' => ['sport' => 'Football', 'level' => 'Varsity', 'teamLabel' => 'Football', 'label' => 'Football - Varsity'],
        'football-jv' => ['sport' => 'Football', 'level' => 'JV', 'teamLabel' => 'Football', 'label' => 'Football - JV'],
        'girls-basketball-varsity' => ['sport' => 'Girls Basketball', 'level' => 'Varsity', 'teamLabel' => 'Girls', 'label' => 'Girls Basketball - Varsity'],
        'girls-basketball-jv' => ['sport' => 'Girls Basketball', 'level' => 'JV', 'teamLabel' => 'Girls', 'label' => 'Girls Basketball - JV'],
        'girls-soccer' => ['sport' => 'Girls Soccer', 'level' => 'Varsity', 'teamLabel' => 'Girls', 'label' => 'Girls Soccer'],
        'girls-soccer-jv' => ['sport' => 'Girls Soccer', 'level' => 'JV', 'teamLabel' => 'Girls', 'label' => 'Girls Soccer - JV'],
        'golf' => ['sport' => 'Golf', 'level' => 'Varsity', 'teamLabel' => 'Golf', 'label' => 'Golf'],
        'softball-jv' => ['sport' => 'Softball', 'level' => 'JV', 'teamLabel' => 'Softball', 'label' => 'Softball - JV'],
        'softball-varsity' => ['sport' => 'Softball', 'level' => 'Varsity', 'teamLabel' => 'Softball', 'label' => 'Softball - Varsity'],
        'track-and-field' => ['sport' => 'Track and Field', 'level' => 'Varsity', 'teamLabel' => 'Track and Field', 'label' => 'Track and Field'],
        'volleyball-varsity' => ['sport' => 'Volleyball', 'level' => 'Varsity', 'teamLabel' => 'Volleyball', 'label' => 'Volleyball - Varsity'],
        'volleyball-jv' => ['sport' => 'Volleyball', 'level' => 'JV', 'teamLabel' => 'Volleyball', 'label' => 'Volleyball - JV'],
        'wrestling' => ['sport' => 'Wrestling', 'level' => 'Varsity', 'teamLabel' => 'Wrestling', 'label' => 'Wrestling'],
    ];
}

function wwh_infer_sport_key(string $sport, string $level): string
{
    $sport = strtolower(trim($sport));
    $level = strtolower(trim($level));

    foreach (wwh_sports_team_options() as $key => $option) {
        if (strtolower($option['sport']) === $sport && strtolower($option['level']) === $level) {
            return $key;
        }
    }

    foreach (wwh_sports_team_options() as $key => $option) {
        if (strtolower($option['sport']) === $sport) {
            return $key;
        }
    }

    return '';
}

function wwh_register_post_types(): void
{
    register_post_type(
        WWH_SPORTS_GAME_POST_TYPE,
        [
            'labels' => [
                'name' => 'Sports Games',
                'singular_name' => 'Sports Game',
                'add_new_item' => 'Add New Sports Game',
                'edit_item' => 'Edit Sports Game',
                'new_item' => 'New Sports Game',
                'view_item' => 'View Sports Game',
                'search_items' => 'Search Sports Games',
                'not_found' => 'No sports games found',
                'menu_name' => 'Sports Games',
            ],
            'public' => false,
            'show_ui' => true,
            'show_in_menu' => true,
            'show_in_rest' => false,
            'menu_icon' => 'dashicons-awards',
            'supports' => ['title'],
            'capability_type' => 'post',
        ]
    );

    register_post_type(
        WWH_SCHOOL_EVENT_POST_TYPE,
        [
            'labels' => [
                'name' => 'School Events',
                'singular_name' => 'School Event',
                'add_new_item' => 'Add New School Event',
                'edit_item' => 'Edit School Event',
                'new_item' => 'New School Event',
                'view_item' => 'View School Event',
                'search_items' => 'Search School Events',
                'not_found' => 'No school events found',
                'menu_name' => 'School Events',
            ],
            'public' => false,
            'show_ui' => true,
            'show_in_menu' => true,
            'show_in_rest' => false,
            'menu_icon' => 'dashicons-calendar-alt',
            'supports' => ['title'],
            'capability_type' => 'post',
        ]
    );
}
add_action('init', 'wwh_register_post_types');

function wwh_register_post_meta(): void
{
    $sports_keys = [
        '_ww_sport_key',
        '_ww_sport',
        '_ww_level',
        '_ww_team_label',
        '_ww_opponent',
        '_ww_site',
        '_ww_location',
        '_ww_location_name',
        '_ww_location_address',
        '_ww_location_latitude',
        '_ww_location_longitude',
        '_ww_location_apple_maps_id',
        '_ww_start_datetime',
        '_ww_game_status',
        '_ww_wildcats_score',
        '_ww_opponent_score',
        '_ww_recap_url',
        '_ww_notes',
        '_ww_import_key',
        '_ww_import_season',
        '_ww_import_date',
        '_ww_import_time',
        '_ww_import_game_type',
    ];

    foreach ($sports_keys as $key) {
        register_post_meta(
            WWH_SPORTS_GAME_POST_TYPE,
            $key,
            [
                'single' => true,
                'type' => 'string',
                'show_in_rest' => false,
                'auth_callback' => static fn() => current_user_can('edit_posts'),
            ]
        );
    }

    $event_keys = [
        '_ww_event_type',
        '_ww_event_start_datetime',
        '_ww_event_end_datetime',
        '_ww_event_all_day',
        '_ww_event_location',
        '_ww_event_description',
        '_ww_event_external_url',
        '_ww_event_status',
    ];

    foreach ($event_keys as $key) {
        register_post_meta(
            WWH_SCHOOL_EVENT_POST_TYPE,
            $key,
            [
                'single' => true,
                'type' => 'string',
                'show_in_rest' => false,
                'auth_callback' => static fn() => current_user_can('edit_posts'),
            ]
        );
    }
}
add_action('init', 'wwh_register_post_meta');

function wwh_register_admin_pages(): void
{
    add_submenu_page(
        'edit.php?post_type=' . WWH_SPORTS_GAME_POST_TYPE,
        'Import Sports Games',
        'Import Games',
        'edit_posts',
        'wwh-sports-import',
        'wwh_render_sports_import_page'
    );

    add_submenu_page(
        'edit.php?post_type=' . WWH_SPORTS_GAME_POST_TYPE,
        'Export Sports Games',
        'Export Games',
        'edit_posts',
        'wwh-sports-export',
        'wwh_render_sports_export_page'
    );
}
add_action('admin_menu', 'wwh_register_admin_pages');
add_action('admin_post_wwh_export_sports_games', 'wwh_export_sports_games');

function wwh_sports_game_admin_columns(array $columns): array
{
    return [
        'cb' => $columns['cb'] ?? '<input type="checkbox">',
        'title' => 'Game',
        'wwh_sport' => 'Sport / Team',
        'wwh_opponent' => 'Opponent',
        'wwh_start' => 'Date / Time',
        'wwh_site' => 'Site',
        'wwh_status' => 'Status',
        'wwh_score' => 'Score',
    ];
}
add_filter('manage_' . WWH_SPORTS_GAME_POST_TYPE . '_posts_columns', 'wwh_sports_game_admin_columns');

function wwh_school_event_admin_columns(array $columns): array
{
    return [
        'cb' => $columns['cb'] ?? '<input type="checkbox">',
        'title' => 'Event',
        'wwh_event_type' => 'Type',
        'wwh_event_start' => 'Start',
        'wwh_event_end' => 'End',
        'wwh_event_location' => 'Location',
        'wwh_event_status' => 'Status',
    ];
}
add_filter('manage_' . WWH_SCHOOL_EVENT_POST_TYPE . '_posts_columns', 'wwh_school_event_admin_columns');

function wwh_render_admin_column(string $column, int $post_id): void
{
    if (get_post_type($post_id) === WWH_SPORTS_GAME_POST_TYPE) {
        wwh_render_sports_game_admin_column($column, $post_id);
        return;
    }

    if (get_post_type($post_id) === WWH_SCHOOL_EVENT_POST_TYPE) {
        wwh_render_school_event_admin_column($column, $post_id);
    }
}
add_action('manage_' . WWH_SPORTS_GAME_POST_TYPE . '_posts_custom_column', 'wwh_render_admin_column', 10, 2);
add_action('manage_' . WWH_SCHOOL_EVENT_POST_TYPE . '_posts_custom_column', 'wwh_render_admin_column', 10, 2);

function wwh_render_sports_game_admin_column(string $column, int $post_id): void
{
    if ($column === 'wwh_sport') {
        $sport_key = wwh_meta_value($post_id, '_ww_sport_key');
        $sport_option = array_key_exists($sport_key, wwh_sports_team_options()) ? wwh_sports_team_options()[$sport_key] : null;
        echo esc_html($sport_option['label'] ?? wwh_meta_value($post_id, '_ww_sport', '—'));
        return;
    }

    if ($column === 'wwh_opponent') {
        echo esc_html(wwh_meta_value($post_id, '_ww_opponent', '—'));
        return;
    }

    if ($column === 'wwh_start') {
        echo esc_html(wwh_admin_datetime_label(wwh_meta_value($post_id, '_ww_start_datetime')));
        return;
    }

    if ($column === 'wwh_site') {
        echo esc_html(wwh_label_from_value(wwh_meta_value($post_id, '_ww_site', 'home')));
        return;
    }

    if ($column === 'wwh_status') {
        echo esc_html(wwh_label_from_value(wwh_effective_game_status(wwh_meta_value($post_id, '_ww_game_status', 'upcoming'), wwh_meta_value($post_id, '_ww_start_datetime'))));
        return;
    }

    if ($column === 'wwh_score') {
        $wildcats_score = wwh_meta_value($post_id, '_ww_wildcats_score');
        $opponent_score = wwh_meta_value($post_id, '_ww_opponent_score');
        echo esc_html($wildcats_score !== '' && $opponent_score !== '' ? sprintf('%s-%s', $wildcats_score, $opponent_score) : '—');
    }
}

function wwh_render_school_event_admin_column(string $column, int $post_id): void
{
    if ($column === 'wwh_event_type') {
        echo esc_html(wwh_meta_value($post_id, '_ww_event_type', '—'));
        return;
    }

    if ($column === 'wwh_event_start') {
        echo esc_html(wwh_admin_datetime_label(wwh_meta_value($post_id, '_ww_event_start_datetime')));
        return;
    }

    if ($column === 'wwh_event_end') {
        echo esc_html(wwh_admin_datetime_label(wwh_meta_value($post_id, '_ww_event_end_datetime')));
        return;
    }

    if ($column === 'wwh_event_location') {
        echo esc_html(wwh_meta_value($post_id, '_ww_event_location', '—'));
        return;
    }

    if ($column === 'wwh_event_status') {
        echo esc_html(wwh_label_from_value(wwh_meta_value($post_id, '_ww_event_status', 'scheduled')));
    }
}

function wwh_admin_datetime_label(string $value): string
{
    return $value !== '' ? wwh_format_date_text($value) : 'Unknown';
}

function wwh_sortable_admin_columns(array $columns): array
{
    $screen = get_current_screen();

    if ($screen && $screen->post_type === WWH_SPORTS_GAME_POST_TYPE) {
        $columns['wwh_sport'] = 'wwh_sport';
        $columns['wwh_opponent'] = 'wwh_opponent';
        $columns['wwh_start'] = 'wwh_start';
        $columns['wwh_status'] = 'wwh_status';
    }

    if ($screen && $screen->post_type === WWH_SCHOOL_EVENT_POST_TYPE) {
        $columns['wwh_event_type'] = 'wwh_event_type';
        $columns['wwh_event_start'] = 'wwh_event_start';
        $columns['wwh_event_status'] = 'wwh_event_status';
    }

    return $columns;
}
add_filter('manage_edit-' . WWH_SPORTS_GAME_POST_TYPE . '_sortable_columns', 'wwh_sortable_admin_columns');
add_filter('manage_edit-' . WWH_SCHOOL_EVENT_POST_TYPE . '_sortable_columns', 'wwh_sortable_admin_columns');

function wwh_admin_filter_value(string $key): string
{
    if (!isset($_GET[$key])) {
        return '';
    }

    return sanitize_text_field(wp_unslash($_GET[$key]));
}

function wwh_render_admin_filters(string $post_type): void
{
    if ($post_type === WWH_SPORTS_GAME_POST_TYPE) {
        wwh_render_sports_game_admin_filters();
        return;
    }

    if ($post_type === WWH_SCHOOL_EVENT_POST_TYPE) {
        wwh_render_school_event_admin_filters();
    }
}
add_action('restrict_manage_posts', 'wwh_render_admin_filters');

function wwh_render_sports_game_admin_filters(): void
{
    $sport_key = wwh_sanitize_sport_key(wwh_admin_filter_value('wwh_sport_key'));
    $status = wwh_sanitize_choice(wwh_admin_filter_value('wwh_game_status'), ['upcoming', 'final', 'postponed', 'canceled'], '');
    $site = wwh_sanitize_choice(wwh_admin_filter_value('wwh_site'), ['home', 'away', 'neutral'], '');
    $date_state = wwh_sanitize_choice(wwh_admin_filter_value('wwh_date_state'), ['known', 'unknown'], '');

    echo '<select name="wwh_sport_key">';
    echo '<option value="">All sports / teams</option>';
    foreach (wwh_sports_team_options() as $key => $option) {
        printf(
            '<option value="%s"%s>%s</option>',
            esc_attr($key),
            selected($sport_key, $key, false),
            esc_html($option['label'])
        );
    }
    echo '</select>';

    wwh_admin_filter_select('wwh_game_status', $status, 'All statuses', [
        'upcoming' => 'Upcoming',
        'final' => 'Final',
        'postponed' => 'Postponed',
        'canceled' => 'Canceled',
    ]);

    wwh_admin_filter_select('wwh_site', $site, 'All sites', [
        'home' => 'Home',
        'away' => 'Away',
        'neutral' => 'Neutral',
    ]);

    wwh_admin_filter_select('wwh_date_state', $date_state, 'Any date/time', [
        'known' => 'Known date/time',
        'unknown' => 'Unknown date/time',
    ]);
}

function wwh_render_school_event_admin_filters(): void
{
    $status = wwh_sanitize_choice(wwh_admin_filter_value('wwh_event_status'), ['scheduled', 'canceled'], '');
    $event_type = wwh_admin_filter_value('wwh_event_type');
    $date_state = wwh_sanitize_choice(wwh_admin_filter_value('wwh_event_date_state'), ['known', 'unknown'], '');
    $event_type_options = [];

    foreach (wwh_distinct_meta_values(WWH_SCHOOL_EVENT_POST_TYPE, '_ww_event_type') as $value) {
        $event_type_options[$value] = $value;
    }

    wwh_admin_filter_select('wwh_event_status', $status, 'All statuses', [
        'scheduled' => 'Scheduled',
        'canceled' => 'Canceled',
    ]);
    wwh_admin_filter_select('wwh_event_type', $event_type, 'All event types', $event_type_options);
    wwh_admin_filter_select('wwh_event_date_state', $date_state, 'Any date/time', [
        'known' => 'Known date/time',
        'unknown' => 'Unknown date/time',
    ]);
}

function wwh_admin_filter_select(string $name, string $value, string $all_label, array $options): void
{
    printf('<select name="%s">', esc_attr($name));
    printf('<option value="">%s</option>', esc_html($all_label));

    foreach ($options as $option_value => $option_label) {
        printf(
            '<option value="%s"%s>%s</option>',
            esc_attr((string) $option_value),
            selected($value, (string) $option_value, false),
            esc_html((string) $option_label)
        );
    }

    echo '</select>';
}

function wwh_distinct_meta_values(string $post_type, string $meta_key): array
{
    global $wpdb;

    $values = $wpdb->get_col(
        $wpdb->prepare(
            "SELECT DISTINCT pm.meta_value
            FROM {$wpdb->postmeta} pm
            INNER JOIN {$wpdb->posts} p ON p.ID = pm.post_id
            WHERE p.post_type = %s
                AND pm.meta_key = %s
                AND pm.meta_value != ''
            ORDER BY pm.meta_value ASC",
            $post_type,
            $meta_key
        )
    );

    return array_values(array_filter(array_map('sanitize_text_field', $values ?: [])));
}

function wwh_filter_admin_posts(WP_Query $query): void
{
    global $pagenow;

    if (!is_admin() || $pagenow !== 'edit.php' || !$query->is_main_query()) {
        return;
    }

    $post_type = $query->get('post_type');

    if ($post_type === WWH_SPORTS_GAME_POST_TYPE) {
        wwh_filter_sports_game_admin_posts($query);
        return;
    }

    if ($post_type === WWH_SCHOOL_EVENT_POST_TYPE) {
        wwh_filter_school_event_admin_posts($query);
    }
}
add_action('pre_get_posts', 'wwh_filter_admin_posts');

function wwh_filter_sports_game_admin_posts(WP_Query $query): void
{
    $meta_query = wwh_admin_meta_query($query);
    $sport_key = wwh_sanitize_sport_key(wwh_admin_filter_value('wwh_sport_key'));
    $status = wwh_sanitize_choice(wwh_admin_filter_value('wwh_game_status'), ['upcoming', 'final', 'postponed', 'canceled'], '');
    $site = wwh_sanitize_choice(wwh_admin_filter_value('wwh_site'), ['home', 'away', 'neutral'], '');
    $date_state = wwh_sanitize_choice(wwh_admin_filter_value('wwh_date_state'), ['known', 'unknown'], '');

    if ($sport_key !== '') {
        $meta_query[] = ['key' => '_ww_sport_key', 'value' => $sport_key];
    }

    if ($status !== '') {
        $meta_query[] = ['key' => '_ww_game_status', 'value' => $status];
    }

    if ($site !== '') {
        $meta_query[] = ['key' => '_ww_site', 'value' => $site];
    }

    wwh_add_date_state_meta_query($meta_query, '_ww_start_datetime', $date_state);
    wwh_apply_admin_meta_query($query, $meta_query);

    $orderby = (string) $query->get('orderby');

    if ($orderby === 'wwh_sport') {
        wwh_set_admin_meta_sort($query, '_ww_sport', 'meta_value');
    } elseif ($orderby === 'wwh_opponent') {
        wwh_set_admin_meta_sort($query, '_ww_opponent', 'meta_value');
    } elseif ($orderby === 'wwh_start') {
        wwh_set_admin_meta_sort($query, '_ww_start_datetime', 'meta_value');
    } elseif ($orderby === 'wwh_status') {
        wwh_set_admin_meta_sort($query, '_ww_game_status', 'meta_value');
    }
}

function wwh_filter_school_event_admin_posts(WP_Query $query): void
{
    $meta_query = wwh_admin_meta_query($query);
    $status = wwh_sanitize_choice(wwh_admin_filter_value('wwh_event_status'), ['scheduled', 'canceled'], '');
    $event_type = wwh_admin_filter_value('wwh_event_type');
    $date_state = wwh_sanitize_choice(wwh_admin_filter_value('wwh_event_date_state'), ['known', 'unknown'], '');

    if ($status !== '') {
        $meta_query[] = ['key' => '_ww_event_status', 'value' => $status];
    }

    if ($event_type !== '') {
        $meta_query[] = ['key' => '_ww_event_type', 'value' => $event_type];
    }

    wwh_add_date_state_meta_query($meta_query, '_ww_event_start_datetime', $date_state);
    wwh_apply_admin_meta_query($query, $meta_query);

    $orderby = (string) $query->get('orderby');

    if ($orderby === 'wwh_event_type') {
        wwh_set_admin_meta_sort($query, '_ww_event_type', 'meta_value');
    } elseif ($orderby === 'wwh_event_start') {
        wwh_set_admin_meta_sort($query, '_ww_event_start_datetime', 'meta_value');
    } elseif ($orderby === 'wwh_event_status') {
        wwh_set_admin_meta_sort($query, '_ww_event_status', 'meta_value');
    }
}

function wwh_admin_meta_query(WP_Query $query): array
{
    $meta_query = $query->get('meta_query');

    return is_array($meta_query) ? $meta_query : [];
}

function wwh_apply_admin_meta_query(WP_Query $query, array $meta_query): void
{
    if ($meta_query !== []) {
        $query->set('meta_query', $meta_query);
    }
}

function wwh_add_date_state_meta_query(array &$meta_query, string $meta_key, string $date_state): void
{
    if ($date_state === 'known') {
        $meta_query[] = [
            'key' => $meta_key,
            'value' => '',
            'compare' => '!=',
        ];
        return;
    }

    if ($date_state === 'unknown') {
        $meta_query[] = [
            'relation' => 'OR',
            [
                'key' => $meta_key,
                'compare' => 'NOT EXISTS',
            ],
            [
                'key' => $meta_key,
                'value' => '',
                'compare' => '=',
            ],
        ];
    }
}

function wwh_set_admin_meta_sort(WP_Query $query, string $meta_key, string $orderby): void
{
    $query->set('meta_key', $meta_key);
    $query->set('orderby', $orderby);
}

function wwh_register_attachment_meta(): void
{
    foreach (array_keys(wwh_image_credit_fields()) as $key) {
        register_post_meta(
            'attachment',
            '_ww_image_' . $key,
            [
                'single' => true,
                'type' => 'string',
                'show_in_rest' => false,
                'auth_callback' => static fn() => current_user_can('upload_files'),
            ]
        );
    }
}
add_action('init', 'wwh_register_attachment_meta');

function wwh_add_meta_boxes(): void
{
    add_meta_box(
        'wwh_sports_game_details',
        'Game Details',
        'wwh_render_sports_game_meta_box',
        WWH_SPORTS_GAME_POST_TYPE,
        'normal',
        'high'
    );

    add_meta_box(
        'wwh_school_event_details',
        'Event Details',
        'wwh_render_school_event_meta_box',
        WWH_SCHOOL_EVENT_POST_TYPE,
        'normal',
        'high'
    );
}
add_action('add_meta_boxes', 'wwh_add_meta_boxes');

function wwh_meta_value(int $post_id, string $key, string $default = ''): string
{
    $value = get_post_meta($post_id, $key, true);

    return is_string($value) && $value !== '' ? $value : $default;
}

function wwh_field(string $label, string $name, string $value, string $type = 'text', array $attributes = []): void
{
    $attribute_html = '';

    foreach ($attributes as $key => $attribute_value) {
        $attribute_html .= sprintf(' %s="%s"', esc_attr($key), esc_attr((string) $attribute_value));
    }

    printf(
        '<p class="wwh-field"><label><span>%s</span><input type="%s" name="%s" value="%s"%s></label></p>',
        esc_html($label),
        esc_attr($type),
        esc_attr($name),
        esc_attr($value),
        $attribute_html
    );
}

function wwh_textarea(string $label, string $name, string $value): void
{
    printf(
        '<p class="wwh-field"><label><span>%s</span><textarea name="%s" rows="4">%s</textarea></label></p>',
        esc_html($label),
        esc_attr($name),
        esc_textarea($value)
    );
}

function wwh_select(string $label, string $name, string $value, array $options): void
{
    printf('<p class="wwh-field"><label><span>%s</span><select name="%s">', esc_html($label), esc_attr($name));

    foreach ($options as $option_value => $option_label) {
        printf(
            '<option value="%s"%s>%s</option>',
            esc_attr((string) $option_value),
            selected($value, (string) $option_value, false),
            esc_html((string) $option_label)
        );
    }

    echo '</select></label></p>';
}

function wwh_render_sports_game_meta_box(WP_Post $post): void
{
    wp_nonce_field('wwh_save_sports_game', 'wwh_sports_game_nonce');
    $sport_key = wwh_meta_value($post->ID, '_ww_sport_key');
    $sport_key = $sport_key !== '' ? $sport_key : wwh_infer_sport_key(wwh_meta_value($post->ID, '_ww_sport'), wwh_meta_value($post->ID, '_ww_level'));
    $sport_key = $sport_key !== '' ? $sport_key : wwh_infer_sport_key(wwh_meta_value($post->ID, '_ww_sport'), wwh_meta_value($post->ID, '_ww_level'));
    $team_options = ['' => 'Select a sport / team'];

    foreach (wwh_sports_team_options() as $key => $option) {
        $team_options[$key] = $option['label'];
    }

    echo '<div class="wwh-fields">';
    wwh_select('Sport / Team', 'ww_sport_key', $sport_key, $team_options);
    wwh_field('Opponent', 'ww_opponent', wwh_meta_value($post->ID, '_ww_opponent'));
    wwh_select('Home / Away / Neutral', 'ww_site', wwh_meta_value($post->ID, '_ww_site', 'home'), [
        'home' => 'Home',
        'away' => 'Away',
        'neutral' => 'Neutral',
    ]);
    wwh_field('Location Name', 'ww_location_name', wwh_meta_value($post->ID, '_ww_location_name', wwh_meta_value($post->ID, '_ww_location')));
    wwh_field('Location Address', 'ww_location_address', wwh_meta_value($post->ID, '_ww_location_address'), 'text', ['placeholder' => '640 South Cambridge Street, Ninety Six, SC']);
    wwh_field('Latitude', 'ww_location_latitude', wwh_meta_value($post->ID, '_ww_location_latitude'), 'text', ['inputmode' => 'decimal', 'placeholder' => '34.1750']);
    wwh_field('Longitude', 'ww_location_longitude', wwh_meta_value($post->ID, '_ww_location_longitude'), 'text', ['inputmode' => 'decimal', 'placeholder' => '-82.0240']);
    wwh_field('Apple Maps Place ID', 'ww_location_apple_maps_id', wwh_meta_value($post->ID, '_ww_location_apple_maps_id'));
    wwh_field('Start Date / Time', 'ww_start_datetime', wwh_meta_value($post->ID, '_ww_start_datetime'), 'datetime-local');
    wwh_select('Status', 'ww_game_status', wwh_meta_value($post->ID, '_ww_game_status', 'upcoming'), [
        'upcoming' => 'Upcoming',
        'final' => 'Final',
        'postponed' => 'Postponed',
        'canceled' => 'Canceled',
    ]);
    wwh_field('Wildcats Score', 'ww_wildcats_score', wwh_meta_value($post->ID, '_ww_wildcats_score'), 'number', ['min' => '0']);
    wwh_field('Opponent Score', 'ww_opponent_score', wwh_meta_value($post->ID, '_ww_opponent_score'), 'number', ['min' => '0']);
    wwh_field('Recap URL', 'ww_recap_url', wwh_meta_value($post->ID, '_ww_recap_url'), 'url');
    wwh_textarea('Notes', 'ww_notes', wwh_meta_value($post->ID, '_ww_notes'));
    echo '</div>';
}

function wwh_render_school_event_meta_box(WP_Post $post): void
{
    wp_nonce_field('wwh_save_school_event', 'wwh_school_event_nonce');

    echo '<div class="wwh-fields">';
    wwh_field('Event Type', 'ww_event_type', wwh_meta_value($post->ID, '_ww_event_type'), 'text', ['placeholder' => 'Academic']);
    wwh_field('Start Date / Time', 'ww_event_start_datetime', wwh_meta_value($post->ID, '_ww_event_start_datetime'), 'datetime-local');
    wwh_field('End Date / Time', 'ww_event_end_datetime', wwh_meta_value($post->ID, '_ww_event_end_datetime'), 'datetime-local');
    printf(
        '<p class="wwh-field wwh-checkbox"><label><input type="checkbox" name="ww_event_all_day" value="1"%s> <span>All-day event</span></label></p>',
        checked(wwh_meta_value($post->ID, '_ww_event_all_day'), '1', false)
    );
    wwh_field('Location', 'ww_event_location', wwh_meta_value($post->ID, '_ww_event_location'));
    wwh_textarea('Description', 'ww_event_description', wwh_meta_value($post->ID, '_ww_event_description'));
    wwh_field('External URL', 'ww_event_external_url', wwh_meta_value($post->ID, '_ww_event_external_url'), 'url');
    wwh_select('Status', 'ww_event_status', wwh_meta_value($post->ID, '_ww_event_status', 'scheduled'), [
        'scheduled' => 'Scheduled',
        'canceled' => 'Canceled',
    ]);
    echo '</div>';
}

function wwh_can_save_post(int $post_id, string $nonce_name, string $nonce_action): bool
{
    if (!isset($_POST[$nonce_name]) || !wp_verify_nonce(sanitize_text_field(wp_unslash($_POST[$nonce_name])), $nonce_action)) {
        return false;
    }

    if (defined('DOING_AUTOSAVE') && DOING_AUTOSAVE) {
        return false;
    }

    return current_user_can('edit_post', $post_id);
}

function wwh_request_value(string $key): string
{
    if (!isset($_POST[$key])) {
        return '';
    }

    return sanitize_text_field(wp_unslash($_POST[$key]));
}

function wwh_request_textarea(string $key): string
{
    if (!isset($_POST[$key])) {
        return '';
    }

    return sanitize_textarea_field(wp_unslash($_POST[$key]));
}

function wwh_sanitize_choice(string $value, array $allowed, string $default): string
{
    return in_array($value, $allowed, true) ? $value : $default;
}

function wwh_sanitize_datetime(string $value): string
{
    $value = str_replace(' ', 'T', sanitize_text_field($value));

    if (preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/', $value) === 1) {
        return $value;
    }

    return '';
}

function wwh_sanitize_sport_key(string $value): string
{
    return array_key_exists($value, wwh_sports_team_options()) ? $value : '';
}

function wwh_sanitize_coordinate(string $value, float $min, float $max): string
{
    $value = trim(sanitize_text_field($value));

    if ($value === '' || !is_numeric($value)) {
        return '';
    }

    $coordinate = (float) $value;

    if ($coordinate < $min || $coordinate > $max) {
        return '';
    }

    return rtrim(rtrim(sprintf('%.7F', $coordinate), '0'), '.');
}

function wwh_update_meta(int $post_id, string $key, string $value): void
{
    if ($value === '') {
        delete_post_meta($post_id, $key);
        return;
    }

    update_post_meta($post_id, $key, $value);
}

function wwh_image_meta_value(int $attachment_id, string $key): string
{
    $value = get_post_meta($attachment_id, '_ww_image_' . $key, true);

    return is_string($value) ? $value : '';
}

function wwh_attachment_fields_to_edit(array $form_fields, WP_Post $post): array
{
    foreach (wwh_image_credit_fields() as $key => $label) {
        $is_url = wwh_string_ends_with($key, '_url');
        $help = '';

        if ($key === 'credit_text') {
            $help = 'Example: Gibson Bell for Weekly Wildcat. This appears over the image on the public site.';
        } elseif (in_array($key, ['copyright_notice', 'license_url', 'acquire_license_url'], true)) {
            $help = 'Leave blank to use the sitewide Weekly Wildcat image license default.';
        }

        $form_fields['ww_image_' . $key] = [
            'label' => $label,
            'input' => 'html',
            'html' => sprintf(
                '<input type="%s" class="text" name="attachments[%d][ww_image_%s]" value="%s">%s',
                $is_url ? 'url' : 'text',
                $post->ID,
                esc_attr($key),
                esc_attr(wwh_image_meta_value($post->ID, $key)),
                $help !== '' ? sprintf('<p class="help">%s</p>', esc_html($help)) : ''
            ),
            'helps' => $key === 'creator' ? 'Usually the photographer or organization that created the image.' : '',
        ];
    }

    return $form_fields;
}
add_filter('attachment_fields_to_edit', 'wwh_attachment_fields_to_edit', 10, 2);

function wwh_attachment_fields_to_save(array $post, array $attachment): array
{
    if (!isset($post['ID'])) {
        return $post;
    }

    $attachment_id = absint($post['ID']);

    foreach (wwh_image_credit_fields() as $key => $_label) {
        $field = 'ww_image_' . $key;
        $value = isset($attachment[$field]) ? (string) $attachment[$field] : '';
        $value = wwh_string_ends_with($key, '_url') ? esc_url_raw($value) : sanitize_text_field($value);
        wwh_update_meta($attachment_id, '_ww_image_' . $key, $value);
    }

    return $post;
}
add_filter('attachment_fields_to_save', 'wwh_attachment_fields_to_save', 10, 2);

function wwh_update_score_meta(int $post_id, string $key, string $value): void
{
    if ($value === '') {
        delete_post_meta($post_id, $key);
        return;
    }

    update_post_meta($post_id, $key, (string) max(0, absint($value)));
}

function wwh_save_sports_game(int $post_id): void
{
    if (!wwh_can_save_post($post_id, 'wwh_sports_game_nonce', 'wwh_save_sports_game')) {
        return;
    }

    $sport_key = wwh_sanitize_sport_key(wwh_request_value('ww_sport_key'));
    $sport_option = $sport_key !== '' ? wwh_sports_team_options()[$sport_key] : null;

    wwh_update_meta($post_id, '_ww_sport_key', $sport_key);
    wwh_update_meta($post_id, '_ww_sport', $sport_option['sport'] ?? '');
    wwh_update_meta($post_id, '_ww_level', $sport_option['level'] ?? '');
    wwh_update_meta($post_id, '_ww_team_label', $sport_option['teamLabel'] ?? '');
    wwh_update_meta($post_id, '_ww_opponent', wwh_request_value('ww_opponent'));
    wwh_update_meta($post_id, '_ww_site', wwh_sanitize_choice(wwh_request_value('ww_site'), ['home', 'away', 'neutral'], 'home'));
    wwh_update_meta($post_id, '_ww_location_name', wwh_request_value('ww_location_name'));
    wwh_update_meta($post_id, '_ww_location', wwh_request_value('ww_location_name'));
    wwh_update_meta($post_id, '_ww_location_address', wwh_request_value('ww_location_address'));
    wwh_update_meta($post_id, '_ww_location_latitude', wwh_sanitize_coordinate(wwh_request_value('ww_location_latitude'), -90, 90));
    wwh_update_meta($post_id, '_ww_location_longitude', wwh_sanitize_coordinate(wwh_request_value('ww_location_longitude'), -180, 180));
    wwh_update_meta($post_id, '_ww_location_apple_maps_id', wwh_request_value('ww_location_apple_maps_id'));
    wwh_update_meta($post_id, '_ww_start_datetime', wwh_sanitize_datetime(wwh_request_value('ww_start_datetime')));
    wwh_update_meta($post_id, '_ww_game_status', wwh_sanitize_choice(wwh_request_value('ww_game_status'), ['upcoming', 'final', 'postponed', 'canceled'], 'upcoming'));
    wwh_update_score_meta($post_id, '_ww_wildcats_score', wwh_request_value('ww_wildcats_score'));
    wwh_update_score_meta($post_id, '_ww_opponent_score', wwh_request_value('ww_opponent_score'));
    wwh_update_meta($post_id, '_ww_recap_url', esc_url_raw(wwh_request_value('ww_recap_url')));
    wwh_update_meta($post_id, '_ww_notes', wwh_request_textarea('ww_notes'));
}
add_action('save_post_' . WWH_SPORTS_GAME_POST_TYPE, 'wwh_save_sports_game');

function wwh_save_school_event(int $post_id): void
{
    if (!wwh_can_save_post($post_id, 'wwh_school_event_nonce', 'wwh_save_school_event')) {
        return;
    }

    wwh_update_meta($post_id, '_ww_event_type', wwh_request_value('ww_event_type'));
    wwh_update_meta($post_id, '_ww_event_start_datetime', wwh_sanitize_datetime(wwh_request_value('ww_event_start_datetime')));
    wwh_update_meta($post_id, '_ww_event_end_datetime', wwh_sanitize_datetime(wwh_request_value('ww_event_end_datetime')));
    wwh_update_meta($post_id, '_ww_event_all_day', isset($_POST['ww_event_all_day']) ? '1' : '0');
    wwh_update_meta($post_id, '_ww_event_location', wwh_request_value('ww_event_location'));
    wwh_update_meta($post_id, '_ww_event_description', wwh_request_textarea('ww_event_description'));
    wwh_update_meta($post_id, '_ww_event_external_url', esc_url_raw(wwh_request_value('ww_event_external_url')));
    wwh_update_meta($post_id, '_ww_event_status', wwh_sanitize_choice(wwh_request_value('ww_event_status'), ['scheduled', 'canceled'], 'scheduled'));
}
add_action('save_post_' . WWH_SCHOOL_EVENT_POST_TYPE, 'wwh_save_school_event');

function wwh_render_sports_import_page(): void
{
    if (!current_user_can('edit_posts')) {
        wp_die(esc_html__('Sorry, you are not allowed to import sports games.', 'weekly-wildcat-headless'));
    }

    $result = null;
    $selected_sport_key = '';
    $import_data = '';

    if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['wwh_sports_import_action'])) {
        check_admin_referer('wwh_import_sports_games', 'wwh_sports_import_nonce');

        $selected_sport_key = wwh_sanitize_sport_key(wwh_request_value('ww_sport_key'));
        $import_data = isset($_POST['wwh_import_data']) ? (string) wp_unslash($_POST['wwh_import_data']) : '';

        if (trim($import_data) === '' && isset($_FILES['wwh_import_file']['tmp_name'], $_FILES['wwh_import_file']['error']) && $_FILES['wwh_import_file']['error'] === UPLOAD_ERR_OK) {
            $uploaded = file_get_contents((string) $_FILES['wwh_import_file']['tmp_name']);
            $import_data = is_string($uploaded) ? $uploaded : '';
        }

        $result = wwh_import_sports_games($selected_sport_key, $import_data);
    }

    $team_options = ['' => 'Select a sport / team'];

    foreach (wwh_sports_team_options() as $key => $option) {
        $team_options[$key] = $option['label'];
    }

    ?>
    <div class="wrap wwh-import-page">
        <h1>Import Sports Games</h1>
        <?php if (is_array($result)) : ?>
            <div class="notice <?php echo $result['errors'] === [] ? 'notice-success' : 'notice-warning'; ?> is-dismissible">
                <p>
                    <strong><?php echo esc_html(sprintf('Imported %d games and updated %d games.', $result['created'], $result['updated'])); ?></strong>
                    <?php if ($result['skipped'] > 0) : ?>
                        <?php echo esc_html(sprintf('Skipped %d rows.', $result['skipped'])); ?>
                    <?php endif; ?>
                </p>
                <?php if ($result['errors'] !== []) : ?>
                    <ul>
                        <?php foreach ($result['errors'] as $error) : ?>
                            <li><?php echo esc_html($error); ?></li>
                        <?php endforeach; ?>
                    </ul>
                <?php endif; ?>
            </div>
        <?php endif; ?>

        <form method="post" enctype="multipart/form-data">
            <?php wp_nonce_field('wwh_import_sports_games', 'wwh_sports_import_nonce'); ?>
            <input type="hidden" name="wwh_sports_import_action" value="import">

            <table class="form-table" role="presentation">
                <tr>
                    <th scope="row"><label for="ww_sport_key">Sport / Team</label></th>
                    <td>
                        <select id="ww_sport_key" name="ww_sport_key" required>
                            <?php foreach ($team_options as $option_value => $option_label) : ?>
                                <option value="<?php echo esc_attr((string) $option_value); ?>" <?php selected($selected_sport_key, (string) $option_value); ?>>
                                    <?php echo esc_html((string) $option_label); ?>
                                </option>
                            <?php endforeach; ?>
                        </select>
                        <p class="description">Every imported row will use this sport/team.</p>
                    </td>
                </tr>
                <tr>
                    <th scope="row"><label for="wwh_import_file">Upload CSV or TSV</label></th>
                    <td>
                        <input type="file" id="wwh_import_file" name="wwh_import_file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain">
                        <p class="description">You can upload a spreadsheet export, or paste rows below.</p>
                    </td>
                </tr>
                <tr>
                    <th scope="row"><label for="wwh_import_data">Paste Data</label></th>
                    <td>
                        <textarea id="wwh_import_data" name="wwh_import_data" rows="12" class="large-text code" placeholder="Season	Date	Time	Site	Opponent	Result	Ninety Six Score	Opponent Score	Game Type	Watch Replay"><?php echo esc_textarea($import_data); ?></textarea>
                        <p class="description">Expected columns: Season, Date, Time, Site, Opponent, Result, Ninety Six Score, Opponent Score, Game Type, Watch Replay.</p>
                    </td>
                </tr>
            </table>

            <?php submit_button('Import Games'); ?>
        </form>
    </div>
    <?php
}

function wwh_render_sports_export_page(): void
{
    if (!current_user_can('edit_posts')) {
        wp_die(esc_html__('Sorry, you are not allowed to export sports games.', 'weekly-wildcat-headless'));
    }

    $export_url = wp_nonce_url(
        admin_url('admin-post.php?action=wwh_export_sports_games'),
        'wwh_export_sports_games',
        'wwh_sports_export_nonce'
    );

    ?>
    <div class="wrap wwh-export-page">
        <h1>Export Sports Games</h1>
        <p>Download every sports game as a CSV file. The first columns match the importer format so the file can be edited and imported again.</p>
        <p>
            <a class="button button-primary" href="<?php echo esc_url($export_url); ?>">Download All Games CSV</a>
        </p>
    </div>
    <?php
}

function wwh_export_sports_games(): void
{
    if (!current_user_can('edit_posts')) {
        wp_die(esc_html__('Sorry, you are not allowed to export sports games.', 'weekly-wildcat-headless'));
    }

    check_admin_referer('wwh_export_sports_games', 'wwh_sports_export_nonce');

    $filename = 'weekly-wildcat-sports-games-' . wp_date('Y-m-d') . '.csv';

    nocache_headers();
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="' . $filename . '"');

    $output = fopen('php://output', 'w');

    if (!$output) {
        exit;
    }

    fputcsv($output, wwh_sports_export_columns());

    $query = new WP_Query([
        'post_type' => WWH_SPORTS_GAME_POST_TYPE,
        'post_status' => ['publish', 'draft', 'pending', 'private', 'future'],
        'posts_per_page' => -1,
        'orderby' => 'title',
        'order' => 'ASC',
        'no_found_rows' => true,
    ]);

    foreach ($query->posts as $post) {
        fputcsv($output, wwh_sports_export_row($post));
    }

    wp_reset_postdata();
    fclose($output);
    exit;
}

function wwh_sports_export_columns(): array
{
    return [
        'Season',
        'Date',
        'Time',
        'Site',
        'Opponent',
        'Result',
        'Ninety Six Score',
        'Opponent Score',
        'Game Type',
        'Watch Replay',
        'Sport Key',
        'Sport / Team',
        'Status',
        'Location Name',
        'Location Address',
        'Recap URL',
        'Notes',
        'Post ID',
        'Post Status',
    ];
}

function wwh_sports_export_row(WP_Post $post): array
{
    $sport_key = wwh_meta_value($post->ID, '_ww_sport_key');
    $sport_option = array_key_exists($sport_key, wwh_sports_team_options()) ? wwh_sports_team_options()[$sport_key] : null;
    $start = wwh_meta_value($post->ID, '_ww_start_datetime');
    $date_time = wwh_export_date_time($post->ID, $start);
    $wildcats_score = wwh_meta_value($post->ID, '_ww_wildcats_score');
    $opponent_score = wwh_meta_value($post->ID, '_ww_opponent_score');
    $recap_url = wwh_meta_value($post->ID, '_ww_recap_url');
    $status = wwh_effective_game_status(wwh_meta_value($post->ID, '_ww_game_status', 'upcoming'), $start);

    return [
        wwh_meta_value($post->ID, '_ww_import_season'),
        $date_time['date'],
        $date_time['time'],
        wwh_label_from_value(wwh_meta_value($post->ID, '_ww_site', 'home')),
        wwh_meta_value($post->ID, '_ww_opponent'),
        wwh_export_result($status, $wildcats_score, $opponent_score),
        $wildcats_score,
        $opponent_score,
        wwh_meta_value($post->ID, '_ww_import_game_type'),
        $recap_url !== '' ? $recap_url : wwh_export_note_value(wwh_meta_value($post->ID, '_ww_notes'), 'Watch replay'),
        $sport_key,
        $sport_option['label'] ?? wwh_meta_value($post->ID, '_ww_sport'),
        wwh_label_from_value($status),
        wwh_meta_value($post->ID, '_ww_location_name', wwh_meta_value($post->ID, '_ww_location')),
        wwh_meta_value($post->ID, '_ww_location_address'),
        $recap_url,
        wwh_meta_value($post->ID, '_ww_notes'),
        (string) $post->ID,
        $post->post_status,
    ];
}

function wwh_export_date_time(int $post_id, string $start): array
{
    if ($start === '') {
        return [
            'date' => wwh_meta_value($post_id, '_ww_import_date', 'TBA'),
            'time' => wwh_meta_value($post_id, '_ww_import_time', 'TBA'),
        ];
    }

    $timestamp = strtotime(str_replace('T', ' ', $start));

    if (!$timestamp) {
        return [
            'date' => $start,
            'time' => '',
        ];
    }

    return [
        'date' => wp_date('Y-m-d', $timestamp, wp_timezone()),
        'time' => wp_date('g:i A', $timestamp, wp_timezone()),
    ];
}

function wwh_export_result(string $status, string $wildcats_score, string $opponent_score): string
{
    if ($status !== 'final' || $wildcats_score === '' || $opponent_score === '') {
        return '';
    }

    $wildcats_score = absint($wildcats_score);
    $opponent_score = absint($opponent_score);

    if ($wildcats_score > $opponent_score) {
        return 'W';
    }

    if ($wildcats_score < $opponent_score) {
        return 'L';
    }

    return 'T';
}

function wwh_export_note_value(string $notes, string $label): string
{
    foreach (preg_split('/\r\n|\r|\n/', $notes) ?: [] as $line) {
        $prefix = $label . ':';

        if (stripos((string) $line, $prefix) === 0) {
            return trim(substr((string) $line, strlen($prefix)));
        }
    }

    return '';
}

function wwh_import_sports_games(string $sport_key, string $raw_data): array
{
    $result = [
        'created' => 0,
        'updated' => 0,
        'skipped' => 0,
        'errors' => [],
    ];

    if ($sport_key === '') {
        $result['errors'][] = 'Choose a sport/team before importing.';
        return $result;
    }

    $parsed = wwh_parse_sports_import_rows($raw_data);

    if ($parsed['errors'] !== []) {
        $result['errors'] = array_merge($result['errors'], $parsed['errors']);
        return $result;
    }

    foreach ($parsed['rows'] as $index => $row) {
        $line_number = $index + 2;
        $imported = wwh_import_sports_game_row($sport_key, $row);

        if (is_wp_error($imported)) {
            $result['skipped']++;
            $result['errors'][] = sprintf('Row %d: %s', $line_number, $imported->get_error_message());
            continue;
        }

        $result[$imported]++;
    }

    return $result;
}

function wwh_parse_sports_import_rows(string $raw_data): array
{
    $raw_data = trim($raw_data);

    if ($raw_data === '') {
        return [
            'rows' => [],
            'errors' => ['Paste schedule data or upload a CSV/TSV file.'],
        ];
    }

    $lines = preg_split('/\r\n|\r|\n/', $raw_data);

    if (!is_array($lines) || count($lines) < 2) {
        return [
            'rows' => [],
            'errors' => ['The import needs a header row and at least one game row.'],
        ];
    }

    $header_line = array_shift($lines);
    $delimiter = wwh_import_delimiter((string) $header_line);
    $headers = str_getcsv((string) $header_line, $delimiter);
    $header_map = wwh_import_header_map($headers);
    $missing = [];

    foreach (['date', 'opponent'] as $required_header) {
        if (!array_key_exists($required_header, $header_map)) {
            $missing[] = $required_header === 'date' ? 'Date' : 'Opponent';
        }
    }

    if ($missing !== []) {
        return [
            'rows' => [],
            'errors' => [sprintf('Missing required column: %s.', implode(', ', $missing))],
        ];
    }

    $rows = [];

    foreach ($lines as $line) {
        if (trim((string) $line) === '') {
            continue;
        }

        $columns = str_getcsv((string) $line, $delimiter);
        $rows[] = [
            'season' => wwh_import_cell($columns, $header_map, 'season'),
            'date' => wwh_import_cell($columns, $header_map, 'date'),
            'time' => wwh_import_cell($columns, $header_map, 'time'),
            'site' => wwh_import_cell($columns, $header_map, 'site'),
            'opponent' => wwh_import_cell($columns, $header_map, 'opponent'),
            'result' => wwh_import_cell($columns, $header_map, 'result'),
            'wildcats_score' => wwh_import_cell($columns, $header_map, 'ninetysixscore'),
            'opponent_score' => wwh_import_cell($columns, $header_map, 'opponentscore'),
            'game_type' => wwh_import_cell($columns, $header_map, 'gametype'),
            'watch_replay' => wwh_import_cell($columns, $header_map, 'watchreplay'),
        ];
    }

    return [
        'rows' => $rows,
        'errors' => [],
    ];
}

function wwh_import_delimiter(string $header_line): string
{
    return substr_count($header_line, "\t") >= substr_count($header_line, ',') ? "\t" : ',';
}

function wwh_import_header_map(array $headers): array
{
    $map = [];

    foreach ($headers as $index => $header) {
        $header = preg_replace('/^\xEF\xBB\xBF/', '', (string) $header);
        $normalized = strtolower(trim((string) $header));
        $normalized = preg_replace('/[^a-z0-9]+/', '', $normalized);

        if (is_string($normalized) && $normalized !== '') {
            $map[$normalized] = $index;
        }
    }

    return $map;
}

function wwh_import_cell(array $columns, array $header_map, string $header): string
{
    if (!array_key_exists($header, $header_map)) {
        return '';
    }

    $index = $header_map[$header];

    return isset($columns[$index]) ? sanitize_text_field((string) $columns[$index]) : '';
}

function wwh_import_sports_game_row(string $sport_key, array $row)
{
    $sport_option = wwh_sports_team_options()[$sport_key];
    $opponent = trim((string) $row['opponent']);
    $start_unknown = wwh_import_has_unknown_datetime((string) $row['date'], (string) $row['time']);
    $start_datetime = wwh_import_datetime((string) $row['date'], (string) $row['time']);

    if ($opponent === '') {
        return new WP_Error('wwh_import_missing_opponent', 'Opponent is required.');
    }

    if (!$start_unknown && $start_datetime === '') {
        return new WP_Error('wwh_import_invalid_date', 'Date or time could not be read.');
    }

    $site = wwh_import_site((string) $row['site']);
    $wildcats_score = wwh_import_score((string) $row['wildcats_score']);
    $opponent_score = wwh_import_score((string) $row['opponent_score']);
    $status = wwh_import_status((string) $row['result'], $wildcats_score, $opponent_score, $start_datetime);
    $recap_url = wwh_import_recap_url((string) $row['watch_replay']);
    $notes = wwh_import_notes($row, $recap_url);
    $import_key = wwh_import_row_key($row);
    $post_id = wwh_find_existing_sports_game($sport_key, $start_datetime, $opponent, $import_key);
    $title = wwh_import_game_title($sport_option['sport'], $site, $opponent);
    $post_data = [
        'post_type' => WWH_SPORTS_GAME_POST_TYPE,
        'post_status' => 'publish',
        'post_title' => $title,
    ];

    if ($post_id > 0) {
        $post_data['ID'] = $post_id;
        $saved_post_id = wp_update_post($post_data, true);
        $mode = 'updated';
    } else {
        $saved_post_id = wp_insert_post($post_data, true);
        $mode = 'created';
    }

    if (is_wp_error($saved_post_id)) {
        return $saved_post_id;
    }

    $saved_post_id = absint($saved_post_id);

    wwh_update_meta($saved_post_id, '_ww_sport_key', $sport_key);
    wwh_update_meta($saved_post_id, '_ww_sport', $sport_option['sport']);
    wwh_update_meta($saved_post_id, '_ww_level', $sport_option['level']);
    wwh_update_meta($saved_post_id, '_ww_team_label', $sport_option['teamLabel']);
    wwh_update_meta($saved_post_id, '_ww_opponent', $opponent);
    wwh_update_meta($saved_post_id, '_ww_site', $site);
    wwh_update_meta($saved_post_id, '_ww_start_datetime', $start_datetime);
    wwh_update_meta($saved_post_id, '_ww_game_status', $status);
    wwh_update_score_meta($saved_post_id, '_ww_wildcats_score', $wildcats_score);
    wwh_update_score_meta($saved_post_id, '_ww_opponent_score', $opponent_score);
    wwh_update_meta($saved_post_id, '_ww_recap_url', $recap_url);
    wwh_update_meta($saved_post_id, '_ww_notes', $notes);
    wwh_update_meta($saved_post_id, '_ww_import_key', $import_key);
    wwh_update_meta($saved_post_id, '_ww_import_season', (string) $row['season']);
    wwh_update_meta($saved_post_id, '_ww_import_date', (string) $row['date']);
    wwh_update_meta($saved_post_id, '_ww_import_time', (string) $row['time']);
    wwh_update_meta($saved_post_id, '_ww_import_game_type', (string) $row['game_type']);

    return $mode;
}

function wwh_import_datetime(string $date, string $time): string
{
    $date = trim($date);
    $time = trim($time);

    if (wwh_import_has_unknown_datetime($date, $time)) {
        return '';
    }

    $value = trim($date . ' ' . $time);
    $timezone = wp_timezone();
    $formats = [
        'Y-m-d g:i A',
        'Y-m-d h:i A',
        'Y-m-d H:i',
        'Y-m-d',
        'm/d/Y g:i A',
        'm/d/Y h:i A',
        'm/d/Y H:i',
        'm/d/Y',
        'n/j/Y g:i A',
        'n/j/Y h:i A',
        'n/j/Y H:i',
        'n/j/Y',
    ];

    foreach ($formats as $format) {
        $datetime = DateTimeImmutable::createFromFormat('!' . $format, $value, $timezone);
        $errors = DateTimeImmutable::getLastErrors();
        $has_errors = is_array($errors) && ($errors['warning_count'] > 0 || $errors['error_count'] > 0);

        if ($datetime instanceof DateTimeImmutable && !$has_errors) {
            return $datetime->format('Y-m-d\TH:i');
        }
    }

    $timestamp = strtotime($value);

    return $timestamp ? wp_date('Y-m-d\TH:i', $timestamp, $timezone) : '';
}

function wwh_import_has_unknown_datetime(string $date, string $time): bool
{
    $date = trim($date);
    $time = trim($time);

    return $date === '' || $time === '' || wwh_import_is_unknown_value($date) || wwh_import_is_unknown_value($time);
}

function wwh_import_is_unknown_value(string $value): bool
{
    $value = strtolower(trim($value));
    $value = preg_replace('/[^a-z0-9]+/', '', $value);

    return in_array($value, ['', 'tba', 'tbd', 'unknown', 'na', 'none', 'tobeannounced', 'tobedetermined'], true);
}

function wwh_import_site(string $site): string
{
    $site = strtolower(trim($site));

    if (in_array($site, ['away', 'a'], true)) {
        return 'away';
    }

    if (in_array($site, ['neutral', 'n'], true)) {
        return 'neutral';
    }

    return 'home';
}

function wwh_import_score(string $score): string
{
    $score = trim($score);

    if ($score === '' || $score === '-') {
        return '';
    }

    return is_numeric($score) ? (string) max(0, absint($score)) : '';
}

function wwh_import_status(string $result, string $wildcats_score, string $opponent_score, string $start_datetime): string
{
    $result = strtolower(trim($result));

    if (in_array($result, ['postponed', 'ppd'], true)) {
        return 'postponed';
    }

    if (in_array($result, ['canceled', 'cancelled'], true)) {
        return 'canceled';
    }

    if (in_array($result, ['w', 'win', 'l', 'loss', 't', 'tie'], true) || ($wildcats_score !== '' && $opponent_score !== '')) {
        return 'final';
    }

    return wwh_effective_game_status('upcoming', $start_datetime);
}

function wwh_import_recap_url(string $watch_replay): string
{
    $watch_replay = trim($watch_replay);

    return filter_var($watch_replay, FILTER_VALIDATE_URL) ? esc_url_raw($watch_replay) : '';
}

function wwh_import_notes(array $row, string $recap_url): string
{
    $notes = [];

    if (wwh_import_has_unknown_datetime((string) $row['date'], (string) $row['time'])) {
        $date = trim((string) $row['date']);
        $time = trim((string) $row['time']);
        $parts = [];

        if ($date !== '') {
            $parts[] = 'Date: ' . $date;
        }

        if ($time !== '') {
            $parts[] = 'Time: ' . $time;
        }

        $notes[] = 'Date/time: ' . ($parts !== [] ? implode('; ', $parts) : 'TBA');
    }

    if ((string) $row['season'] !== '') {
        $notes[] = 'Season: ' . (string) $row['season'];
    }

    if ((string) $row['game_type'] !== '') {
        $notes[] = 'Game type: ' . (string) $row['game_type'];
    }

    if ((string) $row['watch_replay'] !== '' && $recap_url === '') {
        $notes[] = 'Watch replay: ' . (string) $row['watch_replay'];
    }

    return implode("\n", $notes);
}

function wwh_import_row_key(array $row): string
{
    $parts = [
        (string) $row['season'],
        (string) $row['date'],
        (string) $row['time'],
        (string) $row['site'],
        (string) $row['opponent'],
        (string) $row['game_type'],
    ];

    return md5(implode('|', array_map('wwh_normalize_import_key_part', $parts)));
}

function wwh_normalize_import_key_part(string $value): string
{
    $value = strtolower(trim($value));
    $value = preg_replace('/\s+/', ' ', $value);

    return is_string($value) ? $value : '';
}

function wwh_find_existing_sports_game(string $sport_key, string $start_datetime, string $opponent, string $import_key): int
{
    $meta_query = [
        [
            'key' => '_ww_sport_key',
            'value' => $sport_key,
        ],
        [
            'key' => '_ww_opponent',
            'value' => $opponent,
        ],
    ];

    if ($start_datetime !== '') {
        $meta_query[] = [
            'key' => '_ww_start_datetime',
            'value' => $start_datetime,
        ];
    } else {
        $meta_query[] = [
            'key' => '_ww_import_key',
            'value' => $import_key,
        ];
    }

    $query = new WP_Query([
        'post_type' => WWH_SPORTS_GAME_POST_TYPE,
        'post_status' => ['publish', 'draft', 'pending', 'private'],
        'posts_per_page' => 1,
        'fields' => 'ids',
        'no_found_rows' => true,
        'meta_query' => $meta_query,
    ]);

    $post_id = isset($query->posts[0]) ? absint($query->posts[0]) : 0;
    wp_reset_postdata();

    return $post_id;
}

function wwh_import_game_title(string $sport, string $site, string $opponent): string
{
    $preposition = $site === 'away' ? 'at' : 'vs.';

    return trim(sprintf('%s %s %s', $sport, $preposition, $opponent));
}

function wwh_author_meta_value(int $user_id, string $key, string $default = ''): string
{
    $value = get_user_meta($user_id, $key, true);

    return is_string($value) && $value !== '' ? $value : $default;
}

function wwh_author_profile_photo(int $attachment_id): array
{
    if ($attachment_id <= 0) {
        return [
            'id' => 0,
            'url' => '',
            'alt' => '',
            'width' => null,
            'height' => null,
        ];
    }

    $image = wp_get_attachment_image_src($attachment_id, 'medium');
    $full_image = wp_get_attachment_image_src($attachment_id, 'full');
    $source = $image ?: $full_image;

    if (!$source) {
        return [
            'id' => 0,
            'url' => '',
            'alt' => '',
            'width' => null,
            'height' => null,
        ];
    }

    return [
        'id' => $attachment_id,
        'url' => esc_url_raw((string) $source[0]),
        'alt' => get_post_meta($attachment_id, '_wp_attachment_image_alt', true),
        'width' => isset($source[1]) ? absint($source[1]) : null,
        'height' => isset($source[2]) ? absint($source[2]) : null,
    ];
}

function wwh_render_author_profile_fields(WP_User $user): void
{
    $photo_id = absint(get_user_meta($user->ID, '_ww_author_photo_id', true));
    $photo = wwh_author_profile_photo($photo_id);

    ?>
    <h2>Weekly Wildcat Profile</h2>
    <table class="form-table wwh-author-profile" role="presentation">
        <tr>
            <th><label for="ww_author_role">Role</label></th>
            <td><input type="text" class="regular-text" id="ww_author_role" name="ww_author_role" value="<?php echo esc_attr(wwh_author_meta_value($user->ID, '_ww_author_role')); ?>"></td>
        </tr>
        <tr>
            <th><label for="ww_author_pronouns">Pronouns</label></th>
            <td><input type="text" class="regular-text" id="ww_author_pronouns" name="ww_author_pronouns" value="<?php echo esc_attr(wwh_author_meta_value($user->ID, '_ww_author_pronouns')); ?>"></td>
        </tr>
        <tr>
            <th><label for="ww_author_photo_id">Profile Photo</label></th>
            <td>
                <input type="hidden" id="ww_author_photo_id" name="ww_author_photo_id" value="<?php echo esc_attr((string) $photo_id); ?>">
                <img class="wwh-author-photo-preview" src="<?php echo esc_url($photo['url']); ?>" alt="" <?php echo $photo['url'] === '' ? 'hidden' : ''; ?>>
                <p>
                    <button type="button" class="button wwh-author-photo-select">Select Profile Photo</button>
                    <button type="button" class="button wwh-author-photo-remove" <?php echo $photo['url'] === '' ? 'hidden' : ''; ?>>Remove Photo</button>
                </p>
                <p class="description">Use a WordPress Media Library image instead of Gravatar.</p>
            </td>
        </tr>
        <tr>
            <th>Founder Badge</th>
            <td>
                <label>
                    <input type="checkbox" name="ww_author_founder" value="1" <?php checked(wwh_author_meta_value($user->ID, '_ww_author_founder'), '1'); ?>>
                    Show Founder badge on this author profile
                </label>
            </td>
        </tr>
        <tr>
            <th>Author Directory</th>
            <td>
                <label>
                    <input type="checkbox" name="ww_author_show_in_directory" value="1" <?php checked(wwh_author_visible_in_directory($user->ID)); ?>>
                    Show in author directory
                </label>
                <p class="description">Enabled by default so new contributors can appear before their first story is published.</p>
            </td>
        </tr>
        <?php foreach (wwh_author_social_fields() as $key => $label) : ?>
            <tr>
                <th><label for="ww_author_social_<?php echo esc_attr($key); ?>"><?php echo esc_html($label); ?></label></th>
                <td>
                    <input
                        type="<?php echo $key === 'email' ? 'email' : 'url'; ?>"
                        class="regular-text"
                        id="ww_author_social_<?php echo esc_attr($key); ?>"
                        name="ww_author_social_<?php echo esc_attr($key); ?>"
                        value="<?php echo esc_attr(wwh_author_meta_value($user->ID, '_ww_author_social_' . $key)); ?>"
                    >
                </td>
            </tr>
        <?php endforeach; ?>
    </table>
    <?php
}
add_action('show_user_profile', 'wwh_render_author_profile_fields');
add_action('edit_user_profile', 'wwh_render_author_profile_fields');

function wwh_save_author_profile_fields(int $user_id): void
{
    if (!current_user_can('edit_user', $user_id)) {
        return;
    }

    wwh_update_user_meta($user_id, '_ww_author_role', wwh_request_value('ww_author_role'));
    wwh_update_user_meta($user_id, '_ww_author_pronouns', wwh_request_value('ww_author_pronouns'));
    wwh_update_user_meta($user_id, '_ww_author_founder', isset($_POST['ww_author_founder']) ? '1' : '');
    update_user_meta($user_id, '_ww_author_show_in_directory', isset($_POST['ww_author_show_in_directory']) ? '1' : '0');

    $photo_id = isset($_POST['ww_author_photo_id']) ? absint($_POST['ww_author_photo_id']) : 0;
    wwh_update_user_meta($user_id, '_ww_author_photo_id', $photo_id > 0 ? (string) $photo_id : '');

    foreach (wwh_author_social_fields() as $key => $_label) {
        $field = 'ww_author_social_' . $key;
        $value = $key === 'email' ? sanitize_email(wwh_request_value($field)) : esc_url_raw(wwh_request_value($field));
        wwh_update_user_meta($user_id, '_ww_author_social_' . $key, $value);
    }
}
add_action('personal_options_update', 'wwh_save_author_profile_fields');
add_action('edit_user_profile_update', 'wwh_save_author_profile_fields');

function wwh_author_visible_in_directory(int $user_id): bool
{
    return get_user_meta($user_id, '_ww_author_show_in_directory', true) !== '0';
}

function wwh_update_user_meta(int $user_id, string $key, string $value): void
{
    if ($value === '') {
        delete_user_meta($user_id, $key);
        return;
    }

    update_user_meta($user_id, $key, $value);
}

function wwh_enqueue_author_profile_assets(string $hook): void
{
    if (!in_array($hook, ['profile.php', 'user-edit.php'], true)) {
        return;
    }

    wp_enqueue_media();
    wp_add_inline_script(
        'jquery-core',
        "document.addEventListener('click',function(event){var selectButton=event.target.closest('.wwh-author-photo-select');var removeButton=event.target.closest('.wwh-author-photo-remove');if(selectButton){event.preventDefault();var wrap=selectButton.closest('td');var input=wrap.querySelector('#ww_author_photo_id');var preview=wrap.querySelector('.wwh-author-photo-preview');var remove=wrap.querySelector('.wwh-author-photo-remove');var frame=wp.media({title:'Select author profile photo',button:{text:'Use this photo'},multiple:false});frame.on('select',function(){var attachment=frame.state().get('selection').first().toJSON();input.value=attachment.id;preview.src=(attachment.sizes&&attachment.sizes.medium?attachment.sizes.medium.url:attachment.url);preview.hidden=false;remove.hidden=false;});frame.open();}if(removeButton){event.preventDefault();var removeWrap=removeButton.closest('td');removeWrap.querySelector('#ww_author_photo_id').value='';var removePreview=removeWrap.querySelector('.wwh-author-photo-preview');removePreview.removeAttribute('src');removePreview.hidden=true;removeButton.hidden=true;}});"
    );
}
add_action('admin_enqueue_scripts', 'wwh_enqueue_author_profile_assets');

function wwh_admin_styles(): void
{
    $screen = get_current_screen();
    $is_import_page = $screen && $screen->id === WWH_SPORTS_GAME_POST_TYPE . '_page_wwh-sports-import';

    if (!$screen || (!$is_import_page && !in_array($screen->post_type, [WWH_SPORTS_GAME_POST_TYPE, WWH_SCHOOL_EVENT_POST_TYPE], true) && !in_array($screen->id, ['profile', 'user-edit'], true))) {
        return;
    }

    echo '<style>
        .wwh-fields { display: grid; gap: 14px 18px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .wwh-field { margin: 0; }
        .wwh-field label, .wwh-field span { display: block; }
        .wwh-field span { font-weight: 600; margin-bottom: 5px; }
        .wwh-field input:not([type="checkbox"]), .wwh-field select, .wwh-field textarea { max-width: 100%; width: 100%; }
        .wwh-field textarea, .wwh-checkbox { grid-column: 1 / -1; }
        .wwh-checkbox label, .wwh-checkbox span { display: inline; }
        .wwh-author-photo-preview { background: #f0f0f1; display: block; height: 96px; margin-bottom: 10px; object-fit: cover; width: 96px; }
        .wwh-import-page textarea.code { min-height: 240px; white-space: pre; }
        .wwh-import-page select { min-width: 260px; }
        .wwh-import-page .notice ul { list-style: disc; margin-left: 20px; }
        @media (max-width: 782px) { .wwh-fields { grid-template-columns: 1fr; } }
    </style>';
}
add_action('admin_head', 'wwh_admin_styles');

function wwh_register_rest_routes(): void
{
    register_rest_route(WWH_REST_NAMESPACE, '/sports-games', [
        'methods' => WP_REST_Server::READABLE,
        'callback' => 'wwh_rest_sports_games',
        'permission_callback' => '__return_true',
    ]);

    register_rest_route(WWH_REST_NAMESPACE, '/sports-games/facets', [
        'methods' => WP_REST_Server::READABLE,
        'callback' => 'wwh_rest_sports_game_facets',
        'permission_callback' => '__return_true',
    ]);

    register_rest_route(WWH_REST_NAMESPACE, '/sports-games/upcoming', [
        'methods' => WP_REST_Server::READABLE,
        'callback' => 'wwh_rest_upcoming_sports_games',
        'permission_callback' => '__return_true',
    ]);

    register_rest_route(WWH_REST_NAMESPACE, '/sports-games/recent', [
        'methods' => WP_REST_Server::READABLE,
        'callback' => 'wwh_rest_recent_sports_games',
        'permission_callback' => '__return_true',
    ]);

    register_rest_route(WWH_REST_NAMESPACE, '/school-events', [
        'methods' => WP_REST_Server::READABLE,
        'callback' => 'wwh_rest_school_events',
        'permission_callback' => '__return_true',
    ]);

    register_rest_route(WWH_REST_NAMESPACE, '/authors', [
        'methods' => WP_REST_Server::READABLE,
        'callback' => 'wwh_rest_authors',
        'permission_callback' => '__return_true',
    ]);

    register_rest_field('user', 'weeklyWildcatProfile', [
        'get_callback' => 'wwh_rest_author_profile',
        'schema' => [
            'description' => 'Weekly Wildcat author profile fields.',
            'type' => 'object',
            'context' => ['view', 'edit'],
        ],
    ]);

    register_rest_field('attachment', 'weeklyWildcatImage', [
        'get_callback' => 'wwh_rest_image_credit',
        'schema' => [
            'description' => 'Weekly Wildcat image credit and license metadata.',
            'type' => 'object',
            'context' => ['view', 'edit'],
        ],
    ]);
}
add_action('rest_api_init', 'wwh_register_rest_routes');

function wwh_rest_image_credit(array $attachment): array
{
    $attachment_id = isset($attachment['id']) ? absint($attachment['id']) : 0;

    return [
        'creator' => wwh_image_meta_value($attachment_id, 'creator'),
        'creditText' => wwh_image_meta_value($attachment_id, 'credit_text'),
        'copyrightNotice' => wwh_image_meta_value($attachment_id, 'copyright_notice'),
        'licenseUrl' => wwh_image_meta_value($attachment_id, 'license_url'),
        'acquireLicensePage' => wwh_image_meta_value($attachment_id, 'acquire_license_url'),
    ];
}

function wwh_rest_author_profile(array $user): array
{
    $user_id = isset($user['id']) ? absint($user['id']) : 0;
    $photo_id = absint(get_user_meta($user_id, '_ww_author_photo_id', true));
    $socials = [];

    foreach (wwh_author_social_fields() as $key => $_label) {
        $socials[$key] = wwh_author_meta_value($user_id, '_ww_author_social_' . $key);
    }

    return [
        'pronouns' => wwh_author_meta_value($user_id, '_ww_author_pronouns'),
        'role' => wwh_author_meta_value($user_id, '_ww_author_role'),
        'founder' => wwh_author_meta_value($user_id, '_ww_author_founder') === '1',
        'showInDirectory' => wwh_author_visible_in_directory($user_id),
        'profilePhoto' => wwh_author_profile_photo($photo_id),
        'socials' => $socials,
    ];
}

function wwh_rest_authors(): WP_REST_Response
{
    $users = get_users([
        'orderby' => 'display_name',
        'order' => 'ASC',
        'fields' => 'all',
    ]);
    $authors = [];

    foreach ($users as $user) {
        if (!$user instanceof WP_User || !wwh_author_visible_in_directory((int) $user->ID)) {
            continue;
        }

        $author = [
            'id' => (int) $user->ID,
            'name' => $user->display_name,
            'slug' => $user->user_nicename,
            'description' => get_user_meta((int) $user->ID, 'description', true),
            'url' => $user->user_url,
            'link' => get_author_posts_url((int) $user->ID, $user->user_nicename),
            'weeklyWildcatProfile' => wwh_rest_author_profile(['id' => (int) $user->ID]),
        ];

        $authors[] = $author;
    }

    return rest_ensure_response($authors);
}

function wwh_rest_limit(WP_REST_Request $request): int
{
    $raw_limit = (string) $request->get_param('per_page');

    if ($raw_limit === 'all' || $raw_limit === '-1') {
        return -1;
    }

    $limit = absint($raw_limit ?: 20);

    return max(1, $limit);
}

function wwh_rest_page(WP_REST_Request $request): int
{
    return max(1, absint($request->get_param('page') ?: 1));
}

function wwh_now_local(): string
{
    return wp_date('Y-m-d\TH:i', null, wp_timezone());
}

function wwh_game_query_args(WP_REST_Request $request, array $overrides = []): array
{
    $args = [
        'post_type' => WWH_SPORTS_GAME_POST_TYPE,
        'post_status' => 'publish',
        'posts_per_page' => wwh_rest_limit($request),
        'paged' => wwh_rest_page($request),
        'orderby' => 'meta_value',
        'meta_key' => '_ww_start_datetime',
        'order' => 'DESC',
        'no_found_rows' => false,
    ];

    $status = sanitize_text_field((string) $request->get_param('status'));
    $year = absint($request->get_param('year'));
    $sport_key = sanitize_text_field((string) ($request->get_param('sport_key') ?: $request->get_param('sportKey')));
    $meta_query = [];

    if ($status !== '' && in_array($status, ['upcoming', 'final', 'postponed', 'canceled'], true)) {
        $meta_query[] = [
            'key' => '_ww_game_status',
            'value' => $status,
        ];
    }

    if ($sport_key !== '' && array_key_exists($sport_key, wwh_sports_team_options())) {
        $meta_query[] = [
            'key' => '_ww_sport_key',
            'value' => $sport_key,
        ];
    }

    if ($year >= 1900 && $year <= 2200) {
        $meta_query[] = [
            'key' => '_ww_start_datetime',
            'value' => [
                sprintf('%04d-01-01T00:00', $year),
                sprintf('%04d-01-01T00:00', $year + 1),
            ],
            'compare' => 'BETWEEN',
            'type' => 'CHAR',
        ];
    }

    if (isset($overrides['meta_query'])) {
        $meta_query = array_merge($meta_query, $overrides['meta_query']);
        unset($overrides['meta_query']);
    }

    if ($meta_query !== []) {
        $args['meta_query'] = $meta_query;
    }

    return array_merge($args, $overrides);
}

function wwh_event_query_args(WP_REST_Request $request): array
{
    $args = [
        'post_type' => WWH_SCHOOL_EVENT_POST_TYPE,
        'post_status' => 'publish',
        'posts_per_page' => wwh_rest_limit($request),
        'paged' => wwh_rest_page($request),
        'orderby' => 'meta_value',
        'meta_key' => '_ww_event_start_datetime',
        'order' => 'ASC',
        'no_found_rows' => false,
        'meta_query' => [
            [
                'key' => '_ww_event_start_datetime',
                'value' => wwh_now_local(),
                'compare' => '>=',
                'type' => 'CHAR',
            ],
        ],
    ];

    $status = sanitize_text_field((string) $request->get_param('status'));

    if ($status !== '' && in_array($status, ['scheduled', 'canceled'], true)) {
        $args['meta_query'][] = [
            'key' => '_ww_event_status',
            'value' => $status,
        ];
    }

    return $args;
}

function wwh_rest_sports_games(WP_REST_Request $request): WP_REST_Response
{
    return wwh_rest_query_response(new WP_Query(wwh_game_query_args($request)), 'wwh_format_sports_game');
}

function wwh_summary_key(string $year = 'all', string $sport = 'all'): string
{
    return $year . '::' . $sport;
}

function wwh_empty_game_summary(): array
{
    return [
        'games' => 0,
        'upcoming' => 0,
        'finals' => 0,
        'wins' => 0,
        'losses' => 0,
        'ties' => 0,
    ];
}

function wwh_add_game_to_summary(array &$summaries, string $key, string $status, ?int $wildcats_score, ?int $opponent_score): void
{
    if (!isset($summaries[$key])) {
        $summaries[$key] = wwh_empty_game_summary();
    }

    $summaries[$key]['games']++;

    if ($status === 'upcoming') {
        $summaries[$key]['upcoming']++;
    }

    if ($status === 'final') {
        $summaries[$key]['finals']++;

        if ($wildcats_score !== null && $opponent_score !== null) {
            if ($wildcats_score > $opponent_score) {
                $summaries[$key]['wins']++;
            } elseif ($wildcats_score < $opponent_score) {
                $summaries[$key]['losses']++;
            } else {
                $summaries[$key]['ties']++;
            }
        }
    }
}

function wwh_rest_sports_game_facets(): WP_REST_Response
{
    $query = new WP_Query([
        'post_type' => WWH_SPORTS_GAME_POST_TYPE,
        'post_status' => 'publish',
        'posts_per_page' => -1,
        'fields' => 'ids',
        'no_found_rows' => true,
        'orderby' => 'meta_value',
        'meta_key' => '_ww_start_datetime',
        'order' => 'DESC',
    ]);
    $years = [];
    $sports = [];
    $summaries = [];

    foreach ($query->posts as $post_id) {
        $post_id = absint($post_id);
        $start = wwh_meta_value($post_id, '_ww_start_datetime');
        $year = substr($start, 0, 4);
        $sport_key = wwh_meta_value($post_id, '_ww_sport_key');
        $sport_option = array_key_exists($sport_key, wwh_sports_team_options()) ? wwh_sports_team_options()[$sport_key] : null;
        $sport_label = $sport_option['label'] ?? wwh_meta_value($post_id, '_ww_sport', $sport_key);
        $status = wwh_effective_game_status(wwh_meta_value($post_id, '_ww_game_status', 'upcoming'), $start);
        $wildcats_score_raw = wwh_meta_value($post_id, '_ww_wildcats_score');
        $opponent_score_raw = wwh_meta_value($post_id, '_ww_opponent_score');
        $show_score = $status === 'final' && $wildcats_score_raw !== '' && $opponent_score_raw !== '';
        $wildcats_score = $show_score ? absint($wildcats_score_raw) : null;
        $opponent_score = $show_score ? absint($opponent_score_raw) : null;

        if ($year !== '') {
            $years[$year] = true;
        }

        if ($sport_key !== '') {
            $sports[$sport_key] = [
                'value' => $sport_key,
                'label' => $sport_label !== '' ? $sport_label : $sport_key,
            ];
        }

        foreach ([
            wwh_summary_key(),
            wwh_summary_key($year !== '' ? $year : 'all', 'all'),
            wwh_summary_key('all', $sport_key !== '' ? $sport_key : 'all'),
            wwh_summary_key($year !== '' ? $year : 'all', $sport_key !== '' ? $sport_key : 'all'),
        ] as $summary_key) {
            wwh_add_game_to_summary($summaries, $summary_key, $status, $wildcats_score, $opponent_score);
        }
    }

    wp_reset_postdata();
    $year_values = array_keys($years);
    rsort($year_values, SORT_STRING);
    usort($sports, static fn(array $left, array $right): int => strcasecmp($left['label'], $right['label']));

    return rest_ensure_response([
        'years' => $year_values,
        'sports' => array_values($sports),
        'summaries' => $summaries,
        'dataUrl' => add_query_arg(['per_page' => 'all', 'page' => 1], rest_url(WWH_REST_NAMESPACE . '/sports-games')),
    ]);
}

function wwh_rest_upcoming_sports_games(WP_REST_Request $request): WP_REST_Response
{
    $args = wwh_game_query_args($request, [
        'order' => 'ASC',
        'meta_query' => [
            [
                'key' => '_ww_game_status',
                'value' => 'upcoming',
            ],
            [
                'key' => '_ww_start_datetime',
                'value' => wwh_now_local(),
                'compare' => '>=',
                'type' => 'CHAR',
            ],
        ],
    ]);

    return wwh_rest_query_response(new WP_Query($args), 'wwh_format_sports_game');
}

function wwh_rest_recent_sports_games(WP_REST_Request $request): WP_REST_Response
{
    $args = wwh_game_query_args($request, [
        'order' => 'DESC',
        'meta_query' => [
            [
                'key' => '_ww_start_datetime',
                'value' => wwh_now_local(),
                'compare' => '<=',
                'type' => 'CHAR',
            ],
            [
                'relation' => 'OR',
                [
                    'key' => '_ww_game_status',
                    'value' => 'final',
                ],
                [
                    'key' => '_ww_game_status',
                    'value' => 'upcoming',
                ],
            ],
        ],
    ]);

    return wwh_rest_query_response(new WP_Query($args), 'wwh_format_sports_game');
}

function wwh_rest_school_events(WP_REST_Request $request): WP_REST_Response
{
    return wwh_rest_query_response(new WP_Query(wwh_event_query_args($request)), 'wwh_format_school_event');
}

function wwh_rest_query_response(WP_Query $query, callable $formatter): WP_REST_Response
{
    $response = rest_ensure_response(wwh_map_posts($query, $formatter));

    $response->header('X-WP-Total', (string) $query->found_posts);
    $response->header('X-WP-TotalPages', (string) max(1, (int) $query->max_num_pages));

    return $response;
}

function wwh_map_posts(WP_Query $query, callable $formatter): array
{
    $items = [];

    foreach ($query->posts as $post) {
        $items[] = $formatter($post);
    }

    wp_reset_postdata();

    return $items;
}

function wwh_format_date_text(string $value): string
{
    if ($value === '') {
        return '';
    }

    $timestamp = strtotime(str_replace('T', ' ', $value));

    return $timestamp ? wp_date('M j, Y g:i A', $timestamp, wp_timezone()) : $value;
}

function wwh_format_time_text(string $start, string $end, bool $all_day): string
{
    if ($all_day) {
        return 'All day';
    }

    $start_timestamp = $start !== '' ? strtotime(str_replace('T', ' ', $start)) : false;
    $end_timestamp = $end !== '' ? strtotime(str_replace('T', ' ', $end)) : false;

    if (!$start_timestamp) {
        return '';
    }

    $start_text = wp_date('g:i A', $start_timestamp, wp_timezone());

    if (!$end_timestamp) {
        return $start_text;
    }

    return sprintf('%s-%s', $start_text, wp_date('g:i A', $end_timestamp, wp_timezone()));
}

function wwh_label_from_value(string $value): string
{
    return ucwords(str_replace(['_', '-'], ' ', $value));
}

function wwh_effective_game_status(string $status, string $start): string
{
    $status = wwh_sanitize_choice($status, ['upcoming', 'final', 'postponed', 'canceled'], 'upcoming');

    if ($status === 'upcoming' && wwh_game_start_has_passed($start)) {
        return 'final';
    }

    return $status;
}

function wwh_game_start_has_passed(string $start): bool
{
    if ($start === '') {
        return false;
    }

    $start_datetime = DateTimeImmutable::createFromFormat('!Y-m-d\TH:i', $start, wp_timezone());
    $errors = DateTimeImmutable::getLastErrors();
    $has_errors = is_array($errors) && ($errors['warning_count'] > 0 || $errors['error_count'] > 0);

    if (!$start_datetime || $has_errors) {
        return false;
    }

    return $start_datetime < new DateTimeImmutable('now', wp_timezone());
}

function wwh_format_sports_game(WP_Post $post): array
{
    $site = wwh_sanitize_choice(wwh_meta_value($post->ID, '_ww_site', 'home'), ['home', 'away', 'neutral'], 'home');
    $sport_key = wwh_meta_value($post->ID, '_ww_sport_key');
    $sport_option = array_key_exists($sport_key, wwh_sports_team_options()) ? wwh_sports_team_options()[$sport_key] : null;
    $opponent = wwh_meta_value($post->ID, '_ww_opponent');
    $location_name = wwh_meta_value($post->ID, '_ww_location_name', wwh_meta_value($post->ID, '_ww_location'));
    $location_address = wwh_meta_value($post->ID, '_ww_location_address');
    $latitude = wwh_meta_value($post->ID, '_ww_location_latitude');
    $longitude = wwh_meta_value($post->ID, '_ww_location_longitude');
    $start = wwh_meta_value($post->ID, '_ww_start_datetime');
    $status = wwh_effective_game_status(wwh_meta_value($post->ID, '_ww_game_status', 'upcoming'), $start);
    $wildcats_score = wwh_meta_value($post->ID, '_ww_wildcats_score');
    $opponent_score = wwh_meta_value($post->ID, '_ww_opponent_score');
    $show_score = $status === 'final' && $wildcats_score !== '' && $opponent_score !== '';
    $matchup = $opponent !== '' ? sprintf('Wildcats %s %s', $site === 'away' ? 'at' : 'vs.', $opponent) : get_the_title($post);
    $sport = $sport_option['sport'] ?? wwh_meta_value($post->ID, '_ww_sport');
    $level = $sport_option['level'] ?? wwh_meta_value($post->ID, '_ww_level');
    $sport_level = trim(implode(' · ', array_filter([$sport, $level])));
    $opponent_label = $opponent !== '' ? $opponent : 'Opponent';

    return [
        'id' => $post->ID,
        'title' => get_the_title($post),
        'slug' => $post->post_name,
        'sportKey' => $sport_key,
        'sport' => $sport,
        'sportLabel' => $sport_option['label'] ?? wwh_meta_value($post->ID, '_ww_sport'),
        'level' => $level,
        'teamLabel' => $sport_option['teamLabel'] ?? wwh_meta_value($post->ID, '_ww_team_label'),
        'opponent' => $opponent,
        'site' => $site,
        'location' => $location_name,
        'locationName' => $location_name,
        'locationAddress' => $location_address,
        'latitude' => $latitude !== '' ? (float) $latitude : null,
        'longitude' => $longitude !== '' ? (float) $longitude : null,
        'appleMapsId' => wwh_meta_value($post->ID, '_ww_location_apple_maps_id'),
        'startDate' => $start,
        'status' => $status,
        'wildcatsScore' => $show_score ? absint($wildcats_score) : null,
        'opponentScore' => $show_score ? absint($opponent_score) : null,
        'recapUrl' => wwh_meta_value($post->ID, '_ww_recap_url'),
        'notes' => wwh_meta_value($post->ID, '_ww_notes'),
        'display' => [
            'matchup' => $matchup,
            'date' => $start !== '' ? wwh_format_date_text($start) : 'TBA',
            'location' => $location_name !== '' ? $location_name : $location_address,
            'status' => wwh_label_from_value($status),
            'score' => $show_score ? sprintf('Wildcats %d, %s %d', absint($wildcats_score), $opponent !== '' ? $opponent : 'Opponent', absint($opponent_score)) : null,
            'sportLevel' => $sport_level,
            'scoreboard' => [
                'wildcats' => [
                    'label' => 'Wildcats',
                    'score' => $show_score ? absint($wildcats_score) : null,
                ],
                'opponent' => [
                    'label' => $opponent_label,
                    'score' => $show_score ? absint($opponent_score) : null,
                ],
            ],
        ],
    ];
}

function wwh_format_school_event(WP_Post $post): array
{
    $status = wwh_sanitize_choice(wwh_meta_value($post->ID, '_ww_event_status', 'scheduled'), ['scheduled', 'canceled'], 'scheduled');
    $start = wwh_meta_value($post->ID, '_ww_event_start_datetime');
    $end = wwh_meta_value($post->ID, '_ww_event_end_datetime');
    $all_day = wwh_meta_value($post->ID, '_ww_event_all_day') === '1';

    return [
        'id' => $post->ID,
        'title' => get_the_title($post),
        'slug' => $post->post_name,
        'eventType' => wwh_meta_value($post->ID, '_ww_event_type'),
        'startDate' => $start,
        'endDate' => $end,
        'allDay' => $all_day,
        'location' => wwh_meta_value($post->ID, '_ww_event_location'),
        'description' => wwh_meta_value($post->ID, '_ww_event_description'),
        'externalUrl' => wwh_meta_value($post->ID, '_ww_event_external_url'),
        'status' => $status,
        'display' => [
            'date' => wwh_format_date_text($start),
            'time' => wwh_format_time_text($start, $end, $all_day),
            'status' => wwh_label_from_value($status),
        ],
    ];
}
