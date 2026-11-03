<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Preparing newsletter issues requires publishing or editorial authority.
 * Return one capability so native menus and protected endpoints agree.
 */
function byline_newsletter_issue_capability(?int $user_id = null): string
{
    $can_edit_others = $user_id !== null && function_exists('user_can')
        ? user_can($user_id, 'edit_others_posts')
        : (function_exists('current_user_can') && current_user_can('edit_others_posts'));

    return $can_edit_others ? 'edit_others_posts' : 'publish_posts';
}

function byline_newsletter_can_edit_issues(): bool
{
    return function_exists('current_user_can') && current_user_can(byline_newsletter_issue_capability());
}
