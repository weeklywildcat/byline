import type { ComponentType, ReactNode } from "react";
import { createElement } from "react";

/**
 * What every repository-owned article feature shares, whatever editorial idea
 * it serves (a Repository Interactive, a Repository Tracker): a stable key, a
 * newsroom name and description, one server-rendered component that is always
 * in the HTML, and whether a browser enhancement (`client.ts` beside it)
 * exists. Registries are plain data plus that component, so a host can list
 * and validate features without loading any of their browser code.
 */
export type RepositoryFeature<Props> = {
  /** The stable key stored in the article. Never renamed once a story uses it. */
  key: string;
  /** What the newsroom calls it. */
  name: string;
  /** What it does, one sentence, shown when choosing it. */
  description: string;
  /** The static, server-rendered content: always in the HTML, useful with no script. */
  Fallback: ComponentType<Props>;
  /** Whether the feature has a browser enhancement (`client.ts` beside it). */
  client: boolean;
};

export type RepositoryFeatureDescriptor = { key: string; name: string; description: string; client: boolean };

/** The browser enhancement's contract: given the root element it fills, return a cleanup. */
export type RepositoryFeatureClient = (root: HTMLElement) => void | (() => void);

/** A registry as plain data, for a host that must describe features without loading any of their code. */
export function describeRepositoryFeatures(registry: Readonly<Record<string, Pick<RepositoryFeature<unknown>, "key" | "name" | "description" | "client">>>): RepositoryFeatureDescriptor[] {
  return Object.values(registry).map(({ key, name, description, client }) => ({ key, name, description, client }));
}

/** A renderer host hook: a registered feature's server-rendered content, or nothing for an unknown key. */
export function renderRepositoryFeature<Props extends { title: string; description: string }>(registry: Readonly<Record<string, RepositoryFeature<Props>>>) {
  return (block: { key: string; title: string; description: string }): ReactNode => {
    const entry = registry[block.key];
    return entry ? createElement(entry.Fallback, { title: block.title, description: block.description } as Props) : null;
  };
}
