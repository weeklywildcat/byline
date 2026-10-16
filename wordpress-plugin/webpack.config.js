// Admin, article preview, and Gutenberg entries share the local WordPress build.
const defaultConfig = require('@wordpress/scripts/config/webpack.config');
const path = require('path');

module.exports = {
  ...defaultConfig,
  module: {
    ...defaultConfig.module,
    rules: [
      // Point the site's /fonts URLs at the files on disk (see the loader).
      {
        test: /apps[\\/]web[\\/]views[\\/]fonts\.css$/,
        enforce: 'pre',
        loader: path.resolve(__dirname, 'loaders/site-font-urls.js'),
      },
      ...defaultConfig.module.rules,
    ],
  },
  // The default configuration resolves paths from process.cwd(). Anchoring both
  // ends to this file keeps the build correct however it is invoked.
  output: {
    ...defaultConfig.output,
    path: path.resolve(__dirname, 'build'),
  },
  entry: {
    index: path.resolve(__dirname, 'src/index.tsx'),
    'editorial-workflow': path.resolve(__dirname, 'src/editorial-workflow.tsx'),
    'article-preview': path.resolve(__dirname, 'src/article-preview.tsx'),
    'page-editor': path.resolve(__dirname, 'src/page-editor.tsx'),
    'editor-canvas': path.resolve(__dirname, 'src/editor-canvas/index.ts'),
    'blocks/page-section/index': path.resolve(__dirname, 'src/blocks/page-section/index.tsx'),
    'blocks/stories/index': path.resolve(__dirname, 'src/blocks/stories/index.tsx'),
    'blocks/people/index': path.resolve(__dirname, 'src/blocks/people/index.tsx'),
    'blocks/sports-schedule/index': path.resolve(__dirname, 'src/blocks/sports-schedule/index.tsx'),
    'blocks/events/index': path.resolve(__dirname, 'src/blocks/events/index.tsx'),
    'blocks/poll/index': path.resolve(__dirname, 'src/blocks/poll/index.tsx'),
    'blocks/game-score/index': path.resolve(__dirname, 'src/blocks/game-score/index.tsx'),
    'blocks/correction-notice/index': path.resolve(__dirname, 'src/blocks/correction-notice/index.tsx'),
  },
};
