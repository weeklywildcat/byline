"use client";

import { ARTICLE_BLOCK_FAMILIES, ARTICLE_BLOCK_TYPES, ARTICLE_BLOCKS, isPrivilegedBlockType, type ArticleBlockType } from "@byline/article-body";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@byline/newsroom-ui/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@byline/newsroom-ui/ui/popover";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@byline/newsroom-ui/ui/sheet";
import type { LexicalEditor } from "@payloadcms/richtext-lexical/lexical";
import { Plus } from "lucide-react";
import { cloneElement, useState, type ReactElement } from "react";
import { useCoarseLayout } from "./chrome";
import { useAnnounce, useOptionalEditorHost } from "./host";
import { BlockIcon } from "./icons";
import { insertStoryBlock } from "./lexical";

/**
 * The explicit Add menu: Byline's grouped Command over the one block
 * registry. The slash menu is the fast keyboard path; this is the visible
 * one, the same tools grouped by editorial task, searchable by the words
 * writers use. On touch or a narrow screen it opens in a bottom Sheet.
 */
export function BlockInserterCommand({ onChoose }: { onChoose: (type: ArticleBlockType) => void }) {
  // Hiding a tool is not security (the server restores what a writer may not change); it only avoids offering it.
  const allowed = useOptionalEditorHost()?.canUsePrivilegedBlocks === true;
  return (
    <Command loop className="byline-inserter">
      <CommandInput placeholder="Find a tool: photo, chart, quote, timeline…" aria-label="Find a story tool" />
      <CommandList className="max-h-[min(60dvh,26rem)]">
        <CommandEmpty>No tool by that name.</CommandEmpty>
        {ARTICLE_BLOCK_FAMILIES.map((family) => {
          const types = ARTICLE_BLOCK_TYPES.filter((type) => ARTICLE_BLOCKS[type].family === family.id && (allowed || !isPrivilegedBlockType(type)));
          if (!types.length) return null;
          return (
            <CommandGroup key={family.id} heading={family.label}>
              {types.map((type) => {
                const definition = ARTICLE_BLOCKS[type];
                return (
                  <CommandItem key={type} value={type} keywords={[definition.label, ...definition.aliases]} onSelect={() => onChoose(type)} className="items-start gap-3 py-2" data-block-type={type}>
                    <BlockIcon icon={definition.icon} className="mt-0.5 size-4 shrink-0" />
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="font-medium">{definition.label}</span>
                      <span className="text-xs text-muted-foreground">{definition.description}</span>
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          );
        })}
      </CommandList>
    </Command>
  );
}

/** Opens the Add menu from any trigger and inserts the chosen block where the writer is. */
export function AddBlockMenu({ editor, trigger, align = "start" }: { editor: LexicalEditor; trigger: ReactElement; align?: "start" | "center" | "end" }) {
  const coarse = useCoarseLayout();
  const announce = useAnnounce();
  const [open, setOpen] = useState(false);
  const choose = (type: ArticleBlockType) => {
    setOpen(false);
    insertStoryBlock(editor, type);
    announce(`${ARTICLE_BLOCKS[type].label} added.`);
  };
  if (coarse) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        {cloneElement(trigger as ReactElement<{ onClick?: () => void }>, { onClick: () => setOpen(true) })}
        <SheetContent side="bottom" className="max-h-[85dvh] gap-0 p-0">
          <SheetHeader className="border-b px-4 py-3">
            <SheetTitle>Add to the story</SheetTitle>
            <SheetDescription>Choose a tool. It goes where you were writing.</SheetDescription>
          </SheetHeader>
          <BlockInserterCommand onChoose={choose} />
        </SheetContent>
      </Sheet>
    );
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={trigger} />
      <PopoverContent align={align} className="w-80 p-0">
        <BlockInserterCommand onChoose={choose} />
      </PopoverContent>
    </Popover>
  );
}

/** The always-visible Add button under the story (sticky on touch, so insertion never needs hover or "/"). */
export function AddBlockBar({ editor }: { editor: LexicalEditor }) {
  return (
    <div className="byline-add-bar" contentEditable={false}>
      <AddBlockMenu
        editor={editor}
        trigger={
          <Button type="button" variant="outline" size="sm" className="byline-add-bar-button" onMouseDown={(event) => event.preventDefault()}>
            <Plus />
            Add photo, quote, facts…
          </Button>
        }
      />
      <span className="byline-add-bar-hint">or type <kbd>/</kbd> in the story</span>
    </div>
  );
}
