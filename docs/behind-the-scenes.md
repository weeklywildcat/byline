# Off Deadline

**Stories behind the stories**

Publish a normal WordPress post with the **Off Deadline** category (slug
`behind-the-scenes`). Byline creates the category when a user who can manage
categories opens WordPress admin after the plugin update. Existing category
custom names are preserved. The original Behind the Scenes category is renamed
in place, retaining its term ID, slug, article assignments and article URLs.

Posts appear at `/off-deadline/`, in site search, on author pages and in
the XML sitemap, using the existing article renderer and URLs. The footer links
to the section. Once published posts exist, the bottom of the homepage shows
the latest two; the section is absent when empty.

BTS membership overrides other categories for automatic placement: these posts
are excluded from the main homepage packages, other category archives, All
Stories, Watch, general RSS, related stories and More by author recommendations.
Author profile story lists still include them. Coverage story lists also exclude
them. `/behind-the-scenes/` and the category archive URL redirect to the dedicated page.

The empty BTS page is `noindex` and omitted from the sitemap until there is a
published post. Individual posts keep normal article metadata and indexing.
All public output is generated from the existing build snapshot; publishing uses
the usual rebuild workflow.
