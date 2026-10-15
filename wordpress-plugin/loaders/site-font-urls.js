// The Astro site serves its fonts from /fonts (apps/web/public/fonts), so
// apps/web/views/fonts.css uses root-relative URLs. The block editor is not on
// that origin, so the editor build rewrites them to the files on disk and lets
// webpack emit them next to the bundle. The site's own CSS stays untouched, and a
// font added there reaches the editor automatically.
const fontPrefix = 'url("/fonts/';
const publicFonts = 'url("../public/fonts/';

module.exports = function siteFontUrls(source) {
  const rewritten = source.split(fontPrefix).join(publicFonts);
  const stray = rewritten.match(/url\(\s*["']?\/(?!\/)[^)]*\)/);
  if (stray) {
    throw new Error(`apps/web/views/fonts.css has a root-relative URL the editor build cannot resolve: ${stray[0]}`);
  }
  return rewritten;
};
