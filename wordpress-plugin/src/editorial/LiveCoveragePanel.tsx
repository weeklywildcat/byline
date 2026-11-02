import apiFetch from '@wordpress/api-fetch';
import { MediaUpload, MediaUploadCheck } from '@wordpress/block-editor';
import { Button, CheckboxControl, Notice, Spinner, TextControl, TextareaControl } from '@wordpress/components';
import { useSelect } from '@wordpress/data';
import { useCallback, useEffect, useState } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';
import { normalizeBylineError } from '@byline/admin-runtime';
import {
  EMPTY_LIVE_UPDATE,
  canPostLiveUpdate,
  liveUpdateTimeLabel,
  readLiveCoverage,
  type LiveCoverageRecord,
  type LiveUpdateInput,
  type LiveUpdateRecord
} from './live-coverage-model';
import './editorial.css';

type Props = { postId: number };

const livePath = (postId: number) => `/byline/v1/editorial/stories/${postId}/live`;

/**
 * Live coverage for a developing story. Updates are posted on their own, never
 * by saving the article, and each one republishes the static story. Ending
 * coverage keeps every update on the page.
 */
export function LiveCoveragePanel({ postId }: Props) {
  const isPublished = useSelect((select: any) => select('core/editor')?.getCurrentPostAttribute?.('status') === 'publish', []);
  const [coverage, setCoverage] = useState<LiveCoverageRecord | null>(null);
  const [draft, setDraft] = useState<LiveUpdateInput>(EMPTY_LIVE_UPDATE);
  const [editing, setEditing] = useState<LiveUpdateRecord | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    try {
      setCoverage(readLiveCoverage(await apiFetch({ path: livePath(postId) })));
    } catch (caught) {
      setError(normalizeBylineError(caught).message);
    }
  }, [postId]);

  useEffect(() => { void load(); }, [load]);

  const run = async (action: () => Promise<unknown>, success: string) => {
    setIsBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
      await load();
      setNotice(success);
      return true;
    } catch (caught) {
      setError(normalizeBylineError(caught).message);
      return false;
    } finally {
      setIsBusy(false);
    }
  };

  const setStatus = (action: 'start' | 'end' | 'resume') => {
    if (action === 'end' && !window.confirm(__('End live coverage? Every update stays on the story, and readers see that coverage has ended.', 'weekly-wildcat-headless'))) return;
    const messages = {
      start: __('Live coverage started. Post the first update.', 'weekly-wildcat-headless'),
      end: __('Live coverage ended. Every update stays on the story.', 'weekly-wildcat-headless'),
      resume: __('Live coverage resumed.', 'weekly-wildcat-headless')
    };
    void run(() => apiFetch({ path: livePath(postId), method: 'POST', data: { action } }), messages[action]);
  };

  const published = isPublished
    ? __('Posted. It appears on the site after the next publish, usually within a few minutes.', 'weekly-wildcat-headless')
    : __('Saved. Updates appear when the story is published.', 'weekly-wildcat-headless');

  const submit = async () => {
    const ok = editing
      ? await run(() => apiFetch({ path: `${livePath(postId)}/updates/${editing.id}`, method: 'POST', data: draft }), published)
      : await run(() => apiFetch({ path: `${livePath(postId)}/updates`, method: 'POST', data: draft }), published);
    if (ok) {
      setDraft(EMPTY_LIVE_UPDATE);
      setEditing(null);
    }
  };

  const remove = (update: LiveUpdateRecord) => {
    if (!window.confirm(__('Delete this update from the story?', 'weekly-wildcat-headless'))) return;
    void run(() => apiFetch({ path: `${livePath(postId)}/updates/${update.id}`, method: 'DELETE' }), __('Update deleted.', 'weekly-wildcat-headless'));
  };

  if (!coverage) return error ? <Notice status="error" isDismissible={false}>{error}</Notice> : <Spinner />;

  if (coverage.status === '') {
    return (
      <div className="byline-live-panel">
        <p className="byline-editorial-muted">
          {__('For a developing story: post short, timestamped updates without editing the article. Readers see a LIVE label and new updates as they are published.', 'weekly-wildcat-headless')}
        </p>
        {error ? <Notice status="error" isDismissible={false}>{error}</Notice> : null}
        <Button variant="primary" onClick={() => setStatus('start')} isBusy={isBusy} disabled={isBusy}>
          {__('Start live coverage', 'weekly-wildcat-headless')}
        </Button>
      </div>
    );
  }

  return (
    <div className="byline-live-panel">
      <p className={`byline-live-panel-status is-${coverage.status}`}>
        {coverage.status === 'live'
          ? __('Live now', 'weekly-wildcat-headless')
          : sprintf(/* translators: %s: time coverage ended. */ __('Ended %s. Every update stays on the story.', 'weekly-wildcat-headless'), liveUpdateTimeLabel(coverage.endedAt))}
      </p>
      {notice ? <Notice status="success" isDismissible onRemove={() => setNotice('')}>{notice}</Notice> : null}
      {error ? <Notice status="error" isDismissible onRemove={() => setError('')}>{error}</Notice> : null}

      <div className="byline-live-panel-composer">
        <TextControl
          __nextHasNoMarginBottom
          __next40pxDefaultSize
          label={__('Headline (optional)', 'weekly-wildcat-headless')}
          value={draft.title}
          onChange={(title) => setDraft({ ...draft, title })}
        />
        <TextareaControl
          __nextHasNoMarginBottom
          label={editing ? __('Edit update', 'weekly-wildcat-headless') : __('Update', 'weekly-wildcat-headless')}
          help={__('Blank line for a new paragraph. Start lines with "- " for a list. Links work as typed.', 'weekly-wildcat-headless')}
          rows={5}
          value={draft.text}
          onChange={(text) => setDraft({ ...draft, text })}
        />
        <MediaUploadCheck>
          <MediaUpload
            allowedTypes={['image']}
            value={draft.imageId || undefined}
            onSelect={(media: { id?: number }) => setDraft({ ...draft, imageId: Number(media?.id) || 0 })}
            render={({ open }: { open: () => void }) => (
              <div className="byline-live-panel-photo">
                <Button variant="secondary" onClick={open}>{draft.imageId ? __('Replace photo', 'weekly-wildcat-headless') : __('Add photo', 'weekly-wildcat-headless')}</Button>
                {draft.imageId ? <Button variant="link" isDestructive onClick={() => setDraft({ ...draft, imageId: 0 })}>{__('Remove photo', 'weekly-wildcat-headless')}</Button> : null}
              </div>
            )}
          />
        </MediaUploadCheck>
        <CheckboxControl
          __nextHasNoMarginBottom
          label={__('Pin as key points', 'weekly-wildcat-headless')}
          help={__('Shown in a box above every other update. Only one update is pinned.', 'weekly-wildcat-headless')}
          checked={draft.pinned}
          onChange={(pinned) => setDraft({ ...draft, pinned })}
        />
        <div className="byline-live-panel-actions">
          {editing ? <Button variant="tertiary" onClick={() => { setEditing(null); setDraft(EMPTY_LIVE_UPDATE); }}>{__('Cancel', 'weekly-wildcat-headless')}</Button> : null}
          <Button variant="primary" onClick={submit} isBusy={isBusy} disabled={isBusy || !canPostLiveUpdate(draft)}>
            {editing ? __('Save update', 'weekly-wildcat-headless') : __('Post update', 'weekly-wildcat-headless')}
          </Button>
        </div>
      </div>

      <ol className="byline-live-panel-updates" aria-label={__('Posted updates, newest first', 'weekly-wildcat-headless')}>
        {coverage.updates.map((update) => (
          <li key={update.id} className={update.pinned ? 'is-pinned' : undefined}>
            <span className="byline-editorial-muted">
              {liveUpdateTimeLabel(update.date)}{update.author ? ` · ${update.author}` : ''}{update.pinned ? ` · ${__('Key points', 'weekly-wildcat-headless')}` : ''}
            </span>
            {update.title ? <strong>{update.title}</strong> : null}
            <p>{update.text.length > 140 ? `${update.text.slice(0, 140)}…` : update.text}</p>
            <span className="byline-live-panel-item-actions">
              <Button variant="link" onClick={() => { setEditing(update); setDraft({ title: update.title, text: update.text, imageId: update.imageId, pinned: update.pinned }); }}>{__('Edit', 'weekly-wildcat-headless')}</Button>
              <Button variant="link" isDestructive onClick={() => remove(update)}>{__('Delete', 'weekly-wildcat-headless')}</Button>
            </span>
          </li>
        ))}
      </ol>

      {coverage.status === 'live' ? (
        <Button variant="secondary" isDestructive onClick={() => setStatus('end')} disabled={isBusy}>{__('End live coverage', 'weekly-wildcat-headless')}</Button>
      ) : (
        <Button variant="secondary" onClick={() => setStatus('resume')} disabled={isBusy}>{__('Resume live coverage', 'weekly-wildcat-headless')}</Button>
      )}
    </div>
  );
}
