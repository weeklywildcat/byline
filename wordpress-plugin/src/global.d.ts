declare module "*.css";

declare module "@wordpress/blocks" {
  export function registerBlockType(metadata: unknown, settings: unknown): unknown;
}

declare module "@wordpress/block-editor" {
  export const BlockControls: any;
  export const InnerBlocks: any;
  export const InspectorControls: any;
  export const RichText: any;
  export const useBlockProps: any;
}

declare module "@wordpress/edit-post" {
  import type { ComponentType, ReactNode } from "react";

  export const PluginDocumentSettingPanel: ComponentType<{
    name: string;
    title: string;
    className?: string;
    initialOpen?: boolean;
    children?: ReactNode;
  }>;
}

/**
 * The block-editor SlotFills the workflow sidebar uses.
 *
 * `@wordpress/editor` is deliberately not an npm dependency: its transitive
 * `react-autosize-textarea` peer-depends on react-dom ^16, which forces npm to
 * hoist React 18 over the React 19 the Next app requires. The package is a
 * WordPress runtime global in every environment that matters —
 * @wordpress/scripts externalises every `@wordpress/*` import to `wp.*`, and the
 * generated asset manifest declares `wp-editor` so WordPress enqueues the real
 * one — so only its types are needed here. This declares exactly the surface
 * used, and nothing more.
 */
declare module "@wordpress/editor" {
  import type { ComponentType, ReactNode } from "react";

  export const PluginPostStatusInfo: ComponentType<{ className?: string; children?: ReactNode }>;
  export const PluginSidebar: ComponentType<{
    name: string;
    title: string;
    icon?: unknown;
    className?: string;
    children?: ReactNode;
  }>;
  export const PluginSidebarMoreMenuItem: ComponentType<{
    target: string;
    icon?: unknown;
    children?: ReactNode;
  }>;
}

interface Window {
  wp?: {
    media: (options: Record<string, unknown>) => {
      on: (event: string, callback: () => void) => void;
      open: () => void;
      state: () => { get: (key: string) => { first: () => { get: (key: string) => unknown; toJSON: () => Record<string, unknown> } } };
    };
  };
}
