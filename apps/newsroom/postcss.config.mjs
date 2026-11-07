import { fileURLToPath } from "node:url";

// See postcss/byline-ui.cjs: Nova styles only, Payload's CSS untouched.
// Turbopack loads plugins from inside .next, so the plugin is named by absolute path.
const bylineUi = fileURLToPath(new URL("./postcss/byline-ui.cjs", import.meta.url));

export default { plugins: { [bylineUi]: {} } };
