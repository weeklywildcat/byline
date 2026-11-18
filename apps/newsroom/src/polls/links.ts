/**
 * Wildcat Polls' respondent addresses (docs/wildcat-polls.md). One place, so
 * Poll Studio, the pages and the tests agree.
 *
 * - `/poll`: set up a polling device with a code or a Byline sign-in.
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


/** Signed-in destination used by /poll when the interviewer wants to set up this device directly. */
export const deviceSetupPath = (admin: string) => `${admin}/polls?view=fieldwork&setupDevice=1`;

/** Keep authentication inside Payload's admin login; it returns to the focused Poll device-setup flow. */
export const deviceSetupSignInPath = (admin: string, login: string) =>
  `${admin}${login}?${new URLSearchParams({ redirect: deviceSetupPath(admin) })}`;
