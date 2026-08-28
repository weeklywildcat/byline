import { Button, Notice, SelectControl, Spinner, TextControl } from "@wordpress/components";
import { __ } from "@wordpress/i18n";
import { useCallback, useEffect, useMemo, useState } from "@wordpress/element";

import type { NewsletterFetchers } from "./api";
import {
  NEWSLETTER_CAPABILITIES,
  providerCapabilityLabel,
  providerStatusLabel,
  type NewsletterProvider,
  type NewsletterProviderField,
  type NewsletterProviderSettings
} from "./models";
import { describeNewsletterError } from "./models";
import { ErrorState, OptionalUnavailable, ProviderStatus } from "./ui";

export type NewsletterSettingsProps = {
  fetchers: NewsletterFetchers;
  initialProviderId?: string;
  title?: string;
};

function valuesForProvider(provider: NewsletterProvider | undefined): NewsletterProviderSettings {
  return Object.fromEntries((provider?.fields || []).flatMap((field) => field.value === undefined ? [] : [[field.id, field.value]]));
}
function fieldInputType(field: NewsletterProviderField): "text" | "url" | "email" | "password" {
  if (field.secret) return "password";
  return field.type;
}

export function NewsletterSettings({ fetchers, initialProviderId, title }: NewsletterSettingsProps) {
  const [providers, setProviders] = useState<NewsletterProvider[]>([]);
  const [providerId, setProviderId] = useState(initialProviderId || "");
  const [settings, setSettings] = useState<NewsletterProviderSettings>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchers.providers();
      setProviders(result.providers);
      const selectedId = initialProviderId || result.providers[0]?.id || "";
      setProviderId((current) => current || selectedId);
      const selected = result.providers.find((provider) => provider.id === (providerId || selectedId));
      setSettings(valuesForProvider(selected));
    } catch (loadError: unknown) {
      setError(describeNewsletterError(loadError, __("Newsletter provider settings are unavailable.", "weekly-wildcat-headless")));
    } finally {
      setIsLoading(false);
    }
  }, [fetchers, initialProviderId, providerId]);

  useEffect(() => {
    void load();
    // Do not reload when local fields change; testing must preserve unsaved values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchers, initialProviderId]);

  const selectedProvider = useMemo(() => providers.find((provider) => provider.id === providerId), [providerId, providers]);

  const selectProvider = useCallback((nextId: string) => {
    setProviderId(nextId);
    setSettings(valuesForProvider(providers.find((provider) => provider.id === nextId)));
    setNotice(null);
    setError(null);
  }, [providers]);

  const updateSetting = useCallback((key: string, value: string) => {
    setSettings((current) => ({ ...current, [key]: value }));
    setNotice(null);
  }, []);

  const saveSettings = useCallback(async () => {
    if (!providerId) return;
    setIsSaving(true);
    setError(null);
    setNotice(null);
    try {
      const result = await fetchers.saveProviderSettings(providerId, settings);
      setProviders((current) => current.map((provider) => provider.id === result.provider.id ? result.provider : provider));
      setNotice(result.message || __("Provider settings saved.", "weekly-wildcat-headless"));
    } catch (saveError: unknown) {
      setError(describeNewsletterError(saveError, __("Provider settings could not be saved.", "weekly-wildcat-headless")));
    } finally {
      setIsSaving(false);
    }
  }, [fetchers, providerId, settings]);

  const testConnection = useCallback(async () => {
    if (!providerId || !selectedProvider?.capabilities.connectionTest) return;
    setIsTesting(true);
    setError(null);
    setNotice(null);
    try {
      const result = await fetchers.testProvider(providerId, settings);
      // The result updates safe connection status only.  Local `settings` are
      // intentionally untouched so a test cannot erase unsaved credentials.
      setProviders((current) => current.map((provider) => provider.id === result.provider.id ? result.provider : provider));
      setNotice(result.message || __("Connection test completed.", "weekly-wildcat-headless"));
    } catch (testError: unknown) {
      setError(describeNewsletterError(testError, __("The provider connection test failed.", "weekly-wildcat-headless")));
    } finally {
      setIsTesting(false);
    }
  }, [fetchers, providerId, selectedProvider, settings]);

  if (isLoading) {
    return <div className="byline-newsletter-loading" role="status"><Spinner /><span>{__("Loading provider settings…", "weekly-wildcat-headless")}</span></div>;
  }

  if (error && !providers.length) return <ErrorState message={error} onRetry={() => void load()} />;

  return (
    <section className="byline-newsletter-screen byline-newsletter-settings" aria-labelledby="byline-newsletter-settings-title">
      <header className="byline-newsletter-screen-header">
        <div>
          <h1 id="byline-newsletter-settings-title">{title || __("Newsletter settings", "weekly-wildcat-headless")}</h1>
          <p>{__("Connect a provider using protected WordPress settings. Secret values are write-only and are never displayed here or in public output.", "weekly-wildcat-headless")}</p>
        </div>
      </header>

      {error ? <Notice status="error" isDismissible={false}><p>{error}</p></Notice> : null}
      {notice ? <Notice status="success" isDismissible={false}><p>{notice}</p></Notice> : null}

      {!providers.length ? (
        <OptionalUnavailable>{__("No newsletter provider is available. The public site can continue without a newsletter integration; connect one when you are ready.", "weekly-wildcat-headless")}</OptionalUnavailable>
      ) : (
        <div className="byline-newsletter-settings-grid">
          <div className="byline-newsletter-card">
            <h2>{__("Provider", "weekly-wildcat-headless")}</h2>
            <SelectControl __nextHasNoMarginBottom label={__("Newsletter provider", "weekly-wildcat-headless")} value={providerId} options={providers.map((provider) => ({ label: provider.label, value: provider.id }))} onChange={selectProvider} />
            {selectedProvider ? (
              <>
                <p className="byline-newsletter-provider-line"><ProviderStatus status={selectedProvider.connectionStatus} configured={selectedProvider.configured} />{selectedProvider.maskedIdentifier ? <span>{selectedProvider.maskedIdentifier}</span> : null}</p>
                {selectedProvider.setupMessage ? <OptionalUnavailable>{selectedProvider.setupMessage}</OptionalUnavailable> : null}
                <h3>{__("Supported actions", "weekly-wildcat-headless")}</h3>
                <ul className="byline-newsletter-capabilities">
                  {NEWSLETTER_CAPABILITIES.map((capability) => <li key={capability} className={selectedProvider.capabilities[capability] ? "is-supported" : "is-unavailable"}><span aria-hidden="true">{selectedProvider.capabilities[capability] ? "✓" : "—"}</span>{providerCapabilityLabel(capability)}<span className="screen-reader-text">{selectedProvider.capabilities[capability] ? __("supported", "weekly-wildcat-headless") : __("unavailable", "weekly-wildcat-headless")}</span></li>)}
                </ul>
                <p className="byline-newsletter-help">{__("Delivery screens only show actions marked as supported by this provider.", "weekly-wildcat-headless")}</p>
              </>
            ) : null}
          </div>

          <div className="byline-newsletter-card">
            <h2>{__("Connection details", "weekly-wildcat-headless")}</h2>
            {selectedProvider?.fields?.length ? selectedProvider.fields.map((field) => (
              <TextControl key={field.id} label={field.label} type={fieldInputType(field)} value={settings[field.id] || ""} onChange={(value: string) => updateSetting(field.id, value)} placeholder={field.placeholder} help={field.description || (field.secret ? __("Stored securely; the existing value is not shown.", "weekly-wildcat-headless") : undefined)} autoComplete={field.secret ? "new-password" : undefined} />
            )) : <p className="byline-newsletter-help">{__("This provider has no editable connection fields. Check its setup instructions or use its public signup link mode.", "weekly-wildcat-headless")}</p>}
            <div className="byline-newsletter-settings-actions">
              <Button variant="primary" onClick={() => void saveSettings()} isBusy={isSaving} disabled={isSaving || isTesting || !providerId}>{__("Save settings", "weekly-wildcat-headless")}</Button>
              {selectedProvider?.capabilities.connectionTest ? <Button variant="secondary" onClick={() => void testConnection()} isBusy={isTesting} disabled={isSaving || isTesting}>{__("Test connection", "weekly-wildcat-headless")}</Button> : null}
              {selectedProvider ? <span className="byline-newsletter-muted">{providerStatusLabel(selectedProvider.connectionStatus)}</span> : null}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
