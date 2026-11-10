import {
  altFor,
  collectFootnotes,
  collectSources,

  isDocumentAsset,
  sortChapters,
  sourceAnchor,
  sourceHref,
  sourceRefAnchor,
  webUrlHost,
  footnoteAnchor,
  footnoteRefAnchor,
  isArticleBlock,
  mediaKey,
  paragraphsFromText,
  periodStarts,
  safeHref,
  visualizationPieceName,
  EDITORS_NOTE_LABEL,
  type ArticleBlockOf,
  type ArticleBlockType,
  type ArticleBody,
  type ArticleBodyNode,
  type ArticleMediaAsset,
  type ArticleReferences,
  type Inline,
  type ListNode,
  type ParagraphNode,
  type ProseNode,
  type PublicPollReference
} from "@byline/article-body";
import { Fragment, type ReactNode } from "react";
import {
  AnnotatedImageFigure,
  annotationAnchor,
  ArticleBlockFrame,
  articleBlockPlacement,
  ArticleImage,
  AudioFigure,
  BeforeAfterFigure,
  CaptionText,
  ChartMapFigure,
  ComparisonView,
  DataTableView,
  DocumentFigure,
  documentFileFacts,
  EditorsNoteView,
  ExpandableView,
  GalleryLayout,
  KeyNumbersView,
  MarginNoteView,
  PortraitTextFigure,
  PullQuoteView,
  RelatedCoverageView,
  RepositoryInteractiveFigure,
  ReportedQuoteView,
  StoryFigure,
  SupportingContext,
  TimelineItem,
  TimelineList,
  VideoFigure,
  VisualChapterView,
  YouTubePlayer,
  youTubeWatch
} from "./primitives";
import { ChartDataTable, DataProjectFigure, EventView, FinalScoreView, finalScoreDetails, MediaChapters, NativeChart, RepositoryTrackerFigure, SocialPostFigure } from "./tools";

/**
 * The canonical renderer for a `byline-v1` body. It reads only the semantic
 * ArticleBody (never a CMS document) and draws the shared primitives, so the
 * public site, Live Preview and the editor's parity harness agree by
 * construction. Unfinished blocks never reach it: adapters finalize blocks
 * first (`finalizeBlock`), and a block whose media is missing renders nothing.
 */

export type MediaTable = ArticleBody["media"];

/**
 * What a host may add to rendering without the renderer knowing the host:
 * how dates read in this publication, and how a registered repository
 * interactive draws its static fallback (the public site and the newsroom
 * supply their own registry; the renderer never imports one).
 */
export type ArticleRenderHost = {
  imageSources?: (asset: ArticleMediaAsset, sizes?: string) => { src: string; srcSet?: string } | undefined;
  formatDate?: (iso: string) => string;
  /** The publication's timezone and locale, for event times (UTC and en-US when absent). */
  timeZone?: string;
  locale?: string;
  renderInteractive?: (block: ArticleBlockOf<"repositoryInteractive">) => ReactNode;
  /** A registered repository tracker's server-rendered content. */
  renderTracker?: (block: ArticleBlockOf<"repositoryTracker">) => ReactNode;
  /**
   * A published Data Project drawn by the host: its heading, description,
   * the project's own server-rendered presentation and its notes. The host
   * resolves the project from the same published Data the project's page
   * uses; this renderer never imports Data, Payload or a presentation. A
   * harness without a Data host gets the story's own words, no data.
   */
  renderDataProject?: (block: ArticleBlockOf<"dataProject">) => ReactNode;
  /** True in a private preview: social posts keep their facade and never offer to load. */
  preview?: boolean;
};

type BlockContext = { references: ArticleReferences; footnotes: Record<string, number>; host: ArticleRenderHost };

const defaultFormatDate = (iso: string): string => new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(iso));

const lookup = (media: MediaTable, id: unknown): ArticleMediaAsset | null => (id === null || id === undefined ? null : media[mediaKey(id as string | number)] ?? null);

function BodyImage({ asset, host, alt, sizes }: { asset: ArticleMediaAsset; host: ArticleRenderHost; alt: string; sizes?: string }) {
  const sources = host.imageSources?.(asset, sizes);
  return <ArticleImage asset={sources ? { ...asset, src: sources.src } : asset} srcSet={sources?.srcSet} alt={alt} sizes={sizes} />;
}

/** Inline text: bold, italic, links, line breaks, footnote and source references. Nothing else exists. */
export function InlineContent({ children, footnotes = {}, sources = {} }: { children: readonly Inline[]; footnotes?: Record<string, number>; sources?: Record<string, number> }): ReactNode {
  return children.map((child, index) => {
    if (child.type === "lineBreak") return <br key={index} />;
    if (child.type === "source") {
      const number = sources[child.id];
      if (number === undefined) return null;
      return (
        <sup key={index} className="byline-source-ref">
          <a id={sourceRefAnchor(child.id)} href={`#${sourceAnchor(child.id)}`} aria-label={`Source ${number}: ${child.label}`}>[{number}]</a>
        </sup>
      );
    }
    if (child.type === "footnote") {
      const number = footnotes[child.id];
      if (number === undefined) return null;
      return (
        <sup key={index} className="byline-footnote-ref">
          <a id={footnoteRefAnchor(child.id)} href={`#${footnoteAnchor(child.id)}`} aria-label={`Footnote ${number}`}>{number}</a>
        </sup>
      );
    }
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

function ListView({ list, footnotes, sources }: { list: ListNode; footnotes: Record<string, number>; sources: Record<string, number> }): ReactNode {
  const Tag = list.ordered ? "ol" : "ul";
  return (
    <Tag>
      {list.items.map((item, index) => (
        <li key={index}>
          <InlineContent footnotes={footnotes} sources={sources}>{item.children}</InlineContent>
          {item.list ? <ListView list={item.list} footnotes={footnotes} sources={sources} /> : null}
        </li>
      ))}
    </Tag>
  );
}

export function ProseView({ node, footnotes = {}, sources = {} }: { node: ProseNode; footnotes?: Record<string, number>; sources?: Record<string, number> }): ReactNode {
  switch (node.type) {
    case "paragraph":
      return <p><InlineContent footnotes={footnotes} sources={sources}>{node.children}</InlineContent></p>;
    case "heading": {
      const Tag = node.level === 3 ? "h3" : "h2";
      return <Tag><InlineContent footnotes={footnotes} sources={sources}>{node.children}</InlineContent></Tag>;
    }
    case "list":
      return <ListView list={node} footnotes={footnotes} sources={sources} />;
  }
}

/** Plain block text as paragraphs (quotes keep the writer's paragraph breaks). */
export function TextParagraphs({ text }: { text: string }): ReactNode {
  return paragraphsFromText(text).map((paragraph, index) => <p key={index}><InlineContent>{paragraph.children}</InlineContent></p>);
}

/** A block's stored paragraphs. */
export function BodyParagraphs({ body }: { body: readonly ParagraphNode[] }): ReactNode {
  return body.map((paragraph, index) => <p key={index}><InlineContent>{paragraph.children}</InlineContent></p>);
}


/** A poll as the page draws it before any script runs: its question and answers, or its results once closed. */
export function PollBlockView({ blockId, poll }: { blockId: string; poll: PublicPollReference }): ReactNode {
  const id = `${blockId}-heading`;
  const total = poll.results?.totalVotes ?? 0;
  return (
    <section className="byline-poll-block" id={`poll-${blockId}`} data-byline-poll-id={poll.id} aria-labelledby={id}>
      <h2 id={id}>Reader poll</h2>
      <p className="byline-poll-question">{poll.question}</p>
      {poll.votingOpen ? (
        <>
          <ul className="byline-poll-options">
            {poll.options.map((option) => <li key={option.id} className="byline-poll-option">{option.label}</li>)}
          </ul>
          <p className="byline-poll-note">Online voting is unavailable.</p>
        </>
      ) : poll.results ? (
        <ol className="byline-poll-results">
          {poll.options.map((option) => {
            const votes = poll.results?.votes[option.id] ?? 0;
            const percent = total > 0 ? Math.round((votes / total) * 100) : 0;
            return (
              <li key={option.id} className="byline-poll-result">
                <span className="byline-poll-result-label">{option.label}: {percent}%</span>
                <span className="byline-poll-result-bar" aria-hidden="true"><span style={{ width: `${percent}%` }} /></span>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="byline-poll-note">Voting is closed.</p>
      )}
    </section>
  );
}

type BlockRenderer<T extends ArticleBlockType> = (props: { block: ArticleBlockOf<T>; media: MediaTable; context: BlockContext }) => ReactNode;

/**
 * One renderer per registered block type. The `{ [K in ArticleBlockType] }`
 * type makes a new block type a compile error here until it has a renderer,
 * and tests check the map against the contract's registry.
 */
export const ARTICLE_BLOCK_RENDERERS: { [K in ArticleBlockType]: BlockRenderer<K> } = {
  photo: ({ block, media, context }) => {
    const asset = lookup(media, block.media);
    if (!asset) return null;
    return (
      <ArticleBlockFrame type="photo" placement={articleBlockPlacement(block)}>
        <StoryFigure className="byline-photo" media={<BodyImage host={context.host} asset={asset} alt={altFor(asset, block.altOverride)} sizes={block.placement === "column" ? "(min-width: 800px) 760px, 100vw" : block.placement === "wide" ? "(min-width: 1080px) 1040px, 100vw" : "100vw"} />} caption={<CaptionText text={block.caption} />} credit={asset.credit} />
      </ArticleBlockFrame>
    );
  },
  gallery: ({ block, media, context }) => {
    const items = block.items.map((item) => ({ item, asset: lookup(media, item.media) })).filter((entry): entry is { item: typeof entry.item; asset: ArticleMediaAsset } => entry.asset !== null);
    if (!items.length) return null;
    const layout = block.layout ?? "grid";
    const sizes = (index: number) => (layout === "essay" || (layout === "featured" && index === 0) ? "(min-width: 1080px) 1040px, 100vw" : "(min-width: 1080px) 520px, 100vw");
    return (
      <ArticleBlockFrame type="gallery" placement={articleBlockPlacement(block)}>
        <GalleryLayout count={items.length} fit={block.fit} layout={layout}>
          {items.map(({ item, asset }, index) => (
            <StoryFigure key={item.id} className="byline-gallery-item" media={<BodyImage host={context.host} asset={asset} alt={altFor(asset, item.altOverride)} sizes={sizes(index)} />} caption={<CaptionText text={item.caption} />} credit={asset.credit} />
          ))}
        </GalleryLayout>
      </ArticleBlockFrame>
    );
  },
  portraitText: ({ block, media, context }) => {
    const asset = lookup(media, block.media);
    if (!asset) return null;
    return (
      <ArticleBlockFrame type="portraitText" placement="wide">
        <PortraitTextFigure
          side={block.side}
          media={<BodyImage host={context.host} asset={asset} alt={altFor(asset, block.altOverride)} sizes="(min-width: 1080px) 416px, (min-width: 640px) 40vw, 100vw" />}
          caption={block.caption ? <CaptionText text={block.caption} /> : undefined}
          credit={asset.credit}
          heading={block.heading ? <h3>{block.heading}</h3> : undefined}
        >
          <BodyParagraphs body={block.body} />
        </PortraitTextFigure>
      </ArticleBlockFrame>
    );
  },
  video: ({ block }) => (
    <ArticleBlockFrame type="video" placement="wide">
      <VideoFigure
        videoId={block.videoId as string}
        title={block.title}
        player={<YouTubePlayer videoId={block.videoId as string} title={block.title} />}
        caption={block.caption ? <CaptionText text={block.caption} /> : undefined}
        chapters={block.chapters?.length ? <MediaChapters chapters={sortChapters(block.chapters)} href={(time) => `${youTubeWatch(block.videoId as string)}&t=${time}s`} /> : undefined}
        transcript={block.transcript ? <TextParagraphs text={block.transcript} /> : undefined}
      />
    </ArticleBlockFrame>
  ),
  audio: ({ block, media }) => {
    const asset = lookup(media, block.media);
    if (!asset) return null;
    return (
      <ArticleBlockFrame type="audio">
        <AudioFigure
          title={block.title}
          caption={block.caption ? <CaptionText text={block.caption} /> : undefined}
          player={
            <audio controls preload="metadata" src={asset.src}>
              <a href={asset.src}>Download the audio ({asset.filename})</a>
            </audio>
          }
          transcript={<TextParagraphs text={block.transcript} />}
          chapters={block.chapters?.length ? <MediaChapters chapters={sortChapters(block.chapters)} href={(time) => `${asset.src}#t=${time}`} /> : undefined}
        />
      </ArticleBlockFrame>
    );
  },
  reportedQuote: ({ block }) => (
    <ArticleBlockFrame type="reportedQuote">
      <ReportedQuoteView
        text={<TextParagraphs text={block.text} />}
        attribution={block.attribution}
        cite={block.sourceUrl}
        source={block.sourceUrl ? <>Source: <a href={block.sourceUrl} rel="noopener">{block.sourceLabel || webUrlHost(block.sourceUrl)}</a></> : undefined}
      />
    </ArticleBlockFrame>
  ),
  pullQuote: ({ block }) => (
    <ArticleBlockFrame type="pullQuote">
      <PullQuoteView text={<TextParagraphs text={block.text} />} attribution={block.attribution} />
    </ArticleBlockFrame>
  ),
  keyFacts: ({ block }) => (
    <ArticleBlockFrame type="keyFacts">
      <SupportingContext kind="keyFacts" headingId={`${block.id}-heading`} heading={block.heading} presentation={block.presentation}>
        <ul>
          {block.facts.map((fact) => <li key={fact.id}>{fact.text}</li>)}
        </ul>
      </SupportingContext>
    </ArticleBlockFrame>
  ),
  context: ({ block }) => (
    <ArticleBlockFrame type="context">
      <SupportingContext kind="context" headingId={`${block.id}-heading`} heading={block.heading}>
        <BodyParagraphs body={block.body} />
      </SupportingContext>
    </ArticleBlockFrame>
  ),
  editorsNote: ({ block }) => (
    <ArticleBlockFrame type="editorsNote">
      <EditorsNoteView label={EDITORS_NOTE_LABEL}>
        <BodyParagraphs body={block.body} />
      </EditorsNoteView>
    </ArticleBlockFrame>
  ),
  marginNote: ({ block }) => (
    <ArticleBlockFrame type="marginNote">
      <MarginNoteView heading={block.heading}>
        <BodyParagraphs body={block.body} />
      </MarginNoteView>
    </ArticleBlockFrame>
  ),
  expandable: ({ block }) => (
    <ArticleBlockFrame type="expandable">
      <ExpandableView heading={block.heading}>
        <BodyParagraphs body={block.body} />
      </ExpandableView>
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
                      {ref.label || ref.excerpt ? (
                        <span className="byline-document-page-text">
                          {ref.label ? <span className="byline-document-page-label">{ref.label}</span> : null}
                          {ref.excerpt ? <span className="byline-document-page-excerpt">{ref.excerpt}</span> : null}
                        </span>
                      ) : null}
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
  chartMap: ({ block, media, context }) => {
    if (block.mode === "native") {
      if (!block.data || !block.chartType) return null;
      return (
        <ArticleBlockFrame type="chartMap" placement="wide">
          <ChartMapFigure
            mode="native"
            height="standard"
            title={block.title}
            titleId={`${block.id}-title`}
            summaryId={`${block.id}-summary`}
            dek={block.dek}
            media={<NativeChart type={block.chartType} data={block.data} labelledBy={`${block.id}-title ${block.id}-summary`} />}
            link={<ChartDataTable data={block.data} caption={block.title} />}
            summary={<TextParagraphs text={block.summary} />}
            source={block.source ? <>Source: {block.sourceUrl ? <a href={block.sourceUrl} rel="noopener">{block.source}</a> : block.source}</> : undefined}
            notes={block.notes}
          />
        </ArticleBlockFrame>
      );
    }
    const asset = lookup(media, block.image);
    if (block.mode === "static" && !asset) return null;
    const graphic = asset ? (
      <div className="byline-visualization-fallback-image">
        <BodyImage host={context.host} asset={asset} alt={altFor(asset, block.altOverride)} sizes="(min-width: 1080px) 1040px, 100vw" />
      </div>
    ) : null;
    return (
      <ArticleBlockFrame type="chartMap" placement="wide">
        <ChartMapFigure
          mode={block.mode}
          provider={block.provider}
          src={block.url}
          height={block.height}
          title={block.title}
          dek={block.dek}
          media={graphic}
          link={block.mode === "interactive" && block.url ? <p className="byline-visualization-link"><a href={block.url} target="_blank" rel="noopener noreferrer">Open the {visualizationPieceName(block.provider ?? "")} in a new window</a></p> : undefined}
          summary={<TextParagraphs text={block.summary} />}
          source={block.source ? `Source: ${block.source}` : undefined}
          notes={block.notes}
          credit={block.credit ? `Credit: ${block.credit}` : asset?.credit ? `Photo: ${asset.credit}` : undefined}
        />
      </ArticleBlockFrame>
    );
  },
  dataTable: ({ block }) => (
    <ArticleBlockFrame type="dataTable">
      <DataTableView
        title={block.title}
        description={block.description}
        presentation={block.presentation}
        rowHeaders={block.rowHeaders}
        columns={block.columns.map((column) => ({ key: column.id, header: column.label }))}
        rows={block.rows.map((row) => ({ key: row.id, cells: row.cells }))}
        footer={block.source || block.notes ? (
          <>
            {block.source ? <p>Source: {block.source}</p> : null}
            {block.notes ? <p>{block.notes}</p> : null}
          </>
        ) : undefined}
      />
    </ArticleBlockFrame>
  ),
  comparison: ({ block }) => (
    <ArticleBlockFrame type="comparison">
      <ComparisonView
        headingId={`${block.id}-heading`}
        heading={block.heading}
        left={<ComparisonSideView side={block.left} />}
        right={<ComparisonSideView side={block.right} />}
      />
    </ArticleBlockFrame>
  ),
  keyNumbers: ({ block }) => (
    <ArticleBlockFrame type="keyNumbers">
      <KeyNumbersView
        headingId={`${block.id}-heading`}
        heading={block.heading}
        items={block.items.map((item) => ({ key: item.id, value: item.value, label: item.label, context: item.context }))}
        source={block.source ? `Source: ${block.source}` : undefined}
      />
    </ArticleBlockFrame>
  ),
  annotatedImage: ({ block, media, context }) => {
    const asset = lookup(media, block.media);
    if (!asset) return null;
    return (
      <ArticleBlockFrame type="annotatedImage" placement={articleBlockPlacement(block)}>
        <AnnotatedImageFigure
          image={<BodyImage host={context.host} asset={asset} alt={altFor(asset, block.altOverride)} sizes="(min-width: 1080px) 700px, 100vw" />}
          markers={block.markers.map((marker, index) => (
            <a key={marker.id} className="byline-annotation-marker" href={`#${annotationAnchor(block.id, marker.id)}`} style={{ left: `${marker.x}%`, top: `${marker.y}%` }} aria-label={`Note ${index + 1}: ${marker.title}`}>{index + 1}</a>
          ))}
          notes={
            <ol className="byline-annotations">
              {block.markers.map((marker) => (
                <li key={marker.id} id={annotationAnchor(block.id, marker.id)} tabIndex={-1}>
                  {marker.title ? <h3>{marker.title}</h3> : null}
                  {marker.body ? <p>{marker.body}</p> : null}
                </li>
              ))}
            </ol>
          }
          caption={block.caption ? <CaptionText text={block.caption} /> : undefined}
          credit={asset.credit}
        />
      </ArticleBlockFrame>
    );
  },
  beforeAfter: ({ block, media, context }) => {
    const before = lookup(media, block.before);
    const after = lookup(media, block.after);
    if (!before || !after) return null;
    const aspect = before.width && before.height ? Math.round((before.width / before.height) * 1000) / 1000 : undefined;
    const credits = [...new Set([before.credit, after.credit].filter(Boolean))].join(", ");
    return (
      <ArticleBlockFrame type="beforeAfter" placement={articleBlockPlacement(block)}>
        <BeforeAfterFigure
          fit={block.fit}
          aspect={aspect}
          before={<BodyImage host={context.host} asset={before} alt={altFor(before)} sizes="(min-width: 1080px) 520px, 100vw" />}
          after={<BodyImage host={context.host} asset={after} alt={altFor(after)} sizes="(min-width: 1080px) 520px, 100vw" />}
          beforeLabel={block.beforeLabel}
          afterLabel={block.afterLabel}
          caption={block.caption ? <CaptionText text={block.caption} /> : undefined}
          credit={credits}
        />
      </ArticleBlockFrame>
    );
  },
  visualChapter: ({ block, media, context }) => {
    const asset = lookup(media, block.media);
    if (!asset) return null;
    return (
      <ArticleBlockFrame type="visualChapter" placement={articleBlockPlacement(block)}>
        <VisualChapterView
          id={`chapter-${block.id}`}
          align={block.align}
          headingId={`${block.id}-heading`}
          media={<BodyImage host={context.host} asset={asset} alt={altFor(asset, block.altOverride)} sizes="100vw" />}
          eyebrow={block.eyebrow ? <p className="byline-kicker byline-visual-chapter-eyebrow">{block.eyebrow}</p> : undefined}
          heading={block.heading}
          dek={block.dek ? <p className="byline-visual-chapter-dek">{block.dek}</p> : undefined}
          credit={asset.credit}
        />
      </ArticleBlockFrame>
    );
  },
  timeline: ({ block, media, context }) => {
    const starts = periodStarts(block.items);
    return (
      <ArticleBlockFrame type="timeline">
        <TimelineList>
          {block.items.map((event, index) => {
            const photo = event.image ? lookup(media, event.image.media) : null;
            const pdf = event.document ? lookup(media, event.document.media) : null;
            const evidence = [
              event.link ? <li key="link"><a href={event.link.url} rel="noopener">{event.link.label || webUrlHost(event.link.url)}</a></li> : null,
              pdf && event.document ? <li key="document"><a href={event.document.page ? `${pdf.src}#page=${event.document.page}` : pdf.src}>{pdf.filename}{event.document.page ? `, page ${event.document.page}` : ""}</a> <span className="byline-timeline-evidence-kind">PDF</span></li> : null
            ].filter(Boolean);
            return (
              <TimelineItem
                key={event.id}
                current={event.current}
                newPeriod={starts[index] ?? false}
                label={event.label ? <p className="byline-timeline-label">{event.label}</p> : null}
                title={event.title ? <h3 className="byline-timeline-title">{event.title}</h3> : null}
                body={event.body ? <p className="byline-timeline-body">{event.body}</p> : null}
                evidence={evidence.length ? <ul>{evidence}</ul> : undefined}
                media={photo && event.image ? <StoryFigure className="byline-timeline-photo" media={<BodyImage host={context.host} asset={photo} alt={altFor(photo, event.image.altOverride)} sizes="(min-width: 700px) 200px, 100vw" />} caption={event.image.caption ? <CaptionText text={event.image.caption} /> : undefined} credit={photo.credit} /> : undefined}
              />
            );
          })}
        </TimelineList>
      </ArticleBlockFrame>
    );
  },
  relatedCoverage: ({ block, media, context }) => {
    const formatDate = context.host.formatDate ?? defaultFormatDate;
    const stories = block.stories.map((item) => ({ item, story: context.references.stories?.[mediaKey(item.story as string | number)] })).filter((entry): entry is { item: typeof entry.item; story: NonNullable<typeof entry.story> } => Boolean(entry.story));
    if (!stories.length) return null;
    return (
      <ArticleBlockFrame type="relatedCoverage">
        <RelatedCoverageView headingId={`${block.id}-heading`} heading={block.heading}>
          {stories.map(({ item, story }) => {
            const thumb = story.thumbnail === undefined ? null : lookup(media, story.thumbnail);
            return (
              <li key={item.id} className="byline-related-item">
                <a href={story.href}>
                  {thumb ? <span className="byline-related-thumb"><BodyImage host={context.host} asset={{ ...thumb, src: thumb.previewSrc ?? thumb.src }} alt="" sizes="96px" /></span> : null}
                  <span className="byline-related-text">
                    <span className="byline-related-meta">
                      {story.section ? <span>{story.section}</span> : null}
                      <time dateTime={story.publishedAt}>{formatDate(story.publishedAt)}</time>
                    </span>
                    <span className="byline-related-headline">{story.headline}</span>
                  </span>
                </a>
              </li>
            );
          })}
        </RelatedCoverageView>
      </ArticleBlockFrame>
    );
  },
  poll: ({ block, context }) => {
    const poll = block.poll === null ? null : context.references.polls?.[mediaKey(block.poll)];
    if (!poll) return null;
    return (
      <ArticleBlockFrame type="poll">
        <PollBlockView blockId={block.id} poll={poll} />
      </ArticleBlockFrame>
    );
  },
  repositoryInteractive: ({ block, context }) => (
    <ArticleBlockFrame type="repositoryInteractive" placement="wide">
      <RepositoryInteractiveFigure interactiveKey={block.key} title={block.title} description={block.description}>
        {context.host.renderInteractive?.(block)}
      </RepositoryInteractiveFigure>
    </ArticleBlockFrame>
  ),
  repositoryTracker: ({ block, context }) => (
    <ArticleBlockFrame type="repositoryTracker" placement="wide">
      <RepositoryTrackerFigure trackerKey={block.key} title={block.title} description={block.description}>
        {context.host.renderTracker?.(block)}
      </RepositoryTrackerFigure>
    </ArticleBlockFrame>
  ),
  dataProject: ({ block, context }) => {
    if (block.project === null) return null;
    return (
      <ArticleBlockFrame type="dataProject" placement="wide">
        {context.host.renderDataProject ? context.host.renderDataProject(block) : <DataProjectFigure headingId={`${block.id}-heading`} title={block.title} description={block.description} />}
      </ArticleBlockFrame>
    );
  },
  event: ({ block, context }) => {
    const event = block.event === null ? null : context.references.events?.[mediaKey(block.event)];
    if (!event) return null;
    return (
      <ArticleBlockFrame type="event">
        <EventView headingId={`${block.id}-heading`} event={event} timeZone={context.host.timeZone} locale={context.host.locale} />
      </ArticleBlockFrame>
    );
  },
  socialPost: ({ block, context }) => {
    if (!block.provider || !block.postId) return null;
    return (
      <ArticleBlockFrame type="socialPost">
        <SocialPostFigure
          provider={block.provider}
          postId={block.postId}
          url={block.url}
          caption={block.caption ? <CaptionText text={block.caption} /> : undefined}
          facadeNote={context.host.preview ? "Preview: the post can be loaded on the published story." : undefined}
        />
      </ArticleBlockFrame>
    );
  },
  finalScore: ({ block }) => {
    const details = finalScoreDetails(block);
    return (
      <ArticleBlockFrame type="finalScore">
        <FinalScoreView block={block} details={details || undefined} note={block.note} />
      </ArticleBlockFrame>
    );
  }
};

function ComparisonSideView({ side }: { side: { label: string; title: string; body: readonly ParagraphNode[] } }): ReactNode {
  return (
    <>
      {side.label ? <p className="byline-kicker">{side.label}</p> : null}
      <h3>{side.title}</h3>
      <BodyParagraphs body={side.body} />
    </>
  );
}

export function ArticleBodyNodeView({ node, media, references = {}, footnotes = {}, sources = {}, host = {} }: { node: ArticleBodyNode; media: MediaTable; references?: ArticleReferences; footnotes?: Record<string, number>; sources?: Record<string, number>; host?: ArticleRenderHost }): ReactNode {
  if (!isArticleBlock(node)) return <ProseView node={node} footnotes={footnotes} sources={sources} />;
  const Render = ARTICLE_BLOCK_RENDERERS[node.type] as BlockRenderer<typeof node.type>;
  return <Render block={node as never} media={media} context={{ references, footnotes, host }} />;
}

/** The end-of-story notes: one ordered list, each with a link back to its reference. */
export function FootnotesSection({ nodes }: { nodes: readonly ArticleBodyNode[] }): ReactNode {
  const notes = collectFootnotes(nodes);
  if (!notes.length) return null;
  return (
    <section className="byline-footnotes" aria-labelledby="byline-footnotes-heading">
      <h2 id="byline-footnotes-heading" className="byline-kicker">Footnotes</h2>
      <ol>
        {notes.map((note) => (
          <li key={note.id} id={footnoteAnchor(note.id)}>
            <span>{note.text}</span>{" "}
            <a className="byline-footnote-back" href={`#${footnoteRefAnchor(note.id)}`} aria-label={`Back to reference ${note.number}`}>↩</a>
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * The end-of-story Sources: one ordered list, each entry linking straight to
 * the web page or the PDF (at its page), with a link back to the claim. Numbers
 * come from document order and are independent of the footnotes.
 */
export function SourcesSection({ nodes, media }: { nodes: readonly ArticleBodyNode[]; media: MediaTable }): ReactNode {
  const sources = collectSources(nodes);
  if (!sources.length) return null;
  return (
    <section className="byline-sources" aria-labelledby="byline-sources-heading">
      <h2 id="byline-sources-heading" className="byline-kicker">Sources</h2>
      <ol>
        {sources.map((source) => {
          const pdf = source.kind === "document" ? lookup(media, source.media) : null;
          const href = sourceHref(source, pdf && isDocumentAsset(pdf) ? pdf.src : undefined);
          const detail = source.kind === "web" ? webUrlHost(source.url) : `PDF${source.page ? `, page ${source.page}` : ""}`;
          return (
            <li key={source.id} id={sourceAnchor(source.id)}>
              {href ? <a href={href} rel={source.kind === "web" ? "noopener" : undefined}>{source.label}</a> : <span>{source.label}</span>}{" "}
              <span className="byline-source-detail">{detail}</span>{" "}
              <a className="byline-footnote-back" href={`#${sourceRefAnchor(source.id)}`} aria-label={`Back to source ${source.number} in the story`}>↩</a>
              {source.note ? <p className="byline-source-note">{source.note}</p> : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** The nodes of a body, for a host that supplies its own `.article-body` element. */
export function ArticleBodyContent({ body, host }: { body: ArticleBody; host?: ArticleRenderHost }): ReactNode {
  const footnotes = Object.fromEntries(collectFootnotes(body.nodes).map((note) => [note.id, note.number]));
  const sources = Object.fromEntries(collectSources(body.nodes).map((source) => [source.id, source.number]));
  return (
    <>
      {body.nodes.map((node, index) => <ArticleBodyNodeView key={isArticleBlock(node) ? node.id : `n${index}`} node={node} media={body.media} references={body.references} footnotes={footnotes} sources={sources} host={host} />)}
      <SourcesSection nodes={body.nodes} media={body.media} />
      <FootnotesSection nodes={body.nodes} />
    </>
  );
}

/** A whole structured body in its `.article-body` element. Place it inside `.byline-article-view`. */
export function StructuredArticleBody({ body, host }: { body: ArticleBody; host?: ArticleRenderHost }): ReactNode {
  return (
    <div className="article-body">
      <ArticleBodyContent body={body} host={host} />
    </div>
  );
}
