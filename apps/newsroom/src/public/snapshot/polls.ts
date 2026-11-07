import { sql } from "@payloadcms/db-postgres";
import type { PublicPollReference } from "@byline/article-body";
import { PUBLIC_POLL_MIN_RESULTS_VOTES } from "@byline/content";
import type { Payload } from "payload";
import { drizzleFor } from "../../publication-media/state";
import { publicPollReference } from "../references";
import { publicRead } from "./datasets";

export async function collectPolls(payload: Payload, ids: number[], now: Date): Promise<Map<number, PublicPollReference>> {
  if (!ids.length) return new Map();
  const { docs } = await payload.find({ collection: "polls", where: { id: { in: ids } }, sort: "id", ...publicRead,
    select: { pollKey: true, question: true, options: true, status: true, opensAt: true, closesAt: true } });
  const polls = new Map<number, PublicPollReference>();
  for (const row of docs) {
    const poll = publicPollReference(row, now);
    if (!poll) continue;
    if (row.status === "closed" || (row.closesAt && Date.parse(row.closesAt) <= now.getTime())) {
      // Read only aggregate counts for a finished poll. Match the existing public five-response floor.
      const db = await drizzleFor(payload);
      const { rows } = await db.execute(sql`select option_id, count(*) as votes from byline_poll_votes where poll_id = ${poll.id} group by option_id`);
      const counts = new Map(rows.map((entry) => [entry.option_id, Number(entry.votes)]));
      const votes = Object.fromEntries(poll.options.map(({ id }) => [id, counts.get(id) ?? 0]));
      const totalVotes = Object.values(votes).reduce((sum, count) => sum + count, 0);
      if (totalVotes >= PUBLIC_POLL_MIN_RESULTS_VOTES) poll.results = { totalVotes, votes };
    }
    polls.set(row.id, poll);
  }
  return polls;
}
