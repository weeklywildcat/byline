"use client"

import * as React from "react"
import { Check, Copy } from "lucide-react"
import { cn } from "../lib/utils"
import { Button } from "./button"

function CodeBlock({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="code-block" className={cn("group/code-block relative flex w-full min-w-0 flex-col overflow-hidden rounded-xl border bg-muted/30", className)} {...props} />
}

function CodeBlockHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="code-block-header" className={cn("flex min-w-0 shrink-0 items-center gap-2 border-b px-3 py-2 text-xs text-muted-foreground", className)} {...props} />
}

function CodeBlockTitle({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="code-block-title" className={cn("min-w-0 truncate font-medium text-foreground", className)} {...props} />
}

function CodeBlockActions({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="code-block-actions" className={cn("ml-auto flex shrink-0 items-center", className)} {...props} />
}

function CodeBlockCopyButton({ value, className, ...props }: React.ComponentProps<typeof Button> & { value: string }) {
  const [copied, setCopied] = React.useState(false)
  React.useEffect(() => {
    if (!copied) return
    const timeout = window.setTimeout(() => setCopied(false), 2000)
    return () => window.clearTimeout(timeout)
  }, [copied])
  return (
    <>
      <Button
        data-slot="code-block-copy-button"
        variant="ghost"
        size="icon-xs"
        aria-label={copied ? "Copied" : "Copy"}
        className={className}
        onClick={(event) => {
          props.onClick?.(event)
          void navigator.clipboard.writeText(value).then(() => setCopied(true)).catch(() => undefined)
        }}
        {...props}
      >
        {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      </Button>
      <span aria-live="polite" className="sr-only">{copied ? "Copied" : ""}</span>
    </>
  )
}

function CodeBlockContent({ className, children, wrap = false, ...props }: React.ComponentProps<"pre"> & { wrap?: boolean }) {
  return (
    <pre data-slot="code-block-content" data-wrap={wrap || undefined} tabIndex={0} className={cn("max-h-96 min-w-0 overflow-auto p-3 text-left font-mono text-xs leading-relaxed outline-none data-wrap:whitespace-pre-wrap data-wrap:break-words", className)} {...props}>
      <code>{children}</code>
    </pre>
  )
}

export { CodeBlock, CodeBlockHeader, CodeBlockTitle, CodeBlockActions, CodeBlockCopyButton, CodeBlockContent }
