<?php

/**
 * Guest Contributors screen, under Users.
 *
 * A native-style WordPress list table and edit form for the guest records that
 * the Story sidebar creates. Every write goes through the guest domain functions
 * in contributors.php, so slug uniqueness, publish gating, sanitising and
 * capability checks are the same as the REST routes.
 */

if (!defined('ABSPATH')) {
    exit;
}

const BYLINE_GUESTS_ADMIN_PAGE = 'byline-guests';

/**
 * add_submenu_page() takes one capability. Editors manage guests through
 * edit_others_posts; Byline managers without it fall back to manage_byline.
 * The handlers below re-check byline_guest_can_manage() on every request.
 */
function byline_guests_admin_menu_capability(): string
{
    return current_user_can('edit_others_posts') ? 'edit_others_posts' : byline_guest_management_capability();
}

function byline_guests_register_admin_page(): void
{
    $hook = add_users_page(
        __('Guest Contributors', 'weekly-wildcat-headless'),
        __('Guest Contributors', 'weekly-wildcat-headless'),
        byline_guests_admin_menu_capability(),
        BYLINE_GUESTS_ADMIN_PAGE,
        'byline_guests_render_page'
    );

    if (is_string($hook) && $hook !== '') {
        add_action('load-' . $hook, 'byline_guests_handle_request');
        add_action('admin_print_styles-' . $hook, 'byline_guests_print_styles');
        add_action('admin_enqueue_scripts', static function (string $current) use ($hook): void {
            if ($current === $hook && function_exists('wp_enqueue_media')) {
                wp_enqueue_media();
            }
        });
    }
}
add_action('admin_menu', 'byline_guests_register_admin_page');

/** @param array<string,mixed> $args */
function byline_guests_admin_url(array $args = []): string
{
    $parent = current_user_can('edit_users') ? 'users.php' : 'profile.php';

    return add_query_arg(array_merge(['page' => BYLINE_GUESTS_ADMIN_PAGE], $args), admin_url($parent));
}

function byline_guests_print_styles(): void
{
    ?>
    <style>
        .byline-guest-name { align-items: center; display: flex; gap: 10px; }
        .byline-guest-thumb, .byline-guest-initial {
            border-radius: 50%;
            flex: none;
            height: 36px;
            object-fit: cover;
            width: 36px;
        }
        .byline-guest-initial { align-items: center; background: #dcdcde; color: #50575e; display: flex; font-weight: 600; justify-content: center; }
        .byline-guest-photo-preview { border-radius: 50%; display: block; height: 80px; margin-bottom: 8px; object-fit: cover; width: 80px; }
        .byline-guest-merge-list { margin: 1em 0; max-width: 640px; }
        .byline-guest-merge-list label { display: block; padding: 6px 0; }
        .column-byline_stories, .column-byline_page, .column-byline_status { width: 12%; }
    </style>
    <?php
}

/** Queue a one-shot admin notice for the next page load. */
function byline_guests_flash(string $type, string $message): void
{
    set_transient('byline_guests_notice_' . get_current_user_id(), ['type' => $type, 'message' => $message], MINUTE_IN_SECONDS);
}

/** @param array<string,mixed> $args */
function byline_guests_redirect(array $args = []): void
{
    wp_safe_redirect(byline_guests_admin_url($args));
    exit;
}

/** @param mixed $error */
function byline_guests_redirect_with_error($error, array $args = []): void
{
    byline_guests_flash('error', is_wp_error($error) ? $error->get_error_message() : (string) $error);
    byline_guests_redirect($args);
}

/** @return array<int,int> */
function byline_guests_request_ids(string $key): array
{
    $raw = isset($_REQUEST[$key]) ? wp_unslash($_REQUEST[$key]) : [];

    return array_values(array_unique(array_filter(array_map('absint', (array) $raw))));
}

function byline_guests_request_action(): string
{
    $action = isset($_REQUEST['action']) ? sanitize_key((string) wp_unslash($_REQUEST['action'])) : '';
    if ($action === '' || $action === '-1') {
        $action = isset($_REQUEST['action2']) ? sanitize_key((string) wp_unslash($_REQUEST['action2'])) : '';
    }

    return $action === '-1' ? '' : $action;
}

/** Process form posts and row/bulk actions before any output, so they can redirect. */
function byline_guests_handle_request(): void
{
    if (!byline_guest_can_manage()) {
        wp_die(esc_html__('You are not allowed to manage guest contributors.', 'weekly-wildcat-headless'), 403);
    }

    $action = byline_guests_request_action();

    if ($action === 'save') {
        byline_guests_handle_save();
    }

    if ($action === 'delete') {
        $guest_id = absint($_GET['guest'] ?? 0);
        check_admin_referer('delete-guest_' . $guest_id);
        $result = byline_delete_guest_contributor($guest_id, null, true);
        if (is_wp_error($result)) {
            byline_guests_redirect_with_error($result);
        }
        byline_guests_flash('success', __('Guest deleted. Stories that credited them no longer show their name.', 'weekly-wildcat-headless'));
        byline_guests_redirect();
    }

    if ($action === 'bulk_delete') {
        check_admin_referer('bulk-guests');
        $deleted = 0;
        foreach (byline_guests_request_ids('guests') as $guest_id) {
            if (!is_wp_error(byline_delete_guest_contributor($guest_id, null, true))) {
                $deleted++;
            }
        }
        /* translators: %d: number of guests deleted. */
        byline_guests_flash('success', sprintf(_n('%d guest deleted.', '%d guests deleted.', $deleted, 'weekly-wildcat-headless'), $deleted));
        byline_guests_redirect();
    }

    if ($action === 'bulk_merge') {
        check_admin_referer('bulk-guests');
        $ids = byline_guests_request_ids('guests');
        if (count($ids) < 2) {
            byline_guests_redirect_with_error(__('Select at least two guests to merge.', 'weekly-wildcat-headless'));
        }
        byline_guests_redirect(['action' => 'merge', 'guests' => $ids]);
    }

    if ($action === 'do_merge') {
        check_admin_referer('byline_guest_merge');
        $ids = byline_guests_request_ids('guests');
        $primary = absint($_POST['primary'] ?? 0);
        $result = byline_merge_guest_contributors($primary, array_diff($ids, [$primary]));
        if (is_wp_error($result)) {
            byline_guests_redirect_with_error($result, ['action' => 'merge', 'guests' => $ids]);
        }
        byline_guests_flash(
            'success',
            sprintf(
                /* translators: 1: number of guests merged, 2: number of stories updated. */
                __('Merged %1$d duplicate guest(s) into one. %2$d story byline(s) updated.', 'weekly-wildcat-headless'),
                count($result['mergedIds']),
                $result['storiesUpdated']
            )
        );
        byline_guests_redirect();
    }
}

function byline_guests_handle_save(): void
{
    check_admin_referer('byline_guest_save');

    $guest_id = absint($_POST['guest_id'] ?? 0);
    $input = [
        'name' => wp_unslash($_POST['guest_name'] ?? ''),
        'role' => wp_unslash($_POST['guest_role'] ?? ''),
        'bio' => wp_unslash($_POST['guest_bio'] ?? ''),
        'imageId' => absint($_POST['guest_image_id'] ?? 0),
        'hasProfilePage' => isset($_POST['has_profile_page']),
    ];
    if (byline_guest_can_publish() && isset($_POST['guest_status'])) {
        $input['status'] = wp_unslash($_POST['guest_status']);
    }

    $form_args = $guest_id > 0 ? ['action' => 'edit', 'guest' => $guest_id] : ['action' => 'add'];
    $result = $guest_id > 0
        ? byline_update_guest_contributor($guest_id, $input)
        : byline_create_guest_contributor($input);

    if (is_wp_error($result)) {
        byline_guests_redirect_with_error($result, $form_args);
    }

    byline_guests_flash('success', $guest_id > 0 ? __('Guest updated.', 'weekly-wildcat-headless') : __('Guest added.', 'weekly-wildcat-headless'));
    byline_guests_redirect();
}

function byline_guests_render_notice(): void
{
    $key = 'byline_guests_notice_' . get_current_user_id();
    $notice = get_transient($key);
    if (!is_array($notice)) {
        return;
    }
    delete_transient($key);

    $class = ($notice['type'] ?? '') === 'error' ? 'notice-error' : 'notice-success';
    printf(
        '<div class="notice %1$s is-dismissible"><p>%2$s</p></div>',
        esc_attr($class),
        esc_html((string) ($notice['message'] ?? ''))
    );
}

function byline_guests_render_page(): void
{
    if (!byline_guest_can_manage()) {
        wp_die(esc_html__('You are not allowed to manage guest contributors.', 'weekly-wildcat-headless'), 403);
    }

    $action = isset($_GET['action']) ? sanitize_key((string) wp_unslash($_GET['action'])) : '';

    echo '<div class="wrap">';
    byline_guests_render_notice();

    if ($action === 'add' || $action === 'edit') {
        byline_guests_render_form(absint($_GET['guest'] ?? 0));
    } elseif ($action === 'merge') {
        byline_guests_render_merge(byline_guests_request_ids('guests'));
    } else {
        byline_guests_render_list();
    }

    echo '</div>';
}

function byline_guests_render_list(): void
{
    $table = byline_guests_list_table();
    $table->prepare_items();

    printf(
        '<h1 class="wp-heading-inline">%s</h1> <a href="%s" class="page-title-action">%s</a><hr class="wp-header-end">',
        esc_html__('Guest Contributors', 'weekly-wildcat-headless'),
        esc_url(byline_guests_admin_url(['action' => 'add'])),
        esc_html__('Add New', 'weekly-wildcat-headless')
    );
    echo '<p>' . esc_html__('One-off contributors, such as a photographer who is not on staff, who can be credited on stories. Add them from a story\'s Authors and contributors panel, or here. Select two or more to merge duplicates.', 'weekly-wildcat-headless') . '</p>';

    echo '<form method="post" action="' . esc_url(byline_guests_admin_url()) . '">';
    $table->display();
    echo '</form>';
}

function byline_guests_render_form(int $guest_id): void
{
    $guest = $guest_id > 0 ? byline_get_guest_contributor($guest_id) : null;
    if ($guest_id > 0 && $guest === null) {
        echo '<h1>' . esc_html__('Guest Contributors', 'weekly-wildcat-headless') . '</h1>';
        echo '<div class="notice notice-error"><p>' . esc_html__('That guest does not exist.', 'weekly-wildcat-headless') . '</p></div>';
        echo '<p><a href="' . esc_url(byline_guests_admin_url()) . '">' . esc_html__('Back to Guest Contributors', 'weekly-wildcat-headless') . '</a></p>';

        return;
    }

    $guest = is_array($guest) ? $guest : ['name' => '', 'role' => '', 'bio' => '', 'imageId' => 0, 'hasProfilePage' => false, 'status' => 'publish'];
    $image_id = absint($guest['imageId'] ?? 0);
    $image_url = $image_id > 0 ? byline_guest_image_url($image_id, 'medium') : '';
    $can_publish = byline_guest_can_publish();
    $title = $guest_id > 0 ? __('Edit Guest Contributor', 'weekly-wildcat-headless') : __('Add Guest Contributor', 'weekly-wildcat-headless');

    echo '<h1>' . esc_html($title) . '</h1>';
    echo '<form method="post" action="' . esc_url(byline_guests_admin_url()) . '">';
    wp_nonce_field('byline_guest_save');
    echo '<input type="hidden" name="action" value="save">';
    echo '<input type="hidden" name="guest_id" value="' . esc_attr((string) $guest_id) . '">';
    echo '<table class="form-table" role="presentation"><tbody>';

    echo '<tr><th scope="row"><label for="byline-guest-name">' . esc_html__('Name', 'weekly-wildcat-headless') . '</label></th>';
    echo '<td><input name="guest_name" id="byline-guest-name" type="text" class="regular-text" required value="' . esc_attr((string) $guest['name']) . '"></td></tr>';

    echo '<tr><th scope="row"><label for="byline-guest-role">' . esc_html__('Role', 'weekly-wildcat-headless') . '</label></th>';
    echo '<td><input name="guest_role" id="byline-guest-role" type="text" class="regular-text" placeholder="' . esc_attr__('Photographer', 'weekly-wildcat-headless') . '" value="' . esc_attr((string) ($guest['role'] ?? '')) . '">';
    echo '<p class="description">' . esc_html__('Optional. Shown under their name on the story.', 'weekly-wildcat-headless') . '</p></td></tr>';

    echo '<tr><th scope="row">' . esc_html__('Photo', 'weekly-wildcat-headless') . '</th><td>';
    printf(
        '<img class="byline-guest-photo-preview" id="byline-guest-photo-preview" alt="" src="%s"%s>',
        esc_url($image_url),
        $image_url === '' ? ' hidden' : ''
    );
    echo '<input type="hidden" name="guest_image_id" id="byline-guest-image-id" value="' . esc_attr((string) $image_id) . '">';
    echo '<button type="button" class="button" id="byline-guest-photo-select">' . esc_html__('Choose photo', 'weekly-wildcat-headless') . '</button> ';
    echo '<button type="button" class="button-link button-link-delete" id="byline-guest-photo-remove"' . ($image_id > 0 ? '' : ' hidden') . '>' . esc_html__('Remove photo', 'weekly-wildcat-headless') . '</button>';
    echo '</td></tr>';

    echo '<tr><th scope="row"><label for="byline-guest-bio">' . esc_html__('Short bio', 'weekly-wildcat-headless') . '</label></th>';
    echo '<td><textarea name="guest_bio" id="byline-guest-bio" rows="4" class="large-text">' . esc_textarea((string) ($guest['bio'] ?? '')) . '</textarea>';
    echo '<p class="description">' . esc_html__('Optional. Plain text.', 'weekly-wildcat-headless') . '</p></td></tr>';

    echo '<tr><th scope="row">' . esc_html__('Profile page', 'weekly-wildcat-headless') . '</th><td><label>';
    echo '<input type="checkbox" name="has_profile_page" value="1"' . checked(!empty($guest['hasProfilePage']), true, false) . '> ';
    echo esc_html__('Give this guest a public profile page', 'weekly-wildcat-headless') . '</label>';
    echo '<p class="description">' . esc_html__('Off for one-offs. Without a page they are credited by name and photo only and are left out of the authors directory.', 'weekly-wildcat-headless') . '</p></td></tr>';

    echo '<tr><th scope="row"><label for="byline-guest-status">' . esc_html__('Status', 'weekly-wildcat-headless') . '</label></th><td>';
    if ($can_publish) {
        echo '<select name="guest_status" id="byline-guest-status">';
        foreach (['publish' => __('Published', 'weekly-wildcat-headless'), 'draft' => __('Draft', 'weekly-wildcat-headless')] as $value => $label) {
            echo '<option value="' . esc_attr($value) . '"' . selected((string) ($guest['status'] ?? 'publish'), $value, false) . '>' . esc_html($label) . '</option>';
        }
        echo '</select>';
    } else {
        echo '<p>' . esc_html__('Saved as a draft. A publisher needs to publish a guest before their name appears on the site.', 'weekly-wildcat-headless') . '</p>';
    }
    echo '</td></tr>';

    echo '</tbody></table>';
    submit_button($guest_id > 0 ? __('Update Guest', 'weekly-wildcat-headless') : __('Add Guest', 'weekly-wildcat-headless'));
    echo '</form>';
    echo '<p><a href="' . esc_url(byline_guests_admin_url()) . '">' . esc_html__('Back to Guest Contributors', 'weekly-wildcat-headless') . '</a></p>';
    byline_guests_print_photo_script();
}

function byline_guests_print_photo_script(): void
{
    ?>
    <script>
        (function () {
            var select = document.getElementById('byline-guest-photo-select');
            var remove = document.getElementById('byline-guest-photo-remove');
            var input = document.getElementById('byline-guest-image-id');
            var preview = document.getElementById('byline-guest-photo-preview');
            if (!select || !window.wp || !wp.media) { return; }
            select.addEventListener('click', function (event) {
                event.preventDefault();
                var frame = wp.media({ title: <?php echo wp_json_encode(__('Choose a photo for this guest', 'weekly-wildcat-headless')); ?>, button: { text: <?php echo wp_json_encode(__('Use this photo', 'weekly-wildcat-headless')); ?> }, library: { type: 'image' }, multiple: false });
                frame.on('select', function () {
                    var attachment = frame.state().get('selection').first().toJSON();
                    input.value = attachment.id;
                    preview.src = attachment.sizes && attachment.sizes.medium ? attachment.sizes.medium.url : attachment.url;
                    preview.hidden = false;
                    remove.hidden = false;
                });
                frame.open();
            });
            remove.addEventListener('click', function (event) {
                event.preventDefault();
                input.value = '';
                preview.removeAttribute('src');
                preview.hidden = true;
                remove.hidden = true;
            });
        }());
    </script>
    <?php
}

/** @param array<int,int> $ids */
function byline_guests_render_merge(array $ids): void
{
    $guests = [];
    foreach (byline_list_guest_contributors() as $guest) {
        if (in_array((int) $guest['id'], $ids, true)) {
            $guests[] = $guest;
        }
    }

    echo '<h1>' . esc_html__('Merge Guest Contributors', 'weekly-wildcat-headless') . '</h1>';

    if (count($guests) < 2) {
        echo '<div class="notice notice-error"><p>' . esc_html__('Select at least two guests to merge.', 'weekly-wildcat-headless') . '</p></div>';
        echo '<p><a href="' . esc_url(byline_guests_admin_url()) . '">' . esc_html__('Back to Guest Contributors', 'weekly-wildcat-headless') . '</a></p>';

        return;
    }

    echo '<p>' . esc_html__('Choose the guest to keep. Every story that credits one of the others will credit this guest instead, and the others are then deleted. This cannot be undone.', 'weekly-wildcat-headless') . '</p>';
    echo '<form method="post" action="' . esc_url(byline_guests_admin_url()) . '">';
    wp_nonce_field('byline_guest_merge');
    echo '<input type="hidden" name="action" value="do_merge">';
    echo '<div class="byline-guest-merge-list">';
    foreach ($guests as $index => $guest) {
        $detail = array_filter([
            (string) ($guest['role'] ?? ''),
            sprintf(
                /* translators: %d: number of stories. */
                _n('%d story', '%d stories', (int) $guest['storyCount'], 'weekly-wildcat-headless'),
                (int) $guest['storyCount']
            ),
        ]);
        echo '<input type="hidden" name="guests[]" value="' . esc_attr((string) $guest['id']) . '">';
        echo '<label><input type="radio" name="primary" value="' . esc_attr((string) $guest['id']) . '"' . checked($index, 0, false) . '> ';
        echo '<strong>' . esc_html((string) $guest['name']) . '</strong> <span class="description">' . esc_html(implode(' · ', $detail)) . '</span></label>';
    }
    echo '</div>';
    submit_button(__('Merge Guests', 'weekly-wildcat-headless'), 'primary', 'submit', false);
    echo ' <a class="button" href="' . esc_url(byline_guests_admin_url()) . '">' . esc_html__('Cancel', 'weekly-wildcat-headless') . '</a>';
    echo '</form>';
}

function byline_guests_list_table(): WP_List_Table
{
    if (!class_exists('WP_List_Table')) {
        require_once ABSPATH . 'wp-admin/includes/class-wp-list-table.php';
    }

    if (!class_exists('Byline_Guests_List_Table')) {
        class Byline_Guests_List_Table extends WP_List_Table
        {
            public function __construct()
            {
                parent::__construct([
                    'singular' => 'guest',
                    'plural' => 'guests',
                    'ajax' => false,
                ]);
            }

            public function get_columns(): array
            {
                return [
                    'cb' => '<input type="checkbox">',
                    'name' => __('Name', 'weekly-wildcat-headless'),
                    'role' => __('Role', 'weekly-wildcat-headless'),
                    'byline_page' => __('Profile page', 'weekly-wildcat-headless'),
                    'byline_status' => __('Status', 'weekly-wildcat-headless'),
                    'byline_stories' => __('Stories', 'weekly-wildcat-headless'),
                ];
            }

            protected function get_bulk_actions(): array
            {
                return [
                    'bulk_merge' => __('Merge selected', 'weekly-wildcat-headless'),
                    'bulk_delete' => __('Delete', 'weekly-wildcat-headless'),
                ];
            }

            public function prepare_items(): void
            {
                $this->_column_headers = [$this->get_columns(), [], []];
                $this->items = byline_list_guest_contributors();
            }

            public function no_items(): void
            {
                esc_html_e('No guest contributors yet.', 'weekly-wildcat-headless');
            }

            /** @param array<string,mixed> $item */
            protected function column_cb($item): string
            {
                return sprintf(
                    '<input type="checkbox" name="guests[]" value="%d"><span class="screen-reader-text"> %s</span>',
                    (int) $item['id'],
                    esc_html((string) $item['name'])
                );
            }

            /** @param array<string,mixed> $item */
            protected function column_name($item): string
            {
                $id = (int) $item['id'];
                $image_id = absint($item['imageId'] ?? 0);
                $photo = $image_id > 0 && function_exists('wp_get_attachment_image')
                    ? wp_get_attachment_image($image_id, [36, 36], false, ['class' => 'byline-guest-thumb', 'alt' => ''])
                    : '';
                if ($photo === '') {
                    $photo = '<span class="byline-guest-initial" aria-hidden="true">' . esc_html(function_exists('mb_substr') ? mb_strtoupper(mb_substr((string) $item['name'], 0, 1)) : strtoupper(substr((string) $item['name'], 0, 1))) . '</span>';
                }

                $edit = byline_guests_admin_url(['action' => 'edit', 'guest' => $id]);
                $delete = wp_nonce_url(byline_guests_admin_url(['action' => 'delete', 'guest' => $id]), 'delete-guest_' . $id);
                $confirm = esc_js(__('Delete this guest? Stories that credit them will no longer show their name.', 'weekly-wildcat-headless'));

                $actions = [
                    'edit' => '<a href="' . esc_url($edit) . '">' . esc_html__('Edit', 'weekly-wildcat-headless') . '</a>',
                    'delete' => '<a href="' . esc_url($delete) . '" class="submitdelete" onclick="return confirm(\'' . $confirm . '\');">' . esc_html__('Delete', 'weekly-wildcat-headless') . '</a>',
                ];

                return '<div class="byline-guest-name">' . $photo . '<strong><a class="row-title" href="' . esc_url($edit) . '">' . esc_html((string) $item['name']) . '</a></strong></div>'
                    . $this->row_actions($actions);
            }

            /** @param array<string,mixed> $item */
            protected function column_role($item): string
            {
                return esc_html((string) ($item['role'] ?? '')) ?: '&mdash;';
            }

            /** @param array<string,mixed> $item */
            protected function column_byline_page($item): string
            {
                return !empty($item['hasProfilePage'])
                    ? esc_html__('Yes', 'weekly-wildcat-headless')
                    : esc_html__('No', 'weekly-wildcat-headless');
            }

            /** @param array<string,mixed> $item */
            protected function column_byline_status($item): string
            {
                return ($item['status'] ?? '') === 'publish'
                    ? esc_html__('Published', 'weekly-wildcat-headless')
                    : esc_html__('Draft', 'weekly-wildcat-headless');
            }

            /** @param array<string,mixed> $item */
            protected function column_byline_stories($item): string
            {
                return esc_html((string) (int) ($item['storyCount'] ?? 0));
            }
        }
    }

    return new Byline_Guests_List_Table();
}
