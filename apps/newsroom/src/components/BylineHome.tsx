import { Gutter } from "@payloadcms/ui";
import Link from "next/link";
import type { AdminViewServerProps } from "payload";
import { atLeast, requestUser } from "../access/user";
import { newsroomTimeZone } from "../domain/dates";
import { loadNewsroomHome, type HomeStory, type HomeWork } from "../newsroom/home";

function formatWhen(value: string | null, timeZone: string, withTime: boolean) {
  if (!value) return "";
  // Date-only values are calendar days, never instants.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, day)));
  }
  return new Intl.DateTimeFormat("en-US", withTime ? { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone } : { month: "short", day: "numeric", timeZone }).format(new Date(value));
}

function StoryList({ stories, admin, empty }: { stories: HomeStory[]; admin: string; empty: string }) {
  if (stories.length === 0) return <p className="byline-home__empty">{empty}</p>;
  return (
    <ul className="byline-home__list">
      {stories.map((story) => (
        <li key={story.id}>
          <Link href={`${admin}/collections/stories/${story.id}`} prefetch={false}>{story.headline}</Link>
          <span className="byline-home__meta">
            Workflow: {story.workflowLabel} · Publication: {story.publication === "published" ? "Published" : "Draft"}
            {story.deadline ? ` · Due ${formatWhen(story.deadline, "UTC", false)}` : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}

function WorkList({ rows, admin, empty, timeZone, withTime }: { rows: HomeWork[]; admin: string; empty: string; timeZone: string; withTime: boolean }) {
  if (rows.length === 0) return <p className="byline-home__empty">{empty}</p>;
  return (
    <ul className="byline-home__list">
      {rows.map((row) => (
        <li key={row.id}>
          {row.storyId !== null ? <Link href={`${admin}/collections/stories/${row.storyId}`} prefetch={false}>{row.title}</Link> : row.title}
          <span className="byline-home__meta">
            {row.detail}
            {row.when ? ` · ${formatWhen(row.when, timeZone, withTime)}` : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Byline Home, replacing Payload's collections dashboard. It re-checks the
 * account on the server and reads everything through access-controlled Local
 * API calls; being inside the admin layout is not, by itself, permission.
 */
export async function BylineHome({ initPageResult }: AdminViewServerProps) {
  const { req } = initPageResult;
  const user = requestUser(req);
  const admin = req.payload.config.routes.admin;
  if (!user) {
    return (
      <Gutter>
        <p>Your account is not enabled for Byline. Ask an administrator for access.</p>
      </Gutter>
    );
  }
  const timeZone = newsroomTimeZone();
  const home = await loadNewsroomHome(req, { timeZone });
  const editor = atLeast(user, "editor");

  return (
    <Gutter className="byline-home">
      <header className="byline-home__header">
        <h1>Home</h1>
        <Link className="btn btn--style-primary btn--size-medium" href={`${admin}/collections/stories/create`} prefetch={false}>
          New story
        </Link>
      </header>

      {home.board && (
        <section aria-labelledby="byline-board" className="byline-home__board">
          <h2 id="byline-board">Stories by stage</h2>
          <ul>
            {home.board.map((column) => (
              <li key={column.stage}>
                <span className="byline-home__count">{column.count}</span>
                {column.label}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="byline-home__grid">
        <section aria-labelledby="byline-mine">
          <h2 id="byline-mine">My work</h2>
          <StoryList stories={home.myStories} admin={admin} empty="No stories in progress." />
        </section>
        <section aria-labelledby="byline-due">
          <h2 id="byline-due">Due soon</h2>
          <StoryList stories={home.dueSoon} admin={admin} empty="Nothing due in the next three days." />
        </section>
        <section aria-labelledby="byline-today">
          <h2 id="byline-today">Today</h2>
          <WorkList rows={home.todaysAppointments} admin={admin} empty="No appointments today." timeZone={timeZone} withTime />
        </section>
        <section aria-labelledby="byline-production">
          <h2 id="byline-production">My production work</h2>
          <WorkList rows={home.myProduction} admin={admin} empty="No open assignments." timeZone={timeZone} withTime />
        </section>
        <section aria-labelledby="byline-tasks">
          <h2 id="byline-tasks">My tasks</h2>
          <WorkList rows={home.myTasks} admin={admin} empty="No open tasks." timeZone={timeZone} withTime />
        </section>
        {editor && home.readyForReview && (
          <section aria-labelledby="byline-ready">
            <h2 id="byline-ready">Ready for Review</h2>
            <StoryList stories={home.readyForReview} admin={admin} empty="Nothing is waiting for review." />
          </section>
        )}
      </div>
    </Gutter>
  );
}
