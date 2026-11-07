import { createContext, use } from "react";
import type { CollectionHref, CollectionTab } from "./collection-model";

/**
 * How shared screens reach a Collection: its address (`href`, for links)
 * and, where the host moves within its own app (`open`), how to go there.
 * WordPress addresses its Planning screen; Payload its Collections screen
 * through the shell's guarded navigation. Absent, screens show no link.
 */
export type CollectionLinks = {
  href?: CollectionHref;
  open?: (
    collectionId: number,
    options?: { tab?: CollectionTab; interviewId?: number },
  ) => void;
};

const CollectionLinksContext = createContext<CollectionLinks>({});

export const CollectionLinksProvider = CollectionLinksContext;
export const useCollectionLinks = () => use(CollectionLinksContext);
