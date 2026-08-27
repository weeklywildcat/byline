/**
 * The Byline editorial workflow, as a native block-editor integration.
 *
 * Two supported SlotFills, no DOM manipulation:
 *
 *  - `PluginPostStatusInfo` adds one summary row to the document Summary panel,
 *    next to — and clearly distinct from — the WordPress publication status.
 *  - `PluginSidebar` (with its More-menu item) holds the full controls.
 *
 * Editorial workflow and WordPress publication state are different questions.
 * The UI never merges them: Summary shows "Status: Draft" and "Workflow:
 * Writing" as two separate rows, and "Published" is reported as derived from
 * WordPress rather than offered as a choice.
 *
 * Workflow values are private newsroom information, so they travel over a
 * capability-protected Byline endpoint rather than through public post meta.
 * That means workflow saves independently of the post's own draft; the sidebar
 * says so rather than leaving an editor to guess.
 */
import apiFetch from '@wordpress/api-fetch';
import { Button, Notice, SelectControl, Spinner, TextControl, TextareaControl } from '@wordpress/components';
import { useDispatch, useSelect } from '@wordpress/data';
import { useCallback, useEffect, useMemo, useRef, useState } from '@wordpress/element';
import { PluginPostStatusInfo, PluginSidebar, PluginSidebarMoreMenuItem } from '@wordpress/editor';
import { __, sprintf } from '@wordpress/i18n';
import { pencil } from '@wordpress/icons';
import { registerPlugin } from '@wordpress/plugins';

import {
  describeWorkflowError,
  workflowStages,
  workflowStatusLabel,
  workflowStoryPath,
  type WorkflowChanges,
  type WorkflowPayload,
  type WorkflowStatusDefinition
} from './editorial-workflow-model';

import './editorial-workflow.css';

const PLUGIN_NAME = 'byline-editorial-workflow';
const SIDEBAR_NAME = 'byline-editorial-workflow-sidebar';

function errorMessage(error: unknown): string {
  return describeWorkflowError(error, __('Something went wrong. Please try again.', 'weekly-wildcat-headless'));
}

const storyPath = workflowStoryPath;

/**
 * Loads the workflow once per post and owns every write.
 *
 * A failure here is never fatal: `error` is surfaced as a dismissible notice
 * with a retry, and the editor keeps writing their article regardless.
 */
function useEditorialWorkflow(postId: number, isPublished: boolean) {
  const [payload, setPayload] = useState<WorkflowPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  // Guards against a slow first response overwriting a newer one, and against
  // setting state on an unmounted sidebar.
  const requestRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(() => {
    if (!postId) return;

    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setIsLoading(true);
    setLoadError(null);

    apiFetch<WorkflowPayload>({ path: storyPath(postId) })
      .then((next) => {
        if (!mountedRef.current || requestRef.current !== requestId) return;
        setPayload(next);
      })
      .catch((error: unknown) => {
        if (!mountedRef.current || requestRef.current !== requestId) return;
        setLoadError(errorMessage(error));
      })
      .finally(() => {
        if (!mountedRef.current || requestRef.current !== requestId) return;
        setIsLoading(false);
      });
  }, [postId]);

  useEffect(load, [load]);

  // Publishing and unpublishing change the effective status without any
  // workflow write, so the panel re-reads when the publication state flips.
  useEffect(() => {
    if (payload) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPublished]);

  const save = useCallback(
    (changes: WorkflowChanges) => {
      if (!postId) return Promise.resolve(false);

      const requestId = requestRef.current + 1;
      requestRef.current = requestId;
      setIsSaving(true);
      setSaveError(null);

      return apiFetch<WorkflowPayload>({ path: storyPath(postId), method: 'POST', data: changes })
        .then((next) => {
          if (!mountedRef.current || requestRef.current !== requestId) return false;
          setPayload(next);
          setSavedAt(Date.now());
          return true;
        })
        .catch((error: unknown) => {
          // The entered value is deliberately left in the field so the editor
          // can correct it and retry rather than retyping it.
          if (mountedRef.current && requestRef.current === requestId) setSaveError(errorMessage(error));
          return false;
        })
        .finally(() => {
          if (mountedRef.current && requestRef.current === requestId) setIsSaving(false);
        });
    },
    [postId]
  );

  return { payload, load, save, isLoading, isSaving, loadError, saveError, savedAt };
}

type StageListProps = {
  statuses: WorkflowStatusDefinition[];
  current: string;
  disabled: boolean;
  onChange: (status: string) => void;
};

/**
 * A native radio group, not a fake select. Progress through the main line is
 * conveyed by position and by a "done" text style; the accessible name of each
 * option is always the plain status label.
 */
function StageList({ statuses, current, disabled, onChange }: StageListProps) {
  const { main, sidelined } = workflowStages(statuses, current);

  const renderStage = (stage: (typeof main)[number]) => {
    const className = [
      'byline-workflow-stage',
      stage.isCurrent ? 'byline-workflow-stage-current' : '',
      stage.isDone ? 'byline-workflow-stage-done' : '',
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <label className={className} key={stage.id}>
        <input
          type="radio"
          name="byline-workflow-stage"
          value={stage.id}
          checked={stage.isCurrent}
          disabled={disabled}
          onChange={() => onChange(stage.id)}
        />
        <span className="byline-workflow-stage-text">{stage.label}</span>
      </label>
    );
  };

  return (
    <>
      <fieldset className="byline-workflow-stages">
        <legend>{__('Workflow', 'weekly-wildcat-headless')}</legend>
        {main.map(renderStage)}
      </fieldset>
      {sidelined.length > 0 ? (
        <fieldset className="byline-workflow-stages byline-workflow-stages-sidelined">
          <legend>{__('Not in production', 'weekly-wildcat-headless')}</legend>
          {sidelined.map(renderStage)}
        </fieldset>
      ) : null}
    </>
  );
}

type WorkflowControlsProps = ReturnType<typeof useEditorialWorkflow>;

function WorkflowControls(workflow: WorkflowControlsProps) {
  const { payload, load, save, isLoading, isSaving, loadError, saveError, savedAt } = workflow;
  const [visuals, setVisuals] = useState('');
  const [visualsDirty, setVisualsDirty] = useState(false);

  useEffect(() => {
    if (payload && !visualsDirty) setVisuals(payload.story.visuals);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload?.story.visuals]);

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

  const { story, statuses, capabilities, writer, editors, discord } = payload;
  const currentLabel = workflowStatusLabel(payload);
  const busy = isLoading || isSaving;

  const editorOptions = [
    { label: __('Unassigned', 'weekly-wildcat-headless'), value: '0' },
    ...editors.map((editor) => ({ label: editor.name, value: String(editor.id) })),
  ];
  const assignedEditorName = editors.find((editor) => editor.id === story.editorId)?.name ?? '';

  return (
    <>
      <div className="byline-workflow-panel">
        <p className="byline-workflow-current">
          <span className="byline-workflow-current-label">{__('Current status', 'weekly-wildcat-headless')}</span>
          <span className="byline-workflow-current-value">{currentLabel}</span>
        </p>
        {story.isPublished ? (
          <p className="byline-workflow-note">
            {__(
              'This story is published, so its workflow follows the WordPress publication state. The earlier stage is kept in case it is unpublished.',
              'weekly-wildcat-headless'
            )}
          </p>
        ) : (
          <p className="byline-workflow-note">
            {__('Workflow changes save on their own, separately from the post content.', 'weekly-wildcat-headless')}
          </p>
        )}
      </div>

      {story.isPublished ? null : (
        <div className="byline-workflow-panel">
          <StageList
            statuses={statuses}
            current={story.storedStatus}
            disabled={busy || !capabilities.changeStatus}
            onChange={(status) => save({ status })}
          />
        </div>
      )}

      <div className="byline-workflow-panel">
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
                disabled={busy}
                onChange={(value: string) => save({ editorId: Number.parseInt(value, 10) || 0 })}
              />
            </div>
            <div className="byline-workflow-field">
              <TextControl
                __nextHasNoMarginBottom
                type="date"
                label={__('Deadline', 'weekly-wildcat-headless')}
                help={__('An internal newsroom date. It does not schedule publication.', 'weekly-wildcat-headless')}
                value={story.deadline}
                disabled={busy}
                onChange={(value: string) => save({ deadline: value })}
              />
            </div>
          </>
        ) : (
          <dl className="byline-workflow-readonly">
            <dt>{__('Editor', 'weekly-wildcat-headless')}</dt>
            <dd>{assignedEditorName || __('Unassigned', 'weekly-wildcat-headless')}</dd>
            {story.deadline ? (
              <>
                <dt>{__('Deadline', 'weekly-wildcat-headless')}</dt>
                <dd>{story.deadline}</dd>
              </>
            ) : null}
          </dl>
        )}

        <div className="byline-workflow-field">
          <TextareaControl
            __nextHasNoMarginBottom
            label={__('Visual needs', 'weekly-wildcat-headless')}
            help={__('Internal only. Never shown to readers.', 'weekly-wildcat-headless')}
            rows={3}
            value={visuals}
            disabled={busy || !capabilities.changeStatus}
            onChange={(value: string) => {
              setVisuals(value);
              setVisualsDirty(true);
            }}
          />
          {visualsDirty ? (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => {
                save({ visuals }).then((saved) => {
                  if (saved) setVisualsDirty(false);
                });
              }}
            >
              {__('Save visual needs', 'weekly-wildcat-headless')}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="byline-workflow-panel">
        <dl className="byline-workflow-readonly">
          <dt>{__('Discussion', 'weekly-wildcat-headless')}</dt>
          <dd>
            {discord.threadId
              ? __('Discord thread linked.', 'weekly-wildcat-headless')
              : __('Not linked to a Discord thread yet.', 'weekly-wildcat-headless')}
          </dd>
        </dl>

        {saveError ? (
          <Notice status="error" isDismissible={false}>
            <p>{saveError}</p>
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
    </>
  );
}

function EditorialWorkflowPlugin() {
  const { postId, postType, isPublished } = useSelect((select: any) => {
    const editor = select('core/editor');

    return {
      postId: (editor?.getCurrentPostId?.() as number) ?? 0,
      postType: (editor?.getCurrentPostType?.() as string) ?? '',
      isPublished: (editor?.getEditedPostAttribute?.('status') as string) === 'publish',
    };
  }, []);

  const workflow = useEditorialWorkflow(postId, isPublished);
  const { payload } = workflow;

  const currentLabel = useMemo(() => workflowStatusLabel(payload), [payload]);

  const { openGeneralSidebar } = useDispatch('core/edit-post') as {
    openGeneralSidebar?: (name: string) => void;
  };

  // Workflow is a story concept. Pages and the other Byline post types never
  // see it, and the server does not load this bundle for them either.
  if (postType !== 'post') return null;

  // The button's accessible name carries the current state, so a screen-reader
  // user learns the workflow status without opening the sidebar.
  const sidebarTitle = currentLabel
    ? sprintf(/* translators: %s: current editorial workflow status. */ __('Workflow: %s', 'weekly-wildcat-headless'), currentLabel)
    : __('Editorial Workflow', 'weekly-wildcat-headless');

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

      <PluginSidebarMoreMenuItem target={SIDEBAR_NAME} icon={pencil}>
        {sidebarTitle}
      </PluginSidebarMoreMenuItem>

      <PluginSidebar name={SIDEBAR_NAME} title={sidebarTitle} icon={pencil}>
        <WorkflowControls {...workflow} />
      </PluginSidebar>
    </>
  );
}

registerPlugin(PLUGIN_NAME, { render: EditorialWorkflowPlugin });
