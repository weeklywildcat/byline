import {
  buildPollVotedCookie,
  buildVoterCookie,
  createVoterId,
  hashVoterKey,
  readSignedVoterId,
  signVoterId
} from "@/lib/voter-cookie";

export type PollOption = {
  id: string;
  label: string;
  votes: number;
};

export type ActivePoll = {
  id: string;
  question: string;
  options: PollOption[];
  totalVotes: number;
};

type PollRow = {
  id: string;
  question: string;
};

type PollOptionRow = {
  id: string;
  label: string;
  votes: number;
};

type PollEnv = {
  DB?: D1DatabaseLike;
  POLLS_DB?: D1DatabaseLike;
  POLL_COOKIE_SECRET?: string;
  VOTER_COOKIE_SECRET?: string;
};

type D1Result<T> = {
  results?: T[];
};

type D1PreparedStatementLike = {
  bind(...values: unknown[]): D1PreparedStatementLike;
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<D1Result<T>>;
  run(): Promise<unknown>;
};

export type D1DatabaseLike = {
  prepare(query: string): D1PreparedStatementLike;
};

export type VoteResult =
  | {
      ok: true;
      poll: ActivePoll;
      setCookies: string[];
    }
  | {
      ok: false;
      status: number;
      error: string;
      poll?: ActivePoll;
      setCookies?: string[];
    };

export function getPollEnv(): PollEnv {
  const globalEnv = globalThis as typeof globalThis & PollEnv;

  return {
    DB: globalEnv.DB,
    POLLS_DB: globalEnv.POLLS_DB,
    POLL_COOKIE_SECRET: process.env.POLL_COOKIE_SECRET || globalEnv.POLL_COOKIE_SECRET,
    VOTER_COOKIE_SECRET: process.env.VOTER_COOKIE_SECRET || globalEnv.VOTER_COOKIE_SECRET
  };
}

export function getPollDatabase(env: PollEnv = getPollEnv()) {
  return env.POLLS_DB || env.DB || null;
}

export function getPollCookieSecret(env: PollEnv = getPollEnv()) {
  return env.POLL_COOKIE_SECRET || env.VOTER_COOKIE_SECRET || process.env.POLL_COOKIE_SECRET || process.env.VOTER_COOKIE_SECRET || "";
}

export async function getActivePoll(db: D1DatabaseLike, now = new Date()) {
  const nowIso = now.toISOString();
  const poll = await db
    .prepare(
      `SELECT id, question
       FROM polls
       WHERE status = 'open'
         AND (opens_at IS NULL OR opens_at <= ?)
         AND (closes_at IS NULL OR closes_at > ?)
       ORDER BY COALESCE(opens_at, created_at) DESC, created_at DESC
       LIMIT 1`
    )
    .bind(nowIso, nowIso)
    .first<PollRow>();

  return poll ? getPollWithTotals(db, poll.id, poll) : null;
}

export async function getOpenPollById(db: D1DatabaseLike, pollId: string, now = new Date()) {
  const nowIso = now.toISOString();
  const poll = await db
    .prepare(
      `SELECT id, question
       FROM polls
       WHERE id = ?
         AND status = 'open'
         AND (opens_at IS NULL OR opens_at <= ?)
         AND (closes_at IS NULL OR closes_at > ?)
       LIMIT 1`
    )
    .bind(pollId, nowIso, nowIso)
    .first<PollRow>();

  return poll ? getPollWithTotals(db, poll.id, poll) : null;
}

export async function getPollWithTotals(db: D1DatabaseLike, pollId: string, pollRow?: PollRow): Promise<ActivePoll | null> {
  const poll =
    pollRow ??
    (await db.prepare("SELECT id, question FROM polls WHERE id = ? LIMIT 1").bind(pollId).first<PollRow>());

  if (!poll) {
    return null;
  }

  const optionRows = await db
    .prepare(
      `SELECT poll_options.id, poll_options.label, COUNT(poll_votes.id) AS votes
       FROM poll_options
       LEFT JOIN poll_votes ON poll_votes.option_id = poll_options.id
       WHERE poll_options.poll_id = ?
       GROUP BY poll_options.id, poll_options.label, poll_options.position
       ORDER BY poll_options.position ASC, poll_options.id ASC`
    )
    .bind(pollId)
    .all<PollOptionRow>();
  const options = (optionRows.results ?? []).map((option) => ({
    id: option.id,
    label: option.label,
    votes: Number(option.votes) || 0
  }));

  return {
    id: poll.id,
    question: poll.question,
    options,
    totalVotes: options.reduce((total, option) => total + option.votes, 0)
  };
}

export async function submitPollVote({
  db,
  pollId,
  optionId,
  cookieHeader,
  env = getPollEnv()
}: {
  db: D1DatabaseLike;
  pollId: unknown;
  optionId: unknown;
  cookieHeader?: string | null;
  env?: PollEnv;
}): Promise<VoteResult> {
  if (typeof pollId !== "string" || typeof optionId !== "string" || !pollId || !optionId) {
    return { ok: false, status: 400, error: "Choose a poll option before voting." };
  }

  const secret = getPollCookieSecret(env);

  if (!secret) {
    return { ok: false, status: 500, error: "Poll voting is not configured yet." };
  }

  const poll = await getOpenPollById(db, pollId);

  if (!poll) {
    return { ok: false, status: 404, error: "Poll is not open." };
  }

  if (!poll.options.some((option) => option.id === optionId)) {
    return { ok: false, status: 400, error: "That answer does not belong to this poll." };
  }

  let voterId = await readSignedVoterId(cookieHeader, secret);
  const setCookies: string[] = [];

  if (!voterId) {
    voterId = createVoterId();
    setCookies.push(buildVoterCookie(await signVoterId(voterId, secret)));
  }

  const voterKey = await hashVoterKey(voterId, secret);

  try {
    await db
      .prepare("INSERT INTO poll_votes (id, poll_id, option_id, voter_key) VALUES (?, ?, ?, ?)")
      .bind(crypto.randomUUID(), pollId, optionId, voterKey)
      .run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const updatedPoll = (await getPollWithTotals(db, pollId, poll)) ?? poll;
    const votedCookie = buildPollVotedCookie(pollId);

    if (/unique|constraint/i.test(message)) {
      return {
        ok: false,
        status: 409,
        error: "Already voted.",
        poll: updatedPoll,
        setCookies: setCookies.includes(votedCookie) ? setCookies : [...setCookies, votedCookie]
      };
    }

    throw error;
  }

  const updatedPoll = (await getPollWithTotals(db, pollId, poll)) ?? poll;

  return {
    ok: true,
    poll: updatedPoll,
    setCookies: [...setCookies, buildPollVotedCookie(pollId)]
  };
}
