/** Progressive enhancement for Core gallery media links only. */
export function enhanceArticleGalleries(root: ParentNode = document) {
  if (typeof HTMLDialogElement === "undefined" || !HTMLDialogElement.prototype.showModal) return;
  const galleries = root.querySelectorAll<HTMLElement>(".article-body .wp-block-gallery");
  let dialog: HTMLDialogElement | null = null;
  let image: HTMLImageElement;
  let caption: HTMLElement;
  let status: HTMLElement;
  let previous: HTMLButtonElement;
  let next: HTMLButtonElement;
  let links: HTMLAnchorElement[] = [];
  let index = 0;
  let opener: HTMLAnchorElement | null = null;

  function show(selected: number) {
    index = (selected + links.length) % links.length;
    const link = links[index];
    const thumbnail = link.querySelector("img")!;
    image.src = link.href;
    image.alt = thumbnail.alt;
    caption.textContent = link.closest("figure, .blocks-gallery-item")?.querySelector("figcaption")?.textContent || "";
    caption.hidden = !caption.textContent;
    status.textContent = `Photograph ${index + 1} of ${links.length}`;
    previous.disabled = next.disabled = links.length < 2;
  }
  function createDialog() {
    dialog = document.createElement("dialog");
    dialog.className = "byline-gallery-dialog";
    dialog.setAttribute("aria-label", "Article photographs");
    // Static UI only. Authored captions and alt text are assigned as text.
    dialog.innerHTML = '<div class="byline-gallery-dialog-controls"><button type="button" data-close autofocus>Close</button><button type="button" data-previous aria-label="Previous photograph">Previous</button><span role="status" aria-live="polite"></span><button type="button" data-next aria-label="Next photograph">Next</button></div><figure><img alt=""><figcaption></figcaption></figure>';
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
    dialog.addEventListener("close", () => { opener?.focus(); image.removeAttribute("src"); });
    document.body.append(dialog);
  }
  for (const gallery of galleries) {
    if (gallery.dataset.bylineLightbox) continue;
    const candidates = Array.from(gallery.querySelectorAll<HTMLAnchorElement>("a[href]")).filter((link) => {
      if (!link.querySelector("img") || link.hasAttribute("download")) return false;
      try {
        const url = new URL(link.href, document.baseURI);
        return /^https?:$/.test(url.protocol) && /\.(?:avif|gif|jpe?g|png|webp|svg)$/i.test(url.pathname);
      } catch { return false; }
    });
    if (!candidates.length) continue;
    gallery.dataset.bylineLightbox = "true";
    for (const link of candidates) {
      link.setAttribute("aria-haspopup", "dialog");
      link.addEventListener("click", (event) => {
        if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
        event.preventDefault();
        links = candidates;
        opener = link;
        if (!dialog) createDialog();
        show(links.indexOf(link));
        dialog!.showModal();
      });
    }
  }
}
