import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { BylineShell } from "./BylineShell";
import { SIDEBAR_COOKIE } from "./shell-config";

/**
 * `admin.components.providers`: mounts the Byline shell above every admin
 * view. A server component only so the remembered sidebar state is known on
 * the first paint.
 */
export async function BylineShellProvider({ children }: { children?: ReactNode }) {
  const store = await cookies();
  return <BylineShell defaultOpen={store.get(SIDEBAR_COOKIE)?.value !== "false"}>{children}</BylineShell>;
}
