/**
 * Two independent WordPress entries.
 *
 * `index` is the Byline admin/Studio application. It is large by nature — Puck,
 * the shared theme packages, the whole design surface — and it belongs only on
 * Byline's own admin screens.
 *
 * `editorial-workflow` is the block-editor integration. It loads on every post
 * editor, so it stays deliberately small: WordPress packages are externalised by
 * the default @wordpress/scripts configuration, which means this entry ships no
 * React and no component library of its own.
 */
const defaultConfig = require('@wordpress/scripts/config/webpack.config');
const path = require('path');

module.exports = {
  ...defaultConfig,
  // The default configuration resolves paths from process.cwd(). Anchoring both
  // ends to this file keeps the build correct however it is invoked.
  output: {
    ...defaultConfig.output,
    path: path.resolve(__dirname, 'build'),
  },
  entry: {
    index: path.resolve(__dirname, 'src/index.tsx'),
    'editorial-workflow': path.resolve(__dirname, 'src/editorial-workflow.tsx'),
    'page-editor': path.resolve(__dirname, 'src/page-editor.tsx'),
    'blocks/page-section/index': path.resolve(__dirname, 'src/blocks/page-section/index.tsx'),
  },
};
