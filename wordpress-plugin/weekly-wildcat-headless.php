<?php
/**
 * Plugin Name: Weekly Wildcat Headless
 * Description: Headless CMS extensions for Weekly Wildcat sports schedules, scores, and school events.
 * Version: 0.1.5
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
        'cheer-competition' => ['sport' => 'Cheer', 'level' => 'Competition', 'teamLabel' => 'Cheer', 'label' => 'Cheer - Competition'],
        'cheer-sideline' => ['sport' => 'Cheer', 'level' => 'Sideline', 'teamLabel' => 'Cheer', 'label' => 'Cheer - Sideline'],
        'cross-country' => ['sport' => 'Cross Country', 'level' => 'Varsity', 'teamLabel' => 'Cross Country', 'label' => 'Cross Country'],
        'football-varsity' => ['sport' => 'Football', 'level' => 'Varsity', 'teamLabel' => 'Football', 'label' => 'Football - Varsity'],
        'football-jv' => ['sport' => 'Football', 'level' => 'JV', 'teamLabel' => 'Football', 'label' => 'Football - JV'],
        'girls-basketball-varsity' => ['sport' => 'Girls Basketball', 'level' => 'Varsity', 'teamLabel' => 'Girls', 'label' => 'Girls Basketball - Varsity'],
        'girls-basketball-jv' => ['sport' => 'Girls Basketball', 'level' => 'JV', 'teamLabel' => 'Girls', 'label' => 'Girls Basketball - JV'],
        'girls-soccer' => ['sport' => 'Girls Soccer', 'level' => 'Varsity', 'teamLabel' => 'Girls', 'label' => 'Girls Soccer'],
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
        $form_fields['ww_image_' . $key] = [
            'label' => $label,
            'input' => 'html',
            'html' => sprintf(
                '<input type="%s" class="text" name="attachments[%d][ww_image_%s]" value="%s">%s',
                $is_url ? 'url' : 'text',
                $post->ID,
                esc_attr($key),
                esc_attr(wwh_image_meta_value($post->ID, $key)),
                $key === 'credit_text' ? '<p class="help">Example: Gibson Bell for Weekly Wildcat. This appears over the image on the public site.</p>' : ''
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

    if (!$screen || (!in_array($screen->post_type, [WWH_SPORTS_GAME_POST_TYPE, WWH_SCHOOL_EVENT_POST_TYPE], true) && !in_array($screen->id, ['profile', 'user-edit'], true))) {
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
        'profilePhoto' => wwh_author_profile_photo($photo_id),
        'socials' => $socials,
    ];
}

function wwh_rest_limit(WP_REST_Request $request): int
{
    $limit = absint($request->get_param('per_page') ?: 20);

    return min(100, max(1, $limit));
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
        'orderby' => 'meta_value',
        'meta_key' => '_ww_start_datetime',
        'order' => 'DESC',
        'no_found_rows' => true,
    ];

    $status = sanitize_text_field((string) $request->get_param('status'));
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
        'orderby' => 'meta_value',
        'meta_key' => '_ww_event_start_datetime',
        'order' => 'ASC',
        'no_found_rows' => true,
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
    return rest_ensure_response(wwh_map_posts(new WP_Query(wwh_game_query_args($request)), 'wwh_format_sports_game'));
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

    return rest_ensure_response(wwh_map_posts(new WP_Query($args), 'wwh_format_sports_game'));
}

function wwh_rest_recent_sports_games(WP_REST_Request $request): WP_REST_Response
{
    $args = wwh_game_query_args($request, [
        'order' => 'DESC',
        'meta_query' => [
            [
                'key' => '_ww_game_status',
                'value' => 'final',
            ],
            [
                'key' => '_ww_start_datetime',
                'value' => wwh_now_local(),
                'compare' => '<=',
                'type' => 'CHAR',
            ],
        ],
    ]);

    return rest_ensure_response(wwh_map_posts(new WP_Query($args), 'wwh_format_sports_game'));
}

function wwh_rest_school_events(WP_REST_Request $request): WP_REST_Response
{
    return rest_ensure_response(wwh_map_posts(new WP_Query(wwh_event_query_args($request)), 'wwh_format_school_event'));
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

function wwh_format_sports_game(WP_Post $post): array
{
    $status = wwh_sanitize_choice(wwh_meta_value($post->ID, '_ww_game_status', 'upcoming'), ['upcoming', 'final', 'postponed', 'canceled'], 'upcoming');
    $site = wwh_sanitize_choice(wwh_meta_value($post->ID, '_ww_site', 'home'), ['home', 'away', 'neutral'], 'home');
    $sport_key = wwh_meta_value($post->ID, '_ww_sport_key');
    $sport_option = array_key_exists($sport_key, wwh_sports_team_options()) ? wwh_sports_team_options()[$sport_key] : null;
    $opponent = wwh_meta_value($post->ID, '_ww_opponent');
    $location_name = wwh_meta_value($post->ID, '_ww_location_name', wwh_meta_value($post->ID, '_ww_location'));
    $location_address = wwh_meta_value($post->ID, '_ww_location_address');
    $latitude = wwh_meta_value($post->ID, '_ww_location_latitude');
    $longitude = wwh_meta_value($post->ID, '_ww_location_longitude');
    $start = wwh_meta_value($post->ID, '_ww_start_datetime');
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
            'date' => wwh_format_date_text($start),
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
