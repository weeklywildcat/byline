/**
 * Chart / Map provider allowlist, heights and URL normalization. The
 * implementation is the dependency-free contract's (`@byline/article-body`),
 * because publishing readiness needs the same rules; this module keeps the
 * `@byline/ui/visualization` import path the WordPress blocks and the
 * enhancement scripts already use.
 */
export {
  visualizationHeight,
  visualizationHeights,
  visualizationMessageHeight,
  visualizationPieceName,
  visualizationPreviewNote,
  visualizationProviders,
  visualizationUrl,
  type VisualizationPreset,
  type VisualizationProvider
} from "@byline/article-body";
