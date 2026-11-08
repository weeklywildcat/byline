/**
 * The share button on each live update. One delegated listener covers updates
 * in the static page and ones the live checker inserts later. Uses the native
 * share sheet where there is one, otherwise copies the update's permalink.
 */
export function bindLiveShare(root: HTMLElement) {
  root.addEventListener("click", async (event) => {
    const button = (event.target as Element | null)?.closest<HTMLButtonElement>("[data-live-share]");
    if (!button || !root.contains(button)) return;
    const url = new URL(`#${button.dataset.liveShare}`, window.location.href).href;
    const title = button.closest(".article-live-update")?.querySelector(".article-live-update-title")?.textContent || document.title;
    if (navigator.share) {
      try { await navigator.share({ title, url }); } catch { /* Dismissed. */ }
      return;
    }
    let label = "Link copied";
    try { await navigator.clipboard.writeText(url); } catch { label = "Copy failed"; }
    button.setAttribute("aria-label", label);
    button.dataset.copied = label === "Link copied" ? "true" : "false";
    window.setTimeout(() => {
      button.setAttribute("aria-label", "Share this update");
      delete button.dataset.copied;
    }, 1800);
  });
}
