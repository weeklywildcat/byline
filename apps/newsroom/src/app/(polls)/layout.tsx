/**
 * Wildcat Polls' respondent routes (docs/wildcat-polls.md): the kiosk and
 * public links. Their own root layout, deliberately not Payload's admin: no
 * newsroom navigation, account, search or data is ever rendered here.
 */
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "../../ui/polls.css";

export const metadata: Metadata = {
  title: "Wildcat Polls",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  appleWebApp: { capable: true, title: "Wildcat Polls", statusBarStyle: "default" },
  referrer: "no-referrer"
};
// `cover` so the respondent screens can reach the edges and clear the insets themselves.
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#ffffff" };

export default function PollsLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-background text-foreground" style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
