"use client";

import { useState } from "react";
import { ArticleShareActionsView } from "@byline/ui";

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
    <ArticleShareActionsView
      copyLabel={copyLabel}
      copyIcon={copyStatus === "copied" ? "ph:check" : copyStatus === "failed" ? "ph:warning-circle" : "ph:link"}
      status={copyStatus === "idle" ? "" : copyLabel}
      onShare={handleShare}
      onCopy={handleCopy}
    />
  );
}
