<?php

if (!defined('ABSPATH')) {
    exit;
}

const BYLINE_MANAGE_CAPABILITY = 'manage_byline';
const BYLINE_EDIT_DESIGN_CAPABILITY = 'edit_byline_design';
const BYLINE_PUBLISH_DESIGN_CAPABILITY = 'publish_byline_design';
const BYLINE_MANAGE_INTEGRATIONS_CAPABILITY = 'manage_byline_integrations';
const BYLINE_CAPABILITIES_VERSION_OPTION = 'byline_capabilities_version';
const BYLINE_CAPABILITIES_VERSION = 2;

function byline_capabilities(): array
{
    return [
        BYLINE_MANAGE_CAPABILITY,
        BYLINE_EDIT_DESIGN_CAPABILITY,
        BYLINE_PUBLISH_DESIGN_CAPABILITY,
        BYLINE_MANAGE_INTEGRATIONS_CAPABILITY,
    ];
}

function byline_administrator_capabilities_ready(): bool
{
    $role = get_role('administrator');
    if (!$role instanceof WP_Role) {
        return false;
    }

    foreach (byline_capabilities() as $capability) {
        if (!$role->has_cap($capability)) {
            return false;
        }
    }

    return true;
}

function byline_add_administrator_capabilities(): bool
{
    $role = get_role('administrator');
    if (!$role instanceof WP_Role) {
        return false;
    }

    foreach (byline_capabilities() as $capability) {
        $role->add_cap($capability);
    }

    // Polls carry their own newsroom capability family, granted to the roles
    // that actually run a newsroom rather than to site administrators only.
    if (function_exists('byline_poll_add_role_capabilities')) {
        byline_poll_add_role_capabilities();
    }

    // The upgrade coordinator writes the marker only after this function has
    // completed and verified the step. Keeping the mutation here is retained
    // for activation/backward-compatible callers, but a missing role must not
    // make a failed capability install look complete.
    update_option(BYLINE_CAPABILITIES_VERSION_OPTION, BYLINE_CAPABILITIES_VERSION, false);

    return true;
}

function byline_maybe_upgrade_capabilities(): void
{
    if ((int) get_option(BYLINE_CAPABILITIES_VERSION_OPTION, 0) < BYLINE_CAPABILITIES_VERSION) {
        byline_add_administrator_capabilities();
    }
}
