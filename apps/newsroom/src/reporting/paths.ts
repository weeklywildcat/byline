import path from "node:path";
import { newsroomAppRoot, privateMediaDir } from "../publication-media/paths";

/**
 * Private reporting files (interview audio, documents) live in their own
 * directory, never inside Media's: `BYLINE_REPORTING_LOCAL_DIR`, default
 * `reporting-files` beside the newsroom's Media originals. Payload serves them
 * only through the `reporting-files` file route, under that collection's read
 * access (docs/reporting.md#private-files). Nothing here is ever copied into
 * a publication store or the static build.
 */
export function privateReportingDir(env: Record<string, string | undefined> = process.env, cwd?: string) {
  const configured = env.BYLINE_REPORTING_LOCAL_DIR?.trim();
  if (configured) return path.isAbsolute(configured) ? path.normalize(configured) : path.resolve(newsroomAppRoot(cwd), configured);
  return path.resolve(path.dirname(privateMediaDir(env, cwd)), "reporting-files");
}
