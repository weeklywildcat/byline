# Apple platforms

How the newsroom behaves on Safari, iOS, iPadOS and macOS, with a finger, Apple Pencil, trackpad or
mouse, the software keyboard, and as a Home Screen web app. This is compatibility and ergonomics, not
an Apple look: the shadcn/Base Nova design, Geist and the navigation model are unchanged. **The 768px
and 1200px navigation breakpoints were not touched**, and an iPad is never treated as a phone because
it has touch. Nothing sniffs the user agent: it is CSS, feature detection, pointer capabilities and
standard Web APIs.

## Contracts

**Safe areas.** The admin layout uses `viewport-fit=cover`, so interactive content must clear all four
insets; backgrounds may bleed to the edge. The names are `--byline-safe-top|right|bottom|left`, defined
on `:root` (`custom.scss`) and on `.byline-ui-root` (`packages/newsroom-ui/src/styles.css`). Use them,
never a fresh `env(...)`.

- **Dialog / AlertDialog** position inside Base UI's `Viewport`, which pads the safe area and scrolls
  when a dialog is taller than the space, so the close button and footer stay reachable. A deliberate
  full-bleed workspace (the Media crops editor) passes `fullBleed`: below `md` it fills the screen and
  pads its own header, footer and content with the variables.
- **Sheet** keeps its background edge to edge and pads content on the edges it touches (top and bottom
  for left/right sheets; the side it is attached to).
- **Drawer** keeps its bottom inset and now clears the left and right insets in landscape. More's custom
  full-height Drawer, snap points and swipe dismissal are unchanged.
- **Login, Field Mode, toasts, the header and the phone bottom navigation** use the same variables.

**Software keyboard.** Bottom Drawers with forms use Base UI's `VirtualKeyboardProvider` (`keyboardAware`;
the adaptive Dialog sets it). Dialogs, Sheets and the login page follow the visible viewport through
`trackVisualViewport` / `useVisualViewportFit` (`packages/newsroom-ui/src/lib/visual-viewport.ts`): it
feature-detects `window.visualViewport`, writes `--byline-vv-top|right|bottom|left` on the overlay once
per animation frame (no React renders) and removes them on unmount. Keyboard height is never guessed.
Dialogs do not `autoFocus` a field: Base UI focuses the first field when opened with a keyboard or
mouse, and deliberately does not when opened by touch, so the software keyboard does not appear
unasked.

**Hybrid input.** `any-pointer: coarse` sizes touch targets (44×44pt); fine hover enables optional hover
extras; a device can be both. Raw small controls use the `touch-hit` utility, which extends the hit
area to 44px on coarse pointers without changing the artwork or the layout. Apple Pencil hover is read
from real pen `pointermove` events with no buttons down (`useFineHoverPointer`). Hover may reveal a
preview; it never submits, moves, publishes or deletes anything. Finger touch never counts as hover.

**Context menus** are mounted for every input: right-click, Control-click, touch-and-hold (Base UI's own
long press, no timer of ours) and the keyboard. They are accelerators; the visible Actions button is the
canonical way. Only **hover cards** (previews) are gated on a hover-capable pointer. The Board's drag
grip is pointer-only and decorative; moving a Story is always Actions → Move to.

**Custom pointer gestures** (focal point, annotation markers) end on `pointerup`, `pointercancel` and
`lostpointercapture`, so an interrupted Pencil or finger gesture cannot leave the UI stuck dragging.
`touch-action: none` is limited to the surface that owns the gesture.

**Form semantics.** `FormField` wrappers pass an allowlist of `type`, `inputMode`, `autoComplete`,
`autoCapitalize`, `autoCorrect`, `spellCheck` and `enterKeyHint`; they cannot override ids or the
label/error wiring. Presets: `URL_INPUT`, `IDENTIFIER_INPUT`, `EMAIL_INPUT`, `PHONE_INPUT`. URLs,
slugs and emails are never auto-capitalized, corrected or spell-checked; prose keeps normal behaviour.
Someone else's email is `autoComplete="off"`, not the signed-in user's identity. The login form keeps
`username` / `current-password`. Search boxes are live filters, so they keep the `search` type without
a custom enter key.

**Scribble** needs nothing from us: ordinary inputs and textareas are never replaced or intercepted, and
fields do not move or resize when writing begins.

**Home Screen.** `/admin/manifest.webmanifest` (id and start URL `/admin`, scope `/`, standalone, white
background and theme colour) plus the Weekly Wildcat's existing icons in `public/app-icons` (identical
to `apps/web/public`, guarded by a test), exposed through `admin.meta` (`manifest`, `icons`,
`appleWebApp`) and a `theme-color`. There is no service worker, and no
`apple-mobile-web-app-status-bar-style=black-translucent`; the page background decides the chrome.

**Screen Wake Lock** (`useScreenWakeLock`, feature detected, silent if refused): on while a browser
recording is in progress and while Field Mode is actually sending a capture; never for a whole live
session.

**Photos.** HEIC/HEIF is accepted and decoded server-side to JPEG; ProRAW/DNG is refused with a clear
message. See [media-workspace.md](media-workspace.md#heicheif-photos).

## Automated coverage

- `npm run test:newsroom`: HEIC decode and metadata, hover capability (`PointerEvent` pen), Wake Lock,
  Visual Viewport, manifest.
- `npm run test:newsroom:integration`: HEIC and ProRAW through the Media upload path.
- `npm run test:apple:browser --workspace @byline/newsroom` (needs `npx playwright install webkit`):
  WebKit on Desktop Safari, iPhone, iPad Pro 11 portrait and landscape. The Chromium suite stays
  `npm run test:browser`.

Playwright WebKit is regression coverage. It has no software keyboard, safe-area insets, Dynamic Island,
Apple Pencil or Home Screen mode, and Safari's Responsive Design Mode presets are only approximate.

## Manual and simulator checklist

Use Safari on the iOS/iPadOS Simulator for layout; use real hardware for Pencil and the camera.

**iPhone Safari** (portrait and landscape)
- [ ] Bottom navigation clears the home indicator; More opens full height; landscape side insets clear content.
- [ ] Dynamic Island: header, dialogs and sheets do not sit under it; close buttons are reachable.
- [ ] Open a dialog/drawer with a field and the software keyboard: the focused field and Save/Cancel stay visible.
- [ ] Open a Dialog by touch: the keyboard does not appear on its own.
- [ ] Media inspector sheet with the keyboard open; Media Picker and Upload with search.
- [ ] Add to Home Screen, launch standalone, navigate within `/admin`, stay signed in, open Field Mode, rotate.
- [ ] Field Mode: take a photo (camera opens), choose a HEIC from Photos; the screen stays on while it sends.
- [ ] Long-press a Story card or row: the menu opens; the drag grip still drags; scrolling still works.

**iPad Safari** (portrait, landscape, Split View narrow)
- [ ] 768pt and wider shows the tablet navigation, never the phone bar; Split View narrow switches correctly.
- [ ] Touch, trackpad hover (preview cards), right-click and Control-click menus; no Story opens after a secondary click.
- [ ] Software keyboard and Scribble in notes, search, headline, excerpt, bio.

**iPad + Apple Pencil (real device)**
- [ ] Hover over a Story shows its preview; hover alone never changes anything.
- [ ] Tap controls with the Pencil; Scribble in ordinary inputs; the field does not jump while writing.
- [ ] Drag the focal point, then interrupt (Pencil out of range, system gesture): it does not stay stuck.
- [ ] Finger long-press still opens a context menu.

**macOS Safari**
- [ ] Hover previews, right-click and Control-click menus, Command shortcuts (⌘K), Add to Dock.
