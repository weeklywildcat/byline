# Nova component composition

Byline uses shadcn base-nova as a component vocabulary, not a checklist. The
goal is to choose the component whose interaction semantics match the newsroom
job and then use the component's complete composition before inventing custom
chrome.

## Composition rules

| Need | Byline component choice |
| --- | --- |
| One person with a real photo | `Avatar` |
| Several pictured people in dense UI | `AvatarGroup` + `AvatarGroupCount`; add `HoverCard` only when names are intentionally not printed nearby |
| Searchable person/story/entity | `Combobox` |
| Short custom choice | `Select` |
| Simple static choice, especially Settings/mobile | `NativeSelect` |
| Binary setting | `Switch` inside `Field` |
| Related actions | `ButtonGroup` |
| Mutually exclusive UI state | `ToggleGroup` |
| Alternate views of the same on-screen collection | `Tabs` |
| Small anchored filter/choice | `Popover`; use its header/title/description when the popover becomes a mini form |
| Focused create/edit flow on desktop | `Dialog` |
| The same long create/edit flow on a phone | `Drawer` |
| Complementary side content that should preserve the current page | `Sheet` |
| Consequential confirmation or loss of unsaved work | `AlertDialog` |
| Recoverable warning/error with a direct next step | `Alert` + `AlertAction` |
| Scannable content + metadata + actions | `Item` / `ItemGroup` |
| Distinct grouped object or section | `Card` |
| File/media object | full `Attachment` composition, including Group, Media, Trigger and Actions |
| Long owned scroll region inside an overlay | `ScrollArea` |
| Technical/support text | `CodeBlock` with copy action |
| Real measurable completion | `Progress`; use `Spinner` for indeterminate work |
| Large server-paged archive | `Table` + `Pagination`; use the Data Table pattern only once selection/configurable columns/bulk actions are required |

## Current deliberate non-uses

These are not omissions.

- **Data Table:** Stories and Media Desk need responsive scanning, not row
  selection, bulk actions or configurable columns. Newsletter issues use a
  normal Table plus server Pagination. Adopt TanStack Data Table only when its
  interaction model is needed.
- **Chart:** Performance currently receives point metrics and ranked lists, not
  a time series. A chart would imply data that the API does not provide.
- **Resizable:** the Story Workspace layout does not need user-resizable panes
  enough to justify persisted sizing and extra keyboard interaction.
- **Navigation Menu:** WordPress already owns the application navigation;
  Settings uses a local Sidebar instead of website-style navigation.
- **Bubble, Message and Message Scroller:** Activity is not a conversation.
  These become appropriate only if Byline gains actual threaded messaging.
- **Carousel, Menubar, Input OTP, Slider, Trace and Questionnaire:** no current
  newsroom workflow benefits from their interaction semantics.
- **AvatarBadge:** reserved for a real avatar-attached state such as presence.
  Roles, workflow and assignment state belong in text/Badge metadata instead.
- **Progress:** never substitutes for a spinner when the amount of work is
  unknown.
- **HoverCard/Tooltip:** supplemental information only. Essential names and
  actions remain available without hover.

## Legacy admin migration

The unified Settings, Newsletters and Doctor screens now mount inside
`AdminRoot`, so the same scoped Nova theme, tooltip provider, portal root and
Sonner toaster used by Home/Planning/Workspace are available there too.
Compatibility adapters keep the existing business logic while replacing the old
WordPress control layer with Nova Field/Input/NativeSelect/Switch/Alert/Button
primitives. New work should import Nova primitives directly.

Settings uses a grouped Sidebar with a mobile Sheet, branding previews use
AspectRatio, technical contract output uses CodeBlock, and settings saves use
toasts. Newsletters use InputGroup search, NativeSelect, responsive Table/Item
views, Badge status, Empty/Alert states and server Pagination. Doctor uses
Badge, Alert/AlertAction, Progress, Accordion and CodeBlock.
