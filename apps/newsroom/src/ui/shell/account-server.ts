import type { ServerProps } from "payload";
import { relationId } from "../../access/user";

/** The account's byline person, read as the user: their newsroom title and portrait, when there is one. */
export async function linkedPerson(payload: ServerProps["payload"], user: ServerProps["user"], id: number | string | null): Promise<{ newsroomRole: string; avatarUrl: string | null; exists: boolean }> {
  if (id === null) return { newsroomRole: "", avatarUrl: null, exists: false };
  try {
    const person = await payload.findByID({ collection: "people", id, depth: 1, overrideAccess: false, user, select: { newsroomRole: true, portrait: true } });
    const portrait = person.portrait;
    const url = portrait && typeof portrait === "object" && relationId(portrait) !== null && typeof portrait.url === "string" && portrait.mimeType?.startsWith("image/") ? portrait.url : null;
    return { newsroomRole: typeof person.newsroomRole === "string" ? person.newsroomRole.trim() : "", avatarUrl: url, exists: true };
  } catch {
    return { newsroomRole: "", avatarUrl: null, exists: false };
  }
}
