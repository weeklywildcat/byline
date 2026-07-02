import { NextResponse } from "next/server";
import { getPollDatabase, getPollEnv, submitPollVote } from "@/lib/polls";

export const dynamic = "force-static";

export async function POST(request: Request) {
  const db = getPollDatabase();

  if (!db) {
    return NextResponse.json({ error: "Poll database is not configured." }, { status: 500 });
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Send a valid vote request." }, { status: 400 });
  }

  const body = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const result = await submitPollVote({
    db,
    pollId: body.pollId,
    optionId: body.optionId,
    cookieHeader: request.headers.get("cookie"),
    env: getPollEnv()
  });
  const responseBody = result.ok ? result.poll : { error: result.error, poll: result.poll };
  const response = NextResponse.json(responseBody, {
    status: result.ok ? 200 : result.status,
    headers: {
      "Cache-Control": "no-store"
    }
  });

  result.setCookies?.forEach((cookie) => {
    response.headers.append("Set-Cookie", cookie);
  });

  return response;
}
