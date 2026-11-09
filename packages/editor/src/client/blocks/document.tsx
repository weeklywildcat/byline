"use client";

import { ARTICLE_BLOCK_LIMITS as LIMITS, isDocumentAsset, type ArticleMediaAsset } from "@byline/article-body";
import { Attachment, AttachmentActions, AttachmentContent, AttachmentDescription, AttachmentMedia, AttachmentTitle } from "@byline/newsroom-ui/ui/attachment";
import { Button } from "@byline/newsroom-ui/ui/button";
import { ButtonGroup } from "@byline/newsroom-ui/ui/button-group";
import { DocumentFigure, documentFileFacts } from "@byline/ui/article-body";
import { ExternalLink, FilePlus2, Plus, Trash2 } from "lucide-react";
import { useRef } from "react";
import { newRowId } from "../../fields";
import { insertItem, removeItem } from "../../items";
import { BlockShell, ToolButton, ToolTextButton } from "../chrome";
import { InlineText } from "../fields";
import { useFocusWhenCreated } from "../focus";
import { useAnnounce, useMediaAsset, usePickMedia } from "../host";
import { BlockIcon } from "../icons";
import { MediaPlaceholder } from "./media";
import { focusIn, useReadiness, useTypedFields, type BlockEditorProps } from "./shared";

export function DocumentEditor({ node, id, nodeKey }: BlockEditorProps) {
  const [fields, set] = useTypedFields("document", node);
  const issues = useReadiness("document", id, node.fields);
  const media = useMediaAsset(fields.media);
  const pick = usePickMedia();
  const announce = useAnnounce();
  const chooseRef = useRef<HTMLButtonElement>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  useFocusWhenCreated(nodeKey, fields.media === null ? chooseRef : titleRef);
  const readOnly = !node.editable;
  const asset = media.asset;
  const pdf = isDocumentAsset(asset);
  const pages = fields.pages;
  const root = () => node.editor.getElementByKey(nodeKey);

  const use = (assets: ArticleMediaAsset[]) => {
    const chosen = assets[0];
    if (!chosen) return;
    set({ media: chosen.id, title: fields.title || chosen.filename.replace(/\.pdf$/i, "").replace(/[-_]+/g, " ") });
    announce("Document chosen.");
  };
  const replace = async () => use(await pick({ kind: "document", multiple: false, title: "Replace the document", confirmLabel: "Use this PDF" }));
  const addPage = () => {
    const change = insertItem(pages, pages.length, { id: newRowId(), page: null, label: "", excerpt: "" }, LIMITS.documentPagesMax);
    set({ pages: change.items });
    announce(`Page reference added. ${change.items.length} in all.`);
    focusIn(root(), `[data-page-index="${change.focus}"] input`);
  };

  if (fields.media === null) {
    return (
      <BlockShell type="document" node={node} issues={issues}>
        <figure className="byline-document">
          <MediaPlaceholder kind="document" title="Add a document" description="Choose a PDF from Media, upload it, or drop it here. Readers always get a direct link to the file." readOnly={readOnly} onChosen={use} chooseRef={chooseRef} />
        </figure>
      </BlockShell>
    );
  }

  return (
    <BlockShell
      type="document"
      node={node}
      issues={issues}
      actions={
        <ButtonGroup>
          <ToolTextButton label="Replace" icon={<FilePlus2 />} onClick={() => void replace()} />
          <span data-add-page="" className="contents"><ToolTextButton label="Add page" icon={<Plus />} disabled={pages.length >= LIMITS.documentPagesMax} onClick={addPage} /></span>
        </ButtonGroup>
      }
    >
      <DocumentFigure
        details={
          <>
            <p className="byline-document-title">
              <InlineText inputRef={titleRef} label="Document title" placeholder="What the document is" value={fields.title} maxLength={LIMITS.documentTitle} readOnly={readOnly} onChange={(title) => set({ title })} />
            </p>
            <p className="byline-document-context">
              <InlineText label="Why it matters" placeholder="Why a reader should look at it (optional)" value={fields.context} maxLength={LIMITS.documentContext} readOnly={readOnly} multiline onChange={(context) => set({ context })} />
            </p>
            <p className="byline-document-source byline-document-source-field">
              <span aria-hidden="true">Source:</span>
              <InlineText label="Source" placeholder="Who released it (optional)" value={fields.source} maxLength={LIMITS.documentSource} readOnly={readOnly} onChange={(source) => set({ source })} />
            </p>
            {pages.length ? (
              <ul className="byline-document-pages" aria-label="Pages to read">
                {pages.map((ref, index) => (
                  <li key={ref.id} data-page-index={index} className="byline-editable-row">
                    <label className="byline-page-number">
                      <span>Page</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        data-byline-field=""
                        className="byline-field"
                        aria-label={`Page number for reference ${index + 1}`}
                        value={ref.page ?? ""}
                        readOnly={readOnly}
                        onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }}
                        onChange={(event) => {
                          const page = event.target.value === "" ? null : Math.max(1, Math.floor(Number(event.target.value)));
                          set({ pages: pages.map((row) => (row.id === ref.id ? { ...row, page: Number.isFinite(page) ? page : null } : row)) });
                        }}
                      />
                    </label>
                    <span className="byline-document-page-text">
                      <InlineText className="byline-document-page-label" label={`What is on page ${ref.page ?? index + 1}`} placeholder="What the reader will find there" value={ref.label} maxLength={LIMITS.documentPageLabel} readOnly={readOnly} onEnter={() => focusIn(root(), `[data-page-index="${index}"] .byline-document-page-excerpt`, true)} onChange={(label) => set({ pages: pages.map((row) => (row.id === ref.id ? { ...row, label } : row)) })} />
                      <InlineText className="byline-document-page-excerpt" label={`What matters on page ${ref.page ?? index + 1} (optional)`} placeholder="Why it matters, or the passage in your words (optional)" value={ref.excerpt} maxLength={LIMITS.documentPageExcerpt} readOnly={readOnly} multiline onEnter={addPage} onChange={(excerpt) => set({ pages: pages.map((row) => (row.id === ref.id ? { ...row, excerpt } : row)) })} />
                    </span>
                    {readOnly ? null : (
                      <ButtonGroup className="byline-row-actions" data-byline-chrome="">
                        <ToolButton label={`Remove page reference ${index + 1}`} onClick={() => {
                          const change = removeItem(pages, index);
                          set({ pages: change.items });
                          announce(`Page reference removed. ${change.items.length} left.`);
                          // Focus stays in the list: the reference now in this place, else the toolbar's Add page.
                          if (change.items.length) focusIn(root(), `[data-page-index="${change.focus}"] input`);
                          else window.requestAnimationFrame(() => root()?.querySelector<HTMLElement>("[data-add-page] button")?.focus());
                        }}><Trash2 /></ToolButton>
                      </ButtonGroup>
                    )}
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        }
        actions={
          asset ? (
            <Attachment state={pdf ? "done" : "error"} size="sm" className="byline-document-attachment" data-byline-chrome="">
              <AttachmentMedia><BlockIcon icon="document" /></AttachmentMedia>
              <AttachmentContent>
                <AttachmentTitle>{asset.filename}</AttachmentTitle>
                <AttachmentDescription>{pdf ? documentFileFacts(asset) : "Not a PDF. Replace it with a PDF."}</AttachmentDescription>
              </AttachmentContent>
              <AttachmentActions>
                <Button variant="ghost" size="icon-sm" aria-label="Open the document in a new tab" nativeButton={false} render={<a href={asset.src} target="_blank" rel="noreferrer" />}><ExternalLink /></Button>
              </AttachmentActions>
            </Attachment>
          ) : (
            <span className="byline-document-file">{media.status === "loading" ? "Loading the file…" : "This file is no longer in Media. Replace it."}</span>
          )
        }
        preview={asset && pdf ? <object data={`${asset.src}#view=FitH`} type="application/pdf" aria-label={fields.title || asset.filename} tabIndex={-1} /> : undefined}
      />
    </BlockShell>
  );
}
