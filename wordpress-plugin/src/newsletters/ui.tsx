import { Button, Notice, Placeholder, Spinner } from "@wordpress/components";
import { __ } from "@wordpress/i18n";
import type { ReactNode } from "react";

import {
  newsletterStatusDescription,
  newsletterStatusLabel,
  providerStatusLabel,
  type NewsletterConnectionStatus,
  type NewsletterStatus
} from "./models";

import "./style.css";

export function NewsletterStatusBadge({ status }: { status: NewsletterStatus }) {
  return (
    <span className={`byline-newsletter-status byline-newsletter-status-${status}`} title={newsletterStatusDescription(status)}>
      <span aria-hidden="true" className="byline-newsletter-status-dot" />
      {newsletterStatusLabel(status)}
    </span>
  );
}

export function ProviderStatus({ status, configured }: { status: NewsletterConnectionStatus; configured: boolean }) {
  const label = configured ? providerStatusLabel(status) : __("Not configured", "weekly-wildcat-headless");
  return <span className={`byline-newsletter-provider-status byline-newsletter-provider-status-${status}`}>{label}</span>;
}

export function LoadingState({ label }: { label: string }) {
  return (
    <Placeholder label={label} instructions={__("Loading newsletter data…", "weekly-wildcat-headless")}>
      <Spinner />
    </Placeholder>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Notice status="error" isDismissible={false}>
      <p>{message}</p>
      {onRetry ? <Button variant="secondary" onClick={onRetry}>{__("Try again", "weekly-wildcat-headless")}</Button> : null}
    </Notice>
  );
}

export function OptionalUnavailable({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="byline-newsletter-optional" role="status">
      <p>{children}</p>
      {action ? <div>{action}</div> : null}
    </div>
  );
}

export function formatNewsletterDate(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function formatNewsletterDateOnly(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}
