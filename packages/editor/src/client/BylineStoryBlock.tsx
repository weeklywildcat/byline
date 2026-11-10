"use client";

import { isArticleBlockType, type ArticleBlockType } from "@byline/article-body";
import { useBlockComponentContext } from "@payloadcms/richtext-lexical/client";
import type { ComponentType } from "react";
import { DataProjectEditor } from "./blocks/data-project";
import { DocumentEditor } from "./blocks/document";
import { AudioEditor, ChartMapEditor, RepositoryInteractiveEditor, RepositoryTrackerEditor, VideoEditor } from "./blocks/embeds";
import { ComparisonEditor, EditorsNoteEditor, ExpandableEditor, KeyNumbersEditor, MarginNoteEditor } from "./blocks/explain";
import { EventEditor, PollEditor, RelatedCoverageEditor } from "./blocks/relations";
import { FinalScoreEditor } from "./blocks/score";
import { SocialPostEditor } from "./blocks/social";
import { DataTableEditor } from "./blocks/table";
import { AnnotatedImageEditor, BeforeAfterEditor, PortraitTextEditor, VisualChapterEditor } from "./blocks/visual";
import { GalleryEditor, PhotoEditor } from "./blocks/media";
import type { BlockEditorProps } from "./blocks/shared";
import { ContextEditor, KeyFactsEditor, PullQuoteEditor, ReportedQuoteEditor } from "./blocks/text";
import { TimelineEditor } from "./blocks/timeline";
import { useBlockNode } from "./lexical";

/**
 * One editor per registered block type. Typed against the contract's
 * registry, so a new block type is a compile error here until it has an
 * editor (and a test checks the map against the registry too).
 */
export const BLOCK_EDITORS: { readonly [K in ArticleBlockType]: ComponentType<BlockEditorProps> } = {
  photo: PhotoEditor,
  gallery: GalleryEditor,
  reportedQuote: ReportedQuoteEditor,
  pullQuote: PullQuoteEditor,
  keyFacts: KeyFactsEditor,
  context: ContextEditor,
  document: DocumentEditor,
  timeline: TimelineEditor,
  portraitText: PortraitTextEditor,
  visualChapter: VisualChapterEditor,
  video: VideoEditor,
  audio: AudioEditor,
  editorsNote: EditorsNoteEditor,
  marginNote: MarginNoteEditor,
  expandable: ExpandableEditor,
  chartMap: ChartMapEditor,
  dataTable: DataTableEditor,
  comparison: ComparisonEditor,
  keyNumbers: KeyNumbersEditor,
  annotatedImage: AnnotatedImageEditor,
  beforeAfter: BeforeAfterEditor,
  relatedCoverage: RelatedCoverageEditor,
  poll: PollEditor,
  repositoryInteractive: RepositoryInteractiveEditor,
  repositoryTracker: RepositoryTrackerEditor,
  dataProject: DataProjectEditor,
  event: EventEditor,
  socialPost: SocialPostEditor,
  finalScore: FinalScoreEditor
};

/**
 * Payload renders this for every Byline block (`admin.components.Block`)
 * inside the block's decorator. It finds the Lexical node it belongs to and
 * hands it to that block's editor; Payload's generic block form never shows.
 */
export function BylineStoryBlock() {
  const { nodeKey } = useBlockComponentContext();
  const node = useBlockNode(nodeKey);
  const type = node.fields?.blockType;
  if (!node.fields || !isArticleBlockType(type)) return null;
  const Editor = BLOCK_EDITORS[type];
  const id = typeof node.fields.id === "string" && node.fields.id ? node.fields.id : nodeKey;
  return <Editor node={node} id={id} nodeKey={nodeKey} />;
}
