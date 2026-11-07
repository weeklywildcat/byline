import {
  altFor,
  isArticleBlock,
  mediaKey,
  paragraphsFromText,
  periodStarts,
  safeHref,
  type ArticleBlockOf,
  type ArticleBlockType,
  type ArticleBody,
  type ArticleBodyNode,
  type ArticleMediaAsset,
  type Inline,
  type ListNode,
  type ProseNode
} from "@byline/article-body";
import { Fragment, type ReactNode } from "react";
import {
  ArticleBlockFrame,
  articleBlockPlacement,
  ArticleImage,
  CaptionText,
  DocumentFigure,
  documentFileFacts,
  GalleryLayout,
  PullQuoteView,
  ReportedQuoteView,
  StoryFigure,
  SupportingContext,
  TimelineItem,
  TimelineList
} from "./primitives";

/**
 * The canonical renderer for a `byline-v1` body. It reads only the semantic
 * ArticleBody (never a CMS document) and draws the shared primitives, so the
 * public site, Live Preview and the editor's parity harness agree by
 * construction. Unfinished blocks never reach it: adapters finalize blocks
 * first (`finalizeBlock`), and a block whose media is missing renders nothing.
 */

export type MediaTable = ArticleBody["media"];

const lookup = (media: MediaTable, id: unknown): ArticleMediaAsset | null => (id === null || id === undefined ? null : media[mediaKey(id as string | number)] ?? null);

/** Inline text: bold, italic, links and line breaks. Nothing else exists. */
export function InlineContent({ children }: { children: readonly Inline[] }): ReactNode {
  return children.map((child, index) => {
    if (child.type === "lineBreak") return <br key={index} />;
    if (child.type === "link") {
      const href = safeHref(child.href);
      const text = <InlineContent>{child.children}</InlineContent>;
      return href ? <a key={index} href={href}>{text}</a> : <Fragment key={index}>{text}</Fragment>;
    }
    let node: ReactNode = child.text;
    if (child.italic) node = <em>{node}</em>;
    if (child.bold) node = <strong>{node}</strong>;
    return <Fragment key={index}>{node}</Fragment>;
  });
}

function ListView({ list }: { list: ListNode }): ReactNode {
  const Tag = list.ordered ? "ol" : "ul";
  return (
    <Tag>
      {list.items.map((item, index) => (
        <li key={index}>
          <InlineContent>{item.children}</InlineContent>
          {item.list ? <ListView list={item.list} /> : null}
        </li>
      ))}
    </Tag>
  );
}

export function ProseView({ node }: { node: ProseNode }): ReactNode {
  switch (node.type) {
    case "paragraph":
      return <p><InlineContent>{node.children}</InlineContent></p>;
    case "heading": {
      const Tag = node.level === 3 ? "h3" : "h2";
      return <Tag><InlineContent>{node.children}</InlineContent></Tag>;
    }
    case "list":
      return <ListView list={node} />;
  }
}

/** Plain block text as paragraphs (quotes keep the writer's paragraph breaks). */
function TextParagraphs({ text }: { text: string }): ReactNode {
  return paragraphsFromText(text).map((paragraph, index) => <p key={index}><InlineContent>{paragraph.children}</InlineContent></p>);
}

type BlockRenderer<T extends ArticleBlockType> = (props: { block: ArticleBlockOf<T>; media: MediaTable }) => ReactNode;

/**
 * One renderer per registered block type. The `{ [K in ArticleBlockType] }`
 * type makes a new block type a compile error here until it has a renderer,
 * and tests check the map against the contract's registry.
 */
export const ARTICLE_BLOCK_RENDERERS: { [K in ArticleBlockType]: BlockRenderer<K> } = {
  photo: ({ block, media }) => {
    const asset = lookup(media, block.media);
    if (!asset) return null;
    return (
      <ArticleBlockFrame type="photo" placement={articleBlockPlacement(block)}>
        <StoryFigure className="byline-photo" media={<ArticleImage asset={asset} alt={altFor(asset, block.altOverride)} sizes={block.placement === "column" ? "(min-width: 800px) 760px, 100vw" : block.placement === "wide" ? "(min-width: 1080px) 1040px, 100vw" : "100vw"} />} caption={<CaptionText text={block.caption} />} credit={asset.credit} />
      </ArticleBlockFrame>
    );
  },
  gallery: ({ block, media }) => {
    const items = block.items.map((item) => ({ item, asset: lookup(media, item.media) })).filter((entry): entry is { item: typeof entry.item; asset: ArticleMediaAsset } => entry.asset !== null);
    if (!items.length) return null;
    return (
      <ArticleBlockFrame type="gallery" placement={articleBlockPlacement(block)}>
        <GalleryLayout count={items.length} fit={block.fit}>
          {items.map(({ item, asset }) => (
            <StoryFigure key={item.id} className="byline-gallery-item" media={<ArticleImage asset={asset} alt={altFor(asset, item.altOverride)} sizes="(min-width: 1080px) 520px, 100vw" />} caption={<CaptionText text={item.caption} />} credit={asset.credit} />
          ))}
        </GalleryLayout>
      </ArticleBlockFrame>
    );
  },
  reportedQuote: ({ block }) => (
    <ArticleBlockFrame type="reportedQuote">
      <ReportedQuoteView text={<TextParagraphs text={block.text} />} attribution={block.attribution} />
    </ArticleBlockFrame>
  ),
  pullQuote: ({ block }) => (
    <ArticleBlockFrame type="pullQuote">
      <PullQuoteView text={<TextParagraphs text={block.text} />} attribution={block.attribution} />
    </ArticleBlockFrame>
  ),
  keyFacts: ({ block }) => (
    <ArticleBlockFrame type="keyFacts">
      <SupportingContext kind="keyFacts" headingId={`${block.id}-heading`} heading={block.heading}>
        <ul>
          {block.facts.map((fact) => <li key={fact.id}>{fact.text}</li>)}
        </ul>
      </SupportingContext>
    </ArticleBlockFrame>
  ),
  context: ({ block }) => (
    <ArticleBlockFrame type="context">
      <SupportingContext kind="context" headingId={`${block.id}-heading`} heading={block.heading}>
        {block.body.map((paragraph, index) => <p key={index}><InlineContent>{paragraph.children}</InlineContent></p>)}
      </SupportingContext>
    </ArticleBlockFrame>
  ),
  document: ({ block, media }) => {
    const asset = lookup(media, block.media);
    if (!asset) return null;
    const title = block.title || asset.filename;
    return (
      <ArticleBlockFrame type="document">
        <DocumentFigure
          details={
            <>
              <p className="byline-document-title"><a href={asset.src}>{title}</a></p>
              {block.context ? <p className="byline-document-context">{block.context}</p> : null}
              {block.source ? <p className="byline-document-source">Source: {block.source}</p> : null}
              {block.pages.length ? (
                <ul className="byline-document-pages" aria-label="Pages to read">
                  {block.pages.map((ref) => (
                    <li key={ref.id}>
                      <a href={`${asset.src}#page=${ref.page}`}>Page {ref.page}</a>
                      {ref.label ? <span>{ref.label}</span> : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          }
          actions={
            <>
              <a className="byline-document-open" href={asset.src}>Open the document</a>
              <span className="byline-document-file">{documentFileFacts(asset)}</span>
            </>
          }
          preview={<object data={`${asset.src}#view=FitH`} type="application/pdf" aria-label={title} tabIndex={-1} />}
        />
      </ArticleBlockFrame>
    );
  },
  timeline: ({ block }) => {
    const starts = periodStarts(block.items);
    return (
      <ArticleBlockFrame type="timeline">
        <TimelineList>
          {block.items.map((event, index) => (
            <TimelineItem
              key={event.id}
              current={event.current}
              newPeriod={starts[index] ?? false}
              label={event.label ? <p className="byline-timeline-label">{event.label}</p> : null}
              title={event.title ? <h3 className="byline-timeline-title">{event.title}</h3> : null}
              body={event.body ? <p className="byline-timeline-body">{event.body}</p> : null}
            />
          ))}
        </TimelineList>
      </ArticleBlockFrame>
    );
  }
};

export function ArticleBodyNodeView({ node, media }: { node: ArticleBodyNode; media: MediaTable }): ReactNode {
  if (!isArticleBlock(node)) return <ProseView node={node} />;
  const Render = ARTICLE_BLOCK_RENDERERS[node.type] as BlockRenderer<typeof node.type>;
  return <Render block={node as never} media={media} />;
}

/** The nodes of a body, for a host that supplies its own `.article-body` element. */
export function ArticleBodyContent({ body }: { body: ArticleBody }): ReactNode {
  return body.nodes.map((node, index) => <ArticleBodyNodeView key={isArticleBlock(node) ? node.id : `n${index}`} node={node} media={body.media} />);
}

/** A whole structured body in its `.article-body` element. Place it inside `.byline-article-view`. */
export function StructuredArticleBody({ body }: { body: ArticleBody }): ReactNode {
  return (
    <div className="article-body">
      <ArticleBodyContent body={body} />
    </div>
  );
}
