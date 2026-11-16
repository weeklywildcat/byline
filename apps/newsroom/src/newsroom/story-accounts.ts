import type { PayloadRequest } from "payload";
import { ASSIGNED_WORK_COLLECTIONS } from "../access/story-context";
import { relationId, relationIds } from "../access/user";

/**
 * The accounts connected to a Story through the existing Story access model, each with why: its creator, a
 * contributor through their linked person, anyone holding assigned work, and anyone holding the live grant.
 */
export async function storyAccounts(req: PayloadRequest, storyId: number): Promise<{ relation: Map<string, string>; granted: Set<string> }> {
  const { payload } = req;
  const base = { depth: 0, pagination: false, overrideAccess: true, req } as const;
  const [plan, ...work] = await Promise.all([
    payload.find({ collection: "story-plans", where: { story: { equals: storyId } }, limit: 1, depth: 0, select: { createdBy: true, contributors: true, livePublishers: true }, overrideAccess: true, req }),
    ...ASSIGNED_WORK_COLLECTIONS.map((collection) => payload.find({ collection, where: { story: { equals: storyId } }, select: { assignees: true } as never, ...base }))
  ]);
  const row = plan.docs[0];
  const granted = new Set(relationIds(row?.livePublishers).map(String));
  const relation = new Map<string, string>();
  const note = (id: unknown, why: string) => { const key = String(relationId(id) ?? ""); if (key && !relation.has(key)) relation.set(key, why); };
  note(row?.createdBy, "Started this story");
  const contributorPeople = relationIds(row?.contributors);
  if (contributorPeople.length) {
    const linked = await payload.find({ collection: "users", where: { linkedPerson: { in: contributorPeople } }, select: { linkedPerson: true }, ...base });
    for (const user of linked.docs) note(user.id, "On the byline");
  }
  for (const result of work) for (const record of result.docs as Array<{ assignees?: unknown }>) for (const user of relationIds(record.assignees)) note(user, "Has work on this story");
  for (const id of granted) note(id, "May already publish");
  return { relation, granted };
}
