import type { ArticleBlockType, ArticleMediaAsset, Placement } from "@byline/article-body";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

/**
 * The visual structure of the Byline story blocks, shared by the public
 * renderer and the newsroom editor.
 *
 * Each primitive draws the element tree and classes the shared CSS styles
 * (article-body.css, newsroom/*.css) and takes its content as slots: the
 * public renderer passes text, the editor passes its own inputs in the same
 * places. They hold no editing state and know nothing about any CMS or
 * editor. Editor controls stay in the editor; never add an editing mode here.
 */

const join = (...names: Array<string | false | null | undefined>) => names.filter(Boolean).join(" ");

/** The frame classes every block's outermost element carries (see article-body.css). */
export function articleBlockFrameClassName(type: ArticleBlockType, placement: Placement = "column"): string {
  return join("byline-block", `byline-block-${type}`, placement === "wide" && "alignwide", placement === "full" && "alignfull");
}

/** Where a block sits: a Photo's own choice; a Gallery is a visual moment; everything else reads in the column. */
export function articleBlockPlacement(block: { type: ArticleBlockType; placement?: Placement }): Placement {
  switch (block.type) {
    case "photo":
    case "visualChapter":
    case "annotatedImage":
    case "beforeAfter":
      return block.placement ?? "column";
    // Major visual moments break out of the reading column; everything else reads in it.
    case "gallery":
    case "portraitText":
    case "video":
    case "chartMap":
    case "repositoryInteractive":
      return "wide";
    default:
      return "column";
  }
}

/** The public frame. The editor uses its own block element with the same classes. */
export function ArticleBlockFrame({ type, placement, children }: { type: ArticleBlockType; placement?: Placement; children: ReactNode }): ReactNode {
  return (
    <div className={articleBlockFrameClassName(type, placement)} data-block-type={type}>
      {children}
    </div>
  );
}

/** "Photo: Name", on its own line under the caption. Credit always comes from the Media asset. */
export function PhotoCredit({ credit }: { credit: string }): ReactNode {
  return credit ? <p className="photo-credit">Photo: {credit}</p> : null;
}

/** A photograph or graphic from the article's media table. */
export function ArticleImage({ asset, alt, sizes, ...rest }: { asset: Pick<ArticleMediaAsset, "src" | "width" | "height" | "focalPoint">; alt: string; sizes?: string } & Omit<ComponentPropsWithoutRef<"img">, "src" | "alt" | "width" | "height">): ReactNode {
  const style = asset.focalPoint ? { objectPosition: `${asset.focalPoint.x}% ${asset.focalPoint.y}%` } : undefined;
  return <img src={asset.src} alt={alt} width={asset.width ?? undefined} height={asset.height ?? undefined} sizes={sizes} loading="lazy" decoding="async" style={style} {...rest} />;
}

/** A caption's paragraphs: what is shown. */
export function CaptionText({ text }: { text: string }): ReactNode {
  return text ? <p className="byline-caption">{text}</p> : null;
}

/** One figure: the media, then a caption slot and the resolved credit. */
export function StoryFigure({ className, media, caption, credit, children }: { className: string; media: ReactNode; caption?: ReactNode; credit?: string; children?: ReactNode }): ReactNode {
  const hasCaption = Boolean(caption) || Boolean(credit);
  return (
    <figure className={className}>
      {media}
      {hasCaption ? (
        <figcaption>
          {caption}
          {credit ? <PhotoCredit credit={credit} /> : null}
        </figcaption>
      ) : null}
      {children}
    </figure>
  );
}

/** A gallery's grid. Two photographs pair up; the CSS owns how many fit each width. */
export function GalleryLayout({ count, fit, children, ...rest }: { count: number; fit: "natural" | "crop"; children: ReactNode } & Omit<ComponentPropsWithoutRef<"div">, "className" | "children">): ReactNode {
  return (
    <div className={join("byline-gallery", fit === "crop" && "is-cropped", count === 2 && "is-pair")} {...rest}>
      {children}
    </div>
  );
}

/** A source's words: the quote, then who said it. */
export function ReportedQuoteView({ text, attribution }: { text: ReactNode; attribution: ReactNode }): ReactNode {
  return (
    <blockquote className="byline-reported-quote">
      {text}
      {attribution ? <cite>{attribution}</cite> : null}
    </blockquote>
  );
}

/** A line pulled from the story, between rules, in the headline face. */
export function PullQuoteView({ text, attribution }: { text: ReactNode; attribution?: ReactNode }): ReactNode {
  return (
    <figure className="byline-pull-quote">
      <blockquote>
        {text}
        {attribution ? <cite>{attribution}</cite> : null}
      </blockquote>
    </figure>
  );
}

/**
 * Supporting context: a rule, a small-caps label and the material. No box.
 * Context and Key Facts share it; `kind` picks the family member.
 */
export function SupportingContext({ kind, headingId, heading, children }: { kind: "context" | "keyFacts"; headingId: string; heading: ReactNode; children: ReactNode }): ReactNode {
  return (
    <aside className={kind === "keyFacts" ? "byline-key-facts" : "byline-context"} aria-labelledby={headingId}>
      <h2 id={headingId}>{heading}</h2>
      {children}
    </aside>
  );
}

/** A source document: what it is and why it matters, the pages to read, then the file itself. */
export function DocumentFigure({ details, actions, preview }: { details: ReactNode; actions: ReactNode; preview?: ReactNode }): ReactNode {
  return (
    <figure className="byline-document">
      <figcaption className="byline-document-details">
        <p className="byline-kicker">Document</p>
        {details}
      </figcaption>
      <div className="byline-document-actions">{actions}</div>
      {preview ? <div className="byline-document-preview">{preview}</div> : null}
    </figure>
  );
}

/** "PDF, 1.2 MB": what a reader is about to open. */
export function documentFileFacts(asset: Pick<ArticleMediaAsset, "mimeType" | "filesize">): string {
  const type = asset.mimeType === "application/pdf" ? "PDF" : "File";
  if (!asset.filesize) return type;
  const size = asset.filesize >= 1_000_000 ? `${(asset.filesize / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(asset.filesize / 1000))} KB`;
  return `${type}, ${size}`;
}

/** A chronology on a hairline axis. */
export function TimelineList({ children, ...rest }: { children: ReactNode } & Omit<ComponentPropsWithoutRef<"ol">, "className" | "children">): ReactNode {
  return (
    <ol className="byline-timeline" {...rest}>
      {children}
    </ol>
  );
}

/** One event: its label, headline and explanation slots in the timeline grid. */
export function TimelineItem({ current, newPeriod, label, title, body, ...rest }: { current: boolean; newPeriod: boolean; label: ReactNode; title: ReactNode; body: ReactNode } & Omit<ComponentPropsWithoutRef<"li">, "className" | "children" | "title">): ReactNode {
  return (
    <li className={join("byline-timeline-item", current && "is-current", newPeriod && "is-new-period")} {...rest}>
      {label}
      {title}
      {body}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Blocks added after the first eight. Each primitive draws the element tree and
// classes the shared CSS styles and takes content as slots, exactly as above.
// ---------------------------------------------------------------------------

/** A portrait and the passage that goes with it. The CSS owns the 40/60 split and the stacking. */
export function PortraitTextFigure({ side, media, caption, credit, heading, children }: { side: "left" | "right"; media: ReactNode; caption?: ReactNode; credit?: string; heading?: ReactNode; children: ReactNode }): ReactNode {
  return (
    <div className="byline-portrait-text" data-side={side}>
      <StoryFigure className="byline-portrait-text-figure" media={media} caption={caption} credit={credit} />
      <div className="byline-portrait-text-body">
        {heading}
        {children}
      </div>
    </div>
  );
}

/** A chapter opener: a photograph with its heading over a scrim. The heading is an H2 of the story. */
export function VisualChapterView({ id, align, headingId, media, eyebrow, heading, dek, credit }: { id?: string; align: "bottom-left" | "center"; headingId: string; media: ReactNode; eyebrow?: ReactNode; heading: ReactNode; dek?: ReactNode; credit?: string }): ReactNode {
  return (
    <section className="byline-visual-chapter" id={id} data-align={align} aria-labelledby={headingId}>
      <div className="byline-visual-chapter-media">{media}</div>
      <div className="byline-visual-chapter-text">
        {eyebrow}
        <h2 id={headingId}>{heading}</h2>
        {dek}
      </div>
      {credit ? <p className="photo-credit byline-visual-chapter-credit">Photo: {credit}</p> : null}
    </section>
  );
}

export const youTubeNoCookieEmbed = (videoId: string): string => `https://www.youtube-nocookie.com/embed/${videoId}`;
export const youTubeWatch = (videoId: string): string => `https://www.youtube.com/watch?v=${videoId}`;

/** A YouTube video. `player` is the privacy-enhanced iframe on the public page; the editor passes a placeholder. */
export function VideoFigure({ videoId, title, player, caption }: { videoId: string; title: ReactNode; player: ReactNode; caption?: ReactNode }): ReactNode {
  return (
    <figure className="byline-video" data-video-id={videoId}>
      <div className="byline-video-frame">{player}</div>
      <figcaption>
        <p className="byline-video-title">{title}</p>
        {caption}
        <p className="byline-video-link"><a href={youTubeWatch(videoId)} rel="noopener">Watch on YouTube</a></p>
      </figcaption>
    </figure>
  );
}

/** The privacy-enhanced player: lazy, no autoplay, no looping, ordinary controls, fullscreen allowed. */
export function YouTubePlayer({ videoId, title }: { videoId: string; title: string }): ReactNode {
  return (
    <iframe
      src={youTubeNoCookieEmbed(videoId)}
      title={title}
      loading="lazy"
      referrerPolicy="strict-origin-when-cross-origin"
      allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
      allowFullScreen
    />
  );
}

/** A recording: title and context above, the native player, the transcript in a native disclosure. */
export function AudioFigure({ title, caption, player, transcript, editing = false }: { title: ReactNode; caption?: ReactNode; player: ReactNode; transcript: ReactNode; editing?: boolean }): ReactNode {
  return (
    <figure className="byline-audio">
      <figcaption className="byline-audio-details">
        <p className="byline-kicker">Audio</p>
        <p className="byline-audio-title">{title}</p>
        {caption}
      </figcaption>
      {player}
      <details className="byline-audio-transcript" open={editing || undefined}>
        <summary>Transcript</summary>
        <div className="byline-audio-transcript-text">{transcript}</div>
      </details>
    </figure>
  );
}

/** The editors' voice: a rule, the fixed label "Editor's note", the note. */
export function EditorsNoteView({ label, children }: { label: string; children: ReactNode }): ReactNode {
  return (
    <aside className="byline-editors-note" aria-label={label}>
      <p className="byline-kicker">{label}</p>
      {children}
    </aside>
  );
}

/** Supplementary information that sits in the margin on wide layouts and in order on narrow ones. */
export function MarginNoteView({ heading, children }: { heading?: ReactNode; children: ReactNode }): ReactNode {
  return (
    <aside className="byline-margin-note" aria-label={typeof heading === "string" && heading ? heading : "Margin note"}>
      {heading ? <h3 className="byline-kicker">{heading}</h3> : null}
      {children}
    </aside>
  );
}

/** Detail a reader opens. The public page is a native `<details>`; the editor keeps it open and typeable. */
export function ExpandableView({ heading, children, editing = false }: { heading: ReactNode; children: ReactNode; editing?: boolean }): ReactNode {
  if (editing) {
    return (
      <div className="byline-expandable is-editing">
        <div className="byline-expandable-summary">{heading}</div>
        <div className="byline-expandable-body">{children}</div>
      </div>
    );
  }
  return (
    <details className="byline-expandable">
      <summary><span>{heading}</span></summary>
      <div className="byline-expandable-body">{children}</div>
    </details>
  );
}

/** A chart or map: title, dek, the graphic or its slot, the summary in words, then source, notes and credit. */
export function ChartMapFigure({ mode, provider, src, height, title, dek, media, link, summary, source, notes, credit }: {
  mode: "interactive" | "static";
  provider?: string;
  src?: string;
  height: string;
  title: ReactNode;
  dek?: ReactNode;
  media: ReactNode;
  link?: ReactNode;
  summary: ReactNode;
  source?: ReactNode;
  notes?: ReactNode;
  credit?: ReactNode;
}): ReactNode {
  return (
    <figure className="byline-visualization" data-mode={mode === "interactive" ? "embed" : "static"} data-provider={provider} data-src={mode === "interactive" ? src : undefined} data-height={height}>
      <h3 className="byline-visualization-title">{title}</h3>
      {dek ? <p className="byline-visualization-dek">{dek}</p> : null}
      <div className="byline-visualization-media">{media}</div>
      {link}
      <figcaption>
        <div className="byline-visualization-summary">{summary}</div>
        {source ? <p className="byline-visualization-source">{source}</p> : null}
        {notes ? <p className="byline-visualization-notes">{notes}</p> : null}
        {credit ? <p className="photo-credit">{credit}</p> : null}
      </figcaption>
    </figure>
  );
}

/** Real table markup: caption, header row, optional row headers, horizontal scrolling on a narrow screen. */
export function DataTableView({ title, description, presentation, rowHeaders, columns, rows, footer, ...rest }: {
  title: ReactNode;
  description?: ReactNode;
  presentation: "standard" | "comparison";
  rowHeaders: boolean;
  columns: Array<{ key: string; header: ReactNode }>;
  rows: Array<{ key: string; cells: ReactNode[]; actions?: ReactNode }>;
  footer?: ReactNode;
} & Omit<ComponentPropsWithoutRef<"table">, "className" | "children" | "title">): ReactNode {
  return (
    <figure className="byline-data-table" data-presentation={presentation}>
      <div className="byline-data-table-scroll" role="region" aria-label={typeof title === "string" ? title : "Data table"} tabIndex={0}>
        <table {...rest}>
          <caption>
            <span className="byline-data-table-title">{title}</span>
            {description ? <span className="byline-data-table-description">{description}</span> : null}
          </caption>
          <thead>
            <tr>
              {columns.map((column) => <th key={column.key} scope="col">{column.header}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                {row.cells.map((cell, index) => (rowHeaders && index === 0 ? <th key={index} scope="row">{cell}</th> : <td key={index}>{cell}</td>))}
                {row.actions}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {footer ? <figcaption>{footer}</figcaption> : null}
    </figure>
  );
}

/** Two sides explained next to each other. Logical order is left, then right, on every width. */
export function ComparisonView({ headingId, heading, left, right }: { headingId: string; heading?: ReactNode; left: ReactNode; right: ReactNode }): ReactNode {
  return (
    <section className="byline-compare" aria-labelledby={heading ? headingId : undefined} aria-label={heading ? undefined : "Comparison"}>
      {heading ? <h2 id={headingId} className="byline-kicker">{heading}</h2> : null}
      <div className="byline-compare-sides">
        <div className="byline-compare-side" data-side="left">{left}</div>
        <div className="byline-compare-side" data-side="right">{right}</div>
      </div>
    </section>
  );
}

/** The few figures a reader should remember. The renderer owns the scale. */
export function KeyNumbersView({ headingId, heading, items, source }: { headingId: string; heading?: ReactNode; items: Array<{ key: string; value: ReactNode; label: ReactNode; context?: ReactNode; actions?: ReactNode }>; source?: ReactNode }): ReactNode {
  return (
    <section className="byline-key-numbers" data-count={items.length} aria-labelledby={heading ? headingId : undefined} aria-label={heading ? undefined : "Key numbers"}>
      {heading ? <h2 id={headingId} className="byline-kicker">{heading}</h2> : null}
      <dl>
        {items.map((item) => (
          <div key={item.key} className="byline-key-number">
            <dt>{item.label}</dt>
            <dd className="byline-key-number-value">{item.value}</dd>
            {item.context ? <dd className="byline-key-number-context">{item.context}</dd> : null}
            {item.actions}
          </div>
        ))}
      </dl>
      {source ? <p className="byline-key-numbers-source">{source}</p> : null}
    </section>
  );
}

export const annotationAnchor = (blockId: string, markerId: string): string => `annotation-${blockId}-${markerId}`;

/** A photograph with numbered markers and the notes they point to. Markers are links, so it works without script. */
export function AnnotatedImageFigure({ image, markers, notes, caption, credit, canvasRef, ...rest }: { image: ReactNode; markers: ReactNode; notes: ReactNode; caption?: ReactNode; credit?: string; canvasRef?: React.Ref<HTMLDivElement> } & Omit<ComponentPropsWithoutRef<"figure">, "className" | "children">): ReactNode {
  return (
    <figure className="byline-annotated-image" {...rest}>
      <div className="byline-annotation-layout">
        <div className="byline-annotation-canvas" ref={canvasRef}>
          {image}
          {markers}
        </div>
        {notes}
      </div>
      {caption || credit ? (
        <figcaption>
          {caption}
          {credit ? <PhotoCredit credit={credit} /> : null}
        </figcaption>
      ) : null}
    </figure>
  );
}

/** Two photographs under labels. Without script they sit side by side (stacked when narrow); the enhancer adds the range input. */
export function BeforeAfterFigure({ fit, aspect, before, after, beforeLabel, afterLabel, caption, credit, figureRef }: {
  fit: "cover" | "contain";
  aspect?: number;
  before: ReactNode;
  after: ReactNode;
  beforeLabel: ReactNode;
  afterLabel: ReactNode;
  caption?: ReactNode;
  credit?: string;
  figureRef?: React.Ref<HTMLElement>;
}): ReactNode {
  return (
    <figure className="byline-before-after" data-fit={fit} style={aspect ? ({ "--comparison-aspect": String(aspect) } as React.CSSProperties) : undefined} ref={figureRef}>
      <div className="byline-comparison-images">
        <figure className="byline-comparison-image">
          <strong data-before="">{beforeLabel}</strong>
          {before}
        </figure>
        <figure className="byline-comparison-image">
          <strong data-after="">{afterLabel}</strong>
          {after}
        </figure>
      </div>
      {caption || credit ? (
        <figcaption>
          {caption}
          {credit ? <PhotoCredit credit={credit} /> : null}
        </figcaption>
      ) : null}
    </figure>
  );
}

/** Mid-story links to our own stories. */
export function RelatedCoverageView({ headingId, heading, children }: { headingId: string; heading: ReactNode; children: ReactNode }): ReactNode {
  return (
    <section className="byline-related" aria-labelledby={headingId}>
      <h2 id={headingId} className="byline-kicker">{heading}</h2>
      <ul>{children}</ul>
    </section>
  );
}

/** One repository interactive: its title and text alternative are real content; the host fills the root. */
export function RepositoryInteractiveFigure({ interactiveKey, title, description, children }: { interactiveKey: string; title: ReactNode; description: ReactNode; children?: ReactNode }): ReactNode {
  return (
    <figure className="byline-repository-interactive" data-repository-interactive={interactiveKey}>
      <h3 className="byline-repository-interactive-title">{title}</h3>
      <p className="byline-repository-interactive-description">{description}</p>
      <div className="byline-repository-interactive-root" data-interactive-root="">{children}</div>
    </figure>
  );
}
