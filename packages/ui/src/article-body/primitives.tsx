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
  if (block.type === "photo") return block.placement ?? "column";
  return block.type === "gallery" ? "wide" : "column";
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
