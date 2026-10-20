import { Button, Notice, SelectControl, Spinner, TextControl } from "../admin-ui/components/legacy-control-adapters";
import { __ } from "@wordpress/i18n";
import { toast } from "sonner";
import { useCallback, useEffect, useMemo, useState } from "@wordpress/element";
import { Badge } from "../admin-ui/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../admin-ui/ui/card";
import { FieldGroup } from "../admin-ui/ui/field";
import { Item, ItemActions, ItemContent, ItemGroup, ItemTitle } from "../admin-ui/ui/item";

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
      const message = result.message || __("Provider settings saved.", "weekly-wildcat-headless");
      setNotice(message);
      toast.success(message);
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
      const message = result.message || __("Connection test completed.", "weekly-wildcat-headless");
      setNotice(message);
      toast.success(message);
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
        <div className="grid gap-4 lg:grid-cols-[minmax(16rem,0.8fr)_minmax(0,1.2fr)]">
          <Card size="sm">
            <CardHeader><CardTitle>{__("Provider", "weekly-wildcat-headless")}</CardTitle><CardDescription>{__("Choose the delivery service and review exactly which actions it supports.", "weekly-wildcat-headless")}</CardDescription></CardHeader>
            <CardContent className="flex flex-col gap-4">
              <SelectControl label={__("Newsletter provider", "weekly-wildcat-headless")} value={providerId} options={providers.map((provider) => ({ label: provider.label, value: provider.id }))} onChange={selectProvider} />
              {selectedProvider ? (
                <>
                  <div className="flex flex-wrap items-center gap-2"><ProviderStatus status={selectedProvider.connectionStatus} configured={selectedProvider.configured} />{selectedProvider.maskedIdentifier ? <span className="text-xs text-muted-foreground">{selectedProvider.maskedIdentifier}</span> : null}</div>
                  {selectedProvider.setupMessage ? <OptionalUnavailable>{selectedProvider.setupMessage}</OptionalUnavailable> : null}
                  <div>
                    <p className="mb-1.5 text-xs font-medium text-muted-foreground">{__("Supported actions", "weekly-wildcat-headless")}</p>
                    <ItemGroup className="gap-0 overflow-hidden rounded-lg border">
                      {NEWSLETTER_CAPABILITIES.map((capability) => <Item key={capability} size="xs" className="rounded-none border-0 border-b last:border-b-0">
                        <ItemContent><ItemTitle>{providerCapabilityLabel(capability)}</ItemTitle></ItemContent>
                        <ItemActions><Badge variant={selectedProvider.capabilities[capability] ? "secondary" : "outline"}>{selectedProvider.capabilities[capability] ? __("Supported", "weekly-wildcat-headless") : __("Unavailable", "weekly-wildcat-headless")}</Badge></ItemActions>
                      </Item>)}
                    </ItemGroup>
                  </div>
                </>
              ) : null}
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader><CardTitle>{__("Connection details", "weekly-wildcat-headless")}</CardTitle><CardDescription>{__("Secret values are write-only and never displayed after saving.", "weekly-wildcat-headless")}</CardDescription></CardHeader>
            <CardContent className="flex flex-col gap-4">
              {selectedProvider?.fields?.length ? <FieldGroup className="gap-4">{selectedProvider.fields.map((field) => (
                <TextControl key={field.id} label={field.label} type={fieldInputType(field)} value={settings[field.id] || ""} onChange={(value: string) => updateSetting(field.id, value)} placeholder={field.placeholder} help={field.description || (field.secret ? __("Stored securely; the existing value is not shown.", "weekly-wildcat-headless") : undefined)} autoComplete={field.secret ? "new-password" : undefined} />
              ))}</FieldGroup> : <p className="text-sm text-muted-foreground">{__("This provider has no editable connection fields. Check its setup instructions or use its public signup link mode.", "weekly-wildcat-headless")}</p>}
              <div className="flex flex-wrap items-center gap-2 border-t pt-4">
                <Button variant="primary" onClick={() => void saveSettings()} isBusy={isSaving} disabled={isSaving || isTesting || !providerId}>{__("Save settings", "weekly-wildcat-headless")}</Button>
                {selectedProvider?.capabilities.connectionTest ? <Button variant="secondary" onClick={() => void testConnection()} isBusy={isTesting} disabled={isSaving || isTesting}>{__("Test connection", "weekly-wildcat-headless")}</Button> : null}
                {selectedProvider ? <span className="ml-auto text-xs text-muted-foreground">{providerStatusLabel(selectedProvider.connectionStatus)}</span> : null}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </section>
  );
}
