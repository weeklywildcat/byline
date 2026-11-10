"use client";

import { compactInline, safeHref, safeWebUrl, type Inline, type ParagraphNode, type TextRun } from "@byline/article-body";
import { Button } from "@byline/newsroom-ui/ui/button";
import { ButtonGroup } from "@byline/newsroom-ui/ui/button-group";
import { Field, FieldDescription, FieldError, FieldLabel } from "@byline/newsroom-ui/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@byline/newsroom-ui/ui/input-group";
import { Bold, Italic, Link2, Unlink } from "lucide-react";
import { useCallback, useEffect, useId, useImperativeHandle, useLayoutEffect, useRef, useState, type Ref } from "react";
import { SettingsSurface, ToolButton } from "../chrome";

/**
 * Paragraphs with bold, italic and web links, typed where readers see them.
 *
 * Not a nested Lexical editor: one small `contentEditable` element whose DOM
 * is read back into Byline's bounded `ParagraphNode` model on every input and
 * written into the block node like any other field (so undo, autosave and
 * Live Preview are unchanged). Paste is plain text. Only `<p>`, `<strong>`,
 * `<em>`, `<a href>` and `<br>` are ever produced or read; anything else a
 * browser inserts is read as its text. Lexical leaves a focused editable
 * inside a block decorator alone.
 */

export type RichFieldHandle = { format: (mark: "bold" | "italic") => void; selection: () => Range | null; link: (href: string | null, range: Range | null) => void; linkAt: (range: Range | null) => string | null };

const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function runHtml(run: TextRun): string {
  let html = escape(run.text);
  if (run.italic) html = `<em>${html}</em>`;
  if (run.bold) html = `<strong>${html}</strong>`;
  return html;
}

export function paragraphsHtml(body: readonly ParagraphNode[]): string {
  if (!body.length) return "<p><br></p>";
  return body.map((paragraph) => {
    const inner = paragraph.children.map((child: Inline) => {
      if (child.type === "text") return runHtml(child);
      if (child.type === "lineBreak") return "<br>";
      if (child.type === "link") return `<a href="${escape(child.href)}">${child.children.map(runHtml).join("")}</a>`;
      return "";
    }).join("");
    return `<p>${inner || "<br>"}</p>`;
  }).join("");
}

const BLOCK = new Set(["P", "DIV", "LI", "H1", "H2", "H3", "H4", "BLOCKQUOTE"]);

/** The editable DOM as bounded paragraphs. */
export function readParagraphs(root: HTMLElement): ParagraphNode[] {
  const paragraphs: ParagraphNode[] = [];
  let current: Inline[] = [];
  const flush = () => {
    const children = compactInline(current);
    paragraphs.push({ type: "paragraph", children });
    current = [];
  };
  const walk = (node: Node, marks: { bold: boolean; italic: boolean; href: string | null }, target: Inline[]) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node.textContent ?? "").replace(/ /g, " ").replace(/\n/g, " ");
      if (!text) return;
      const run: TextRun = { type: "text", text, ...(marks.bold ? { bold: true as const } : {}), ...(marks.italic ? { italic: true as const } : {}) };
      if (marks.href) {
        const last = target[target.length - 1];
        if (last?.type === "link" && last.href === marks.href) last.children.push(run);
        else target.push({ type: "link", href: marks.href, children: [run] });
      } else target.push(run);
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    if (node.tagName === "BR") {
      target.push({ type: "lineBreak" });
      return;
    }
    const next = {
      bold: marks.bold || node.tagName === "B" || node.tagName === "STRONG" || /^(?:bold|[6-9]00)$/.test(node.style.fontWeight),
      italic: marks.italic || node.tagName === "I" || node.tagName === "EM" || node.style.fontStyle === "italic",
      href: node.tagName === "A" ? (() => {
        const href = safeHref(node.getAttribute("href"));
        return href && /^(?:https?|mailto):/i.test(href) ? href : null;
      })() : marks.href
    };
    node.childNodes.forEach((child) => walk(child, next, target));
  };
  root.childNodes.forEach((child) => {
    if (child instanceof HTMLElement && BLOCK.has(child.tagName)) {
      if (current.length) flush();
      child.childNodes.forEach((grand) => walk(grand, { bold: false, italic: false, href: null }, current));
      flush();
    } else walk(child, { bold: false, italic: false, href: null }, current);
  });
  if (current.length) flush();
  return paragraphs.filter((paragraph) => paragraph.children.length);
}

export function RichParagraphs({ value, onChange, readOnly, label, placeholder, handleRef, inputRef, onLinkShortcut }: {
  value: readonly ParagraphNode[];
  onChange: (value: ParagraphNode[]) => void;
  readOnly: boolean;
  label: string;
  placeholder: string;
  handleRef?: Ref<RichFieldHandle>;
  inputRef?: Ref<HTMLDivElement>;
  /** Cmd/Ctrl+K: the caller opens its link surface. */
  onLinkShortcut?: () => void;
}) {
  const element = useRef<HTMLDivElement | null>(null);
  const emitted = useRef<string>("");
  const json = JSON.stringify(value);

  // Write the DOM only when the value changed from outside (undo, a reload), never while it echoes typing.
  useLayoutEffect(() => {
    const root = element.current;
    if (!root || json === emitted.current) return;
    emitted.current = json;
    root.innerHTML = paragraphsHtml(value);
  }, [json, value]);

  const read = useCallback(() => {
    const root = element.current;
    if (!root) return;
    const next = readParagraphs(root);
    emitted.current = JSON.stringify(next);
    onChange(next);
  }, [onChange]);

  const selection = useCallback((): Range | null => {
    const root = element.current;
    const current = root?.ownerDocument.getSelection();
    if (!root || !current || !current.rangeCount) return null;
    const range = current.getRangeAt(0);
    return root.contains(range.commonAncestorContainer) ? range.cloneRange() : null;
  }, []);

  useImperativeHandle(handleRef, () => ({
    format: (mark) => {
      const root = element.current;
      if (!root || readOnly) return;
      root.focus();
      root.ownerDocument.execCommand("styleWithCSS", false, "false");
      root.ownerDocument.execCommand(mark, false);
      read();
    },
    selection,
    linkAt: (range) => {
      const node = range?.startContainer;
      const anchor = (node instanceof Element ? node : node?.parentElement)?.closest("a");
      return anchor && element.current?.contains(anchor) ? anchor.getAttribute("href") : null;
    },
    link: (href, range) => {
      const root = element.current;
      if (!root || readOnly) return;
      const document = root.ownerDocument;
      root.focus();
      const current = document.getSelection();
      if (range && current) {
        current.removeAllRanges();
        current.addRange(range);
      }
      const start = range?.startContainer;
      const anchor = (start instanceof Element ? start : start?.parentElement)?.closest("a");
      if (anchor && root.contains(anchor) && current && range?.collapsed) {
        // The caret is in a link: change or remove the whole link.
        const whole = document.createRange();
        whole.selectNodeContents(anchor);
        current.removeAllRanges();
        current.addRange(whole);
      }
      if (href === null) document.execCommand("unlink", false);
      else if (current?.isCollapsed) document.execCommand("insertHTML", false, `<a href="${escape(href)}">${escape(href)}</a>`);
      else document.execCommand("createLink", false, href);
      read();
    }
  }), [read, readOnly, selection]);

  return (
    <div
      ref={(node) => {
        element.current = node;
        if (typeof inputRef === "function") inputRef(node);
        else if (inputRef) (inputRef as { current: HTMLDivElement | null }).current = node;
      }}
      className="byline-field byline-rich-field"
      data-byline-field=""
      contentEditable={!readOnly}
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="true"
      aria-label={label}
      aria-readonly={readOnly || undefined}
      data-placeholder={placeholder}
      data-empty={value.length === 0 || undefined}
      spellCheck
      onInput={read}
      onPaste={(event) => {
        event.preventDefault();
        if (readOnly) return;
        const text = event.clipboardData.getData("text/plain").replace(/\r\n?/g, "\n");
        event.currentTarget.ownerDocument.execCommand("insertText", false, text);
        read();
      }}
      onDrop={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
        const key = event.key.toLowerCase();
        if (key === "b" || key === "i") {
          event.preventDefault();
          event.currentTarget.ownerDocument.execCommand("styleWithCSS", false, "false");
          event.currentTarget.ownerDocument.execCommand(key === "b" ? "bold" : "italic", false);
          read();
        } else if (key === "k" && onLinkShortcut) {
          event.preventDefault();
          onLinkShortcut();
        } else if (key === "u") event.preventDefault();
      }}
    />
  );
}

/** Bold, Italic and Link for a rich field: a ButtonGroup in the block toolbar, plus a Link surface. */
export function RichFormatButtons({ field, readOnly, linkOpen, onLinkOpenChange }: { field: React.RefObject<RichFieldHandle | null>; readOnly: boolean; linkOpen: boolean; onLinkOpenChange: (open: boolean) => void }) {
  const range = useRef<Range | null>(null);
  const [href, setHref] = useState("");
  const [existing, setExisting] = useState<string | null>(null);
  const id = useId();
  const valid = safeWebUrl(href) !== null || /^mailto:[^\s@]+@[^\s@]+$/i.test(href.trim());
  const keep = (event: React.MouseEvent | React.PointerEvent) => event.preventDefault();
  useEffect(() => {
    if (!linkOpen) return;
    range.current = field.current?.selection() ?? null;
    const current = field.current?.linkAt(range.current) ?? null;
    setExisting(current);
    setHref(current ?? "");
  }, [field, linkOpen]);
  if (readOnly) return null;
  const apply = () => {
    if (!valid) return;
    const url = safeWebUrl(href) ?? href.trim();
    onLinkOpenChange(false);
    field.current?.link(url, range.current);
  };
  return (
    <ButtonGroup aria-label="Text formatting">
      <span onPointerDown={keep} onMouseDown={keep}><ToolButton label="Bold (⌘B)" onClick={() => field.current?.format("bold")}><Bold /></ToolButton></span>
      <span onPointerDown={keep} onMouseDown={keep}><ToolButton label="Italic (⌘I)" onClick={() => field.current?.format("italic")}><Italic /></ToolButton></span>
      <SettingsSurface
        open={linkOpen}
        onOpenChange={onLinkOpenChange}
        title={existing ? "Edit link" : "Add a link"}
        description="Links go to a web page. Select words first to link them."
        trigger={<Button type="button" variant="ghost" size="icon-sm" aria-label="Link (⌘K)" onPointerDown={keep} onMouseDown={keep}><Link2 /></Button>}
      >
        <Field data-invalid={href && !valid ? true : undefined}>
          <FieldLabel htmlFor={id}>Address</FieldLabel>
          <InputGroup>
            <InputGroupAddon><Link2 /></InputGroupAddon>
            <InputGroupInput id={id} value={href} placeholder="https://" type="url" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} aria-invalid={href && !valid ? true : undefined} onChange={(event) => setHref(event.target.value)} onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                apply();
              }
            }} />
          </InputGroup>
          {href && !valid ? <FieldError>Use a web address that starts with https://.</FieldError> : <FieldDescription>Opens in the reader's browser.</FieldDescription>}
        </Field>
        <div className="flex justify-between gap-2">
          <Button type="button" size="sm" disabled={!valid} onClick={apply}>{existing ? "Update link" : "Add link"}</Button>
          {existing ? <Button type="button" size="sm" variant="ghost" onClick={() => { onLinkOpenChange(false); field.current?.link(null, range.current); }}><Unlink />Remove link</Button> : null}
        </div>
      </SettingsSurface>
    </ButtonGroup>
  );
}
