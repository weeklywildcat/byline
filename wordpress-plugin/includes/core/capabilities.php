<?php

if (!defined('ABSPATH')) {
    exit;
}

const BYLINE_MANAGE_CAPABILITY = 'manage_byline';
const BYLINE_EDIT_DESIGN_CAPABILITY = 'edit_byline_design';
const BYLINE_PUBLISH_DESIGN_CAPABILITY = 'publish_byline_design';
const BYLINE_MANAGE_INTEGRATIONS_CAPABILITY = 'manage_byline_integrations';
const BYLINE_CAPABILITIES_VERSION_OPTION = 'byline_capabilities_version';
const BYLINE_CAPABILITIES_VERSION = 1;

function byline_capabilities(): array
{
    return [
        BYLINE_MANAGE_CAPABILITY,
        BYLINE_EDIT_DESIGN_CAPABILITY,
        BYLINE_PUBLISH_DESIGN_CAPABILITY,
        BYLINE_MANAGE_INTEGRATIONS_CAPABILITY,
    ];
}

function byline_add_administrator_capabilities(): void
{
    $role = get_role('administrator');
    if (!$role instanceof WP_Role) {
        return;
    }

    foreach (byline_capabilities() as $capability) {
        $role->add_cap($capability);
    }

    update_option(BYLINE_CAPABILITIES_VERSION_OPTION, BYLINE_CAPABILITIES_VERSION, false);
}

function byline_maybe_upgrade_capabilities(): void
{
    if ((int) get_option(BYLINE_CAPABILITIES_VERSION_OPTION, 0) < BYLINE_CAPABILITIES_VERSION) {
        byline_add_administrator_capabilities();
    }
}
add_action('admin_init', 'byline_maybe_upgrade_capabilities');

