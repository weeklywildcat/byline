# GitHub Actions and GitHub Pages

This recipe builds the static site in GitHub Actions and publishes it to
GitHub Pages. The copyable workflow is
[`github-actions.yml`](github-actions.yml); copy it to
`.github/workflows/byline-static-site.yml` in the repository.

Official references: [GitHub custom Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages),
[GitHub Pages publishing sources](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site),
and [repository dispatch events](https://docs.github.com/en/rest/repos/repos#create-a-repository-dispatch-event).

## Configure the Pages project

Enable GitHub Pages with **GitHub Actions** as the publishing source. The
copyable workflow assumes `main`; replace `main` in its `push` trigger if a
different branch is your production branch. Prefer a
custom domain or an organization/user Pages site so the public URL is served at
the domain root. The Byline export is configured for root-relative routes; a
repository subpath such as `https://owner.github.io/repository/` requires
additional base-path work that is outside this recipe.

Create repository **Variables**—not Secrets—for these public endpoint values.
The build job reads repository variables; the `github-pages` environment is used
only by the final Pages deployment job:

```text
BYLINE_WP_API_URL=https://cms.example.edu/wp-json/wp/v2
BYLINE_SITE_URL=https://news.example.edu
BYLINE_PUBLICATION_URL=https://cms.example.edu/wp-json/byline/v1/publication
```

The workflow maps them to the frontend's exact names. They identify public
endpoints and are expected to be present in the build environment. Do not put
CMS credentials, hook URLs, or relay tokens in these variables.

The workflow also sets `WORDPRESS_FETCH_CACHE_KEY` to `github.sha`. If your CMS
or an intermediate cache needs a new value for repeated builds of the same
commit, change that line to a per-run value such as
`${{ github.run_id }}`.

## Triggering from WordPress

GitHub Actions does not provide an unauthenticated incoming deploy-hook URL.
Do not paste the GitHub REST API URL into Byline: `repository_dispatch` requires
authentication and a JSON body, while Byline's Generic Deploy Hook sends a
provider-neutral POST.

For automatic publication builds, use a private HTTPS relay that:

1. accepts the Byline POST at an opaque, revocable URL;
2. keeps its GitHub token in the relay's secret store;
3. maps the Byline headers into a `repository_dispatch` request with
   `event_type: byline-publish` and optional revision/reason metadata; and
4. returns a 2xx response only after GitHub accepts the dispatch.

Save the relay URL as the private hook in **Byline → Integrations → Deployment**.
The relay is deployment infrastructure, not a Byline public build variable.
If automatic builds are not needed yet, `workflow_dispatch` in the example can
be run manually, but the WordPress deployment lifecycle will remain queued or
unknown until the resulting manifest is live.

## Polls

GitHub Pages serves static files and cannot run the included Cloudflare Worker.
If polls are enabled, deploy an equivalent same-origin poll proxy separately,
or use the Cloudflare Worker/public host profile. Without a runtime for
`/api/polls/active` and `/api/polls/vote`, disable polls for the GitHub Pages
deployment.

## Verify

After the workflow succeeds and the custom domain is serving the Pages
environment, run the exact revision comparison in
[`docs/getting-started.md`](../../docs/getting-started.md#7-verify-the-exact-public-revision).
