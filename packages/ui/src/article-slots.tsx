"use client";

import type { FormEventHandler, ReactNode, Ref } from "react";
import { Icon } from "./Icon";

/**
 * The visual half of the article's interactive slots (share, reader feedback,
 * newsletter). The public site's components own the behavior (clipboard,
 * feedback POST, Kit embed) and render through these; the newsroom's Live
 * Preview renders the same markup inert, so the slots look identical there but
 * can vote, submit or subscribe to nothing. No network, script or storage
 * side effects live here.
 */

export type ArticleShareActionsViewProps = {
  copyLabel: string;
  copyIcon: string;
  /** Text for the status live region; empty while idle. */
  status: string;
  onShare?: () => void;
  onCopy?: () => void;
};

export function ArticleShareActionsView({ copyLabel, copyIcon, status, onShare, onCopy }: ArticleShareActionsViewProps): ReactNode {
  return (
    <div className="article-share-actions" aria-label="Share this story">
      <button type="button" onClick={onShare} title="Share this story" aria-label="Share this story">
        <Icon name="ph:share-fat" width={18} height={18} />
      </button>
      <button type="button" onClick={onCopy} title={copyLabel} aria-label={copyLabel}>
        <Icon name={copyIcon} width={18} height={18} />
      </button>
      <span className="article-share-status" role="status">{status}</span>
    </div>
  );
}

export type NewsletterSignupViewProps = {
  headingId?: string;
  heading: string;
  showLabel?: boolean;
  /** The Kit embed's mount point (public site only). */
  embedRef?: Ref<HTMLDivElement>;
  /** Shown instead of the embed when the publication has none. */
  fallbackLink?: { href: string; label: string } | null;
  preferredSource: { href: string; label: string };
};

export function NewsletterSignupView({ headingId = "article-newsletter-heading", heading, showLabel = true, embedRef, fallbackLink, preferredSource }: NewsletterSignupViewProps): ReactNode {
  return (
    <aside className="article-newsletter-signup" aria-labelledby={headingId}>
      <div className="article-newsletter-copy">
        {showLabel ? <p className="article-newsletter-kicker">Newsletter</p> : null}
        <h2 id={headingId}>{heading}</h2>
        <p>Catch the newest stories and campus updates when they publish.</p>
      </div>

      {fallbackLink ? <a className="article-newsletter-generic-link" href={fallbackLink.href}>{fallbackLink.label}</a> : <div className="article-newsletter-kit" ref={embedRef} />}

      <p className="article-newsletter-preferred">
        <a href={preferredSource.href} target="_blank" rel="noopener">{preferredSource.label}</a>
      </p>
    </aside>
  );
}

export type ReaderFeedbackViewProps = {
  type: string;
  message: string;
  name: string;
  email: string;
  submitting: boolean;
  /** Status line text (thanks / error); empty otherwise. */
  status: ReactNode;
  onType?: (value: string) => void;
  onMessage?: (value: string) => void;
  onName?: (value: string) => void;
  onEmail?: (value: string) => void;
  onSubmit?: FormEventHandler<HTMLFormElement>;
  /** Inert (Live Preview): every control disabled. */
  inert?: boolean;
};

export function ReaderFeedbackView({ type, message, name, email, submitting, status, onType, onMessage, onName, onEmail, onSubmit, inert = false }: ReaderFeedbackViewProps): ReactNode {
  const disabled = submitting || inert;
  return (
    <section className="reader-feedback" aria-labelledby="reader-feedback-heading">
      <details>
        <summary id="reader-feedback-heading">Spot an error or have a note? Send us feedback</summary>
        <div className="reader-feedback-body">
          <p>Help us keep this story accurate. We review every submission.</p>
          <form onSubmit={onSubmit}>
            <label>
              What would you like to share?
              <select value={type} onChange={(event) => onType?.(event.target.value)} disabled={disabled}>
                <option value="correction">Correction</option>
                <option value="tip">Tip</option>
                <option value="general">General feedback</option>
              </select>
            </label>
            <label>
              Message
              <textarea required maxLength={5000} value={message} onChange={(event) => onMessage?.(event.target.value)} disabled={disabled} rows={5} />
            </label>
            <div className="reader-feedback-fields">
              <label>
                Name <span>(optional)</span>
                <input type="text" maxLength={120} value={name} onChange={(event) => onName?.(event.target.value)} disabled={disabled} />
              </label>
              <label>
                Email <span>(optional)</span>
                <input type="email" maxLength={254} value={email} onChange={(event) => onEmail?.(event.target.value)} disabled={disabled} />
              </label>
            </div>
            <div className="reader-feedback-honeypot" aria-hidden="true">
              <label>
                Leave this field empty
                <input name="website" tabIndex={-1} autoComplete="off" />
              </label>
            </div>
            <button type="submit" disabled={disabled}>{submitting ? "Sending…" : "Send feedback"}</button>
            <p className="reader-feedback-status" role="status" aria-live="polite">{status}</p>
          </form>
        </div>
      </details>
    </section>
  );
}
