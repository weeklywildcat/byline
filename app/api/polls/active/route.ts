import { NextResponse } from "next/server";
import { getActivePoll, getPollDatabase } from "@/lib/polls";

export const dynamic = "force-static";

export async function GET() {
  const db = getPollDatabase();

  if (!db) {
    return NextResponse.json({ error: "Poll database is not configured." }, { status: 500 });
  }

  const poll = await getActivePoll(db);

  if (!poll) {
    return NextResponse.json({ error: "No active poll is available." }, { status: 404 });
  }

  return NextResponse.json(poll, {
    headers: {
      "Cache-Control": "no-store"
    }
  });
}
