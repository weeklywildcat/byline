const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", hellip: "…", ndash: "–", mdash: "—", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”" };

/**
 * WordPress texturizes titles (`get_the_title` turns an apostrophe into
 * `&#8217;`). React escapes text, so those entities would print literally;
 * this turns them back into the characters they stand for. Plain text in, plain
 * text out: nothing is ever treated as markup.
 */
export function decodeEntities(value: string | null | undefined): string {
  if (!value || !value.includes("&")) return value || "";
  return value.replace(/&(?:#(\d{1,7})|#x([0-9a-f]{1,6})|([a-z]+));/gi, (match, decimal?: string, hex?: string, name?: string) => {
    if (decimal || hex) {
      const code = decimal ? Number(decimal) : parseInt(hex as string, 16);
      return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return NAMED[(name as string).toLowerCase()] ?? match;
  });
}
