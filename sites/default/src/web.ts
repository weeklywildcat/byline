// Astro only. The newsroom must never resolve this module.
import Head from "./Head.astro";
import { interactives } from "./interactives";

export const WEB_ONLY_MARKER = "byline-site-web-only-marker-default";
export { Head, interactives };
