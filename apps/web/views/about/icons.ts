// Phosphor glyphs for the About page. The site's usual icon component loads icons
// from the Iconify API after hydration, which leaves them blank in static HTML, so
// these are bundled and drawn with Iconify's offline renderer. Icon data: Phosphor
// Icons (MIT), via https://api.iconify.design/ph.json.
import type { IconifyIcon } from "@iconify/react/offline";

const size = { width: 256, height: 256 } as const;

export const ABOUT_ICONS = {
  "users-three": { ...size, body: "<path fill=\"currentColor\" d=\"M244.8 150.4a8 8 0 0 1-11.2-1.6A51.6 51.6 0 0 0 192 128a8 8 0 0 1-7.37-4.89a8 8 0 0 1 0-6.22A8 8 0 0 1 192 112a24 24 0 1 0-23.24-30a8 8 0 1 1-15.5-4A40 40 0 1 1 219 117.51a67.94 67.94 0 0 1 27.43 21.68a8 8 0 0 1-1.63 11.21M190.92 212a8 8 0 1 1-13.84 8a57 57 0 0 0-98.16 0a8 8 0 1 1-13.84-8a72.06 72.06 0 0 1 33.74-29.92a48 48 0 1 1 58.36 0A72.06 72.06 0 0 1 190.92 212M128 176a32 32 0 1 0-32-32a32 32 0 0 0 32 32m-56-56a8 8 0 0 0-8-8a24 24 0 1 1 23.24-30a8 8 0 1 0 15.5-4A40 40 0 1 0 37 117.51a67.94 67.94 0 0 0-27.4 21.68a8 8 0 1 0 12.8 9.61A51.6 51.6 0 0 1 64 128a8 8 0 0 0 8-8\"/>" },
  "images": { ...size, body: "<path fill=\"currentColor\" d=\"M216 40H72a16 16 0 0 0-16 16v16H40a16 16 0 0 0-16 16v112a16 16 0 0 0 16 16h144a16 16 0 0 0 16-16v-16h16a16 16 0 0 0 16-16V56a16 16 0 0 0-16-16M72 56h144v62.75l-10.07-10.06a16 16 0 0 0-22.63 0l-20 20l-44-44a16 16 0 0 0-22.62 0L72 109.37Zm112 144H40V88h16v80a16 16 0 0 0 16 16h112Zm32-32H72v-36l36-36l49.66 49.66a8 8 0 0 0 11.31 0L194.63 120L216 141.38zm-56-84a12 12 0 1 1 12 12a12 12 0 0 1-12-12\"/>" },
  "identification-badge": { ...size, body: "<path fill=\"currentColor\" d=\"M75.19 198.4a8 8 0 0 0 11.21-1.6a52 52 0 0 1 83.2 0a8 8 0 1 0 12.8-9.6a67.9 67.9 0 0 0-27.4-21.69a40 40 0 1 0-53.94 0A67.9 67.9 0 0 0 73.6 187.2a8 8 0 0 0 1.59 11.2M128 112a24 24 0 1 1-24 24a24 24 0 0 1 24-24m72-88H56a16 16 0 0 0-16 16v176a16 16 0 0 0 16 16h144a16 16 0 0 0 16-16V40a16 16 0 0 0-16-16m0 192H56V40h144ZM88 64a8 8 0 0 1 8-8h64a8 8 0 0 1 0 16H96a8 8 0 0 1-8-8\"/>" },
  "pencil-line": { ...size, body: "<path fill=\"currentColor\" d=\"m227.32 73.37l-44.69-44.68a16 16 0 0 0-22.63 0L36.69 152A15.86 15.86 0 0 0 32 163.31V208a16 16 0 0 0 16 16h168a8 8 0 0 0 0-16H115.32l112-112a16 16 0 0 0 0-22.63M136 75.31L152.69 92L68 176.69L51.31 160ZM48 208v-28.69L76.69 208Zm48-3.31L79.32 188L164 103.31L180.69 120Zm96-96L147.32 64l24-24L216 84.69Z\"/>" },
  "megaphone-simple": { ...size, body: "<path fill=\"currentColor\" d=\"m228.54 86.66l-176.06-54A16 16 0 0 0 32 48v144a16 16 0 0 0 16 16a16 16 0 0 0 4.52-.65L136 181.73V192a16 16 0 0 0 16 16h32a16 16 0 0 0 16-16v-29.9l28.54-8.75A16.09 16.09 0 0 0 240 138v-36a16.09 16.09 0 0 0-11.46-15.34M136 165l-88 27V48l88 27Zm48 27h-32v-15.18l32-9.82Zm40-54h-.11L152 160.08V79.92l71.89 22h.11v36Z\"/>" },
  "envelope-simple": { ...size, body: "<path fill=\"currentColor\" d=\"M224 48H32a8 8 0 0 0-8 8v136a16 16 0 0 0 16 16h176a16 16 0 0 0 16-16V56a8 8 0 0 0-8-8m-20.57 16L128 133.15L52.57 64ZM216 192H40V74.19l82.59 75.71a8 8 0 0 0 10.82 0L216 74.19z\"/>" },
  "arrow-right": { ...size, body: "<path fill=\"currentColor\" d=\"m221.66 133.66l-72 72a8 8 0 0 1-11.32-11.32L196.69 136H40a8 8 0 0 1 0-16h156.69l-58.35-58.34a8 8 0 0 1 11.32-11.32l72 72a8 8 0 0 1 0 11.32\"/>" }
} satisfies Record<string, IconifyIcon>;

export type AboutIconName = keyof typeof ABOUT_ICONS;
