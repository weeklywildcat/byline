"use client";

import { useState } from "react";
import { SiteIcon } from "@/components/SiteIcon";

type ArticleShareActionsProps = {
  title: string;
  url: string;
};

type CopyStatus = "idle" | "copied" | "failed";

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {
      // Fall through to the legacy command when clipboard permission is denied.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.append(textarea);
  textarea.select();

  try {
    if (!document.execCommand("copy")) {
      throw new Error("Copy command was not accepted.");
    }
  } finally {
    textarea.remove();
  }
}

export function ArticleShareActions({ title, url }: ArticleShareActionsProps) {
  const [copyStatus, setCopyStatus] = useState<CopyStatus>("idle");

  async function handleShare() {
    if (navigator.share) {
      await navigator.share({ title, url });
      return;
    }

    window.location.href = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(url)}`;
  }

  async function handleCopy() {
    try {
      await copyText(url);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }

    window.setTimeout(() => setCopyStatus("idle"), 1800);
  }

  const copyLabel =
    copyStatus === "copied" ? "Copied" : copyStatus === "failed" ? "Copy failed" : "Copy link";

  return (
    <div className="article-share-actions" aria-label="Share this story">
      <button type="button" onClick={handleShare} title="Share this story">
        <SiteIcon name="ph:share-fat" width={16} height={16} />
        <span>Share</span>
      </button>
      <button type="button" onClick={handleCopy} title="Copy story link">
        <SiteIcon
          name={copyStatus === "copied" ? "ph:check" : copyStatus === "failed" ? "ph:warning-circle" : "ph:link"}
          width={16}
          height={16}
        />
        <span>{copyLabel}</span>
      </button>
    </div>
  );
}
