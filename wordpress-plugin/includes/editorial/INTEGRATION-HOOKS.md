# Editorial module integration hooks

The editorial slice is intentionally self-registering and does not require a
change to the main plugin bootstrap. `includes/editorial/rest.php` loads the
domain modules with `require_once` before registering the grouped REST routes.

For an integrator that prefers explicit includes, load these files after
`workflow.php` and before `rest.php`:

1. `collections.php` (compare-and-swap helper shared by the private story collections)
2. `story-context.php` (who may view a story's private context)
3. `planning.php`
4. `media.php`, then `media-assignments.php`
5. `tasks.php`
6. `coverage.php`
7. `readiness.php`
8. `corrections.php`
9. `feedback.php`
10. `contributors.php`
11. `reporting.php`, `resources.php`, then `workspace.php`

Each module registers its private post meta or hidden CPT on `init`. The REST
transport registers on `rest_api_init` through
`byline_editorial_register_rest_routes()`, which calls
`byline_editorial_register_extended_rest_routes()`. Public contributor and
correction fields are registered from that same callback, and the feedback CORS
filter is attached there as well.

`admin.php` remains the editor/admin glue. Its existing `admin_enqueue_scripts`,
`add_meta_boxes_post`, `save_post_post`, Posts-list, and `pre_get_posts` hooks
remain the registration points for the workflow editor surfaces. The main
bootstrap, admin app loader, central TypeScript entrypoints, integrations, and
design folders are deliberately outside this slice.

## Story Workspace actions

The reporting and production domains announce changes the same way the workflow
does; activity and notifications subscribe, and a subscriber failing never blocks
the write. See `docs/story-workspace.md`.

```php
do_action('byline_story_source_changed', $story_id, $source, $previous, $operation, $actor_id);
do_action('byline_story_appointment_changed', $story_id, $appointment, $previous, $operation, $actor_id);
do_action('byline_editorial_media_assignment_changed', $story_id, $assignment, $previous, $operation, $actor_id);
```

`$operation` is `created`, `updated` or `deleted`; `$previous` is `null` on create
and the removed record on delete. Records never include another user's email.
