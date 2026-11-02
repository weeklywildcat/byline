import apiFetch from '@wordpress/api-fetch';
import { Button, FocalPointPicker, Modal, Notice, RangeControl, Spinner } from '@wordpress/components';
import { useDispatch } from '@wordpress/data';
import { useEffect, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import Cropper from 'react-easy-crop';
import { IMAGE_CROP_SHAPES, IMAGE_CROP_SHAPE_DETAILS, shapeAspectRatio, type ImageCropShape } from '@byline/core';
import { normalizeBylineError } from '@byline/admin-runtime';
import { PhotoPlacements } from './PhotoPlacements';
import {
  areaFromRect,
  draftFromImage,
  draftPayload,
  draftsEqual,
  effectiveCrop,
  readArtDirectionImage,
  rectFromArea,
  resetShapeCrop,
  setFocalPoint,
  setShapeCrop,
  type ArtDirectionImage,
  type CropDraft
} from './photo-crops-model';
import './photo-crops.css';

export type PhotoCropsDialogProps = {
  attachmentId: number;
  title: string;
  excerpt: string;
  onClose: () => void;
};

type Tab = 'focal' | ImageCropShape;

/** Dispatched on `window` to open the dialog for the featured image (readiness fixes use it). */
export const OPEN_PHOTO_CROPS_EVENT = 'byline:open-photo-crops';

function host() {
  return (window as { bylineEditorialWorkflow?: { publicHost?: string } }).bylineEditorialWorkflow?.publicHost ?? '';
}

/**
 * Focal point and per-shape crops for a photo, with every placement previewed.
 * Saved on the attachment, so every story that uses the photo gets them.
 */
export function PhotoCropsDialog({ attachmentId, title, excerpt, onClose }: PhotoCropsDialogProps) {
  const [image, setImage] = useState<ArtDirectionImage | null>(null);
  const [saved, setSaved] = useState<CropDraft | null>(null);
  const [draft, setDraft] = useState<CropDraft | null>(null);
  const [tab, setTab] = useState<Tab>('focal');
  const [cropperKey, setCropperKey] = useState(0);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const { createNotice } = useDispatch('core/notices') as { createNotice?: (status: string, message: string, options?: Record<string, unknown>) => void };

  useEffect(() => {
    let active = true;
    apiFetch({ path: `/byline/v1/media/${attachmentId}/art-direction` })
      .then((response) => {
        if (!active) return;
        const next = readArtDirectionImage(response);
        if (!next) throw new Error(__('This photo could not be loaded.', 'weekly-wildcat-headless'));
        setImage(next);
        setSaved(draftFromImage(next));
        setDraft(draftFromImage(next));
      })
      .catch((caught: unknown) => active && setError(normalizeBylineError(caught).message));
    return () => {
      active = false;
    };
  }, [attachmentId]);

  const isDirty = Boolean(draft && saved && !draftsEqual(draft, saved));

  const selectTab = (next: Tab) => {
    setTab(next);
    setPosition({ x: 0, y: 0 });
    setZoom(1);
    setCropperKey((key) => key + 1);
  };

  const close = () => {
    if (isDirty && !window.confirm(__('Discard your crop changes?', 'weekly-wildcat-headless'))) return;
    onClose();
  };

  const save = async () => {
    if (!draft || !image) return;
    setIsSaving(true);
    setError('');
    try {
      const response = await apiFetch({ path: `/byline/v1/media/${attachmentId}/art-direction`, method: 'POST', data: draftPayload(draft) });
      const next = readArtDirectionImage(response);
      if (next) {
        setImage(next);
        setSaved(draftFromImage(next));
        setDraft(draftFromImage(next));
      }
      createNotice?.('success', __('Photo crops saved. The site updates on its next publish.', 'weekly-wildcat-headless'), { type: 'snackbar' });
    } catch (caught) {
      setError(normalizeBylineError(caught).message);
    } finally {
      setIsSaving(false);
    }
  };

  const shapeCrop = image && draft && tab !== 'focal' ? effectiveCrop(draft, tab, image.width, image.height) : null;

  return (
    <Modal title={__('Photo crops', 'weekly-wildcat-headless')} onRequestClose={close} className="byline-photo-crops-modal" isFullScreen>
      {error ? <Notice status="error" isDismissible={false}>{error}</Notice> : null}
      {!image || !draft ? (
        error ? null : <Spinner />
      ) : (
        <div className="byline-photo-crops">
          <div className="byline-photo-crops-editor">
            <div className="byline-photo-crops-tabs" role="tablist" aria-label={__('Crop', 'weekly-wildcat-headless')}>
              <Button role="tab" aria-selected={tab === 'focal'} variant={tab === 'focal' ? 'primary' : 'secondary'} onClick={() => selectTab('focal')}>
                {__('Focal point', 'weekly-wildcat-headless')}
              </Button>
              {IMAGE_CROP_SHAPES.map((shape) => (
                <Button key={shape} role="tab" aria-selected={tab === shape} variant={tab === shape ? 'primary' : 'secondary'} onClick={() => selectTab(shape)}>
                  {__(IMAGE_CROP_SHAPE_DETAILS[shape].label, 'weekly-wildcat-headless')}
                  {draft.crops[shape] ? ' •' : ''}
                </Button>
              ))}
            </div>

            {tab === 'focal' ? (
              <>
                <p className="byline-photo-crops-hint">
                  {__('Click the most important part of the photo, such as a face. Every crop without a custom box keeps it in view.', 'weekly-wildcat-headless')}
                </p>
                <FocalPointPicker
                  __nextHasNoMarginBottom
                  url={image.previewUrl}
                  value={{ x: draft.focalPoint.x / 100, y: draft.focalPoint.y / 100 }}
                  onChange={(value) => setDraft((current) => current && setFocalPoint(current, { x: value.x * 100, y: value.y * 100 }))}
                />
              </>
            ) : shapeCrop ? (
              <>
                <p className="byline-photo-crops-hint">
                  {__(IMAGE_CROP_SHAPE_DETAILS[tab].usedFor, 'weekly-wildcat-headless')}.{' '}
                  {shapeCrop.custom
                    ? __('Custom crop: WordPress makes cropped files for it when you save.', 'weekly-wildcat-headless')
                    : __('Automatic: follows the focal point. Drag or zoom to draw your own.', 'weekly-wildcat-headless')}
                </p>
                <div className="byline-photo-crops-cropper">
                  <Cropper
                    key={`${tab}-${cropperKey}`}
                    image={image.previewUrl}
                    aspect={shapeAspectRatio(tab)}
                    crop={position}
                    zoom={zoom}
                    maxZoom={5}
                    showGrid
                    initialCroppedAreaPercentages={areaFromRect(shapeCrop.rect)}
                    onCropChange={setPosition}
                    onZoomChange={setZoom}
                    onCropComplete={(area) => setDraft((current) => current && setShapeCrop(current, tab, rectFromArea(area), image.width, image.height))}
                  />
                </div>
                <div className="byline-photo-crops-cropper-controls">
                  <RangeControl
                    __nextHasNoMarginBottom
                    __next40pxDefaultSize
                    label={__('Zoom', 'weekly-wildcat-headless')}
                    value={zoom}
                    min={1}
                    max={5}
                    step={0.05}
                    onChange={(value) => setZoom(value ?? 1)}
                  />
                  <Button
                    variant="secondary"
                    disabled={!shapeCrop.custom}
                    onClick={() => {
                      setDraft((current) => current && resetShapeCrop(current, tab));
                      selectTab(tab);
                    }}
                  >
                    {__('Reset to focal point', 'weekly-wildcat-headless')}
                  </Button>
                </div>
              </>
            ) : null}

            <div className="byline-photo-crops-actions">
              <Button variant="tertiary" onClick={close}>{__('Close', 'weekly-wildcat-headless')}</Button>
              <Button variant="primary" onClick={save} isBusy={isSaving} disabled={!isDirty || isSaving}>
                {isSaving ? __('Saving and cropping…', 'weekly-wildcat-headless') : __('Save crops', 'weekly-wildcat-headless')}
              </Button>
            </div>
          </div>

          <PhotoPlacements
            image={image}
            draft={draft}
            title={title}
            excerpt={excerpt}
            host={host()}
            selected={tab}
            onSelectShape={selectTab}
          />
        </div>
      )}
    </Modal>
  );
}
