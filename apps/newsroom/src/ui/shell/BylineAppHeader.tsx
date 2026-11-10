import type { ServerProps } from "payload";
import { newsroomUser } from "../../access/user";
import { linkedPerson } from "./account-server";
import { BylineHeaderBar } from "./BylineHeaderBar";

export async function BylineAppHeader({ user, payload }: ServerProps) {
  const account = newsroomUser(user);
  if (!account) return null;
  const { routes, admin } = payload.config;
  const person = await linkedPerson(payload, user, account.linkedPerson);
  return <BylineHeaderBar role={account.role} hasProfile={person.exists} loginHref={`${routes.admin}${admin.routes.login}`} />;
}
