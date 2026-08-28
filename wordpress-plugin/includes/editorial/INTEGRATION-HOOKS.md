# Editorial module integration hooks

The editorial slice is intentionally self-registering and does not require a
change to the main plugin bootstrap. `includes/editorial/rest.php` loads the
domain modules with `require_once` before registering the grouped REST routes.

For an integrator that prefers explicit includes, load these files after
`workflow.php` and before `rest.php`:

1. `planning.php`
2. `media.php`
3. `tasks.php`
4. `coverage.php`
5. `readiness.php`
6. `corrections.php`
7. `feedback.php`
8. `contributors.php`

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
