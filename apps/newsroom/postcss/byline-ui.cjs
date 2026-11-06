// Next.js applies one PostCSS config to every stylesheet, Payload's included.
// Byline's Nova styles must be compiled by Tailwind and scoped to
// `.byline-ui-root`; Payload's must be left exactly as shipped. This plugin runs
// the Nova pipeline only for stylesheets in src/ui/ and passes everything else
// through untouched.
const postcss = require("postcss");
const tailwind = require("@tailwindcss/postcss");
const nesting = require("postcss-nesting");
const scope = require("@byline/newsroom-ui/postcss-scope");

const BYLINE_STYLESHEET = /[\\/]apps[\\/]newsroom[\\/]src[\\/]ui[\\/][^\\/]+\.css$/;

module.exports = () => ({
  postcssPlugin: "byline-ui",
  async Once(root, { result }) {
    const file = root.source?.input.file ?? "";
    if (!BYLINE_STYLESHEET.test(file)) return;
    const compiled = await postcss([tailwind(), nesting(), scope]).process(root.toString(), { from: file });
    root.removeAll();
    root.append(compiled.root.nodes);
    // Keep Tailwind's file/dir dependencies so dev rebuilds when a component changes.
    for (const message of compiled.messages) result.messages.push(message);
  }
});
module.exports.postcss = true;
