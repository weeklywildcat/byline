"use client";

import { useLayoutEffect, useRef, type KeyboardEvent, type Ref } from "react";

const supportsFieldSizing = typeof CSS !== "undefined" && typeof CSS.supports === "function" && CSS.supports("field-sizing", "content");

/**
 * Text typed where the reader will see it: a borderless textarea that takes
 * the typography of the slot it sits in (caption, quote, fact, event) and
 * grows with its content. `data-byline-field` tells the canvas to leave its
 * keystrokes to the browser (Lexical keeps Undo and Redo).
 */
export function InlineText({
  value,
  onChange,
  label,
  placeholder,
  className,
  multiline = false,
  readOnly,
  maxLength,
  onEnter,
  onKeyDown,
  inputRef,
  id,
  invalid
}: {
  value: string;
  onChange: (value: string) => void;
  /** The accessible name ("Caption", "Quote"). */
  label: string;
  placeholder?: string;
  className?: string;
  /** Allow line breaks (paragraphs). Single-line fields wrap but never break. */
  multiline?: boolean;
  readOnly?: boolean;
  maxLength?: number;
  /** Enter moves on (to the next field, the next row). With it, Shift+Enter breaks a line in a multi-line field. */
  onEnter?: () => void;
  onKeyDown?: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  inputRef?: Ref<HTMLTextAreaElement>;
  id?: string;
  invalid?: boolean;
}) {
  const local = useRef<HTMLTextAreaElement | null>(null);
  useLayoutEffect(() => {
    const element = local.current;
    if (!element || supportsFieldSizing) return;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={(element) => {
        local.current = element;
        if (typeof inputRef === "function") inputRef(element);
        else if (inputRef) (inputRef as { current: HTMLTextAreaElement | null }).current = element;
      }}
      id={id}
      data-byline-field=""
      className={["byline-field", className].filter(Boolean).join(" ")}
      aria-label={label}
      aria-invalid={invalid || undefined}
      placeholder={placeholder}
      rows={1}
      value={value}
      maxLength={maxLength}
      readOnly={readOnly}
      spellCheck
      onChange={(event) => onChange(multiline ? event.target.value : event.target.value.replace(/\s*\n\s*/g, " "))}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.defaultPrevented) return;
        if (event.key !== "Enter" || event.shiftKey || event.altKey) return;
        // A single-line field never breaks; a multi-line one breaks unless Enter has a next place to go.
        if (!multiline || onEnter) {
          event.preventDefault();
          onEnter?.();
        }
      }}
    />
  );
}
