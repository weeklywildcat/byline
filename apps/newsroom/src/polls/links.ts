/**
 * Wildcat Polls' respondent addresses (docs/wildcat-polls.md). One place, so
 * Poll Studio, the pages and the tests agree.
 *
 * - `/poll`: pair a polling device with a code from Poll Studio.
 * - `/poll/<key>`: a public poll (canonical). `/polls/s/<key>` still works.
 * - `/polls/kiosk`: the paired device's poll.
 */
export const PAIR_PATH = "/poll";
export const KIOSK_PATH = "/polls/kiosk";
export const PUBLIC_POLL_KEY = /^[A-Za-z0-9]{8,40}$/;

export const publicPollPath = (key: string) => `/poll/${key}`;
export const legacyPublicPollPath = (key: string) => `/polls/s/${key}`;
/** The pairing page with the code in the fragment: the browser never sends a fragment to the server, so the code stays out of logs. */
export const pairingPath = (code: string) => `${PAIR_PATH}#${code.replace(/[^A-Za-z0-9]/g, "")}`;
