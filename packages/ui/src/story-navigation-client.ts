/**
 * Behaviour for `StoryNavigation`: opens and closes the menu sheet, and turns
 * the bar from transparent to a publication surface once the story opening is
 * no longer behind it. The public page runs it from a module script and Live
 * Preview from an effect; it returns a cleanup.
 *
 * No scroll listener: one IntersectionObserver watches the opening
 * (`[data-story-nav-zone]`) against a one-pixel band at the top of the
 * viewport. The bar is transparent while the opening touches that band.
 */
export function startStoryNavigation(scope: ParentNode = document): () => void {
  const root = scope.querySelector<HTMLElement>("[data-story-nav]");
  if (!root) return () => undefined;
  const stops: Array<() => void> = [];

  const sheet = root.querySelector<HTMLDialogElement>("[data-story-nav-sheet]");
  const opener = root.querySelector<HTMLButtonElement>("[data-story-nav-open]");
  if (sheet && opener && typeof sheet.showModal === "function") {
    const open = () => {
      if (sheet.open) return;
      sheet.showModal();
      opener.setAttribute("aria-expanded", "true");
    };
    const onClose = () => {
      opener.setAttribute("aria-expanded", "false");
      // Browsers restore focus to the opener on their own; this makes it certain.
      opener.focus({ preventScroll: true });
    };
    // A click on the dialog box itself (outside its content) is a click on the backdrop.
    const onBackdrop = (event: MouseEvent) => {
      if (event.target === sheet) sheet.close();
    };
    // Following a link inside the sheet closes it first, so a same-page or bfcache return never shows it open.
    const onLink = (event: MouseEvent) => {
      if ((event.target as Element | null)?.closest("a[href]")) sheet.close();
    };
    opener.addEventListener("click", open);
    sheet.addEventListener("close", onClose);
    sheet.addEventListener("click", onBackdrop);
    sheet.addEventListener("click", onLink);
    stops.push(() => {
      opener.removeEventListener("click", open);
      sheet.removeEventListener("close", onClose);
      sheet.removeEventListener("click", onBackdrop);
      sheet.removeEventListener("click", onLink);
      if (sheet.open) sheet.close();
    });
  }

  // Transparent over the story opening; solid once the opening has gone.
  //  - An opening whose content rises over a pinned photograph (Immersive) names that content
  //    `[data-story-nav-surface]`: the bar turns solid when the surface reaches the top edge.
  //  - Otherwise the opening (`[data-story-nav-zone]`) scrolls away itself: the bar turns solid
  //    when it has left the top edge.
  const surface = (scope as Document).querySelector?.<HTMLElement>("[data-story-nav-surface]") ?? null;
  const zone = (scope as Document).querySelector?.<HTMLElement>("[data-story-nav-zone]") ?? null;
  const watched = surface ?? zone;
  const setSolid = (solid: boolean) => root.setAttribute("data-solid", solid ? "true" : "false");
  if (!watched || typeof IntersectionObserver === "undefined") {
    // Nothing to be transparent over, or no observer: the readable state.
    setSolid(true);
  } else {
    const view = root.ownerDocument.defaultView ?? window;
    let observer: IntersectionObserver | null = null;
    const observe = () => {
      observer?.disconnect();
      // IntersectionObserver percentage margins are resolved from the root width,
      // even on the vertical axis. Use pixels so this is always a 1px top band.
      const height = Math.max(1, view.innerHeight);
      const nextObserver = new IntersectionObserver(
        (entries) => {
          if (observer !== nextObserver) return;
          const entry = entries[entries.length - 1];
          if (!entry) return;
          setSolid(surface ? entry.isIntersecting : !entry.isIntersecting);
        },
        { rootMargin: `0px 0px -${height - 1}px 0px`, threshold: 0 }
      );
      observer = nextObserver;
      observer.observe(watched);
    };
    observe();
    view.addEventListener("resize", observe);
    stops.push(() => {
      view.removeEventListener("resize", observe);
      observer?.disconnect();
    });
  }

  return () => stops.forEach((stop) => stop());
}
