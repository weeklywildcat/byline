// Next.js applies one PostCSS config to every stylesheet, Payload's included.
// Byline's Nova styles must be compiled by Tailwind and scoped to
// `.byline-ui-root`; Payload's must be left exactly as shipped. This plugin runs
// the Nova pipeline only for stylesheets in src/ui/ and passes everything else
// through untouched.
const postcss = require("postcss");
const tailwind = require("@tailwindcss/postcss");
const nesting = require("postcss-nesting");
const scope = require("@byline/newsroom-ui/postcss-scope");

// Payload pins the admin's root font size to 13px. Nova is sized in rem against
// the browser's 16px, as in the WordPress admin, so Byline compiles its rem
// values to px: the same pixels in either host, without resizing Payload's UI.
const REM = /(^|[^\w.-])(-?(?:\d+\.?\d*|\.\d+))rem\b/g;
const fixedRem = {
  postcssPlugin: "byline-ui-fixed-rem",
  Declaration(declaration) {
    if (declaration.value.includes("rem")) declaration.value = declaration.value.replace(REM, (_match, before, number) => `${before}${Number((parseFloat(number) * 16).toFixed(4))}px`);
  }
};

const BYLINE_STYLESHEET = /[\\/]apps[\\/]newsroom[\\/]src[\\/]ui[\\/][^\\/]+\.css$/;

module.exports = () => ({
  postcssPlugin: "byline-ui",
  async Once(root, { result }) {
    const file = root.source?.input.file ?? "";
    if (!BYLINE_STYLESHEET.test(file)) return;
    const compiled = await postcss([tailwind(), nesting(), scope, fixedRem]).process(root.toString(), { from: file });
    root.removeAll();
    root.append(compiled.root.nodes);
    // Keep Tailwind's file/dir dependencies so dev rebuilds when a component changes.
    for (const message of compiled.messages) result.messages.push(message);
  }
});
module.exports.postcss = true;
