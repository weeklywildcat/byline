import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SearchIndexItem } from "@/lib/search";
import { createSearchIndexDocument, SEARCH_INDEX_URL } from "@/lib/search-index";

export async function writeSearchIndex(items: SearchIndexItem[]) {
  const outputFile = path.join(process.cwd(), "out", SEARCH_INDEX_URL.replace(/^\/+/, ""));

  await mkdir(path.dirname(outputFile), { recursive: true });
  await writeFile(outputFile, `${JSON.stringify(createSearchIndexDocument(items))}\n`, "utf8");
}
