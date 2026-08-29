# Browser coverage for Story workflow, Preview, and Planning

Most of the Story sidebar is covered without a browser: the mutation queue, the
Discord state projection, and the website lifecycle mapping have vitest suites
in `wordpress-plugin/tests-js/`, and the protected REST contract, the grouped
update rollback, and the deployment lifecycle have PHP regressions in
`wordpress-plugin/tests/`.

A handful of behaviours only exist once WordPress, the block editor, and the
protected endpoints are all real. Those live in `wordpress-plugin/tests/e2e/`;
the Playwright configuration remains in `wordpress-plugin/e2e/`.

## Running the harness

The harness is **opt-in**. It needs Docker (for `wp-env`) and downloaded
Playwright browsers, so it is deliberately not part of `npm test`.

```bash
npm run env:start
```

```bash
npx playwright install chromium && npm run test:e2e:wp71
```

Stop the environment with `npm run env:stop`.
`WP_BASE_URL`, `WP_ADMIN_USER`, and `WP_ADMIN_PASSWORD` override the `wp-env`
defaults (`http://localhost:8888`, `admin`, `password`).

`.wp-env.json` mounts this repository's plugin directory directly, so run
`npm run build:plugin` first: the editor loads `build/editorial-workflow.js`,
not `src/`. Use `npm run test:e2e:legacy` for the smaller WordPress 6.6
compatibility environment. The same suite runs in both environments; the
primary command uses WordPress 7.1 and the legacy command uses WordPress 6.6.

## What the specs cover

1. Open a draft, open the Story sidebar, and confirm the More menu has exactly
   one "Story" entry.
2. Change Stage, then type a Visual Note while the Stage request is still in
   flight. Both persist across a reload, and neither reports a conflict.
3. Secondary panels stay lazy until they are opened.
4. Publishing shows a queued/building website state, and Live only after the
   public manifest reports the expected revision.
5. A failed website update retries into the durable job system, once per click.
6. Preview as Byline saves the current draft first, renders saved content in
   the authenticated private preview, blocks public actions, and is not
   anonymously accessible.
7. Planning Quick View moves one story optimistically, persists it, rolls back
   a failed move without corrupting another story, and opens the full editor.

## Manual QA that still needs a person

These are not automated, in this harness or anywhere else. Run them against a
real WordPress install before shipping a release that touches the sidebar.

**Narrow sidebar widths.** Drag the editor sidebar to roughly 280px, 320px, and
360px, with the Story sidebar open and every panel expanded, and check:

- no horizontal scrollbar anywhere in the sidebar;
- Stage, Editor, Deadline, and Planned publication remain readable and usable,
  including the native date pickers;
- a long story title, a long editor name, and a long notice all wrap;
- buttons wrap rather than widening the panel;
- task rows keep usable controls;
- the correction, contributor, and distribution panels fit;
- keyboard focus rings stay visible on every control;
- a save or a lifecycle poll does not shift the layout under the pointer.

**Cross-user conflict.** Open the same story in two accounts. Change Stage in
one, then change it in the other. The second must show the reload notice with a
working "Reload workflow" button, not a silent overwrite.

**Real deployment.** With a genuine deploy hook configured, publish a story and
watch the post-publish panel move queued → building → live. Then point the hook
at a URL that returns a 4xx, publish again, and confirm Retry moves the panel
out of the failed state and that `wp byline jobs status` shows one deployment
job with a second attempt rather than two jobs.

**Discord.** Check the Discussion panel in all three states: integration not
configured (panel absent), configured with no thread for this story, and a
story with a linked thread (the "Open Discord thread" link).

**Screen readers.** Confirm the Story summary, the workflow status line, and the
post-publish status are announced when they change.
