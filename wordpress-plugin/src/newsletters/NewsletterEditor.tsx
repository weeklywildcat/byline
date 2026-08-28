import {
  Button,
  Notice,
  SearchControl,
  SelectControl,
  Spinner,
  TextControl,
  TextareaControl
} from "@wordpress/components";
import { __ } from "@wordpress/i18n";
import { useCallback, useEffect, useMemo, useState } from "@wordpress/element";

import type { NewsletterFetchers } from "./api";
import {
  addStoryIdempotently,
  availableNewsletterActions,
  canTransitionNewsletter,
  createBlankNewsletter,
  describeNewsletterError,
  normalizeNewsletterDraft,
  orderedStoryIds,
  removeStory,
  type Newsletter,
  type NewsletterAction,
  type NewsletterDraft,
  type NewsletterProvider,
  type NewsletterStory,
  type NewsletterStoryPlacement
} from "./models";
import { createNewsletterSnapshot, type NewsletterBranding, renderNewsletterHtml } from "./render";
import { ErrorState, formatNewsletterDate, LoadingState, OptionalUnavailable, ProviderStatus, NewsletterStatusBadge } from "./ui";

export type NewsletterEditorProps = {
  fetchers: NewsletterFetchers;
  newsletterId?: number;
  initialNewsletter?: NewsletterDraft;
  branding: NewsletterBranding;
  onBack?: () => void;
  onSaved?: (newsletter: Newsletter) => void;
};

function toRenderableNewsletter(draft: NewsletterDraft): Newsletter {
  return { ...draft, id: draft.id || 0 };
}
function fieldValue(value: string | null | undefined): string {
  return value || "";
}

function storyLabel(story: NewsletterStory): string {
  return story.title.trim() || __("Untitled story", "weekly-wildcat-headless");
}

export function NewsletterEditor({ fetchers, newsletterId, initialNewsletter, branding, onBack, onSaved }: NewsletterEditorProps) {
  const [draft, setDraft] = useState<NewsletterDraft>(() => initialNewsletter || createBlankNewsletter());
  const [stories, setStories] = useState<NewsletterStory[]>([]);
  const [providers, setProviders] = useState<NewsletterProvider[]>([]);
  const [isLoading, setIsLoading] = useState(Boolean(newsletterId));
  const [isSaving, setIsSaving] = useState(false);
  const [isActing, setIsActing] = useState<NewsletterAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [providerUnavailable, setProviderUnavailable] = useState(false);
  const [storyQuery, setStoryQuery] = useState("");
  const [storyPlacement, setStoryPlacement] = useState<NewsletterStoryPlacement>("additional");
  const [storyResults, setStoryResults] = useState<NewsletterStory[]>([]);
  const [storySearchError, setStorySearchError] = useState<string | null>(null);
  const [testRecipient, setTestRecipient] = useState("");

  const load = useCallback(async () => {
    setError(null);
    setNotice(null);
    setProviderUnavailable(false);
    setIsLoading(Boolean(newsletterId));

    try {
      if (newsletterId) {
        const result = await fetchers.get(newsletterId);
        setDraft({ ...result.newsletter });
        setStories(result.stories || []);
        if (result.providers?.length) setProviders(result.providers);
      }

      if (!newsletterId || !providers.length) {
        try {
          const providerResult = await fetchers.providers();
          setProviders(providerResult.providers);
        } catch {
          setProviders([]);
          setProviderUnavailable(true);
        }
      }
    } catch (loadError: unknown) {
      setError(describeNewsletterError(loadError, __("This newsletter could not be loaded.", "weekly-wildcat-headless")));
    } finally {
      setIsLoading(false);
    }
  }, [fetchers, newsletterId, providers.length]);

  useEffect(() => {
    void load();
    // The provider directory is deliberately loaded once per editor record;
    // changes made in Settings are refreshed by the host when reopening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchers, newsletterId]);

  const selectedProvider = useMemo(
    () => (draft.providerId ? providers.find((provider) => provider.id === draft.providerId) || null : null),
    [draft.providerId, providers]
  );
  const actions = useMemo(() => availableNewsletterActions(draft, selectedProvider), [draft, selectedProvider]);
  const selectedStoryIds = useMemo(() => new Set(orderedStoryIds(draft)), [draft]);
  const selectedStories = useMemo(
    () => orderedStoryIds(draft).map((id) => stories.find((story) => story.id === id)).filter((story): story is NewsletterStory => Boolean(story)),
    [draft, stories]
  );
  const preview = useMemo(
    () => createNewsletterSnapshot(toRenderableNewsletter(draft), selectedStories, branding),
    [branding, draft, selectedStories]
  );

  const updateDraft = useCallback(<K extends keyof NewsletterDraft>(key: K, value: NewsletterDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setNotice(null);
  }, []);

  const save = useCallback(async (): Promise<Newsletter | null> => {
    setIsSaving(true);
    setError(null);
    setNotice(null);
    try {
      const next = await fetchers.save(normalizeNewsletterDraft(draft));
      setDraft({ ...next });
      setNotice(__("Newsletter saved.", "weekly-wildcat-headless"));
      onSaved?.(next);
      return next;
    } catch (saveError: unknown) {
      setError(describeNewsletterError(saveError, __("The newsletter could not be saved.", "weekly-wildcat-headless")));
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [draft, fetchers, onSaved]);

  const searchStories = useCallback(async (query: string) => {
    setStoryQuery(query);
    if (query.trim().length < 2) {
      setStoryResults([]);
      setStorySearchError(null);
      return;
    }

    try {
      setStorySearchError(null);
      setStoryResults(await fetchers.searchStories(query.trim()));
    } catch (searchError: unknown) {
      setStoryResults([]);
      setStorySearchError(describeNewsletterError(searchError, __("Story search is unavailable.", "weekly-wildcat-headless")));
    }
  }, [fetchers]);

  const addStory = useCallback(async (story: NewsletterStory) => {
    if (selectedStoryIds.has(story.id)) return;
    setStories((current) => current.some((item) => item.id === story.id) ? current : [...current, story]);

    if (draft.id) {
      try {
        const updated = await fetchers.addStory(draft.id, story.id, storyPlacement);
        setDraft({ ...updated });
      } catch (addError: unknown) {
        setError(describeNewsletterError(addError, __("The story could not be added to this issue.", "weekly-wildcat-headless")));
      }
    } else {
      setDraft((current) => addStoryIdempotently(current, story.id, storyPlacement));
    }
  }, [draft.id, fetchers, selectedStoryIds, storyPlacement]);

  const removeSelectedStory = useCallback((storyId: number) => {
    setDraft((current) => removeStory(current, storyId));
  }, []);

  const moveAdditionalStory = useCallback((index: number, direction: -1 | 1) => {
    setDraft((current) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.additionalStoryIds.length) return current;
      const additionalStoryIds = [...current.additionalStoryIds];
      [additionalStoryIds[index], additionalStoryIds[nextIndex]] = [additionalStoryIds[nextIndex], additionalStoryIds[index]];
      return { ...current, additionalStoryIds };
    });
  }, []);

  const ensureSaved = useCallback(async (): Promise<Newsletter | null> => {
    if (draft.id) return toRenderableNewsletter(draft);
    return save();
  }, [draft, save]);

  const performAction = useCallback(async (action: NewsletterAction) => {
    if (!actions.includes(action)) return;
    const record = await ensureSaved();
    if (!record) return;

    if ((action === "send" || action === "schedule") && typeof window !== "undefined" && !window.confirm(action === "send" ? __("Send this newsletter now?", "weekly-wildcat-headless") : __("Schedule this newsletter for the selected time?", "weekly-wildcat-headless"))) return;
    if (action === "schedule" && !draft.scheduledAt) {
      setError(__("Choose a scheduled date and time before scheduling.", "weekly-wildcat-headless"));
      return;
    }

    setIsActing(action);
    setError(null);
    setNotice(null);
    try {
      if (action === "sendTest") {
        const response = await fetchers.sendTest(record.id, testRecipient.trim() || undefined);
        // A test send must never transition a draft to sent.
        setDraft((current) => ({ ...response.newsletter, status: current.status }));
        setNotice(response.message || __("Test email sent. The issue remains unsent.", "weekly-wildcat-headless"));
      } else if (action === "send") {
        const response = await fetchers.send(record.id);
        setDraft({ ...response.newsletter });
        setNotice(response.message || __("Newsletter send requested.", "weekly-wildcat-headless"));
      } else if (action === "schedule") {
        const response = await fetchers.schedule(record.id, draft.scheduledAt as string);
        setDraft({ ...response.newsletter });
        setNotice(response.message || __("Newsletter scheduled.", "weekly-wildcat-headless"));
      } else if (action === "cancel") {
        const response = await fetchers.cancel(record.id);
        setDraft({ ...response.newsletter });
        setNotice(response.message || __("Newsletter schedule cancelled.", "weekly-wildcat-headless"));
      }
    } catch (actionError: unknown) {
      setError(describeNewsletterError(actionError, __("The newsletter action could not be completed.", "weekly-wildcat-headless")));
    } finally {
      setIsActing(null);
    }
  }, [actions, draft.scheduledAt, ensureSaved, fetchers, testRecipient]);

  if (isLoading) return <LoadingState label={__("Newsletter editor", "weekly-wildcat-headless")} />;

  if (error && newsletterId && !draft.id) {
    return <ErrorState message={error} onRetry={() => void load()} />;
  }

  const additionalStoryEntries = draft.additionalStoryIds.map((id, index) => ({
    id,
    story: stories.find((story) => story.id === id)
  }));

  return (
    <section className="byline-newsletter-screen byline-newsletter-editor" aria-labelledby="byline-newsletter-editor-title">
      <header className="byline-newsletter-screen-header">
        <div>
          <div className="byline-newsletter-breadcrumbs">{onBack ? <Button variant="link" onClick={onBack}>{__("All newsletters", "weekly-wildcat-headless")}</Button> : null}</div>
          <h1 id="byline-newsletter-editor-title">{draft.title || __("New newsletter", "weekly-wildcat-headless")}</h1>
          <div className="byline-newsletter-editor-state"><NewsletterStatusBadge status={draft.status} />{draft.updatedAt ? <span>{__("Updated", "weekly-wildcat-headless")} {formatNewsletterDate(draft.updatedAt)}</span> : null}</div>
        </div>
        <div className="byline-newsletter-header-actions">
          <Button variant="secondary" onClick={() => void save()} isBusy={isSaving} disabled={isSaving || draft.status === "sending" || draft.status === "sent"}>
            {__("Save draft", "weekly-wildcat-headless")}
          </Button>
        </div>
      </header>

      {error ? <Notice status="error" isDismissible={false}><p>{error}</p></Notice> : null}
      {notice ? <Notice status="success" isDismissible={false}><p>{notice}</p></Notice> : null}
      {providerUnavailable ? <OptionalUnavailable>{__("Provider information is unavailable. Editing and saving remain available; delivery actions will appear after a provider connection is available.", "weekly-wildcat-headless")}</OptionalUnavailable> : null}

      <div className="byline-newsletter-editor-grid">
        <div className="byline-newsletter-editor-main">
          <div className="byline-newsletter-card">
            <h2>{__("Issue details", "weekly-wildcat-headless")}</h2>
            <TextControl label={__("Internal title", "weekly-wildcat-headless")} value={draft.title} onChange={(value: string) => updateDraft("title", value)} help={__("Use a recognizable name for the newsroom issue.", "weekly-wildcat-headless")} />
            <TextControl label={__("Subject", "weekly-wildcat-headless")} value={draft.subject} onChange={(value: string) => updateDraft("subject", value)} />
            <TextControl label={__("Preheader", "weekly-wildcat-headless")} value={draft.preheader} onChange={(value: string) => updateDraft("preheader", value)} help={__("The short text many inboxes show beside the subject.", "weekly-wildcat-headless")} />
            <TextControl label={__("Audience / list", "weekly-wildcat-headless")} value={draft.audience} onChange={(value: string) => updateDraft("audience", value)} />
            <TextareaControl label={__("Intro", "weekly-wildcat-headless")} value={draft.intro} onChange={(value: string) => updateDraft("intro", value)} help={__("Limited rich text is sanitized before preview and send.", "weekly-wildcat-headless")} rows={4} />
            <TextareaControl label={__("Section headings", "weekly-wildcat-headless")} value={draft.sectionHeadings.join("\n")} onChange={(value: string) => updateDraft("sectionHeadings", value.split(/\r?\n/).map((heading) => heading.trim()).filter(Boolean))} help={__("One optional heading per line, applied between selected stories.", "weekly-wildcat-headless")} rows={3} />
            <TextareaControl label={__("Outro", "weekly-wildcat-headless")} value={draft.outro} onChange={(value: string) => updateDraft("outro", value)} rows={4} />
          </div>

          <div className="byline-newsletter-card">
            <h2>{__("Stories", "weekly-wildcat-headless")}</h2>
            <p className="byline-newsletter-help">{__("Add a lead story and an ordered set of additional stories. The protected API treats repeated add requests as no-ops.", "weekly-wildcat-headless")}</p>
            <div className="byline-newsletter-story-picker-controls">
              <SearchControl label={__("Find a story", "weekly-wildcat-headless")} value={storyQuery} onChange={searchStories} placeholder={__("Search published stories…", "weekly-wildcat-headless")} />
              <SelectControl __nextHasNoMarginBottom label={__("Add as", "weekly-wildcat-headless")} value={storyPlacement} options={[{ label: __("Additional story", "weekly-wildcat-headless"), value: "additional" }, { label: __("Lead story", "weekly-wildcat-headless"), value: "lead" }]} onChange={(value: string) => setStoryPlacement(value as NewsletterStoryPlacement)} />
            </div>
            {storySearchError ? <Notice status="warning" isDismissible={false}><p>{storySearchError}</p></Notice> : null}
            {storyResults.length ? (
              <ul className="byline-newsletter-story-results">
                {storyResults.map((story) => {
                  const selected = selectedStoryIds.has(story.id);
                  return <li key={story.id}><span>{storyLabel(story)}</span><Button variant="secondary" disabled={selected} onClick={() => void addStory(story)}>{selected ? __("Added", "weekly-wildcat-headless") : __("Add story", "weekly-wildcat-headless")}</Button></li>;
                })}
              </ul>
            ) : storyQuery.trim().length >= 2 && !storySearchError ? <p className="byline-newsletter-muted">{__("No stories found.", "weekly-wildcat-headless")}</p> : null}

            <ol className="byline-newsletter-selected-stories">
              {draft.leadStoryId ? (
                <li className="byline-newsletter-selected-story byline-newsletter-selected-lead">
                  <div><span className="byline-newsletter-story-role">{__("Lead", "weekly-wildcat-headless")}</span><span>{stories.find((story) => story.id === draft.leadStoryId)?.title || `Story ${draft.leadStoryId}`}</span></div>
                  <Button variant="tertiary" onClick={() => removeSelectedStory(draft.leadStoryId as number)}>{__("Remove", "weekly-wildcat-headless")}</Button>
                </li>
              ) : null}
              {additionalStoryEntries.map(({ id, story }, index) => (
                <li className="byline-newsletter-selected-story" key={id}>
                  <div><span className="byline-newsletter-story-role">{__("Additional", "weekly-wildcat-headless")}</span><span>{story?.title || `Story ${id}`}</span></div>
                  <div className="byline-newsletter-story-actions">
                    <Button variant="tertiary" disabled={index === 0} onClick={() => moveAdditionalStory(index, -1)}>{__("Move up", "weekly-wildcat-headless")}</Button>
                    <Button variant="tertiary" disabled={index === additionalStoryEntries.length - 1} onClick={() => moveAdditionalStory(index, 1)}>{__("Move down", "weekly-wildcat-headless")}</Button>
                    <Button variant="tertiary" onClick={() => removeSelectedStory(id)}>{__("Remove", "weekly-wildcat-headless")}</Button>
                  </div>
                </li>
              ))}
            </ol>
            {!draft.leadStoryId && !draft.additionalStoryIds.length ? <p className="byline-newsletter-muted">{__("No stories selected yet.", "weekly-wildcat-headless")}</p> : null}
          </div>

          <div className="byline-newsletter-card">
            <h2>{__("Preview", "weekly-wildcat-headless")}</h2>
            <p className="byline-newsletter-help">{__("This preview uses the same deterministic renderer used for the send snapshot. Editor-entered HTML is sanitized.", "weekly-wildcat-headless")}</p>
            <iframe className="byline-newsletter-preview-frame" title={__("Newsletter HTML preview", "weekly-wildcat-headless")} srcDoc={renderNewsletterHtml(toRenderableNewsletter(draft), selectedStories, branding)} sandbox="" />
            <details className="byline-newsletter-plaintext-preview">
              <summary>{__("Plaintext alternative", "weekly-wildcat-headless")}</summary>
              <pre>{preview.plaintext}</pre>
            </details>
          </div>
        </div>

        <aside className="byline-newsletter-editor-sidebar">
          <div className="byline-newsletter-card">
            <h2>{__("Delivery", "weekly-wildcat-headless")}</h2>
            <SelectControl __nextHasNoMarginBottom label={__("Provider", "weekly-wildcat-headless")} value={draft.providerId || ""} options={[{ label: __("Choose a provider", "weekly-wildcat-headless"), value: "" }, ...providers.map((provider) => ({ label: provider.label, value: provider.id }))]} onChange={(value: string) => updateDraft("providerId", value || null)} disabled={draft.status === "sending" || draft.status === "sent"} />
            {selectedProvider ? <p className="byline-newsletter-provider-line"><ProviderStatus status={selectedProvider.connectionStatus} configured={selectedProvider.configured} />{selectedProvider.maskedIdentifier ? <span>{selectedProvider.maskedIdentifier}</span> : null}</p> : <p className="byline-newsletter-help">{__("Choose a configured provider to see only the actions it supports.", "weekly-wildcat-headless")}</p>}
            {selectedProvider && (!selectedProvider.configured || selectedProvider.connectionStatus === "unavailable") ? <OptionalUnavailable>{selectedProvider.setupMessage || __("Connect this provider in Newsletter Settings before sending.", "weekly-wildcat-headless")}</OptionalUnavailable> : null}

            {actions.includes("sendTest") ? <TextControl label={__("Test recipient (optional)", "weekly-wildcat-headless")} type="email" value={testRecipient} onChange={setTestRecipient} help={__("Leave blank to use the provider's configured test recipient.", "weekly-wildcat-headless")} /> : null}
            {actions.includes("schedule") ? <TextControl label={__("Scheduled date and time", "weekly-wildcat-headless")} type="datetime-local" value={fieldValue(draft.scheduledAt)} onChange={(value: string) => updateDraft("scheduledAt", value || null)} /> : null}

            <div className="byline-newsletter-delivery-actions" aria-label={__("Newsletter delivery actions", "weekly-wildcat-headless")}>
              {actions.includes("sendTest") ? <Button variant="secondary" onClick={() => void performAction("sendTest")} isBusy={isActing === "sendTest"} disabled={Boolean(isActing) || isSaving}>{__("Send test", "weekly-wildcat-headless")}</Button> : null}
              {actions.includes("schedule") ? <Button variant="secondary" onClick={() => void performAction("schedule")} isBusy={isActing === "schedule"} disabled={Boolean(isActing) || isSaving}>{__("Schedule", "weekly-wildcat-headless")}</Button> : null}
              {actions.includes("send") ? <Button variant="primary" onClick={() => void performAction("send")} isBusy={isActing === "send"} disabled={Boolean(isActing) || isSaving}>{__("Send now", "weekly-wildcat-headless")}</Button> : null}
              {actions.includes("cancel") ? <Button variant="tertiary" onClick={() => void performAction("cancel")} isBusy={isActing === "cancel"} disabled={Boolean(isActing) || isSaving}>{__("Cancel schedule", "weekly-wildcat-headless")}</Button> : null}
              {draft.status === "sent" && selectedProvider?.capabilities.stats ? <Button variant="secondary" disabled>{__("Stats available in Performance", "weekly-wildcat-headless")}</Button> : null}
            </div>
            {!actions.length && draft.status !== "sent" ? <OptionalUnavailable>{selectedProvider ? __("No delivery actions are available for this provider or issue state.", "weekly-wildcat-headless") : __("Delivery actions will appear after a configured provider is selected.", "weekly-wildcat-headless")}</OptionalUnavailable> : null}
          </div>

          <div className="byline-newsletter-card">
            <h2>{__("Send snapshot", "weekly-wildcat-headless")}</h2>
            {draft.status === "sent" && draft.sentAt ? <p><strong>{__("Sent", "weekly-wildcat-headless")}</strong><br /><time dateTime={draft.sentAt}>{formatNewsletterDate(draft.sentAt)}</time></p> : null}
            {draft.providerExternalId ? <p><span className="byline-newsletter-muted">{__("Provider reference", "weekly-wildcat-headless")}</span><br />{draft.providerExternalId}</p> : null}
            {draft.htmlSnapshot || draft.plaintextSnapshot ? <p>{__("A final content snapshot is stored with this issue.", "weekly-wildcat-headless")}</p> : <p className="byline-newsletter-help">{__("The final HTML and plaintext are captured when the provider accepts the send.", "weekly-wildcat-headless")}</p>}
          </div>
        </aside>
      </div>
    </section>
  );
}
