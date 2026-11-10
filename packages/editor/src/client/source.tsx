"use client";

import { ARTICLE_BLOCK_LIMITS as LIMITS, safeWebUrl, webUrlHost, type ArticleMediaAsset } from "@byline/article-body";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@byline/newsroom-ui/ui/field";
import { Input } from "@byline/newsroom-ui/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@byline/newsroom-ui/ui/input-group";
import { Textarea } from "@byline/newsroom-ui/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@byline/newsroom-ui/ui/toggle-group";
import { useInlineBlockComponentContext } from "@payloadcms/richtext-lexical/client";
import { FileText, Globe, Link2, Trash2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { mediaIdOf } from "../fields";
import { SettingsSurface } from "./chrome";
import { consumeCreated } from "./focus";
import { useAnnounce, useMediaAsset, usePickMedia } from "./host";
import { closedInPlace, returnToText, useInlineSource } from "./lexical";

const text = (value: unknown) => (typeof value === "string" ? value : "");

/**
 * A Source reference at a claim, drawn as a bracketed number in the text. The
 * number follows reading order (Sources number apart from footnotes). Clicking
 * it, or inserting a new one, opens a Popover (a bottom Sheet on touch): the
 * kind (a web page or a document from Media), then the address or the PDF and
 * page, a short title and an optional note. Closing a new, empty one removes
 * it. It never names one of the newsroom's private source records.
 */
export function BylineSource() {
  const { nodeKey } = useInlineBlockComponentContext() as unknown as { nodeKey: string };
  const { editor, fields, number, editable, write } = useInlineSource(nodeKey);
  const announce = useAnnounce();
  const pick = usePickMedia();
  const [open, setOpen] = useState(false);
  const first = useRef<HTMLInputElement>(null);
  const ids = { url: useId(), label: useId(), page: useId(), note: useId() };
  const kind = fields.kind === "document" ? "document" : "web";
  const url = text(fields.url);
  const label = text(fields.label);
  const media = mediaIdOf(fields.media);
  const document = useMediaAsset(media);
  const page = typeof fields.page === "number" ? fields.page : null;
  const validUrl = safeWebUrl(url);
  const urlInvalid = url.trim() !== "" && !validUrl;
  const empty = !url.trim() && media === null && !label.trim();
  const finished = Boolean(label.trim() && (kind === "web" ? validUrl : media !== null));

  useEffect(() => {
    if (consumeCreated(nodeKey)) setOpen(true);
  }, [nodeKey]);
  useEffect(() => {
    if (open) window.requestAnimationFrame(() => first.current?.focus());
  }, [open, kind]);

  const close = (next: boolean, details?: { reason?: string }) => {
    setOpen(next);
    if (next) return;
    // A new source with nothing in it says nothing: closing it removes it (Undo brings it back).
    if (editable && empty) returnToText(editor, nodeKey, { remove: true });
    else if (!closedInPlace(details)) returnToText(editor, nodeKey);
  };
  const choosePdf = async () => {
    const [asset] = await pick({ kind: "document", multiple: false, title: "Choose the document", confirmLabel: "Use this PDF" });
    if (!asset) return;
    write({ media: asset.id, label: label || titleFrom(asset) });
    announce(`${asset.filename} chosen as the source.`);
  };
  const stop = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") return;
    if (event.key === "Enter" && (event.target as HTMLElement).tagName === "INPUT") event.preventDefault();
    event.stopPropagation();
  };

  return (
    <SettingsSurface
      open={open}
      onOpenChange={close}
      title={`Source ${number}`}
      description="Listed under Sources at the end of the story, linked to this claim."
      trigger={
        <button type="button" className="byline-source-ref byline-source-edit" data-empty={!finished || undefined} data-byline-chrome="" aria-label={`Source ${number}${label ? `: ${label}` : ""}. Edit the source.`}>
          <sup>[{number || "·"}]</sup>
        </button>
      }
    >
      <div onKeyDown={stop} className="flex flex-col gap-4">
        <ToggleGroup aria-label="Kind of source" variant="outline" size="sm" spacing={0} value={[kind]} disabled={!editable} onValueChange={(next) => {
          const chosen = next[0];
          if (chosen === "web" || chosen === "document") write({ kind: chosen });
        }}>
          <ToggleGroupItem value="web"><Globe />Web page</ToggleGroupItem>
          <ToggleGroupItem value="document"><FileText />Document</ToggleGroupItem>
        </ToggleGroup>
        <FieldGroup className="gap-4">
          {kind === "web" ? (
            <Field data-invalid={urlInvalid || undefined}>
              <FieldLabel htmlFor={ids.url}>Address</FieldLabel>
              <InputGroup>
                <InputGroupAddon><Link2 /></InputGroupAddon>
                <InputGroupInput ref={first} id={ids.url} type="url" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="https://" value={url} maxLength={LIMITS.webUrl} readOnly={!editable} aria-invalid={urlInvalid || undefined} onChange={(event) => write({ url: event.target.value.trim() })} />
              </InputGroup>
              {urlInvalid ? <FieldError>Use a web address that starts with https://.</FieldError> : <FieldDescription>A public page: a report, a statement, a dataset.</FieldDescription>}
            </Field>
          ) : (
            <>
              <Field>
                <FieldLabel>Document</FieldLabel>
                {media === null ? (
                  <Button type="button" variant="outline" size="sm" disabled={!editable} onClick={() => void choosePdf()}><FileText />Choose a PDF from Media</Button>
                ) : (
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate">{document.asset?.filename ?? (document.status === "loading" ? "Loading…" : "This file is no longer in Media.")}</span>
                    {editable ? <Button type="button" variant="ghost" size="sm" onClick={() => void choosePdf()}>Replace</Button> : null}
                  </div>
                )}
              </Field>
              <Field>
                <FieldLabel htmlFor={ids.page}>Page</FieldLabel>
                <Input id={ids.page} type="number" inputMode="numeric" min={1} className="w-28" value={page ?? ""} readOnly={!editable} onChange={(event) => {
                  const value = event.target.value === "" ? null : Math.max(1, Math.floor(Number(event.target.value)));
                  write({ page: Number.isFinite(value) ? value : null });
                }} />
                <FieldDescription>Optional. The link opens the PDF at this page.</FieldDescription>
              </Field>
            </>
          )}
          <Field>
            <FieldLabel htmlFor={ids.label}>Title</FieldLabel>
            <Input id={ids.label} placeholder={kind === "web" && validUrl ? webUrlHost(validUrl) : "District budget request, 2026"} value={label} maxLength={LIMITS.sourceLabel} readOnly={!editable} onChange={(event) => write({ label: event.target.value })} />
          </Field>
          <Field>
            <FieldLabel htmlFor={ids.note}>Note</FieldLabel>
            <Textarea id={ids.note} rows={2} placeholder="What it shows, briefly (optional)" value={text(fields.note)} maxLength={LIMITS.sourceNote} readOnly={!editable} onChange={(event) => write({ note: event.target.value })} />
          </Field>
        </FieldGroup>
        <div className="flex justify-between gap-2">
          <Button type="button" size="sm" onClick={() => close(false)}>Done</Button>
          {editable ? (
            <Button type="button" size="sm" variant="ghost" onClick={() => {
              setOpen(false);
              returnToText(editor, nodeKey, { remove: true });
              announce("Source removed.");
            }}>
              <Trash2 />
              Remove source
            </Button>
          ) : null}
        </div>
      </div>
    </SettingsSurface>
  );
}

function titleFrom(asset: ArticleMediaAsset): string {
  return asset.filename.replace(/\.pdf$/i, "").replace(/[-_]+/g, " ").trim().slice(0, LIMITS.sourceLabel);
}
