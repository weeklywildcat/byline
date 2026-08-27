import type { ReactNode } from "react";
import { Icon } from "./Icon";

// The poll's chrome, shared so Studio does not reimplement it.
//
// Only the shell is shared. Voting is client-interactive and depends on a runtime
// API that does not exist during a static export or inside the WordPress admin,
// so production supplies the interactive body while Studio supplies a read-only
// one. The card an editor sees is the real card.
export type PollCardProps = {
  children: ReactNode;
};

export function PollCard({ children }: PollCardProps) {
  return (
    <section className="homepage-poll-card" aria-labelledby="homepage-poll-heading">
      <div className="homepage-poll-heading">
        <span>
          <Icon name="ph:chart-bar-horizontal" width={17} height={17} />
        </span>
        <h2 id="homepage-poll-heading">Your Opinion</h2>
      </div>
      {children}
    </section>
  );
}
