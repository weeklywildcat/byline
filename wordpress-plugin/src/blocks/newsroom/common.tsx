import apiFetch from "@wordpress/api-fetch";
import { Button, Notice, Placeholder, Spinner } from "@wordpress/components";
import { useEffect, useState } from "@wordpress/element";
import { __ } from "@wordpress/i18n";
import type { ReactNode } from "react";

export type PreviewStory = {
  id: number;
  date?: string;
  link?: string;
  title?: { rendered?: string };
  excerpt?: { rendered?: string };
  author?: number;
  featured_media?: number;
  _embedded?: {
    author?: Array<{ name?: string }>;
    "wp:featuredmedia"?: Array<{ source_url?: string; alt_text?: string; media_details?: { width?: number; height?: number } }>;
  };
};

export type PreviewPerson = {
  id: number;
  name: string;
  slug?: string;
  description?: string;
  link?: string;
  bylineProfile?: {
    role?: string;
    profilePhoto?: { url?: string; alt?: string; width?: number | null; height?: number | null };
    socials?: Record<string, string>;
  };
};

export type PreviewGame = {
  id: number;
  title?: string;
  opponent?: string;
  site?: string;
  startDate?: string;
  status?: string;
  wildcatsScore?: number | null;
  opponentScore?: number | null;
  sportLabel?: string;
  season?: string;
  locationName?: string;
  display?: {
    matchup?: string;
    date?: string;
    location?: string;
    status?: string;
    score?: string | null;
    sportLevel?: string;
    scoreboard?: {
      team?: { label?: string; score?: number | null };
      wildcats?: { label?: string; score?: number | null };
      opponent?: { label?: string; score?: number | null };
    };
  };
  team?: { displayName?: string; logo?: { url?: string; alt?: string } };
};

export type PreviewEvent = {
  id: number;
  title: string;
  startDate?: string;
  endDate?: string;
  eventType?: string;
  location?: string;
  externalUrl?: string;
  display?: { date?: string; time?: string; status?: string };
};

export type PreviewPoll = {
  id: string;
  postId?: number;
  question: string;
  status?: string;
  options: Array<{ id: string; label: string }>;
};

export type PreviewResponse<T> = {
  data: T | null;
  isLoading: boolean;
  error: string;
};

export function useBylineApi<T>(path: string | null): PreviewResponse<T> {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(path));
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    if (!path) {
      setData(null);
      setIsLoading(false);
      setError("");
      return () => {
        cancelled = true;
      };
    }

    setIsLoading(true);
    setError("");

    apiFetch<T>({ path })
      .then((next) => {
        if (!cancelled) setData(next);
      })
      .catch(() => {
        if (!cancelled) {
          setData(null);
          setError(__("Preview data is unavailable right now.", "weekly-wildcat-headless"));
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [path]);

  return { data, isLoading, error };
}

export function queryPath(path: string, query: Record<string, string | number | boolean | undefined>) {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== "") params.set(key, String(value));
  });
  const suffix = params.toString();
  return suffix ? `${path}?${suffix}` : path;
}

export function boundedNumber(value: unknown, fallback: number, minimum = 1, maximum = 12) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.round(number)));
}

export function HtmlPreview({ html, className }: { html?: string; className?: string }) {
  return <span className={className} dangerouslySetInnerHTML={{ __html: html || "" }} />;
}

export function PreviewFrame({
  label,
  children,
  isLoading,
  error,
  empty,
  onRetry
}: {
  label: string;
  children?: ReactNode;
  isLoading?: boolean;
  error?: string;
  empty?: string;
  onRetry?: () => void;
}) {
  if (isLoading) {
    return (
      <Placeholder label={label} instructions={__("Loading representative public data…", "weekly-wildcat-headless")}>
        <Spinner />
      </Placeholder>
    );
  }

  if (error) {
    return (
      <Placeholder label={label} instructions={error}>
        {onRetry ? <Button variant="secondary" onClick={onRetry}>{__("Try again", "weekly-wildcat-headless")}</Button> : null}
      </Placeholder>
    );
  }

  if (empty) {
    return <Placeholder label={label} instructions={empty} />;
  }

  return <div className="byline-newsroom-editor-preview">{children}</div>;
}

export function StoryPreviewCard({
  story,
  variant = "standard",
  showImage = true,
  showExcerpt = false,
  showByline = true,
  showDate = true
}: {
  story: PreviewStory;
  variant?: "lead" | "standard" | "list";
  showImage?: boolean;
  showExcerpt?: boolean;
  showByline?: boolean;
  showDate?: boolean;
}) {
  const image = story._embedded?.["wp:featuredmedia"]?.[0];
  const title = story.title?.rendered || __("Untitled story", "weekly-wildcat-headless");
  const author = story._embedded?.author?.[0]?.name;
  const imageUrl = image?.source_url;
  const href = story.link || "#";
  const date = story.date ? new Date(story.date).toLocaleDateString() : "";

  return (
    <article className={`story-teaser story-teaser-${variant}${showImage && imageUrl ? "" : " story-teaser-no-image"}`}>
      {showImage && imageUrl ? (
        <figure className="featured-image">
          <div className="featured-image-frame">
            <img src={imageUrl} alt={image?.alt_text || ""} width={image?.media_details?.width} height={image?.media_details?.height} />
          </div>
        </figure>
      ) : null}
      <div className="story-teaser-body">
        {showByline || showDate ? (
          <div className="article-byline">
            {showByline && author ? <span>{author}</span> : null}
            {showDate && date ? <time dateTime={story.date}>{date}</time> : null}
          </div>
        ) : null}
        <h3><a href={href}><HtmlPreview html={title} /></a></h3>
        {showExcerpt && story.excerpt?.rendered ? <div className="story-excerpt"><HtmlPreview html={story.excerpt.rendered} /></div> : null}
      </div>
    </article>
  );
}

export function PersonPreviewCard({
  person,
  layout = "portrait-grid",
  showPhoto = true,
  showRole = true,
  showBio = true,
  showSocials = false
}: {
  person: PreviewPerson;
  layout?: "portrait-grid" | "compact-list";
  showPhoto?: boolean;
  showRole?: boolean;
  showBio?: boolean;
  showSocials?: boolean;
}) {
  const profile = person.bylineProfile;
  const photo = profile?.profilePhoto;
  const initials = person.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "P";
  const socialLinks = Object.entries(profile?.socials || {}).filter(([, value]) => value).slice(0, 3);

  return (
    <article className="byline-person-card">
      <a className="byline-person-card-link" href={person.link || "#"}>
        {showPhoto ? (photo?.url ? <img className="byline-person-photo" src={photo.url} alt={photo.alt || ""} width={photo.width || 120} height={photo.height || 120} /> : <span className="byline-person-initials" aria-hidden="true">{initials}</span>) : null}
        <div>
          <h3 className="byline-person-name">{person.name}</h3>
          {showRole && profile?.role ? <p className="byline-person-role">{profile.role}</p> : null}
          {showBio && person.description ? <p className="byline-person-bio">{person.description}</p> : null}
          {showSocials && socialLinks.length > 0 ? (
            <span className="byline-person-socials">{socialLinks.map(([service, href]) => <span key={service}>{service}: <span>{href}</span></span>)}</span>
          ) : null}
        </div>
      </a>
    </article>
  );
}

export function GamePreview({ game, showDetails = true, showLogos = true, showLink = false }: { game: PreviewGame; showDetails?: boolean; showLogos?: boolean; showLink?: boolean }) {
  const scoreboard = game.display?.scoreboard;
  const team = scoreboard?.team || scoreboard?.wildcats;
  const hasScore = team?.score !== null && team?.score !== undefined && scoreboard?.opponent?.score !== null && scoreboard?.opponent?.score !== undefined;
  const status = game.display?.status || game.status || __("Status pending", "weekly-wildcat-headless");

  return (
    <div className="byline-game-score byline-game-score-editor-preview">
      <p className="byline-game-score-meta"><span className="byline-game-score-status">{status}</span><span>{game.display?.sportLevel || game.sportLabel || __("Sports", "weekly-wildcat-headless")}</span></p>
      <div className="byline-game-score-rows" role="group" aria-label={game.display?.score || game.display?.matchup || game.title || "Game"}>
        <div className="byline-game-score-team">{showLogos && game.team?.logo?.url ? <img className="byline-game-score-team-logo" src={game.team.logo.url} alt={game.team.logo.alt || ""} /> : null}<span className="byline-game-score-team-name">{team?.label || game.team?.displayName || __("Team", "weekly-wildcat-headless")}</span><span className="byline-game-score-team-score">{hasScore ? team?.score : "—"}</span></div>
        <div className="byline-game-score-team"><span className="byline-game-score-team-name">{scoreboard?.opponent?.label || game.opponent || __("Opponent", "weekly-wildcat-headless")}</span><span className="byline-game-score-team-score">{hasScore ? scoreboard?.opponent?.score : "—"}</span></div>
      </div>
      {showDetails ? <p className="byline-game-score-details"><span>{game.display?.date || game.startDate || __("Date pending", "weekly-wildcat-headless")}</span>{game.display?.location ? <span>{game.display.location}</span> : null}</p> : null}
      {showLink ? <p className="byline-game-score-link"><a href={`/sports/schedule/#game-${game.id}`}>{__("View Game Center", "weekly-wildcat-headless")}</a></p> : null}
    </div>
  );
}

export function PollPreview({ poll, heading = __("Your Opinion", "weekly-wildcat-headless") }: { poll: PreviewPoll; heading?: string }) {
  return (
    <section className="byline-poll-block">
      <h2>{heading}</h2>
      <p className="byline-poll-question">{poll.question}</p>
      <div className="byline-poll-options">
        {poll.options.map((option) => <label className="byline-poll-option" key={option.id}><input type="radio" name={`preview-poll-${poll.id}`} readOnly /><span>{option.label}</span></label>)}
      </div>
    </section>
  );
}

export function ErrorNotice({ message }: { message: string }) {
  return <Notice status="warning" isDismissible={false}>{message}</Notice>;
}
