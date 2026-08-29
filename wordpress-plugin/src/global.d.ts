declare module "*.css";

declare module "@wordpress/blocks" {
  export function __unstableGetInnerBlocksProps(...args: any[]): any;
  export function createBlock(...args: any[]): any;
  export function getBlockType(...args: any[]): any;
  export function parse(...args: any[]): any;
  export function registerBlockType(metadata: unknown, settings: unknown): unknown;
  export function serialize(...args: any[]): any;
  export function unregisterBlockType(...args: any[]): any;
  export function validateBlock(...args: any[]): any;
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

  export const PluginPostStatusInfo: ComponentType<{ className?: string; children?: ReactNode }>;
  export const PluginSidebar: ComponentType<{
    name: string;
    title: string;
    icon?: unknown;
    className?: string;
    children?: ReactNode;
  }>;
  export const PluginPrePublishPanel: ComponentType<{ className?: string; children?: ReactNode }>;
  export const PluginPostPublishPanel: ComponentType<{ className?: string; children?: ReactNode }>;
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
 * `@wordpress/edit-post` is a WordPress runtime global in every environment
 * that matters. `@wordpress/scripts` externalises every `@wordpress/*` import
 * to `wp.*`, and the generated asset manifest declares `wp-edit-post` so
 * WordPress enqueues the package that owns these editor SlotFills. This
 * declares exactly the surface used, and nothing more.
 */
interface Window {
  wp?: {
    media: (options: Record<string, unknown>) => {
      on: (event: string, callback: () => void) => void;
      open: () => void;
      state: () => { get: (key: string) => { first: () => { get: (key: string) => unknown; toJSON: () => Record<string, unknown> } } };
    };
  };
}
