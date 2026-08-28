import { Button, Notice, Spinner } from "@wordpress/components";
import { useState } from "@wordpress/element";
import type { DistributionAction, DistributionChannel, DistributionCopyKind, DistributionPanelCapabilities } from "./editorial-model";
import {
  buildDistributionCopy,
  canUseDistributionAction,
  describeEditorialError,
  distributionStatusLabel
} from "./editorial-model";
import "./editorial.css";

export type DistributionPanelProps = {
  headline: string;
  canonicalUrl: string;
  excerpt?: string;
  channels: DistributionChannel[];
  capabilities: DistributionPanelCapabilities;
  isLoading?: boolean;
  isSaving?: boolean;
  error?: unknown;
  providerError?: unknown;
  onAction: (channelId: string, action: Extract<DistributionAction, "send" | "schedule" | "markDistributed">) => Promise<void> | void;
  onCopy?: (text: string, kind: DistributionCopyKind, channel: DistributionChannel) => Promise<void> | void;
  onAddToNewsletter?: () => Promise<void> | void;
};

/** Distribution is optional: provider failures leave copy and editorial state available. */
export function DistributionPanel({
  headline,
  canonicalUrl,
  excerpt = "",
  channels,
  capabilities,
  isLoading = false,
  isSaving = false,
  error,
  providerError,
  onAction,
  onCopy,
  onAddToNewsletter
}: DistributionPanelProps) {
  const [actionError, setActionError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const run = (key: string, operation: () => Promise<void> | void) => {
    setActionError(null);
    setMessage(null);
    setBusyAction(key);
    void Promise.resolve()
      .then(operation)
      .catch((caught: unknown) => setActionError(describeEditorialError(caught)))
      .finally(() => setBusyAction(null));
  };

  const copy = (channel: DistributionChannel, kind: DistributionCopyKind) => {
    if (!canUseDistributionAction(channel, "copy")) return;
    const value = buildDistributionCopy(kind, headline, canonicalUrl, excerpt);
    run(`copy:${channel.id}:${kind}`, async () => {
      if (onCopy) {
        await onCopy(value, kind, channel);
      } else if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        throw new Error("Clipboard access is unavailable. Select the URL or copy text manually.");
      }
      setMessage(`${kind === "url" ? "Canonical URL" : kind === "caption" ? "Caption" : "Headline and URL"} copied for ${channel.label}.`);
    });
  };

  const action = (channel: DistributionChannel, nextAction: Extract<DistributionAction, "send" | "schedule" | "markDistributed">) => {
    if (!canUseDistributionAction(channel, nextAction)) return;
    run(`${nextAction}:${channel.id}`, () => onAction(channel.id, nextAction));
  };

  return (
    <section className="byline-editorial-panel byline-editorial-distribution-panel" aria-labelledby="byline-editorial-distribution-heading">
      <div className="byline-editorial-panel-heading">
        <div>
          <span className="byline-editorial-eyebrow">After publication</span>
          <h2 id="byline-editorial-distribution-heading">Distribution</h2>
        </div>
        {isLoading || isSaving ? <Spinner /> : null}
      </div>

      {error ? <Notice status="warning" isDismissible={false}>{describeEditorialError(error)}</Notice> : null}
      {providerError ? <Notice status="warning" isDismissible={false}>An optional distribution provider is unavailable. Copy and local newsroom actions remain available: {describeEditorialError(providerError)}</Notice> : null}
      {actionError ? <Notice status="error" isDismissible={false}>{actionError}</Notice> : null}
      {message ? <Notice status="success" isDismissible={false}>{message}</Notice> : null}

      <div className="byline-editorial-distribution-toolbar">
        {capabilities.addToNewsletter && onAddToNewsletter ? (
          <Button variant="primary" disabled={isSaving || busyAction !== null} onClick={() => run("newsletter", onAddToNewsletter)}>
            Add to next newsletter
          </Button>
        ) : null}
        {!capabilities.addToNewsletter ? <span className="byline-editorial-muted">Newsletter distribution is not configured.</span> : null}
      </div>

      {channels.length === 0 ? (
        <p className="byline-editorial-empty-state">No distribution channels are configured. The story can still publish normally.</p>
      ) : (
        <ul className="byline-editorial-distribution-list" aria-label="Story distribution channels">
          {channels.map((channel) => {
            const channelBusy = busyAction?.endsWith(`:${channel.id}`) || busyAction === `newsletter`;
            const canMark = canUseDistributionAction(channel, "markDistributed");
            const canSend = canUseDistributionAction(channel, "send");
            const canSchedule = canUseDistributionAction(channel, "schedule");
            return (
              <li className="byline-editorial-distribution-row" key={channel.id}>
                <div className="byline-editorial-distribution-heading">
                  <div>
                    <strong>{channel.label}</strong>
                    <span className={`byline-editorial-badge byline-editorial-badge-${channel.status}`}>{distributionStatusLabel(channel.status)}</span>
                  </div>
                  {channel.provider ? <span className="byline-editorial-muted">{channel.provider}</span> : null}
                </div>
                {channel.lastError ? <p className="byline-editorial-error-copy">{channel.lastError}</p> : null}
                {channel.status === "not-configured" ? <p className="byline-editorial-muted">Set up this channel in Byline Integrations to enable sending.</p> : null}
                <div className="byline-editorial-inline-actions byline-editorial-distribution-actions">
                  <Button variant="tertiary" disabled={!canUseDistributionAction(channel, "copy") || channelBusy} onClick={() => copy(channel, "caption")}>Copy caption</Button>
                  <Button variant="tertiary" disabled={!canUseDistributionAction(channel, "copy") || channelBusy} onClick={() => copy(channel, "headline-url")}>Copy headline + URL</Button>
                  <Button variant="tertiary" disabled={!canUseDistributionAction(channel, "copy") || channelBusy} onClick={() => copy(channel, "url")}>Copy canonical URL</Button>
                  {canMark ? <Button variant="secondary" disabled={channelBusy || isSaving} onClick={() => action(channel, "markDistributed")}>Mark distributed</Button> : null}
                  {canSend ? <Button variant="secondary" disabled={channelBusy || isSaving} onClick={() => action(channel, "send")}>Send now</Button> : null}
                  {canSchedule ? <Button variant="secondary" disabled={channelBusy || isSaving} onClick={() => action(channel, "schedule")}>Schedule</Button> : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
