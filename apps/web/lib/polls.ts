/**
 * Canonical public poll API contract.
 *
 * WordPress is the authoritative poll datastore. The publication reaches it
 * through the relative same-origin routes below, which a host Worker proxies to
 * `/byline/v1/polls/*`. This module is types and constants only: it holds no
 * database access and no poll business logic.
 */

/** Relative, publication-agnostic endpoints. Never a CMS hostname. */
export const POLL_ACTIVE_ENDPOINT = "/api/polls/active";
export const POLL_VOTE_ENDPOINT = "/api/polls/vote";

/** Canonical WordPress routes the host proxy forwards those endpoints to. */
export const CMS_POLL_ACTIVE_ROUTE = "/byline/v1/polls/active";
export const CMS_POLL_VOTE_ROUTE = "/byline/v1/polls/vote";

/**
 * Response threshold before results are released. WordPress enforces it; this
 * constant exists so the legacy fallback in `pollResultsVisible` matches, and so
 * the two implementations can be pinned to the same number by a test.
 */
export const MIN_RESULTS_VOTES = 5;

export type PollOption = {
  id: string;
  label: string;
  votes: number;
};

export type ActivePoll = {
  id: string;
  question: string;
  options: PollOption[];
  /** 0 while `resultsAvailable` is false; the real total is withheld, not just the per-option split. */
  totalVotes: number;
  /**
   * Authoritative signal for whether public results may be shown. While it is
   * false every count in the payload, including `totalVotes`, is withheld and
   * reported as 0, so a low-response poll cannot be watched filling up.
   *
   * Optional only for compatibility with a CMS that predates the field.
   */
  resultsAvailable?: boolean;
};

export type PollVoteRequest = {
  pollId: string;
  optionId: string;
};

/** Error bodies carry the current poll when one is known, e.g. on a 409. */
export type PollErrorResponse = {
  error: string;
  poll?: ActivePoll;
};

export type PollResponse = ActivePoll | PollErrorResponse;

export function isPollErrorResponse(payload: PollResponse): payload is PollErrorResponse {
  return typeof (payload as PollErrorResponse).error === "string";
}

/**
 * Whether public results may be shown.
 *
 * `resultsAvailable` is the authoritative signal and is trusted outright when
 * present: the client must not second-guess it, and counting votes to decide for
 * itself is exactly what the server-side suppression exists to prevent. The
 * total comparison is only a fallback for a CMS that predates the field.
 */
export function pollResultsVisible(poll: ActivePoll | null): boolean {
  if (!poll) {
    return false;
  }

  if (typeof poll.resultsAvailable === "boolean") {
    return poll.resultsAvailable;
  }

  return poll.totalVotes >= MIN_RESULTS_VOTES;
}
