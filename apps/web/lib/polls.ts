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
 * Responses stay aggregate-only until this many people have answered. The rule
 * is enforced by WordPress as well; the frontend threshold must match it so the
 * UI and the API agree.
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
  totalVotes: number;
  /**
   * False while the response threshold has not been reached, in which case
   * every per-option count is withheld and reported as 0.
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
 * Whether detailed results may be shown. Honors the server's own suppression
 * flag when present so the UI can never display counts the API withheld.
 */
export function pollResultsVisible(poll: ActivePoll | null): boolean {
  if (!poll) {
    return false;
  }

  return poll.resultsAvailable !== false && poll.totalVotes >= MIN_RESULTS_VOTES;
}
