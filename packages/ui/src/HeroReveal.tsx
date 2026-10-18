import type { CSSProperties, ReactNode } from "react";

/**
 * A full-screen image that stays pinned while the page content rises over it.
 *
 * Plain static HTML and CSS plus one tiny inline script (no hydration). Render
 * `HeroReveal` and `HeroRevealContent` as adjacent children of the same `<main>`
 * (or another ancestor with no `overflow` set): sticky positioning stops working
 * if an ancestor between the hero and the page clips or scrolls.
 * See docs/fullscreen-hero-reveal.md.
 */
export type HeroRevealImage = {
  src: string;
  srcSet?: string;
  /** Defaults to `100vw`; the image always spans the viewport. */
  sizes?: string;
  /** Empty for decorative art. Editorial photographs keep their real alt text. */
  alt: string;
  width?: number | null;
  height?: number | null;
};

export type HeroRevealProps = {
  image?: HeroRevealImage | null;
  /** CSS `object-position`, for example `"50% 30%"`. Defaults to centered. */
  imagePosition?: string;
  /** Opacity of the dark scrim over the image, 0 to 1. Defaults to 0.66. */
  scrim?: number;
  /** Where the children sit over the image. */
  align?: "center" | "end";
  /** The `id` of the `HeroRevealContent` the scroll cue jumps to. */
  target: string;
  scrollLabel?: string;
  className?: string;
  /** The words over the image. Include the page or article `<h1>` here. */
  children?: ReactNode;
};

/**
 * Sets `--hero-reveal-header-h` to the space above the hero (the in-flow site
 * header), so header plus hero fill the first screen exactly. It measures a
 * zero-height anchor just before the hero rather than `.site-header`, because
 * article pages lay that header out with `display: contents`, which has no box.
 * The anchor is never sticky, so the result holds while the hero is pinned.
 */
export const HERO_REVEAL_FIT_SCRIPT =
  "(function(){var a=document.querySelector('[data-hero-reveal-anchor]');if(!a)return;var r=document.documentElement;function f(){r.style.setProperty('--hero-reveal-header-h',Math.max(0,a.getBoundingClientRect().top+window.scrollY)+'px')}f();addEventListener('resize',f);addEventListener('load',f);if(window.ResizeObserver)new ResizeObserver(f).observe(document.body)})()";

export function HeroReveal({ image, imagePosition, scrim, align = "center", target, scrollLabel = "Scroll", className, children }: HeroRevealProps): ReactNode {
  const style = scrim === undefined ? undefined : ({ "--hero-reveal-scrim": String(scrim) } as CSSProperties);
  return (
    <>
      <div className="hero-reveal-anchor" data-hero-reveal-anchor aria-hidden="true" />
      <script id="hero-reveal-fit" dangerouslySetInnerHTML={{ __html: HERO_REVEAL_FIT_SCRIPT }} />
      <header className={["hero-reveal", className].filter(Boolean).join(" ")} style={style}>
        {image?.src ? (
          <img
            className="hero-reveal-image"
            src={image.src}
            srcSet={image.srcSet}
            sizes={image.sizes ?? "100vw"}
            width={image.width ?? undefined}
            height={image.height ?? undefined}
            alt={image.alt}
            fetchPriority="high"
            style={imagePosition ? { objectPosition: imagePosition } : undefined}
          />
        ) : null}
        <div className={align === "end" ? "hero-reveal-copy hero-reveal-copy-end" : "hero-reveal-copy"}>{children}</div>
        <a className="hero-reveal-scroll" href={`#${target}`}>
          <span>{scrollLabel}</span>
          <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </a>
      </header>
    </>
  );
}

/** The opaque surface that follows the hero and rides up over it. */
export function HeroRevealContent({ id, className, children }: { id: string; className?: string; children?: ReactNode }): ReactNode {
  return <div className={["hero-reveal-content", className].filter(Boolean).join(" ")} id={id}>{children}</div>;
}
