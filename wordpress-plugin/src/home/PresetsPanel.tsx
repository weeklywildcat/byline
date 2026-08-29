import { Button, Card, CardBody, Notice, SelectControl, Spinner, TextControl, ToggleControl } from "@wordpress/components";
import { useCallback, useEffect, useMemo, useRef, useState } from "@wordpress/element";
import { __ } from "@wordpress/i18n";

import { createUndoableMutation, normalizeBylineError } from "@byline/admin-runtime";

import type { HomeFetchers } from "./home-api";
import type { HomePreset, HomePresetsPayload } from "./home-model";

type PresetsPanelProps = {
  fetchers: Pick<HomeFetchers, "getPresets" | "updatePreset" | "resetPreset">;
  canEdit: boolean;
};

function presetLabel(type: string): string {
  return type
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function presetCopy(value: HomePreset): HomePreset {
  return {
    ...value,
    workflow: { ...value.workflow },
    readiness: {
      ...value.readiness,
      required: [...value.readiness.required],
      recommended: [...value.readiness.recommended]
    },
    media: { ...value.media },
    tasks: value.tasks ? value.tasks.map((task) => ({ ...task })) : [],
    associations: value.associations ? { ...value.associations } : {}
  };
}

function requestError(error: unknown): string {
  return normalizeBylineError(error, {
    message: __("Workflow defaults could not be loaded. The rest of Home remains usable.", "weekly-wildcat-headless")
  }).message;
}

export function PresetsPanel({ fetchers, canEdit }: PresetsPanelProps) {
  const [payload, setPayload] = useState<HomePresetsPayload | null>(null);
  const [selectedType, setSelectedType] = useState("");
  const selectedTypeRef = useRef("");
  const [draft, setDraft] = useState<HomePreset | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  // Resetting a preset is fully reversible: the previous values are captured
  // and can be written back through the same save endpoint. That earns an Undo
  // rather than a confirmation dialog in front of the action.
  const [undoReset, setUndoReset] = useState<(() => Promise<void>) | null>(null);

  const load = useCallback(async () => {
    if (!fetchers.getPresets) return;
    setLoading(true);
    setError("");
    try {
      const next = await fetchers.getPresets();
      setPayload(next);
      const nextType = selectedTypeRef.current && next.presets[selectedTypeRef.current]
        ? selectedTypeRef.current
        : next.types[0] || Object.keys(next.presets)[0] || "";
      selectedTypeRef.current = nextType;
      setSelectedType(nextType);
      setDraft(nextType && next.presets[nextType] ? presetCopy(next.presets[nextType]) : null);
    } catch (caught) {
      setError(requestError(caught));
    } finally {
      setLoading(false);
    }
  }, [fetchers.getPresets]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const next = payload?.presets?.[selectedType];
    setDraft(next ? presetCopy(next) : null);
  }, [payload, selectedType]);

  const options = useMemo(
    () => (payload?.types || Object.keys(payload?.presets || {})).map((type) => ({ label: payload?.presets[type]?.label || presetLabel(type), value: type })),
    [payload]
  );

  if (!fetchers.getPresets) return null;

  const selectType = (value: string) => {
    selectedTypeRef.current = value;
    setSelectedType(value);
  };

  const save = async () => {
    if (!draft || !selectedType || !fetchers.updatePreset) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const result = await fetchers.updatePreset(selectedType, {
        label: draft.label,
        section: draft.section,
        workflow: draft.workflow,
        media: draft.media
      });
      setPayload((current) => current ? {
        ...current,
        revision: result.revision,
        presets: { ...current.presets, [selectedType]: result.preset }
      } : current);
      setMessage(__("Workflow defaults saved.", "weekly-wildcat-headless"));
    } catch (caught) {
      setError(requestError(caught));
    } finally {
      setSaving(false);
    }
  };

  const applyResult = (type: string, result: { revision: number; preset: HomePreset }) => {
    setPayload((current) => current ? {
      ...current,
      revision: result.revision,
      presets: { ...current.presets, [type]: result.preset }
    } : current);
  };

  const reset = async () => {
    const resetPreset = fetchers.resetPreset;
    const updatePreset = fetchers.updatePreset;
    const previous = selectedType ? payload?.presets?.[selectedType] : undefined;
    if (!selectedType || !resetPreset || !previous) return;
    const type = selectedType;
    const restored = presetCopy(previous);

    const mutation = createUndoableMutation({
      perform: () => resetPreset(type),
      undo: () => {
        if (!updatePreset) throw new Error("Presets cannot be edited by this account.");
        return updatePreset(type, {
          label: restored.label,
          section: restored.section,
          workflow: restored.workflow,
          media: restored.media
        });
      }
    });

    setSaving(true);
    setError("");
    setMessage("");
    setUndoReset(null);
    try {
      applyResult(type, await mutation.execute());
      setMessage(__("Preset reset to its built-in defaults.", "weekly-wildcat-headless"));
      if (updatePreset) {
        setUndoReset(() => async () => {
          setSaving(true);
          setError("");
          try {
            applyResult(type, await mutation.undo());
            setMessage(__("Preset restored.", "weekly-wildcat-headless"));
            setUndoReset(null);
          } catch (caught) {
            // Undo is a real server write, so a failure says so and stays
            // available instead of pretending the reset was reversed.
            setError(requestError(caught));
          } finally {
            setSaving(false);
          }
        });
      }
    } catch (caught) {
      setError(requestError(caught));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="byline-home-presets-card">
      <CardBody>
        <div className="byline-home-section-heading">
          <div>
            <p className="byline-home-eyebrow">{__("Workflow defaults", "weekly-wildcat-headless")}</p>
            <h2>{__("Story presets", "weekly-wildcat-headless")}</h2>
          </div>
          {loading ? <Spinner /> : null}
        </div>
        <p className="byline-home-muted">{__("Small, editable starting points for section, workflow, readiness, and visual expectations. Presets never create article copy.", "weekly-wildcat-headless")}</p>
        {error ? <Notice status="warning" isDismissible={false}>{error}{" "}<Button variant="link" onClick={() => void load()}>{__("Try again", "weekly-wildcat-headless")}</Button></Notice> : null}
        {!loading && draft ? (
          <div className="byline-home-presets-form">
            <SelectControl __nextHasNoMarginBottom label={__("Preset", "weekly-wildcat-headless")} value={selectedType} options={options} onChange={selectType} disabled={saving} />
            <div className="byline-home-presets-fields">
              <TextControl __nextHasNoMarginBottom label={__("Label", "weekly-wildcat-headless")} value={draft.label} disabled={!canEdit || saving} onChange={(value) => setDraft({ ...draft, label: value })} />
              <TextControl __nextHasNoMarginBottom label={__("Section slug", "weekly-wildcat-headless")} value={draft.section} disabled={!canEdit || saving} onChange={(value) => setDraft({ ...draft, section: value })} />
              <SelectControl __nextHasNoMarginBottom label={__("Starting stage", "weekly-wildcat-headless")} value={draft.workflow.status} disabled={!canEdit || saving} options={["pitch", "assigned", "reporting", "writing", "editing", "ready", "on-hold", "dropped"].map((value) => ({ label: presetLabel(value), value }))} onChange={(value) => setDraft({ ...draft, workflow: { ...draft.workflow, status: value } })} />
              <TextControl __nextHasNoMarginBottom type="number" min={0} max={30} label={__("Deadline offset (days)", "weekly-wildcat-headless")} value={String(draft.workflow.deadlineOffsetDays)} disabled={!canEdit || saving} onChange={(value) => setDraft({ ...draft, workflow: { ...draft.workflow, deadlineOffsetDays: Math.max(0, Math.min(30, Number(value) || 0)) } })} />
            </div>
            <SelectControl __nextHasNoMarginBottom label={__("Visual expectation", "weekly-wildcat-headless")} value={draft.media.mode} disabled={!canEdit || saving} options={["none", "recommended", "requested", "required", "visual-first"].map((value) => ({ label: presetLabel(value), value }))} onChange={(value) => setDraft({ ...draft, media: { ...draft.media, mode: value } })} />
            {canEdit ? (
              <>
                <ToggleControl __nextHasNoMarginBottom label={__("Require image credit", "weekly-wildcat-headless")} checked={draft.media.requireCredit} disabled={saving} onChange={(checked) => setDraft({ ...draft, media: { ...draft.media, requireCredit: checked } })} />
                <ToggleControl __nextHasNoMarginBottom label={__("Require alt text", "weekly-wildcat-headless")} checked={draft.media.requireAltText} disabled={saving} onChange={(checked) => setDraft({ ...draft, media: { ...draft.media, requireAltText: checked } })} />
                <div className="byline-settings-actions">
                  <Button variant="primary" isBusy={saving} disabled={saving} onClick={() => void save()}>{__("Save preset", "weekly-wildcat-headless")}</Button>
                  {fetchers.resetPreset ? <Button variant="tertiary" disabled={saving} onClick={() => void reset()}>{__("Reset", "weekly-wildcat-headless")}</Button> : null}
                </div>
              </>
            ) : <p className="byline-home-muted">{__("Preset editing is limited to publication managers.", "weekly-wildcat-headless")}</p>}
            {message ? (
              <p className="byline-home-status-line" role="status" aria-live="polite">
                {message}
                {undoReset ? (
                  <>
                    {" "}
                    <Button variant="link" disabled={saving} onClick={() => void undoReset()}>
                      {__("Undo", "weekly-wildcat-headless")}
                    </Button>
                  </>
                ) : null}
              </p>
            ) : null}
          </div>
        ) : !loading && !error ? <p className="byline-home-muted">{__("No workflow presets are available.", "weekly-wildcat-headless")}</p> : null}
      </CardBody>
    </Card>
  );
}
