import { getBlockType, registerBlockVariation } from "@wordpress/blocks";
import { subscribe } from "@wordpress/data";
import { storyVariations, supportedAttributes, isStoryVariationActive } from "./definitions";

const registered = new Set<string>();
let stopWatching: (() => void) | undefined;
function registerAvailableVariations() {
  for (const variation of storyVariations) {
    const type = getBlockType(variation.block);
    if (!type || registered.has(variation.name)) continue;
    registered.add(variation.name);
    registerBlockVariation(variation.block, {
      name: variation.name, title: variation.title, description: variation.title,
      icon: variation.icon as any, keywords: variation.keywords, scope: ["inserter"],
      attributes: supportedAttributes(variation.attributes, type.attributes || {}),
      ...(variation.innerBlocks ? { innerBlocks: variation.innerBlocks as any } : {}),
      isActive: (attributes) => isStoryVariationActive(variation, attributes)
    });
  }
  if (registered.size === storyVariations.length) stopWatching?.();
}
// Custom blocks and Core may register after this editor-only entry.
stopWatching = subscribe(registerAvailableVariations);
registerAvailableVariations();
