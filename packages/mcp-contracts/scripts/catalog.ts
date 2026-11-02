import { readFileSync, writeFileSync } from "node:fs";
import { tools } from "../src/catalog";
const escape = (s: string) => s.replaceAll("|", "\\|").replaceAll("\n", " ");
const table =
  `# Byline MCP tool catalog\n\nGenerated from registration metadata by \`npm run mcp:catalog\`. Do not edit this table by hand.\n\n${tools.length} semantic tools. WordPress capabilities and per-object domain permissions are authoritative on every call; visibility hints never grant access.\n\n| Tool | Purpose | Read/write | Destructive | Required Byline capability/domain permission | Canonical API/domain |\n|---|---|---|---|---|---|\n` +
  tools
    .map(
      (t) =>
        `| \`${t.name}\` | ${escape(t.description)} | ${
          t.readOnly ? "Read" : "Write"
        } | ${t.destructive ? "Yes" : "No"} | ${escape(
          t.permission,
        )} | ${escape(t.api)} |`,
    )
    .join("\n") +
  "\n";
const path = new URL("../../../docs/mcp-tools.md", import.meta.url);
if (process.argv.includes("--check")) {
  if (readFileSync(path, "utf8") !== table)
    throw new Error(
      "MCP catalog documentation is stale. Run npm run mcp:catalog.",
    );
} else writeFileSync(path, table);
console.log(`Validated ${tools.length} documented MCP tools.`);
