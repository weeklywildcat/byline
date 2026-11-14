/**
 * The first name to greet an account by: the first word of its name, without
 * surrounding punctuation. Null when there is nothing a person would call
 * themselves (an empty name, an email address used as a name, a stray symbol),
 * so the greeting falls back to "Welcome to Byline."
 */
export function firstName(name: unknown): string | null {
  if (typeof name !== "string") return null;
  const first = name.trim().split(/\s+/)[0] ?? "";
  if (first.includes("@")) return null;
  const cleaned = first.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
  if (!cleaned || !/\p{L}/u.test(cleaned) || cleaned.length > 40) return null;
  return cleaned;
}
