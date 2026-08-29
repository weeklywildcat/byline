import { Button, Notice } from "@wordpress/components";
import { createRoot, useMemo, useRef, useState } from "@wordpress/element";
import { __ } from "@wordpress/i18n";
import { ArticleView, type ArticlePresentation } from "@byline/ui";
import { getPublicationTheme, getPublicationThemeStylesheets, getPublicationThemeVariables } from "./publication-theme";

import "@byline/ui/article.css";
import "./article-preview.css";

type PreviewConfig = {
  model?: ArticlePresentation | null;
  stylesheetUrl?: string;
  themeId?: string;
  tokenOverrides?: Record<string, string>;
  postId?: number;
};

declare global {
  interface Window {
    bylineArticlePreview?: PreviewConfig;
  }
}

type ViewportId = "desktop" | "tablet" | "mobile";

const VIEWPORTS: Record<ViewportId, { label: string; width: number; height: number }> = {
  desktop: { label: "Desktop", width: 1200, height: 820 },
  tablet: { label: "Tablet", width: 768, height: 1024 },
  mobile: { label: "Mobile", width: 390, height: 844 }
};

function attribute(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function previewDocument(stylesheetUrl: string, themeId: string, tokenOverrides: Record<string, string>) {
  const stylesheets = [stylesheetUrl, ...getPublicationThemeStylesheets(themeId)].filter(Boolean);
  const stylesheetLinks = stylesheets
    .map((href) => `<link rel="stylesheet" href="${attribute(href)}">`)
    .join("");
  const cssVariables = Object.entries(getPublicationThemeVariables(themeId, tokenOverrides))
    .map(([name, value]) => `${name}:${value}`)
    .join(";");
  const safeThemeId = attribute(getPublicationTheme(themeId).id);
  const safeVariables = attribute(cssVariables);

  return `<!doctype html><html lang="en" data-byline-theme="${safeThemeId}" style="${safeVariables}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${stylesheetLinks}<style>html,body{background:var(--page);color:var(--ink);font-family:var(--font-body)}html,body,*{box-sizing:border-box}body{margin:0}</style></head><body><div id="byline-article-preview-frame-root"></div></body></html>`;
}

function PreviewFrame({
  model,
  stylesheetUrl,
  themeId,
  tokenOverrides,
  viewport
}: {
  model: ArticlePresentation;
  stylesheetUrl: string;
  themeId: string;
  tokenOverrides: Record<string, string>;
  viewport: ViewportId;
}) {
  const rootRef = useRef<ReturnType<typeof createRoot> | null>(null);
  const frameSize = VIEWPORTS[viewport];
  const srcDoc = useMemo(
    () => previewDocument(stylesheetUrl, themeId, tokenOverrides),
    [stylesheetUrl, themeId, tokenOverrides]
  );

  return (
    <div className="byline-preview-device" style={{ maxWidth: frameSize.width }}>
      <div className="byline-preview-device-label">{frameSize.label} · {frameSize.width}px</div>
      <iframe
        title={__("Byline article preview", "weekly-wildcat-headless")}
        className="byline-preview-frame"
        srcDoc={srcDoc}
        style={{ height: frameSize.height, maxWidth: frameSize.width }}
        onLoad={(event) => {
          const frameDocument = event.currentTarget.contentDocument;
          const mount = frameDocument?.getElementById("byline-article-preview-frame-root");
          if (!frameDocument || !mount) return;
          rootRef.current?.unmount();
          rootRef.current = createRoot(mount);
          rootRef.current.render(<ArticleView presentation={model} className="byline-preview-article" />);
          const stopNavigation = (click: Event) => {
            const target = click.target instanceof Element ? click.target.closest("a,button,form") : null;
            if (!target) return;
            click.preventDefault();
            click.stopPropagation();
          };
          frameDocument.addEventListener("click", stopNavigation, true);
          frameDocument.addEventListener("submit", stopNavigation, true);
        }}
      />
    </div>
  );
}

function PreviewApp({ config }: { config: PreviewConfig }) {
  const [viewport, setViewport] = useState<ViewportId>("desktop");
  const model = config.model;

  if (!model) {
    return <Notice status="error" isDismissible={false}>{__("This story is not available for preview.", "weekly-wildcat-headless")}</Notice>;
  }

  return (
    <div className="byline-preview-app">
      <div className="byline-preview-toolbar" role="toolbar" aria-label={__("Preview viewport", "weekly-wildcat-headless")}>
        <div>
          <strong>{__("Private Byline preview", "weekly-wildcat-headless")}</strong>
          <span>{__("Saved WordPress content only · public actions are disabled", "weekly-wildcat-headless")}</span>
        </div>
        <div className="byline-preview-viewport-buttons">
          {(Object.keys(VIEWPORTS) as ViewportId[]).map((id) => (
            <Button key={id} variant={viewport === id ? "primary" : "secondary"} aria-pressed={viewport === id} onClick={() => setViewport(id)}>
              {VIEWPORTS[id].label}
            </Button>
          ))}
        </div>
      </div>
      <PreviewFrame
        model={model}
        stylesheetUrl={config.stylesheetUrl || ""}
        themeId={config.themeId || "byline-modern"}
        tokenOverrides={config.tokenOverrides || {}}
        viewport={viewport}
      />
    </div>
  );
}

const mount = document.getElementById("byline-article-preview-root");
if (mount) {
  createRoot(mount).render(<PreviewApp config={window.bylineArticlePreview || {}} />);
} else {
  // Keep a missing root visible in a release build instead of failing silently.
  const fallback = document.createElement("p");
  fallback.textContent = __("The Byline preview could not be mounted.", "weekly-wildcat-headless");
  document.body.append(fallback);
}
