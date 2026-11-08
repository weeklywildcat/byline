import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/** Plugin sources, then the shared newsroom screens they were moved to (packages/newsroom-screens). */
export const pluginSrc = path.resolve(__dirname, "../src");
export const screensSrc = path.resolve(__dirname, "../../packages/newsroom-screens/src");

export function sourcePath(relative: string): string {
  const own = path.join(pluginSrc, relative);
  return existsSync(own) ? own : path.join(screensSrc, relative);
}

export const readSource = (relative: string) => readFileSync(sourcePath(relative), "utf8");
