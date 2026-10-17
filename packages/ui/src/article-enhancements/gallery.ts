/**
 * Progressive photo enlargement for article galleries.
 *
 * - Every image in a Byline Photo Gallery can be enlarged, whether or not the
 *   writer linked it. Unlinked images get a generated <button>; no saved content
 *   changes.
 * - Other galleries keep the earlier contract: only images already linked to an
 *   image file are enhanced, and the ordinary link still works without script.
 * - The dialog loads the photograph's full-size source only when it is opened,
 *   never the inline derivative, and warms only the two adjacent photographs.
 */

/** Rendered by WordPress from the attachment's `full` size (see gallery-media.php). */
const FULL_SOURCE_ATTRIBUTE = "data-byline-full-url";
const IMAGE_FILE = /\.(?:avif|gif|jpe?g|png|webp|svg)$/i;

type GalleryItem = {
  image: HTMLImageElement;
  /** The element that opens the dialog and receives focus again on close. */
  opener: HTMLElement;
  link: HTMLAnchorElement | null;
  /** Set when Byline generated the opener, so cleanup can restore the image. */
  generated: boolean;
};

/** An http(s) URL that names an image file, resolved against the document. */
function imageUrl(value: string | null | undefined, base: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value, base);
    return /^https?:$/.test(url.protocol) && IMAGE_FILE.test(url.pathname) ? url.href : null;
  } catch {
    return null;
  }
}

/** The widest candidate in an <img srcset>, by `w` (or `x`) descriptor. */
function largestSrcsetCandidate(srcset: string | null, base: string): string | null {
  let best: { url: string; weight: number } | null = null;
  for (const candidate of (srcset || "").split(/,\s+(?=\S)/)) {
    const [url, descriptor = "1x"] = candidate.trim().split(/\s+/);
    const weight = parseFloat(descriptor);
    const resolved = imageUrl(url, base);
    if (resolved && Number.isFinite(weight) && (!best || weight > best.weight)) best = { url: resolved, weight };
  }
  return best?.url ?? null;
}

/**
 * Sources to try for an item, best first: the attachment's full size, a full
 * media link, the widest srcset candidate, then what the page already shows.
 */
function sourcesFor(item: GalleryItem, base: string): string[] {
  const { image, link } = item;
  const candidates = [
    imageUrl(image.getAttribute(FULL_SOURCE_ATTRIBUTE), base),
    imageUrl(link?.getAttribute("href"), base),
    largestSrcsetCandidate(image.getAttribute("srcset"), base),
    image.currentSrc || null,
    image.getAttribute("src") ? new URL(image.getAttribute("src")!, base).href : null
  ];
  return [...new Set(candidates.filter((source): source is string => Boolean(source)))];
}

function captionFor(image: HTMLImageElement) {
  const figcaption = image.closest("figure")?.querySelector("figcaption");
  if (!figcaption) return "";
  // The photo credit is its own paragraph; keep it apart from the caption text
  // rather than running the two together ("...SaturdayPhoto: Name").
  const clone = figcaption.cloneNode(true) as HTMLElement;
  const credit = [...clone.querySelectorAll(".photo-credit")].map((node) => node.textContent?.trim() || "").filter(Boolean);
  clone.querySelectorAll(".photo-credit").forEach((node) => node.remove());
  return [clone.textContent?.trim() || "", ...credit].filter(Boolean).join(" — ");
}

export function enhanceArticleGalleries(root: ParentNode = document): () => void {
  const doc = root.nodeType === 9 ? (root as Document) : root.ownerDocument!;
  const view = doc.defaultView;
  if (!view || !view.HTMLDialogElement || !view.HTMLDialogElement.prototype.showModal) return () => {};
  const base = doc.baseURI;
  const abort = new view.AbortController();
  const restore: (() => void)[] = [];
  let dialog: HTMLDialogElement | null = null;
  let stage: HTMLElement;
  let image: HTMLImageElement;
  let caption: HTMLElement;
  let status: HTMLElement;
  let previous: HTMLButtonElement;
  let next: HTMLButtonElement;
  let items: GalleryItem[] = [];
  let index = 0;
  let opener: HTMLElement | null = null;
  let token = 0;
  const warmed = new Set<string>();

  /** Warm one neighbouring photograph. Only ever called after the dialog is open. */
  function warm(position: number) {
    if (items.length < 2) return;
    const source = sourcesFor(items[(position + items.length) % items.length], base)[0];
    if (!source || warmed.has(source)) return;
    warmed.add(source);
    new view!.Image().src = source;
  }

  function show(selected: number) {
    index = (selected + items.length) % items.length;
    const item = items[index];
    const sources = sourcesFor(item, base);
    const current = ++token;
    let attempt = 0;

    // Hold the thumbnail's proportions while the full image decodes so the
    // dialog does not jump. The attributes are dropped on load, leaving the
    // photograph at its natural size (never upscaled).
    const { naturalWidth, naturalHeight } = item.image;
    if (naturalWidth && naturalHeight) {
      image.width = 4000;
      image.height = Math.round((4000 * naturalHeight) / naturalWidth);
    }
    stage.setAttribute("aria-busy", "true");
    image.alt = item.image.alt;
    const text = captionFor(item.image);
    caption.textContent = text;
    caption.hidden = !text;
    status.textContent = `Photograph ${index + 1} of ${items.length}`;
    previous.disabled = next.disabled = items.length < 2;

    const settle = () => {
      if (current !== token) return;
      stage.removeAttribute("aria-busy");
      image.removeAttribute("width");
      image.removeAttribute("height");
      warm(index + 1);
      warm(index - 1);
    };
    image.onload = settle;
    image.onerror = () => {
      if (current !== token) return;
      if (++attempt < sources.length) image.src = sources[attempt];
      else settle();
    };
    if (sources[0]) image.src = sources[0];
    else settle();
  }

  function createDialog() {
    dialog = doc.createElement("dialog");
    dialog.className = "byline-gallery-dialog";
    dialog.setAttribute("aria-label", "Article photographs");
    // Static UI only. Authored captions and alt text are assigned as text.
    dialog.innerHTML = '<div class="byline-gallery-dialog-controls"><button type="button" data-close autofocus>Close</button><button type="button" data-previous aria-label="Previous photograph">Previous</button><span role="status" aria-live="polite"></span><button type="button" data-next aria-label="Next photograph">Next</button></div><figure><div class="byline-gallery-dialog-stage"><img alt=""></div><figcaption></figcaption></figure>';
    stage = dialog.querySelector(".byline-gallery-dialog-stage")!;
    image = dialog.querySelector("img")!;
    caption = dialog.querySelector("figcaption")!;
    status = dialog.querySelector('[role="status"]')!;
    previous = dialog.querySelector("[data-previous]")!;
    next = dialog.querySelector("[data-next]")!;
    previous.addEventListener("click", () => show(index - 1));
    next.addEventListener("click", () => show(index + 1));
    dialog.querySelector("[data-close]")!.addEventListener("click", () => dialog!.close());
    dialog.addEventListener("keydown", (event) => {
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        show(index + (event.key === "ArrowLeft" ? -1 : 1));
      }
    });
    dialog.addEventListener("close", () => {
      token++;
      image.onload = image.onerror = null;
      image.removeAttribute("src");
      opener?.focus();
    });
    doc.body.append(dialog);
  }

  function open(galleryItems: GalleryItem[], selected: GalleryItem) {
    items = galleryItems;
    opener = selected.opener;
    if (!dialog) createDialog();
    show(items.indexOf(selected));
    dialog!.showModal();
  }

  for (const gallery of root.querySelectorAll<HTMLElement>(".wp-block-gallery")) {
    if (gallery.dataset.bylineLightbox) continue;
    const photoGallery = gallery.classList.contains("is-style-byline-photo-gallery");
    const galleryItems: GalleryItem[] = [];

    for (const photograph of gallery.querySelectorAll<HTMLImageElement>("img")) {
      const link = photograph.closest<HTMLAnchorElement>("a[href]");
      if (link) {
        // A link to anything but an image file is the writer's choice; leave it.
        if (!gallery.contains(link) || link.hasAttribute("download") || !imageUrl(link.getAttribute("href"), base)) continue;
        galleryItems.push({ image: photograph, opener: link, link, generated: false });
      } else if (photoGallery) {
        const button = doc.createElement("button");
        button.type = "button";
        button.className = "byline-gallery-opener";
        photograph.replaceWith(button);
        button.append(photograph);
        galleryItems.push({ image: photograph, opener: button, link: null, generated: true });
      }
    }
    if (!galleryItems.length) continue;
    gallery.dataset.bylineLightbox = "true";
    restore.push(() => delete gallery.dataset.bylineLightbox);

    galleryItems.forEach((item, position) => {
      item.opener.setAttribute("aria-haspopup", "dialog");
      if (item.generated) {
        item.opener.setAttribute("aria-label", item.image.alt ? `Enlarge photograph: ${item.image.alt}` : `Enlarge photograph ${position + 1} of ${galleryItems.length}`);
        // Unwrap the generated button so cleanup returns the saved markup.
        restore.push(() => item.opener.replaceWith(item.image));
      } else {
        restore.push(() => item.opener.removeAttribute("aria-haspopup"));
      }
      item.opener.addEventListener("click", (event) => {
        if (event.defaultPrevented) return;
        // Let modified clicks (new tab, download) and non-primary buttons act as ordinary links.
        if (item.link && (event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey)) return;
        event.preventDefault();
        open(galleryItems, item);
      }, { signal: abort.signal });
    });
  }

  return () => {
    abort.abort();
    if (dialog?.open) dialog.close();
    dialog?.remove();
    dialog = null;
    restore.splice(0).forEach((undo) => undo());
  };
}
