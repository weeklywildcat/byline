// Admin, article preview, and Gutenberg entries share the local WordPress build.
const defaultConfig = require('@wordpress/scripts/config/webpack.config');
const path = require('path');
const DependencyExtractionWebpackPlugin = require('@wordpress/dependency-extraction-webpack-plugin');
const homeCss = path.resolve(__dirname, 'src/home/style.css');
const cssRule = defaultConfig.module.rules.find((rule) => rule.test?.test('style.css'));

const adminConfig = {
  name: 'admin',
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
      {
        ...cssRule,
        include: homeCss,
        use: cssRule.use.map((entry) => entry.loader?.includes('postcss-loader') ? {
          ...entry,
          options: {
            postcssOptions: {
              plugins: [require('@tailwindcss/postcss')(), require('postcss-nesting')(), require('./loaders/home-postcss')],
            },
          },
        } : entry),
      },
      ...defaultConfig.module.rules.map((rule) => rule === cssRule ? { ...rule, exclude: homeCss } : rule),
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
    'story-block-variations': path.resolve(__dirname, 'src/story-block-variations/index.ts'),
    'blocks/table-of-contents/index': path.resolve(__dirname, 'src/blocks/table-of-contents/index.tsx'),
    'blocks/visualization/index': path.resolve(__dirname, 'src/blocks/visualization/index.tsx'),
    'blocks/annotated-image/index': path.resolve(__dirname, 'src/blocks/annotated-image/index.tsx'),
    'blocks/before-after/index': path.resolve(__dirname, 'src/blocks/before-after/index.tsx'),
    'blocks/scrolly/index': path.resolve(__dirname, 'src/blocks/scrolly/index.tsx'),
    'blocks/scrolly-step/index': path.resolve(__dirname, 'src/blocks/scrolly-step/index.tsx'),
    'blocks/timeline/index': path.resolve(__dirname, 'src/blocks/timeline/index.tsx'),
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

// Core still ships React 18 on supported installations. Home owns one private
// React 19 root; its primitives never receive WordPress React elements. apiFetch
// remains the WordPress-provided, nonce-authenticated transport.
const homeConfig = {
  ...adminConfig,
  name: 'home',
  dependencies: ['admin'],
  entry: { home: path.resolve(__dirname, 'src/home-entry.tsx') },
  output: { ...adminConfig.output, clean: false },
  plugins: adminConfig.plugins.filter((plugin) => !['DependencyExtractionWebpackPlugin', 'CopyPlugin', 'PhpFilePathsPlugin'].includes(plugin.constructor.name)).concat([
    new DependencyExtractionWebpackPlugin({
      useDefaults: false,
      requestToExternal: (request) => request === '@wordpress/api-fetch' ? ['wp', 'apiFetch'] : undefined,
      requestToHandle: (request) => request === '@wordpress/api-fetch' ? 'wp-api-fetch' : undefined,
    }),
  ]),
};
module.exports = [adminConfig, homeConfig];
