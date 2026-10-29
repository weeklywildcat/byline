import { readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";
import { tools } from "../src/catalog";
import { instructions } from "../src/server";
const catalog = {
  instructions,
  tools: tools.map(t => ({
    name: t.name, title: t.title, description: t.description,
    capability: t.capability, api: t.api, permission: t.permission,
    inputSchema: z.toJSONSchema(t.input, {io: "input"}),
    dataSchema: z.toJSONSchema(t.data, {io: "output"}),
    outputSchema: z.toJSONSchema(t.output, {io: "output"}),
    annotations: {readOnlyHint: t.readOnly, destructiveHint: t.destructive,
      idempotentHint: t.idempotent, openWorldHint: t.name === "deployment.trigger"},
  })),
};
// Refinements that cannot be expressed by Zod's JSON Schema exporter.
for (const tool of catalog.tools) {
  const props = tool.inputSchema.properties as Record<string, Record<string, unknown>>;
  if (props.changes) props.changes.minProperties = 1;
  if (tool.name === "task.create") {
    tool.inputSchema.oneOf = [{required:["storyId"],not:{required:["collectionId"]}},
      {required:["collectionId"],not:{required:["storyId"]}}];
  }
}
const path = new URL("../../../wordpress-plugin/includes/mcp/catalog.json", import.meta.url);
const content = JSON.stringify(catalog) + "\n";
if (process.argv.includes("--check")) {
  if (readFileSync(path,"utf8") !== content) throw Error("Plugin MCP schemas are stale. Run npm run mcp:catalog.");
} else writeFileSync(path,content);
console.log(`Validated ${tools.length} plugin MCP schemas.`);
