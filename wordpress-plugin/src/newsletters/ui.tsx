import { Button, Notice, Placeholder, Spinner } from "../admin-ui/components/legacy-control-adapters";
import { Badge } from "../admin-ui/ui/badge";
import { Alert, AlertAction, AlertDescription } from "../admin-ui/ui/alert";
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
  const variant = status === "failed" ? "destructive" : status === "sent" ? "secondary" : "outline";
  return <Badge variant={variant} title={newsletterStatusDescription(status)}>{newsletterStatusLabel(status)}</Badge>;
}

export function ProviderStatus({ status, configured }: { status: NewsletterConnectionStatus; configured: boolean }) {
  const label = configured ? providerStatusLabel(status) : __("Not configured", "weekly-wildcat-headless");
  return <Badge variant={status === "connected" ? "secondary" : "outline"}>{label}</Badge>;
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
  return <Alert role="status">
    <AlertDescription>{children}</AlertDescription>
    {action ? <AlertAction>{action}</AlertAction> : null}
  </Alert>;
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
