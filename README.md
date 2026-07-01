# Weekly Wildcat Byline

Next.js frontend for the Weekly Wildcat WordPress CMS.

## Local Development

Copy `.env.example` to `.env.local` if you need to change the CMS or public site URL. The defaults point at the live CMS:

```txt
NEXT_PUBLIC_WP_API_URL=https://cms.weeklywildcat.com/wp-json/wp/v2
NEXT_PUBLIC_SITE_URL=https://weeklywildcat.com
```

Run the site locally:

```sh
npm run dev
```

Build the static export:

```sh
npm run build
```

The exported site is written to `out/`.
