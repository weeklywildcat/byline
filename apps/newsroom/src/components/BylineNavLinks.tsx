import Link from "next/link";
import type { ServerProps } from "payload";
import { newsroomUser } from "../access/user";
import { navigationFor } from "../domain/navigation";

/** Byline's own navigation at the top of the admin sidebar, filtered by role. */
export function BylineNavLinks({ user, payload }: ServerProps) {
  const account = newsroomUser(user);
  if (!account) return null;
  const admin = payload.config.routes.admin;
  return (
    <nav aria-label="Byline" className="byline-nav">
      <p className="byline-nav__brand">Byline</p>
      <ul>
        {navigationFor(account.role).map((item) => (
          <li key={item.key}>
            <Link className="nav__link byline-nav__link" href={`${admin}${item.path}`} prefetch={false}>
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
