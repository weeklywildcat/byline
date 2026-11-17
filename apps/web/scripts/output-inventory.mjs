import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const OUTPUT_INVENTORY_FILE = "output-inventory.json";

export async function createOutputInventory(outputRoot) {
  const files = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(absolute);
      } else if (entry.isFile()) {
        const info = await stat(absolute);
        files.push({
          path: path.relative(outputRoot, absolute).split(path.sep).join("/"),
          bytes: info.size
        });
      }
    }
  }
  await visit(outputRoot);
  files.sort((a, b) => a.path.localeCompare(b.path));
  return { version: 1, files, totalBytes: files.reduce((sum, file) => sum + file.bytes, 0) };
}

export async function writeOutputInventory(projectRoot, outputRoot = path.join(projectRoot, "out")) {
  const inventory = await createOutputInventory(outputRoot);
  const buildRoot = path.join(projectRoot, ".byline-build");
  await mkdir(buildRoot, { recursive: true });
  await writeFile(path.join(buildRoot, OUTPUT_INVENTORY_FILE), JSON.stringify(inventory) + "\n");
  return inventory;
}

export async function loadOutputInventory(projectRoot, outputRoot = path.join(projectRoot, "out")) {
  const inventory = JSON.parse(await readFile(path.join(projectRoot, ".byline-build", OUTPUT_INVENTORY_FILE), "utf8"));
  if (inventory?.version !== 1 || !Array.isArray(inventory.files)) throw new Error("Invalid build output inventory.");
  return {
    ...inventory,
    absoluteFiles: inventory.files.map((file) => path.join(outputRoot, ...file.path.split("/"))),
    bytesByPath: new Map(inventory.files.map((file) => [file.path, file.bytes]))
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const inventory = await writeOutputInventory(projectRoot);
  console.log(`Inventoried ${inventory.files.length} public build files (${inventory.totalBytes} bytes).`);
}
