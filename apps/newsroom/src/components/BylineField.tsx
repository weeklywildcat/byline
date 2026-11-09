import type { AdminViewServerProps } from "payload";
import { redirectIfSignedOut } from "../auth/session";
import { requestUser } from "../access/user";
import { FieldApp } from "../ui/field/FieldApp";

/**
 * Field Mode (`/admin/field`, docs/field-mode.md): the same authenticated
 * newsroom with an intentionally small, phone-first shell. It deliberately
 * does not render Payload's DefaultTemplate (the desktop sidebar and header)
 * or anything from the article editor, Front Page Desk or Distribution.
 */
export function BylineField({ initPageResult, params, searchParams }: AdminViewServerProps) {
  const { req } = initPageResult;
  redirectIfSignedOut({ req, params, searchParams });
  const user = requestUser(req);
  // The outbox is per account (by id), so two people sharing a phone never see each other's queue.
  return <FieldApp api={req.payload.config.routes.api} admin={req.payload.config.routes.admin} account={user ? String(user.id) : ""} signedIn={user !== null} />;
}
