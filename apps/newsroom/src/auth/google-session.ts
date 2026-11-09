import { sql, type PostgresAdapter } from "@payloadcms/db-postgres";
import { commitTransaction, getFieldsToSign, initTransaction, jwtSign, killTransaction, type PayloadRequest } from "payload";
import { addSessionToUser, generatePayloadCookie } from "payload/shared";
import type { GoogleIdentity } from "./google-identity";

type GoogleSessionRow = {
  id: number;
  email: string;
  google_subject: string | null;
  enabled: boolean;
};

/** Called only after Google's identity has been verified. Lock the matching rows
 * until the binding and session commit together. The unique subject index also
 * prevents two different account rows from claiming the same subject. */
export async function createGoogleSession(req: PayloadRequest, { email, subject }: GoogleIdentity) {
  const { payload } = req;
  const collectionConfig = payload.collections.users.config;
  if (!collectionConfig.auth.useSessions || !await initTransaction(req)) {
    throw new Error("Google sign-in requires Payload sessions and a database transaction.");
  }
  try {
    const tx = (payload.db as unknown as PostgresAdapter).sessions[String(await req.transactionID)]?.db;
    if (!tx) throw new Error("Google sign-in transaction unavailable.");

    const matches = await tx.execute<GoogleSessionRow>(
      sql`select id, lower(btrim(email)) as email, google_subject, enabled from users
          where google_subject = ${subject} or lower(btrim(email)) = ${email}
          order by id for update`,
    );
    const rows = matches.rows as GoogleSessionRow[];
    const bound = rows.filter((row) => row.google_subject === subject);
    const byEmail = rows.filter((row) => row.email === email);
    const account = bound.length === 1 ? bound[0] : bound.length === 0 && byEmail.length === 1 ? byEmail[0] : null;
    if (!account || account.enabled !== true || (account.google_subject !== null && account.google_subject !== subject)) {
      await killTransaction(req);
      return null;
    }

    if (account.google_subject === null) {
      await payload.db.updateOne({ collection: "users", id: account.id, data: { googleSubject: subject }, req });
    }
    const doc = await payload.findByID({ collection: "users", id: account.id, depth: 0, req, overrideAccess: true });
    const user = { ...doc, collection: "users" as const };
    // Payload 3.92.1's native session primitives. Its local-jwt strategy reloads
    // this user and checks the persisted sid on ordinary Admin/API requests.
    const { sid } = await addSessionToUser({ collectionConfig, payload, req, user });
    if (!sid) throw new Error("Payload did not create a session.");
    const { token } = await jwtSign({
      fieldsToSign: getFieldsToSign({ collectionConfig, email: doc.email, sid, user }),
      secret: payload.secret,
      tokenExpiration: collectionConfig.auth.tokenExpiration,
    });
    const cookie = generatePayloadCookie({ collectionAuthConfig: collectionConfig.auth, cookiePrefix: payload.config.cookiePrefix, token });
    await commitTransaction(req);
    return cookie;
  } catch (error) {
    await killTransaction(req);
    throw error;
  }
}
