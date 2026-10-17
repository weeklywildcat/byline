export type StoryBlock = { name: string; clientId: string; attributes: Record<string, any>; innerBlocks?: StoryBlock[] };
export function plainHeading(html: string): string {
  const element = document.createElement('div'); element.innerHTML = html;
  return (element.textContent || '').replace(/\s+/g, ' ').trim();
}
export function headingSlug(text: string): string {
  return text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'section';
}
export function flattenStory(blocks: StoryBlock[]): StoryBlock[] { return blocks.flatMap((block) => [block, ...flattenStory(block.innerBlocks || [])]); }
export function headingAnchorUpdates(blocks: StoryBlock[], maxLevel = 3): { clientId: string; anchor: string }[] {
  const all = flattenStory(blocks);
  const used = new Set(all.map((block) => block.attributes.anchor).filter(Boolean));
  return all.flatMap((block) => {
    if (block.name !== 'core/heading' || ![2, 3].includes(block.attributes.level || 2) || (block.attributes.level || 2) > maxLevel || block.attributes.anchor) return [];
    const text = plainHeading(String(block.attributes.content || ''));
    if (!text) return [];
    const slug = headingSlug(text); let anchor = slug; let suffix = 2;
    while (used.has(anchor)) anchor = `${slug}-${suffix++}`;
    used.add(anchor);
    return [{ clientId: block.clientId, anchor }];
  });
}
export function storyHeadings(blocks: StoryBlock[], maxLevel = 3) {
  return flattenStory(blocks).filter((block) => block.name === 'core/heading' && (block.attributes.level || 2) >= 2 && (block.attributes.level || 2) <= maxLevel)
    .map((block) => ({ text: plainHeading(String(block.attributes.content || '')), anchor: block.attributes.anchor, level: block.attributes.level || 2 })).filter((heading) => heading.text && heading.anchor);
}
