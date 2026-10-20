import { createContext, useContext } from "react";

// Keep every overlay inside Home's CSS/theme boundary, including nested pickers.
export const HomePortalContext = createContext<HTMLElement | null>(null);
export const useHomePortal = () => useContext(HomePortalContext);
