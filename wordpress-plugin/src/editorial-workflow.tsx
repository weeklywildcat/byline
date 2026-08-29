/**
 * The Byline editorial workflow, as a native block-editor integration.
 *
 * Native editor SlotFills, no DOM manipulation:
 *
 *  - `PluginPostStatusInfo` adds one summary row to the document Summary panel,
 *    next to — and clearly distinct from — the WordPress publication status.
 *  - `PluginSidebar` holds the compact Story surface and registers exactly one
 *    "Story" entry in the editor's More menu by itself.
 *  - `PluginPrePublishPanel` and `PluginPostPublishPanel` provide publish-time
 *    readiness and website lifecycle context when the host editor supports them.
 *
 * Editorial workflow and WordPress publication state are different questions.
 * The UI never merges them: the Story summary and workflow panel show the
 * editorial stage and WordPress publication state as separate values, and
 * "Published" is reported as derived from WordPress rather than offered as a
 * workflow choice.
 *
 * Workflow values are private newsroom information, so they travel over a
 * capability-protected Byline endpoint rather than through public post meta.
 * That means workflow saves independently of the post's own draft; the sidebar
 * says so rather than leaving an editor to guess.
 */
import apiFetch from '@wordpress/api-fetch';
import { Button, Notice, Panel, PanelBody, SelectControl, Spinner, TextControl, TextareaControl } from '@wordpress/components';
import { useDispatch, useSelect } from '@wordpress/data';
import { useCallback, useEffect, useMemo, useRef, useState } from '@wordpress/element';
import * as editPostModule from '@wordpress/edit-post';
import { __, sprintf } from '@wordpress/i18n';
import { listView } from '@wordpress/icons';
import { registerPlugin } from '@wordpress/plugins';
import type { ComponentType, ReactNode } from 'react';

import { normalizeBylineError } from '@byline/admin-runtime';

import { CorrectionsPanel } from './editorial/CorrectionsPanel';
import { ContributorsPanel } from './editorial/ContributorsPanel';
import { DistributionPanel } from './editorial/DistributionPanel';
import { TasksPanel } from './editorial/TasksPanel';
import {
  createEditorialRestClient,
  type ProtectedEditorialFetcher,
  type ProtectedEditorialRequest
} from './editorial/editorial-rest';
import type {
  ContributorEntry,
  CorrectionRecord,
  DistributionChannel,
  EditorialActivityRecord,
  EditorialTask,
  EditorialWorkflowPayload,
  ReadinessCheck,
  TaskInput,
  TaskPatch,
} from './editorial/editorial-model';
import { summarizeReadiness } from './editorial/editorial-model';

import {
  workflowDiscordState,
  workflowStatusLabel,
  workflowStoryPath,
  createWorkflowMutationQueue,
  createWorkflowRequestTracker,
  type WorkflowChanges,
  type WorkflowPayload
} from './editorial-workflow-model';
import {
  consumeStorySidebarNavigation,
  createStorySidebarPanelOpenState,
  focusStorySidebarPanel,
  installStorySidebarNavigationBridge,
  setStorySidebarPanelOpen,
  subscribeToStorySidebarNavigation,
  type StorySidebarPanel,
  type StorySidebarPanelOpenState
} from './editorial/story-sidebar-navigation';

import './editorial-workflow.css';

const PLUGIN_NAME = 'byline-editorial-workflow';
const SIDEBAR_NAME = 'byline-editorial-workflow-sidebar';

// Content Health can publish its command before React has mounted. Installing
// the bridge during bundle evaluation gives the PHP inline script a stable,
// typed hand-off point and retains pending state until the sidebar consumes it.
installStorySidebarNavigationBridge();

declare global {
  interface Window {
    bylineEditorialWorkflow?: {
      previewUrl?: string;
    };
  }
}

// `PluginSidebar` registers its own entry in the editor's More menu, so no
// separate `PluginSidebarMoreMenuItem` is rendered here: a second registration
// would put two identical "Story" items in that menu.
const { PluginPostStatusInfo, PluginSidebar } = editPostModule;

/**
 * These fills are available in the WordPress editor runtime, but older
 * WordPress type declarations do not include them. Keeping the lookup
 * optional also lets the workflow sidebar continue working if a host editor
 * does not provide one of the publish-time fills.
 */
type EditorPanelSlotFill = ComponentType<{ className?: string; children?: ReactNode }>;
const {
  PluginPrePublishPanel,
  PluginPostPublishPanel
} = editPostModule as typeof editPostModule & {
  PluginPrePublishPanel?: EditorPanelSlotFill;
  PluginPostPublishPanel?: EditorPanelSlotFill;
};

function errorMessage(error: unknown): string {
  return normalizeBylineError(error, {
    title: __('Workflow error', 'weekly-wildcat-headless'),
    message: __('Something went wrong. Please try again.', 'weekly-wildcat-headless')
  }).message;
}

const storyPath = workflowStoryPath;
type WorkflowSaveChanges = WorkflowChanges & { plannedPublishAt?: string | null };

function deadlineContext(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const deadline = new Date(`${value}T12:00:00`);
  if (!Number.isFinite(deadline.getTime())) return '';
  const today = new Date();
  const todayNoon = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12, 0, 0);
  const dayDelta = Math.round((deadline.getTime() - todayNoon.getTime()) / 86400000);
  const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(deadline);
  if (dayDelta === 0) return __('Today', 'weekly-wildcat-headless');
  if (dayDelta === 1) return __('Tomorrow', 'weekly-wildcat-headless');
  if (dayDelta > 1) return sprintf(
    /* translators: 1: weekday, 2: number of days until a deadline. */
    __('%1$s · %2$d days', 'weekly-wildcat-headless'),
    weekday,
    dayDelta
  );
  const overdueDays = Math.abs(dayDelta);
  return sprintf(
    /* translators: 1: weekday, 2: number of days since a deadline. */
    __('%1$s · %2$d days overdue', 'weekly-wildcat-headless'),
    weekday,
    overdueDays
  );
}

/**
 * Loads the workflow once per post and owns every write.
 *
 * Every mutation — stage, editor, deadline, planned publication, visual notes —
 * goes through one serialized, revision-aware queue per story, so two of this
 * editor's own controls can never conflict with each other. Requests never
 * block typing: a later edit simply coalesces into the next queued request.
 *
 * A failure here is never fatal: `error` is surfaced as a dismissible notice
 * with a retry, and the editor keeps writing their article regardless.
 */
function useEditorialWorkflow(postId: number, isPublished: boolean) {
  const [payload, setPayload] = useState<WorkflowPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [hasConflict, setHasConflict] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  // Reads and writes have independent lifecycles. A publication-status reload
  // must never make an unrelated workflow save look stale (or leave its busy
  // indicator stuck).
  const requestTrackerRef = useRef(createWorkflowRequestTracker());
  const activePostIdRef = useRef(postId);
  activePostIdRef.current = postId;
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // One queue per story. A queue captures its own post id, so a response for a
  // story the editor already left can never be applied to the current one.
  const queue = useMemo(() => createWorkflowMutationQueue<WorkflowPayload>({
    send: (changes) => apiFetch<WorkflowPayload>({ path: storyPath(postId), method: 'POST', data: changes }),
    readRevision: (next) => (typeof next.story?.revision === 'number' ? next.story.revision : null),
    onSuccess: (next, { superseded }) => {
      if (!mountedRef.current || activePostIdRef.current !== postId) return;
      // A newer local edit is already queued behind this response. Applying it
      // now would briefly put the sidebar back on the superseded values.
      if (!superseded) setPayload(next);
      setSaveError(null);
      setSavedAt(Date.now());
    },
    onError: (error, { conflict }) => {
      if (!mountedRef.current || activePostIdRef.current !== postId) return;
      // The entered value is deliberately left in the field so the editor can
      // retry rather than retyping it.
      setSaveError(error.message);
      if (conflict) setHasConflict(true);
    },
    onPendingChange: (pendingCount) => {
      if (!mountedRef.current || activePostIdRef.current !== postId) return;
      setIsSaving(pendingCount > 0);
    },
    errorOptions: {
      title: __('Workflow error', 'weekly-wildcat-headless'),
      message: __('Something went wrong. Please try again.', 'weekly-wildcat-headless')
    },
    conflictMessage: __('This story changed somewhere else. Reload the workflow before saving again.', 'weekly-wildcat-headless')
  }), [postId]);

  useEffect(() => () => queue.detach(), [queue]);

  const load = useCallback(() => {
    if (!postId) return;

    const requestTracker = requestTrackerRef.current;
    const requestId = requestTracker.beginRead();
    const settledWritesAtStart = queue.settledCount();
    setIsLoading(true);
    setLoadError(null);

    apiFetch<WorkflowPayload>({ path: `${storyPath(postId)}/bootstrap` })
      .then((next) => {
        if (!mountedRef.current || activePostIdRef.current !== postId || !requestTracker.isCurrentRead(requestId)) return;
        // A save that is queued, in flight, or that finished while this read
        // was open is authoritative. Applying a slower GET here would put the
        // sidebar back on pre-save values and — worse — would reset the
        // revision the next mutation builds on, turning the editor's own write
        // into a conflict. A conflicted queue is the exception: it is not
        // sending anything, so a fresh read is exactly what reconciles it.
        if (!queue.hasConflict() && (queue.pendingCount() > 0 || queue.settledCount() !== settledWritesAtStart)) return;
        const revision = typeof next.story?.revision === 'number' ? next.story.revision : null;
        // A completed read is also the reconciliation point for a conflict:
        // this snapshot is now the revision the next mutation builds on.
        queue.reconcile(revision);
        setHasConflict(false);
        // A reconciled read clears the stale conflict notice with it; the
        // sidebar now shows the values the next save will build on.
        setSaveError(null);
        setPayload(next);
      })
      .catch((error: unknown) => {
        if (!mountedRef.current || activePostIdRef.current !== postId || !requestTracker.isCurrentRead(requestId)) return;
        setLoadError(errorMessage(error));
      })
      .finally(() => {
        if (!mountedRef.current || activePostIdRef.current !== postId || !requestTracker.isCurrentRead(requestId)) return;
        setIsLoading(false);
      });
  }, [postId, queue]);

  useEffect(load, [load]);

  // Publishing and unpublishing change the effective status without any
  // workflow write, so the panel re-reads when the publication state flips.
  useEffect(() => {
    if (payload) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPublished]);

  const save = useCallback(
    (changes: WorkflowSaveChanges) => {
      if (!postId) return Promise.resolve(false);
      setSaveError(null);
      return queue.enqueue(changes as Record<string, unknown>).then((outcome) => outcome.ok);
    },
    [postId, queue]
  );

  const clearSaveError = useCallback(() => setSaveError(null), []);

  return { payload, load, save, clearSaveError, isLoading, isSaving, loadError, saveError, hasConflict, savedAt };
}

type WorkflowControlsProps = ReturnType<typeof useEditorialWorkflow>;

function WorkflowControls(workflow: WorkflowControlsProps) {
  const { payload, load, save, isLoading, isSaving, loadError, saveError, hasConflict, savedAt } = workflow;

  if (loadError) {
    return (
      <div className="byline-workflow-panel">
        <Notice status="warning" isDismissible={false}>
          <p>{__('Workflow details could not be loaded.', 'weekly-wildcat-headless')}</p>
          <p>{loadError}</p>
          <Button variant="secondary" onClick={load}>
            {__('Retry', 'weekly-wildcat-headless')}
          </Button>
        </Notice>
      </div>
    );
  }

  if (!payload) {
    return (
      <div className="byline-workflow-panel">
        <Spinner />
        <span className="screen-reader-text">{__('Loading editorial workflow', 'weekly-wildcat-headless')}</span>
      </div>
    );
  }

  const normalized = normalizeWorkflowPayload(payload, payload, payload.story.postId, '');
  if (!normalized) return null;

  const { story, statuses = [], capabilities, writer, editors = [], notes } = normalized;
  const currentLabel = workflowStatusLabel(payload);
  const published = story.isPublished || story.postStatus === 'publish';
  // A save in flight never disables a control. Edits queue behind the request
  // and are sent with the revision the previous response returned, so an editor
  // is never made to wait to change a stage or type a date.
  const busy = isLoading;
  const canEditDates = capabilities.assign === true && capabilities.changeDeadline !== false;
  const canEditPlannedPublication = capabilities.assign === true && capabilities.changePlannedPublication !== false;

  const editorOptions = [
    { label: __('Unassigned', 'weekly-wildcat-headless'), value: '0' },
    ...editors.map((editor) => ({ label: editor.name, value: String(editor.id) })),
  ];
  const stageOptions = statuses
    .filter((status) => status.selectable && status.group !== 'derived')
    .map((status) => ({ label: status.label, value: status.id }));
  const assignedEditorName = story.editor?.name ?? editors.find((editor) => Number(editor.id) === story.editorId)?.name ?? '';

  return (
    <div className="byline-workflow-panel">
      <div className="byline-workflow-status-pair" aria-label={__('Story status', 'weekly-wildcat-headless')}>
        <p className="byline-workflow-current">
          <span className="byline-workflow-current-label">{__('Workflow', 'weekly-wildcat-headless')}</span>
          <span className="byline-workflow-current-value">{currentLabel}</span>
        </p>
        <p className="byline-workflow-current">
          <span className="byline-workflow-current-label">{__('WordPress publication', 'weekly-wildcat-headless')}</span>
          <span className="byline-workflow-current-value">{publicationStatusLabel(story.postStatus)}</span>
        </p>
      </div>
      <p className="byline-workflow-note">
        {published
          ? __('Published follows WordPress. The earlier editorial stage is kept if the story is unpublished.', 'weekly-wildcat-headless')
          : __('Workflow changes save separately from the post content.', 'weekly-wildcat-headless')}
      </p>

      {!published ? (
        <div className="byline-workflow-field">
          <SelectControl
            __nextHasNoMarginBottom
            label={__('Stage', 'weekly-wildcat-headless')}
            value={story.storedStatus ?? story.status}
            options={stageOptions}
            disabled={busy || !capabilities.changeStatus}
            onChange={(status: string) => {
              if (status) void save({ status });
            }}
            help={__('Published is a WordPress state, not an editorial stage.', 'weekly-wildcat-headless')}
          />
        </div>
      ) : null}

      <div className="byline-workflow-fields">
        {writer ? (
          <dl className="byline-workflow-readonly">
            <dt>{__('Writer', 'weekly-wildcat-headless')}</dt>
            <dd>{writer.name}</dd>
          </dl>
        ) : null}

        {capabilities.assign ? (
          <>
            <div className="byline-workflow-field">
              <SelectControl
                __nextHasNoMarginBottom
                label={__('Editor', 'weekly-wildcat-headless')}
                value={String(story.editorId)}
                options={editorOptions}
                disabled={busy || !capabilities.assign}
                onChange={(value: string) => void save({ editorId: Number.parseInt(value, 10) || 0 })}
              />
            </div>
            <div className="byline-workflow-field">
              <TextControl
                __nextHasNoMarginBottom
                type="date"
                label={__('Deadline', 'weekly-wildcat-headless')}
                help={__('An internal newsroom date. It does not schedule publication.', 'weekly-wildcat-headless')}
                value={story.deadline?.slice(0, 10) ?? ''}
                disabled={busy || !canEditDates}
                onChange={(value: string) => void save({ deadline: value })}
              />
              {story.deadline && deadlineContext(story.deadline) ? (
                <p className="byline-workflow-field-note">{deadlineContext(story.deadline)}</p>
              ) : null}
            </div>
          </>
        ) : (
          <dl className="byline-workflow-readonly">
            <dt>{__('Editor', 'weekly-wildcat-headless')}</dt>
            <dd>{assignedEditorName || __('Unassigned', 'weekly-wildcat-headless')}</dd>
            {story.deadline ? (
              <>
                <dt>{__('Deadline', 'weekly-wildcat-headless')}</dt>
                <dd>
                  {story.deadline}
                  {deadlineContext(story.deadline) ? <small>{deadlineContext(story.deadline)}</small> : null}
                </dd>
              </>
            ) : null}
          </dl>
        )}
        <div className="byline-workflow-field">
          <TextControl
            __nextHasNoMarginBottom
            type="date"
            label={__('Planned publication', 'weekly-wildcat-headless')}
            help={__('An editorial target; it does not schedule the WordPress post.', 'weekly-wildcat-headless')}
            value={story.plannedPublication?.slice(0, 10) ?? ''}
            disabled={busy || !canEditPlannedPublication}
            onChange={(value: string) => void save({ plannedPublishAt: value || null })}
          />
        </div>
      </div>

      {notes?.available ? (
        <div className="byline-workflow-inline-actions">
          {notes.url ? <Button variant="secondary" href={notes.url}>{__('Open notes', 'weekly-wildcat-headless')}</Button> : null}
        </div>
      ) : null}

      {saveError ? (
        <Notice status={hasConflict ? 'warning' : 'error'} isDismissible={false}>
          <p>{saveError}</p>
          {hasConflict ? (
            <>
              <p>{__('Your entries are still here. Reload the workflow to see the newer values before saving again.', 'weekly-wildcat-headless')}</p>
              <Button variant="secondary" onClick={load}>
                {__('Reload workflow', 'weekly-wildcat-headless')}
              </Button>
            </>
          ) : null}
        </Notice>
      ) : null}

      <p className="byline-workflow-status-line" aria-live="polite">
        {isSaving
          ? __('Saving workflow…', 'weekly-wildcat-headless')
          : savedAt && !saveError
            ? __('Workflow saved.', 'weekly-wildcat-headless')
            : ''}
      </p>
    </div>
  );
}

function publicationStatusLabel(status: string): string {
  if (status === 'publish') return __('Published', 'weekly-wildcat-headless');
  if (status === 'future') return __('Scheduled', 'weekly-wildcat-headless');
  if (status === 'pending') return __('Pending review', 'weekly-wildcat-headless');
  if (status === 'private') return __('Private', 'weekly-wildcat-headless');
  if (status === 'draft') return __('Draft', 'weekly-wildcat-headless');
  return status || __('Unknown', 'weekly-wildcat-headless');
}

function visualStatusLabel(story: EditorialWorkflowPayload['story']): string {
  const status = story.visual?.status;
  if (status === 'done') return __('Visuals complete', 'weekly-wildcat-headless');
  if (status === 'needed') return __('Photo needed', 'weekly-wildcat-headless');
  if (status === 'assigned') return __('Visual assigned', 'weekly-wildcat-headless');
  if (status === 'in-progress') return __('Visuals in progress', 'weekly-wildcat-headless');
  if (status === 'uploaded' || status === 'selected') return __('Visual uploaded', 'weekly-wildcat-headless');
  return story.visuals?.trim() ? __('Visual note saved', 'weekly-wildcat-headless') : __('No visual request', 'weekly-wildcat-headless');
}

/**
 * The visual note shares the story's single mutation queue. Autosave here and a
 * Stage change in the panel above are the same editor's writes, so they are
 * serialized against one another and each request carries the revision the
 * previous response returned. That is what keeps an autosave from conflicting
 * with its own author's previous write.
 */
function VisualNeedsPanel({ workflow }: { workflow: WorkflowControlsProps }) {
  const { payload, save, clearSaveError, isLoading, loadError } = workflow;
  const normalized = payload ? normalizeWorkflowPayload(payload, payload, payload.story.postId, '') : null;
  const [visuals, setVisuals] = useState('');
  const [visualsDirty, setVisualsDirty] = useState(false);
  const [visualsSaving, setVisualsSaving] = useState(false);
  const [visualsSaveError, setVisualsSaveError] = useState(false);
  const visualsSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestVisualsRef = useRef('');
  const visualsDirtyRef = useRef(false);
  const visualsSaveCountRef = useRef(0);
  const visualsInitializedRef = useRef(false);
  const saveRef = useRef(save);
  saveRef.current = save;

  const enqueueVisualSave = useCallback((value: string) => {
    visualsSaveCountRef.current += 1;
    setVisualsSaving(true);
    void saveRef.current({ visuals: value }).then((saved) => {
      visualsSaveCountRef.current -= 1;
      if (visualsSaveCountRef.current === 0) setVisualsSaving(false);
      if (latestVisualsRef.current !== value) return;
      if (saved) {
        visualsDirtyRef.current = false;
        setVisualsDirty(false);
        setVisualsSaveError(false);
      } else {
        setVisualsSaveError(true);
      }
    });
  }, []);

  useEffect(() => () => {
    if (visualsSaveTimerRef.current !== null) clearTimeout(visualsSaveTimerRef.current);
    if (visualsDirtyRef.current) enqueueVisualSave(latestVisualsRef.current);
  }, [enqueueVisualSave]);

  useEffect(() => {
    if (!visualsDirty) return undefined;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [visualsDirty]);

  useEffect(() => {
    const nextVisuals = normalized?.story.visuals ?? '';
    if (normalized && !visualsDirty && (!visualsInitializedRef.current || nextVisuals === latestVisualsRef.current)) {
      setVisuals(nextVisuals);
      latestVisualsRef.current = nextVisuals;
      visualsInitializedRef.current = true;
    }
  }, [normalized?.story.visuals, visualsDirty]);

  if (loadError) {
    return <p className="byline-workflow-field-note">{__('Workflow details are unavailable, so visual notes cannot be edited yet.', 'weekly-wildcat-headless')}</p>;
  }
  if (!normalized) {
    return isLoading ? <Spinner /> : <p className="byline-workflow-field-note">{__('Visual request unavailable.', 'weekly-wildcat-headless')}</p>;
  }

  const canEdit = normalized.capabilities.changeStatus;
  return (
    <div className="byline-workflow-visuals">
      <p className="byline-workflow-panel-summary"><strong>{visualStatusLabel(normalized.story)}</strong></p>
      {normalized.story.visual?.label ? <p className="byline-workflow-field-note">{normalized.story.visual.label}</p> : null}
      <TextareaControl
        __nextHasNoMarginBottom
        label={__('Visual request or note', 'weekly-wildcat-headless')}
        help={__('Internal only. A structured Media Desk request remains the source for its status.', 'weekly-wildcat-headless')}
        rows={3}
        value={visuals}
        disabled={isLoading || !canEdit}
        onChange={(value: string) => {
          clearSaveError();
          setVisualsSaveError(false);
          setVisuals(value);
          setVisualsDirty(true);
          visualsDirtyRef.current = true;
          latestVisualsRef.current = value;
          if (visualsSaveTimerRef.current !== null) clearTimeout(visualsSaveTimerRef.current);
          visualsSaveTimerRef.current = setTimeout(() => {
            visualsSaveTimerRef.current = null;
            enqueueVisualSave(value);
          }, 650);
        }}
      />
      <p className="byline-workflow-field-note" aria-live="polite">
        {visualsDirty
          ? visualsSaving
            ? __('Saving visual note…', 'weekly-wildcat-headless')
            : visualsSaveError
              ? __('Couldn’t save visual note. Your text is still here; try again.', 'weekly-wildcat-headless')
              : __('Visual notes save automatically.', 'weekly-wildcat-headless')
          : ''}
      </p>
      {visualsSaveError ? (
        <Button
          variant="secondary"
          disabled={visualsSaving}
          onClick={() => {
            clearSaveError();
            setVisualsSaveError(false);
            enqueueVisualSave(latestVisualsRef.current);
          }}
        >
          {__('Retry visual note', 'weekly-wildcat-headless')}
        </Button>
      ) : null}
    </div>
  );
}

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : {};
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : value == null ? fallback : String(value);
}

function numberValue(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** Keep optional editorial REST calls behind the same protected transport. */
function useEditorialRestClient() {
  const fetcher = useMemo<ProtectedEditorialFetcher>(() => {
    return async function protectedFetch<T>({ path, method, data }: ProtectedEditorialRequest): Promise<T> {
      let nextData = data;
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        const body = { ...(data as UnknownRecord) };
        if (Object.prototype.hasOwnProperty.call(body, 'plannedPublication')) {
          body.plannedPublishAt = body.plannedPublication;
          delete body.plannedPublication;
        }
        if (path.includes('/corrections') && Object.prototype.hasOwnProperty.call(body, 'publicText')) {
          body.text = body.publicText;
          body.recordedAt = body.date;
          delete body.publicText;
          delete body.date;
        }
        nextData = body;
      }
      return apiFetch<unknown>({
        path,
        ...(method ? { method } : {}),
        ...(nextData !== undefined ? { data: nextData } : {})
      }) as Promise<T>;
    };
  }, []);

  return useMemo(() => createEditorialRestClient(fetcher), [fetcher]);
}

type EditorialRestClient = ReturnType<typeof createEditorialRestClient>;

function normalizeContributor(value: unknown): ContributorEntry | null {
  const item = record(value);
  const id = item.id;
  if ((typeof id !== 'number' && typeof id !== 'string') || String(id) === '') return null;
  const kind = stringValue(item.kind || item.type, 'user') === 'guest' ? 'guest' : 'user';
  return {
    id,
    kind,
    name: stringValue(item.name, 'Contributor'),
    ...(stringValue(item.role) ? { role: stringValue(item.role) } : {}),
    ...(stringValue(item.slug) ? { slug: stringValue(item.slug) } : {}),
    ...(stringValue(item.imageUrl || item.avatarUrl) ? { imageUrl: stringValue(item.imageUrl || item.avatarUrl) } : {}),
    ...(stringValue(item.publicUrl) ? { publicUrl: stringValue(item.publicUrl) } : {}),
    ...(numberValue(item.order, -1) >= 0 ? { order: numberValue(item.order) } : {})
  };
}

function normalizeContributors(value: unknown): ContributorEntry[] {
  return arrayValue(value).map(normalizeContributor).filter((item): item is ContributorEntry => item !== null);
}

function normalizeWorkflowPayload(value: unknown, fallback: WorkflowPayload | null, postId: number, title: string): EditorialWorkflowPayload | null {
  const raw = record(value);
  const rawStory = record(raw.story);
  const fallbackStory = record(fallback?.story);
  if (!rawStory.postId && !fallbackStory.postId && !postId) return null;
  const editors = normalizeContributors(raw.editors ?? fallback?.editors);
  const editorIdValue = rawStory.editorId ?? fallbackStory.editorId;
  const editorId = numberValue(editorIdValue, 0) || null;
  const editor = normalizeContributor(rawStory.editor ?? editors.find((item) => Number(item.id) === editorId));
  const writer = normalizeContributor(raw.writer ?? fallback?.writer);
  const statuses = arrayValue(raw.statuses ?? fallback?.statuses).map((status) => {
    const item = record(status);
    return {
      id: stringValue(item.id),
      label: stringValue(item.label, stringValue(item.id)),
      group: (stringValue(item.group, 'main') as 'main' | 'sidelined' | 'derived'),
      selectable: item.selectable !== false
    };
  }).filter((status) => status.id);
  const rawCapabilities = record(raw.capabilities ?? fallback?.capabilities);
  const rawVisual = record(rawStory.visual ?? raw.media);
  const rawCoverage = arrayValue(rawStory.coverage ?? raw.coverage).map((item) => stringValue(record(item).slug || record(item).title || item)).filter(Boolean);
  const workflowStatus = stringValue(rawStory.status ?? fallbackStory.status, 'pitch');
  const revision = numberValue(rawStory.revision ?? fallbackStory.revision, -1);

  return {
    story: {
      postId: numberValue(rawStory.postId ?? fallbackStory.postId, postId),
      ...(revision >= 0 ? { revision } : {}),
      title: stringValue(rawStory.title, title),
      status: workflowStatus,
      storedStatus: stringValue(rawStory.storedStatus, workflowStatus),
      postStatus: stringValue(rawStory.postStatus ?? fallbackStory.postStatus, 'draft'),
      isPublished: Boolean(rawStory.isPublished ?? fallbackStory.isPublished),
      writer,
      editor,
      editorId,
      deadline: stringValue(rawStory.deadline ?? fallbackStory.deadline) || null,
      plannedPublication: stringValue(rawStory.plannedPublication ?? raw.plannedPublishAt) || null,
      scheduledAt: stringValue(rawStory.scheduledAt) || null,
      visual: Object.keys(rawVisual).length > 0 ? {
        type: (stringValue(rawVisual.type, 'other') as 'none' | 'photo' | 'gallery' | 'graphic' | 'video' | 'other'),
        status: (stringValue(rawVisual.status, 'needed') as 'none' | 'needed' | 'assigned' | 'in-progress' | 'uploaded' | 'selected' | 'done'),
        label: stringValue(rawVisual.label || rawVisual.notes)
      } : null,
      visuals: stringValue(rawStory.visuals ?? fallbackStory.visuals) || null,
      tasksOpen: numberValue(record(raw.tasks).openCount, 0),
      coverage: rawCoverage,
      modifiedAt: stringValue(rawStory.modifiedAt) || null
    },
    statuses,
    capabilities: {
      changeStatus: rawCapabilities.changeStatus !== false,
      assign: rawCapabilities.assign === true,
      changeDeadline: rawCapabilities.changeDeadline !== false && rawCapabilities.assign === true,
      changePlannedPublication: rawCapabilities.changePlannedPublication !== false && rawCapabilities.assign === true
    },
    writer,
    editors,
    notes: record(raw.notes).available === true ? {
      available: true,
      url: stringValue(record(raw.notes).url),
      message: stringValue(record(raw.notes).message)
    } : { available: false, message: 'Notes are not available in this WordPress version.' }
  };
}

function normalizeReadiness(value: unknown, storyId: number): ReadinessCheck[] {
  const raw = record(value);
  return arrayValue(raw.checks).map((check, index) => {
    const item = record(check);
    const status = stringValue(item.state || item.status, 'warning');
    const fix = record(item.fix);
    return {
      id: stringValue(item.id, `check-${index}`),
      label: stringValue(item.label, 'Readiness check'),
      state: (status === 'pass' || status === 'error' ? status : 'warning') as 'pass' | 'warning' | 'error',
      explanation: stringValue(item.explanation, 'Review this check before publishing.'),
      ...(fix.href || fix.url || fix.label ? {
        fix: {
          label: stringValue(fix.label, 'Review'),
          ...(stringValue(fix.href || fix.url) ? { href: stringValue(fix.href || fix.url) } : {})
        }
      } : {})
    };
  }).filter((check) => check.id && (storyId > 0));
}

type CompactReadinessSummary = {
  passed: number;
  warnings: number;
  errors: number;
  total: number;
};

function compactReadinessSummary(value: unknown): CompactReadinessSummary | null {
  const raw = record(value);
  if (raw.total == null || String(raw.total).trim() === '') return null;
  return {
    passed: numberValue(raw.passed, 0),
    warnings: numberValue(raw.warnings, 0),
    errors: numberValue(raw.errors, 0),
    total: numberValue(raw.total, 0)
  };
}

function summaryCount(value: unknown, fallback: number): number {
  const raw = record(value);
  return raw.count == null ? fallback : numberValue(raw.count, fallback);
}

function normalizeTask(value: unknown): EditorialTask | null {
  const item = record(value);
  const id = item.id;
  if ((typeof id !== 'number' && typeof id !== 'string') || String(id) === '') return null;
  const state = stringValue(item.state || item.status, 'open') === 'completed' ? 'completed' : 'open';
  const priority = stringValue(item.priority, 'normal');
  return {
    id,
    title: stringValue(item.title, 'Untitled task'),
    state,
    assignee: normalizeContributor(item.assignee),
    assigneeId: numberValue(item.assigneeId, 0) || null,
    dueAt: stringValue(item.dueAt) || null,
    priority: (['low', 'normal', 'high', 'urgent'].includes(priority) ? priority : 'normal') as 'low' | 'normal' | 'high' | 'urgent',
    storyId: numberValue(item.storyId, 0) || null,
    coverageId: numberValue(item.coverageId, 0) || null,
    createdBy: normalizeContributor(item.createdBy),
    completedAt: stringValue(item.completedAt) || null,
    order: numberValue(item.order, 0)
  };
}

function normalizeTasks(value: unknown): EditorialTask[] {
  const raw = record(value);
  return arrayValue(raw.tasks ?? raw.items ?? value).map(normalizeTask).filter((item): item is EditorialTask => item !== null);
}

function normalizeCorrections(value: unknown): CorrectionRecord[] {
  const raw = record(value);
  const normalized: CorrectionRecord[] = [];
  arrayValue(raw.records ?? raw.corrections ?? raw.items ?? value).forEach((entry) => {
    const item = record(entry);
    const id = item.id;
    if ((typeof id !== 'number' && typeof id !== 'string') || String(id) === '') return;
    const type = stringValue(item.type, 'correction');
    const publicText = stringValue(item.publicText ?? item.text);
    if (!publicText.trim()) return;
    normalized.push({
      id,
      type: (['correction', 'clarification', 'editors-note', 'substantive-update'].includes(type) ? type : 'correction') as CorrectionRecord['type'],
      date: stringValue(item.date ?? item.recordedAt) || null,
      publicText,
      createdAt: stringValue(item.createdAt ?? item.recordedAt) || null,
      modifiedAt: stringValue(item.modifiedAt ?? item.updatedAt) || null
    });
  });
  return normalized;
}

function normalizeActivity(value: unknown): EditorialActivityRecord[] {
  const raw = record(value);
  return arrayValue(raw.activity ?? raw.items ?? value).flatMap((entry) => {
    const item = record(entry);
    const id = item.id;
    const summary = stringValue(item.summary);
    if ((typeof id !== 'number' && typeof id !== 'string') || String(id) === '' || !summary) return [];
    const actor = record(item.actor);
    const story = record(item.story);
    return [{
      id,
      action: stringValue(item.action || item.type),
      type: stringValue(item.type || item.action),
      storyId: numberValue(item.storyId, 0) || undefined,
      summary,
      occurredAt: stringValue(item.occurredAt),
      actor: actor.id != null && stringValue(actor.name) ? { id: numberValue(actor.id), name: stringValue(actor.name) } : null,
      story: story.id != null && stringValue(story.title) ? { id: numberValue(story.id), title: stringValue(story.title) } : null,
      context: record(item.context)
    }];
  });
}

function activityTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || __('Unknown time', 'weekly-wildcat-headless');
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function ActivityPanel({ records, isLoading, error, onRetry }: { records: EditorialActivityRecord[]; isLoading: boolean; error?: unknown; onRetry: () => void }) {
  if (isLoading && records.length === 0) return <Spinner />;
  return (
    <div className="byline-editorial-activity">
      {error ? (
        <Notice status="warning" isDismissible={false}>
          <p>{errorMessage(error)}</p>
          <Button variant="secondary" onClick={onRetry}>{__('Try again', 'weekly-wildcat-headless')}</Button>
        </Notice>
      ) : records.length ? (
        <ol className="byline-editorial-activity-list">
          {records.map((item) => (
            <li key={String(item.id)}>
              <strong>{item.summary}</strong>
              <small>
                {item.actor?.name ? `${item.actor.name} · ` : ''}
                <time dateTime={item.occurredAt}>{activityTime(item.occurredAt)}</time>
              </small>
            </li>
          ))}
        </ol>
      ) : <p className="byline-editorial-muted">{__('No activity has been recorded for this story yet.', 'weekly-wildcat-headless')}</p>}
    </div>
  );
}

type WebsiteLifecycleStatus =
  | 'not-published'
  | 'published'
  | 'building'
  | 'live'
  | 'failed'
  | 'needs-configuration'
  | 'unknown';

type NormalizedDistribution = {
  channels: DistributionChannel[];
  capabilities: { addToNewsletter: boolean };
  websiteStatus: WebsiteLifecycleStatus;
  canRetryWebsite: boolean;
  /** True when the server answered the retry capability itself. */
  retryWebsiteAnswered: boolean;
};

function websiteLifecycleStatus(value: unknown): WebsiteLifecycleStatus {
  const status = stringValue(value).toLowerCase().replace(/_/g, '-');
  if (status === 'not-published' || status === 'draft') return 'not-published';
  if (status === 'published') return 'published';
  if (status === 'rebuild-pending' || status === 'building' || status === 'pending' || status === 'queued') return 'building';
  if (status === 'live') return 'live';
  if (status === 'build-failed' || status === 'failed' || status === 'error') return 'failed';
  // A published story with no deployment target is not a build failure and is
  // certainly not live. It is a configuration gap, and it says so.
  if (status === 'needs-configuration' || status === 'not-configured') return 'needs-configuration';
  return 'unknown';
}

function normalizeDistribution(value: unknown, postId: number, headline: string, canonicalUrl: string, excerpt: string): NormalizedDistribution {
  const raw = record(value);
  const source = record(raw.channels);
  const entries = Array.isArray(raw.channels) ? raw.channels : Object.entries(source).map(([id, channel]) => ({ ...record(channel), channelId: record(channel).channelId || id }));
  const channels = entries.map((entry) => {
    const item = record(entry);
    const id = stringValue(item.id || item.channelId, 'channel');
    const status = stringValue(item.status, 'not-configured').toLowerCase();
    return {
      id,
      label: stringValue(item.label, 'Distribution'),
      status: (status === 'sent' || status === 'pending' || status === 'failed' || status === 'skipped' || status === 'ready' ? status : status === 'live' || status === 'published' ? 'distributed' : status === 'rebuild_pending' || status === 'building' ? 'pending' : 'not-configured') as DistributionChannel['status'],
      configured: Boolean(item.configured),
      capabilities: record(item.capabilities) as DistributionChannel['capabilities'],
      provider: stringValue(item.provider) || undefined,
      distributedAt: stringValue(item.distributedAt) || null,
      externalUrl: stringValue(item.externalUrl) || null,
      lastError: stringValue(item.lastError) || null
    };
  });
  const websiteEntry = entries.find((entry) => stringValue(record(entry).id || record(entry).channelId) === 'website');
  const website = websiteEntry ? record(websiteEntry) : {};
  // The channel status is a compatibility projection. Newer responses carry
  // the authoritative deployment lifecycle separately; prefer it so a stale
  // channel label can never turn an in-progress build into "Published".
  const websiteStatus = websiteLifecycleStatus(website.lifecycle || website.status);
  const rawCapabilities = record(raw.capabilities);
  const newsletter = channels.find((channel) => channel.id === 'newsletter');
  return {
    channels,
    capabilities: {
      addToNewsletter: rawCapabilities.addToNewsletter === true || (
        rawCapabilities.addToNewsletter !== false &&
        Boolean(newsletter?.configured) &&
        postId > 0 &&
        Boolean(headline || canonicalUrl || excerpt)
      )
    },
    websiteStatus,
    canRetryWebsite: (websiteStatus === 'failed' || websiteStatus === 'needs-configuration') && (
      raw.canRetryWebsite === true ||
      rawCapabilities.retryWebsite === true
    ),
    retryWebsiteAnswered: rawCapabilities.retryWebsite !== undefined || raw.canRetryWebsite !== undefined
  };
}

type EditorialPanelKey = 'tasks' | 'contributors' | 'corrections' | 'distribution' | 'activity';

function emptyEditorialPanelState(): Record<EditorialPanelKey, boolean> {
  return { tasks: false, contributors: false, corrections: false, distribution: false, activity: false };
}

function StorySummary({ payload, title }: { payload: WorkflowPayload | null; title: string }) {
  const normalized = payload ? normalizeWorkflowPayload(payload, payload, payload.story.postId, title) : null;
  const rawPayload = record(payload);
  const readiness = compactReadinessSummary(rawPayload.readiness);
  const contributorCount = summaryCount(rawPayload.contributors, normalizeContributors(rawPayload.contributors).length);

  if (!normalized) {
    return (
      <section className="byline-story-summary" aria-labelledby="byline-story-summary-heading">
        <span className="byline-editorial-eyebrow">{__('Story', 'weekly-wildcat-headless')}</span>
        <h2 id="byline-story-summary-heading">{title || __('Untitled story', 'weekly-wildcat-headless')}</h2>
        <p className="byline-editorial-muted">{__('Workflow details are loading.', 'weekly-wildcat-headless')}</p>
      </section>
    );
  }

  const { story } = normalized;
  const writer = normalized.writer?.name || __('Unassigned', 'weekly-wildcat-headless');
  const editor = story.editor?.name || __('Unassigned', 'weekly-wildcat-headless');
  const due = story.deadline
    ? `${story.deadline}${deadlineContext(story.deadline) ? ` · ${deadlineContext(story.deadline)}` : ''}`
    : __('No deadline', 'weekly-wildcat-headless');

  return (
    <section className="byline-story-summary" aria-labelledby="byline-story-summary-heading">
      <div className="byline-story-summary-heading">
        <div>
          <span className="byline-editorial-eyebrow">{__('Story', 'weekly-wildcat-headless')}</span>
          <h2 id="byline-story-summary-heading">{story.title || title || __('Untitled story', 'weekly-wildcat-headless')}</h2>
        </div>
        <span className="byline-editorial-badge byline-story-summary-status">{workflowStatusLabel(payload)}</span>
      </div>
      <dl className="byline-story-summary-meta">
        <div>
          <dt>{__('Writer', 'weekly-wildcat-headless')}</dt>
          <dd>{writer}</dd>
        </div>
        <div>
          <dt>{__('Editor', 'weekly-wildcat-headless')}</dt>
          <dd>{editor}</dd>
        </div>
        <div>
          <dt>{__('Due', 'weekly-wildcat-headless')}</dt>
          <dd>{due}</dd>
        </div>
        <div>
          <dt>{__('WordPress', 'weekly-wildcat-headless')}</dt>
          <dd>{publicationStatusLabel(story.postStatus)}</dd>
        </div>
      </dl>
      <div className="byline-story-summary-counters" aria-live="polite">
        {readiness && readiness.total > 0 ? <span>{sprintf(/* translators: 1: passed checks, 2: total checks. */ __('%1$d of %2$d checks ready', 'weekly-wildcat-headless'), readiness.passed, readiness.total)}</span> : null}
        {typeof story.tasksOpen === 'number' ? <span>{sprintf(/* translators: %d: open task count. */ __('%d open tasks', 'weekly-wildcat-headless'), story.tasksOpen)}</span> : null}
        {contributorCount > 0 ? <span>{sprintf(/* translators: %d: contributor count. */ __('%d contributors', 'weekly-wildcat-headless'), contributorCount)}</span> : null}
      </div>
    </section>
  );
}

function StoryPreviewLaunch({ postId }: { postId: number }) {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { savePost } = useDispatch('core/editor') as {
    savePost?: () => unknown;
  };

  const openPreview = useCallback(async () => {
    if (postId <= 0 || isSaving) return;

    // Reserve the popup during the click gesture. Waiting for savePost() before
    // calling window.open() is rejected by popup blockers in real browsers.
    // The window stays blank until the save has completed, so the preview can
    // never render an older draft snapshot as the result of this action.
    const previewWindow = window.open('about:blank', '_blank');
    if (!previewWindow) {
      setError(__('The preview window was blocked. Allow pop-ups for this WordPress site and try again.', 'weekly-wildcat-headless'));
      return;
    }
    try {
      // This is a same-origin, trusted admin URL. Clear the opener before any
      // later navigation so reserving the window does not create a reverse-tab
      // navigation surface.
      previewWindow.opener = null;
    } catch {
      // The navigation below remains safe even when a browser exposes a
      // read-only opener property.
    }

    setIsSaving(true);
    setError(null);

    try {
      await savePost?.();
      const configuredUrl = window.bylineEditorialWorkflow?.previewUrl;
      if (!configuredUrl) {
        throw new Error(__('The private preview URL is not configured.', 'weekly-wildcat-headless'));
      }

      const previewUrl = new URL(configuredUrl, window.location.href);
      previewUrl.searchParams.set('post', String(postId));
      previewWindow.location.replace(previewUrl.toString());
    } catch (nextError) {
      previewWindow.close();
      setError(errorMessage(nextError));
    } finally {
      setIsSaving(false);
    }
  }, [isSaving, postId, savePost]);

  return (
    <div className="byline-editorial-preview-launch">
      <Button variant="secondary" isBusy={isSaving} disabled={isSaving || postId <= 0} onClick={() => void openPreview()}>
        {isSaving ? __('Saving and opening preview…', 'weekly-wildcat-headless') : __('Preview as Byline', 'weekly-wildcat-headless')}
      </Button>
      <p className="byline-editorial-preview-help">
        {__('Save the current story, then open a private responsive preview. Publishing and deployment actions are disabled there.', 'weekly-wildcat-headless')}
      </p>
      {error ? <Notice status="error" isDismissible={false}>{error}</Notice> : null}
    </div>
  );
}

function EditorialNewsroomPanels({
  postId,
  title,
  canonicalUrl,
  excerpt,
  workflow,
  client,
  openPanels,
  onPanelToggle
}: {
  postId: number;
  title: string;
  canonicalUrl: string;
  excerpt: string;
  workflow: WorkflowControlsProps;
  client: EditorialRestClient;
  openPanels: StorySidebarPanelOpenState;
  onPanelToggle: (panel: StorySidebarPanel, opened: boolean) => void;
}) {
  const { payload } = workflow;
  const workflowForPanel = payload ? normalizeWorkflowPayload(payload, payload, postId, title) : null;
  const [tasks, setTasks] = useState<EditorialTask[]>([]);
  const [taskPeople, setTaskPeople] = useState<ContributorEntry[]>([]);
  const [contributors, setContributors] = useState<ContributorEntry[]>([]);
  const [availableContributors, setAvailableContributors] = useState<ContributorEntry[]>([]);
  const [corrections, setCorrections] = useState<CorrectionRecord[]>([]);
  const [activity, setActivity] = useState<EditorialActivityRecord[]>([]);
  const [legacyCorrectionText, setLegacyCorrectionText] = useState<string | null>(null);
  const [distribution, setDistribution] = useState<NormalizedDistribution>({
    channels: [],
    capabilities: { addToNewsletter: false },
    websiteStatus: 'unknown',
    canRetryWebsite: false,
    retryWebsiteAnswered: false
  });
  const [loading, setLoading] = useState<Record<EditorialPanelKey, boolean>>(emptyEditorialPanelState);
  const [loaded, setLoaded] = useState<Record<EditorialPanelKey, boolean>>(emptyEditorialPanelState);
  const [saving, setSaving] = useState<Record<EditorialPanelKey, boolean>>(emptyEditorialPanelState);
  const [errors, setErrors] = useState<Partial<Record<EditorialPanelKey, unknown>>>({});
  const requestedPanelsRef = useRef<Record<EditorialPanelKey, boolean>>(emptyEditorialPanelState());
  const mountedRef = useRef(true);
  const activePostIdRef = useRef(postId);
  activePostIdRef.current = postId;

  useEffect(() => {
    // Gutenberg can replay effects while mounting the editor. Re-arm the
    // guard on every real/effect remount before accepting async responses.
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const runPanel = useCallback(<T,>(
    key: EditorialPanelKey,
    operation: () => Promise<T>,
    onValue: (value: T) => void
  ) => {
    if (!postId || requestedPanelsRef.current[key]) return;
    requestedPanelsRef.current[key] = true;
    setLoading((current) => ({ ...current, [key]: true }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    void operation()
      .then((value) => {
        if (!mountedRef.current || activePostIdRef.current !== postId) return;
        onValue(value);
        setLoaded((current) => ({ ...current, [key]: true }));
      })
      .catch((error: unknown) => {
        if (!mountedRef.current || activePostIdRef.current !== postId) return;
        requestedPanelsRef.current[key] = false;
        setErrors((current) => ({ ...current, [key]: error }));
      })
      .finally(() => {
        if (mountedRef.current && activePostIdRef.current === postId) {
          setLoading((current) => ({ ...current, [key]: false }));
        }
      });
  }, [postId]);

  const loadTasks = useCallback(() => {
    runPanel('tasks', () => client.listTasks(postId), (value) => {
      setTasks(normalizeTasks(value));
      setTaskPeople(arrayValue(record(value).people).map(normalizeContributor).filter((item): item is ContributorEntry => item !== null));
    });
  }, [client, postId, runPanel]);

  const loadContributors = useCallback(() => {
    runPanel('contributors', () => client.getContributors(postId), (value) => {
      const raw = record(value);
      setContributors(normalizeContributors(raw.contributors));
      setAvailableContributors(normalizeContributors(raw.available ?? record(payload).editors));
    });
  }, [client, payload, postId, runPanel]);

  const loadCorrections = useCallback(() => {
    runPanel('corrections', () => client.getCorrections(postId), (value) => {
      const raw = record(value);
      setCorrections(normalizeCorrections(value));
      setLegacyCorrectionText(stringValue(raw.legacyText) || null);
    });
  }, [client, postId, runPanel]);

  const loadActivity = useCallback(() => {
    runPanel('activity', () => client.getActivity(postId), (value) => {
      setActivity(normalizeActivity(value));
    });
  }, [client, postId, runPanel]);

  const loadDistribution = useCallback(() => {
    runPanel('distribution', () => client.getDistribution(postId), (value) => {
      setDistribution(normalizeDistribution(value, postId, title, canonicalUrl, excerpt));
    });
  }, [canonicalUrl, client, excerpt, postId, runPanel, title]);

  const refreshTasks = useCallback(async () => {
    const value = await client.listTasks(postId);
    if (!mountedRef.current || activePostIdRef.current !== postId) return;
    setTasks(normalizeTasks(value));
    setTaskPeople(arrayValue(record(value).people).map(normalizeContributor).filter((item): item is ContributorEntry => item !== null));
  }, [client, postId]);

  const refreshCorrections = useCallback(async () => {
    const value = await client.getCorrections(postId);
    if (!mountedRef.current || activePostIdRef.current !== postId) return;
    const raw = record(value);
    setCorrections(normalizeCorrections(value));
    setLegacyCorrectionText(stringValue(raw.legacyText) || null);
  }, [client, postId]);

  const refreshDistribution = useCallback(async () => {
    const value = await client.getDistribution(postId);
    if (!mountedRef.current || activePostIdRef.current !== postId) return;
    setDistribution(normalizeDistribution(value, postId, title, canonicalUrl, excerpt));
  }, [canonicalUrl, client, excerpt, postId, title]);

  // A controlled PanelBody does not call onToggle when its `opened` prop is
  // changed by a navigation command. Keep lazy secondary data lazy for normal
  // renders, while making a Content Health deep link load the panel it opens.
  useEffect(() => {
    if (openPanels.tasks) loadTasks();
  }, [loadTasks, openPanels.tasks]);

  useEffect(() => {
    if (openPanels.contributors) loadContributors();
  }, [loadContributors, openPanels.contributors]);

  if (!postId) return null;

  const rawPayload = record(payload);
  const canEditStory = workflowForPanel?.capabilities.changeStatus === true;
  const contributorsCanEdit = workflowForPanel?.capabilities.assign === true;
  const taskCapabilities = {
    canEditLinkedStory: canEditStory,
    canAssign: canEditStory && taskPeople.length > 0,
    canDelete: canEditStory,
    canManageUnlinked: false
  };
  const taskCount = loaded.tasks ? tasks.filter((task) => task.state === 'open').length : workflowForPanel?.story.tasksOpen;
  const contributorCount = loaded.contributors
    ? contributors.length
    : summaryCount(rawPayload.contributors, normalizeContributors(rawPayload.contributors).length);
  const correctionCount = loaded.corrections
    ? corrections.length
    : summaryCount(rawPayload.corrections, normalizeCorrections(rawPayload.corrections).length);
  const isPublished = Boolean(workflowForPanel?.story.isPublished || workflowForPanel?.story.postStatus === 'publish');
  const discord = record(rawPayload.discord);
  const discordUrl = stringValue(discord.threadUrl);
  const discordState = workflowDiscordState(discord);
  const discordCanCreateThread = discord.canCreateThread === true;

  return (
    <>
      <PanelBody
        className="byline-editorial-sidebar-panel"
        title={__('Visuals', 'weekly-wildcat-headless')}
        initialOpen={false}
        opened={openPanels.visuals}
        onToggle={(opened) => onPanelToggle('visuals', opened)}
      >
        {({ opened }) => opened ? <VisualNeedsPanel workflow={workflow} /> : null}
      </PanelBody>

      <PanelBody
        className="byline-editorial-sidebar-panel"
        title={taskCount ? sprintf(/* translators: %d: open task count. */ __('Tasks · %d open', 'weekly-wildcat-headless'), taskCount) : __('Tasks', 'weekly-wildcat-headless')}
        initialOpen={false}
        opened={openPanels.tasks}
        onToggle={(opened) => onPanelToggle('tasks', opened)}
      >
        {({ opened }) => opened ? (
          <TasksPanel
            storyId={postId}
            tasks={tasks}
            people={taskPeople}
            capabilities={taskCapabilities}
            isLoading={loading.tasks}
            error={errors.tasks}
            onCreate={async (input: TaskInput) => { await client.createTask(input); await refreshTasks(); }}
            onUpdate={async (taskId: number | string, patch: TaskPatch) => { await client.updateTask(taskId, patch); await refreshTasks(); }}
            onDelete={async (taskId: number | string) => { await client.deleteTask(taskId); await refreshTasks(); }}
          />
        ) : null}
      </PanelBody>

      <PanelBody
        className="byline-editorial-sidebar-panel"
        title={contributorCount ? sprintf(/* translators: %d: contributor count. */ __('Contributors · %d', 'weekly-wildcat-headless'), contributorCount) : __('Contributors', 'weekly-wildcat-headless')}
        initialOpen={false}
        opened={openPanels.contributors}
        onToggle={(opened) => onPanelToggle('contributors', opened)}
      >
        {({ opened }) => opened ? (
          <ContributorsPanel
            contributors={contributors}
            availableContributors={availableContributors}
            canEdit={contributorsCanEdit}
            isLoading={loading.contributors}
            isSaving={saving.contributors}
            error={errors.contributors}
            onChange={async (next) => {
              setSaving((current) => ({ ...current, contributors: true }));
              try {
                const value = await client.saveContributors(postId, next);
                if (mountedRef.current) setContributors(normalizeContributors(record(value).contributors));
              } finally {
                if (mountedRef.current) setSaving((current) => ({ ...current, contributors: false }));
              }
            }}
          />
        ) : null}
      </PanelBody>

      <PanelBody
        className="byline-editorial-sidebar-panel"
        title={correctionCount ? sprintf(/* translators: %d: correction and update count. */ __('Corrections · %d', 'weekly-wildcat-headless'), correctionCount) : __('Corrections and updates', 'weekly-wildcat-headless')}
        initialOpen={false}
        onToggle={(opened) => { if (opened) loadCorrections(); }}
      >
        {({ opened }) => opened ? (
          <CorrectionsPanel
            records={corrections}
            legacyText={legacyCorrectionText}
            canEdit={contributorsCanEdit}
            isLoading={loading.corrections}
            isSaving={saving.corrections}
            error={errors.corrections}
            onCreate={async (input) => { await client.createCorrection(postId, input); await refreshCorrections(); }}
            onUpdate={async (id, input) => { await client.updateCorrection(postId, id, input); await refreshCorrections(); }}
            onDelete={async (id) => { await client.deleteCorrection(postId, id); await refreshCorrections(); }}
          />
        ) : null}
      </PanelBody>

      <PanelBody
        className="byline-editorial-sidebar-panel"
        title={__('Activity', 'weekly-wildcat-headless')}
        initialOpen={false}
        onToggle={(opened) => { if (opened) loadActivity(); }}
      >
        {({ opened }) => opened ? (
          <ActivityPanel records={activity} isLoading={loading.activity} error={errors.activity} onRetry={() => { requestedPanelsRef.current.activity = false; loadActivity(); }} />
        ) : null}
      </PanelBody>

      {isPublished ? (
        <PanelBody
          className="byline-editorial-sidebar-panel"
          title={__('Distribution', 'weekly-wildcat-headless')}
          initialOpen={false}
          onToggle={(opened) => { if (opened) loadDistribution(); }}
        >
          {({ opened }) => opened ? (
            <DistributionPanel
              headline={title}
              canonicalUrl={canonicalUrl}
              excerpt={excerpt}
              channels={distribution.channels}
              capabilities={distribution.capabilities}
              isLoading={loading.distribution}
              error={errors.distribution}
              onAction={async (channelId, action) => { await client.distributionAction(postId, channelId, action); await refreshDistribution(); }}
              onAddToNewsletter={async () => { await client.addToNewsletter(postId); await refreshDistribution(); }}
            />
          ) : null}
        </PanelBody>
      ) : null}

      {/* Discord is optional. When it is not configured the Discussion panel is
          not rendered at all, so an unused integration never adds a dead end to
          the article sidebar. */}
      {discordState !== 'not-configured' ? (
        <PanelBody
          className="byline-editorial-sidebar-panel"
          title={__('Discussion', 'weekly-wildcat-headless')}
          initialOpen={false}
        >
          {({ opened }) => opened ? (
            <div className="byline-editorial-discussion-summary">
              <p>
                {discordState === 'linked'
                  ? __('This story has a linked Discord discussion.', 'weekly-wildcat-headless')
                  : __('Discord is connected, but this story is not linked to a thread yet.', 'weekly-wildcat-headless')}
              </p>
              {discordState === 'configured-unlinked' && !discordCanCreateThread ? (
                <p className="byline-editorial-muted">
                  {__('Threads are created in Discord. This story links itself the next time the Byline bot syncs the storyboard.', 'weekly-wildcat-headless')}
                </p>
              ) : null}
              {discordUrl ? <a href={discordUrl} target="_blank" rel="noreferrer">{__('Open Discord thread', 'weekly-wildcat-headless')}</a> : null}
            </div>
          ) : null}
        </PanelBody>
      ) : null}
    </>
  );
}

function PrePublishReadinessPanel({ postId, client }: { postId: number; client: EditorialRestClient }) {
  const [checks, setChecks] = useState<ReadinessCheck[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setIsRefreshing(true);
    else setIsLoading(true);
    setError(null);
    try {
      const value = await client.getReadiness(postId);
      if (mountedRef.current) setChecks(normalizeReadiness(value, postId));
    } catch (caught: unknown) {
      if (mountedRef.current) setError(caught);
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, [client, postId]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = summarizeReadiness(checks);
  const attention = checks.filter((check) => check.state !== 'pass');
  const stateLabel = (state: ReadinessCheck['state']) => state === 'error'
    ? __('Error', 'weekly-wildcat-headless')
    : state === 'warning'
      ? __('Warning', 'weekly-wildcat-headless')
      : __('Pass', 'weekly-wildcat-headless');

  if (isLoading && checks.length === 0) {
    return (
      <div className="byline-prepublish-readiness">
        <Spinner />
        <span className="screen-reader-text">{__('Checking publication readiness', 'weekly-wildcat-headless')}</span>
      </div>
    );
  }

  return (
    <div className="byline-prepublish-readiness">
      <div className="byline-prepublish-readiness-summary" aria-live="polite">
        <strong>{summary.errors > 0 ? __('Needs attention before publishing', 'weekly-wildcat-headless') : __('Ready to publish', 'weekly-wildcat-headless')}</strong>
        <span>{sprintf(/* translators: 1: passed checks, 2: total checks. */ __('%1$d of %2$d checks pass', 'weekly-wildcat-headless'), summary.passed, summary.total)}</span>
      </div>

      {error ? (
        <Notice status="warning" isDismissible={false}>
          <p>{errorMessage(error)}</p>
          <p>{__('The article remains publishable in WordPress; readiness could not be refreshed.', 'weekly-wildcat-headless')}</p>
        </Notice>
      ) : null}

      {attention.length > 0 ? (
        <ul className="byline-prepublish-check-list" aria-label={__('Readiness items needing attention', 'weekly-wildcat-headless')}>
          {attention.map((check) => (
            <li className={`byline-prepublish-check byline-prepublish-check-${check.state}`} key={check.id}>
              <span className="byline-prepublish-check-state" aria-label={stateLabel(check.state)}>{stateLabel(check.state)}</span>
              <div>
                <strong>{check.label}</strong>
                <p>{check.explanation}</p>
              </div>
              {check.fix?.href ? <a href={check.fix.href}>{check.fix.label}</a> : null}
            </li>
          ))}
        </ul>
      ) : checks.length > 0 ? (
        <p className="byline-prepublish-success">{__('No blocking readiness issues were found.', 'weekly-wildcat-headless')}</p>
      ) : (
        <p className="byline-editorial-muted">{__('No readiness checks were returned. Recheck before publishing.', 'weekly-wildcat-headless')}</p>
      )}

      {summary.passed > 0 ? (
        <details className="byline-prepublish-passed-details">
          <summary>{sprintf(/* translators: %d: number of passed checks. */ __('Show %d passed checks', 'weekly-wildcat-headless'), summary.passed)}</summary>
          <ul>
            {checks.filter((check) => check.state === 'pass').map((check) => <li key={check.id}>{check.label}</li>)}
          </ul>
        </details>
      ) : null}

      <div className="byline-editorial-inline-actions">
        <Button variant="secondary" disabled={isRefreshing || isLoading} onClick={() => void load(true)}>
          {__('Recheck readiness', 'weekly-wildcat-headless')}
        </Button>
        <span className="byline-editorial-muted">{__('Warnings do not block WordPress publishing; errors need attention first.', 'weekly-wildcat-headless')}</span>
      </div>
    </div>
  );
}

function postPublishStatusLabel(status: WebsiteLifecycleStatus): string {
  if (status === 'live') return __('Live', 'weekly-wildcat-headless');
  if (status === 'building') return __('Building', 'weekly-wildcat-headless');
  if (status === 'failed') return __('Website update failed', 'weekly-wildcat-headless');
  if (status === 'needs-configuration') return __('Website update requires configuration', 'weekly-wildcat-headless');
  if (status === 'published') return __('Published in Byline', 'weekly-wildcat-headless');
  if (status === 'not-published') return __('Not published to Byline yet', 'weekly-wildcat-headless');
  return __('Website status is unavailable', 'weekly-wildcat-headless');
}

function PostPublishLifecycle({
  postId,
  title,
  canonicalUrl,
  excerpt,
  client,
  isPublished
}: {
  postId: number;
  title: string;
  canonicalUrl: string;
  excerpt: string;
  client: EditorialRestClient;
  isPublished: boolean;
}) {
  const [distribution, setDistribution] = useState<NormalizedDistribution | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [canRetry, setCanRetry] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [retriedStatus, setRetriedStatus] = useState<WebsiteLifecycleStatus | null>(null);
  const mountedRef = useRef(true);
  const pollAttemptsRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const value = await client.getDistribution(postId);
      if (mountedRef.current) {
        const next = normalizeDistribution(value, postId, title, canonicalUrl, excerpt);
        setDistribution(next);
        // Once the server reports a lifecycle of its own, the optimistic
        // post-retry state has done its job and must not mask a later failure.
        if (next.websiteStatus !== 'failed' && next.websiteStatus !== 'needs-configuration') setRetriedStatus(null);
      }
    } catch (caught: unknown) {
      if (mountedRef.current) setError(caught);
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, [canonicalUrl, client, excerpt, postId, title]);

  useEffect(() => {
    if (isPublished) void load();
  }, [isPublished, load]);

  // A retry answers with the durable job's own state, so the panel can move to
  // queued/building immediately instead of showing "failed" while work runs.
  const websiteStatus: WebsiteLifecycleStatus = retriedStatus
    ?? distribution?.websiteStatus
    ?? (isPublished ? 'published' : 'unknown');
  const canRetryNow = canRetry || distribution?.canRetryWebsite === true;

  useEffect(() => {
    pollAttemptsRef.current = 0;
  }, [isPublished, postId]);

  useEffect(() => {
    if (!isPublished
      || websiteStatus === 'live'
      || websiteStatus === 'failed'
      || websiteStatus === 'needs-configuration'
      || pollAttemptsRef.current >= 12) {
      return undefined;
    }

    let active = true;
    const timer = window.setTimeout(() => {
      if (!active) return;
      pollAttemptsRef.current += 1;
      void load();
    }, 5000);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [isPublished, load, websiteStatus]);

  useEffect(() => {
    if (websiteStatus !== 'failed' && websiteStatus !== 'needs-configuration') return undefined;
    if (distribution?.canRetryWebsite) {
      setCanRetry(true);
      return undefined;
    }
    // The story's own distribution response reports whether this user may
    // retry. When it has answered, do not also probe the integrations route
    // that most editors are not allowed to read.
    if (distribution?.retryWebsiteAnswered) {
      setCanRetry(false);
      return undefined;
    }
    let active = true;
    void apiFetch<UnknownRecord>({ path: '/byline/v1/admin/deployment' })
      .then((value) => {
        if (active) setCanRetry(record(value).configured === true);
      })
      .catch(() => {
        if (active) setCanRetry(false);
      });
    return () => {
      active = false;
    };
  }, [distribution, websiteStatus]);

  /**
   * Retry requeues the durable deployment job rather than firing an untracked
   * hook request. Repeated clicks are guarded here and remain idempotent on the
   * server, which requeues the existing job instead of creating a second one.
   */
  const retryWebsite = async () => {
    if (!canRetryNow || isRetrying) return;
    setIsRetrying(true);
    setError(null);
    try {
      const status = await apiFetch<UnknownRecord>({ path: '/byline/v1/admin/deployment/trigger', method: 'POST' });
      if (mountedRef.current) {
        const lifecycle = websiteLifecycleStatus(record(status).lifecycle);
        setRetriedStatus(lifecycle === 'unknown' ? 'building' : lifecycle);
      }
      await load();
    } catch (caught: unknown) {
      if (mountedRef.current) {
        setRetriedStatus(null);
        setError(caught);
      }
    } finally {
      if (mountedRef.current) setIsRetrying(false);
    }
  };

  return (
    <div className="byline-postpublish-lifecycle">
      <div className="byline-postpublish-status" aria-live="polite">
        <strong>{postPublishStatusLabel(websiteStatus)}</strong>
        {isLoading ? (
          <>
            <Spinner />
            <span className="screen-reader-text">{__('Loading website lifecycle status', 'weekly-wildcat-headless')}</span>
          </>
        ) : null}
      </div>
      <p className="byline-editorial-muted">
        {websiteStatus === 'failed'
          ? __('WordPress publication succeeded; the Byline website update needs attention.', 'weekly-wildcat-headless')
          : websiteStatus === 'needs-configuration'
            ? __('WordPress publication succeeded. This change is recorded and will deploy once a deployment target is configured.', 'weekly-wildcat-headless')
          : websiteStatus === 'building' || websiteStatus === 'published'
            ? __('WordPress publication succeeded; Byline is checking the public manifest for the exact revision.', 'weekly-wildcat-headless')
          : __('WordPress publication and the Byline website build are tracked separately.', 'weekly-wildcat-headless')}
      </p>
      {error ? <Notice status="warning" isDismissible={false}>{errorMessage(error)}</Notice> : null}
      {websiteStatus === 'failed' || websiteStatus === 'needs-configuration' ? (
        <Notice status={websiteStatus === 'failed' ? 'error' : 'warning'} isDismissible={false}>
          <p>
            {websiteStatus === 'failed'
              ? __('The website build failed after publication.', 'weekly-wildcat-headless')
              : __('No deployment target is configured, so the public website has not been rebuilt yet.', 'weekly-wildcat-headless')}
          </p>
          {canRetryNow ? (
            <Button variant="secondary" disabled={isRetrying} onClick={() => void retryWebsite()}>
              {isRetrying ? __('Retrying website update…', 'weekly-wildcat-headless') : __('Retry website update', 'weekly-wildcat-headless')}
            </Button>
          ) : (
            <p>{__('Ask an integration manager to check Deployment settings before retrying.', 'weekly-wildcat-headless')}</p>
          )}
        </Notice>
      ) : null}
      {distribution ? (
        <DistributionPanel
          headline={title}
          canonicalUrl={canonicalUrl}
          excerpt={excerpt}
          channels={distribution.channels}
          capabilities={distribution.capabilities}
          isLoading={isLoading}
          error={error}
          onAction={async (channelId, action) => { await client.distributionAction(postId, channelId, action); await load(); }}
          onAddToNewsletter={async () => { await client.addToNewsletter(postId); await load(); }}
        />
      ) : null}
    </div>
  );
}

function EditorialWorkflowPlugin() {
  const { postId, postType, isPublished, title, canonicalUrl, excerpt } = useSelect((select: any) => {
    const editor = select('core/editor');

    return {
      postId: (editor?.getCurrentPostId?.() as number) ?? 0,
      postType: (editor?.getCurrentPostType?.() as string) ?? '',
      isPublished: (editor?.getEditedPostAttribute?.('status') as string) === 'publish',
      title: (editor?.getEditedPostAttribute?.('title') as string) ?? '',
      canonicalUrl: (editor?.getPermalink?.() as string) ?? '',
      excerpt: (editor?.getEditedPostAttribute?.('excerpt') as string) ?? '',
    };
  }, []);

  const workflow = useEditorialWorkflow(postId, isPublished);
  const { payload } = workflow;
  const editorialClient = useEditorialRestClient();

  const currentLabel = useMemo(() => workflowStatusLabel(payload), [payload]);

  const { openGeneralSidebar } = useDispatch('core/edit-post') as {
    openGeneralSidebar?: (name: string) => void;
  };

  const [openPanels, setOpenPanels] = useState<StorySidebarPanelOpenState>(() => createStorySidebarPanelOpenState());
  const onPanelToggle = useCallback((panel: StorySidebarPanel, opened: boolean) => {
    setOpenPanels((current) => setStorySidebarPanelOpen(current, panel, opened));
  }, []);
  const openRequestedStoryPanel = useCallback((panel: StorySidebarPanel) => {
    setOpenPanels((current) => focusStorySidebarPanel(current, panel));
    openGeneralSidebar?.(`${PLUGIN_NAME}/${SIDEBAR_NAME}`);
  }, [openGeneralSidebar]);

  // Navigating between stories remounts the lazy newsroom panels, but the
  // workflow PanelBody belongs to this entrypoint. Reset its controlled state
  // so a panel requested for one story cannot remain focused on another.
  useEffect(() => {
    setOpenPanels(createStorySidebarPanelOpenState());
  }, [postId]);

  useEffect(() => {
    if (postType !== 'post' || postId <= 0) return undefined;

    installStorySidebarNavigationBridge();
    const unsubscribe = subscribeToStorySidebarNavigation(window, (command) => {
      openRequestedStoryPanel(command.panel);
    });
    const pending = consumeStorySidebarNavigation();
    if (pending) openRequestedStoryPanel(pending.panel);
    return unsubscribe;
  }, [openRequestedStoryPanel, postId, postType]);

  // Workflow is a story concept. Pages and the other Byline post types never
  // see it, and the server does not load this bundle for them either.
  if (postType !== 'post') return null;

  // Keep the navigation label stable. The compact Story summary carries the
  // current workflow and WordPress publication state inside the sidebar.
  const sidebarTitle = __('Story', 'weekly-wildcat-headless');

  return (
    <>
      <PluginPostStatusInfo className="byline-workflow-summary-slot">
        <div className="byline-workflow-summary">
          <span>{__('Workflow', 'weekly-wildcat-headless')}</span>
          {currentLabel ? (
            <Button
              variant="link"
              className="byline-workflow-summary-value"
              onClick={() => openGeneralSidebar?.(`${PLUGIN_NAME}/${SIDEBAR_NAME}`)}
              aria-label={sprintf(
                /* translators: %s: current editorial workflow status. */
                __('Editorial workflow: %s. Open the workflow sidebar.', 'weekly-wildcat-headless'),
                currentLabel
              )}
            >
              {currentLabel}
            </Button>
          ) : (
            <span className="byline-workflow-summary-value">{__('—', 'weekly-wildcat-headless')}</span>
          )}
        </div>
      </PluginPostStatusInfo>

      <PluginSidebar name={SIDEBAR_NAME} title={sidebarTitle} icon={listView} className="byline-editorial-sidebar">
        <Panel className="byline-story-panel">
          <StorySummary payload={payload} title={title} />
          {postId > 0 ? <StoryPreviewLaunch postId={postId} /> : null}
          <PanelBody
            className="byline-editorial-sidebar-panel byline-editorial-workflow-panel"
            title={__('Workflow', 'weekly-wildcat-headless')}
            initialOpen={true}
            opened={openPanels.workflow}
            onToggle={(opened) => onPanelToggle('workflow', opened)}
          >
            <WorkflowControls key={postId} {...workflow} />
          </PanelBody>
          <EditorialNewsroomPanels
            key={`newsroom-${postId}`}
            postId={postId}
            title={title}
            canonicalUrl={canonicalUrl}
            excerpt={excerpt}
            workflow={workflow}
            client={editorialClient}
            openPanels={openPanels}
            onPanelToggle={onPanelToggle}
          />
        </Panel>
      </PluginSidebar>

      {PluginPrePublishPanel ? (
        <PluginPrePublishPanel className="byline-editorial-prepublish-panel">
          <PrePublishReadinessPanel postId={postId} client={editorialClient} />
        </PluginPrePublishPanel>
      ) : null}

      {PluginPostPublishPanel && isPublished ? (
        <PluginPostPublishPanel className="byline-editorial-postpublish-panel">
          <PostPublishLifecycle
            postId={postId}
            title={title}
            canonicalUrl={canonicalUrl}
            excerpt={excerpt}
            client={editorialClient}
            isPublished={isPublished}
          />
        </PluginPostPublishPanel>
      ) : null}
    </>
  );
}

registerPlugin(PLUGIN_NAME, { render: EditorialWorkflowPlugin });
