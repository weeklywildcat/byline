/**
 * Convert markup-bearing input into plain UI text without regex-based tag
 * removal. A malformed or nested opening tag cannot reappear in the result.
 */
export function stripMarkupForText(value: string): string {
  let output = "";
  let insideTag = false;

  for (const character of value) {
    if (character === "<") {
      insideTag = true;
      continue;
    }

    if (character === ">") {
      insideTag = false;
      continue;
    }

    if (!insideTag) {
      output += character;
    }
  }

  return output.replace(/\s+/g, " ").trim();
}
