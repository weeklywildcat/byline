import { __ } from '@wordpress/i18n';
import type { ReactNode } from 'react';
import {
  IMAGE_CROP_SHAPES,
  IMAGE_CROP_SHAPE_DETAILS,
  autoCropForRatio,
  type CropRect,
  type ImageCropShape
} from '@byline/core';
import { effectiveCrop, frameImageStyle, isLowResolution, type ArtDirectionImage, type CropDraft } from './photo-crops-model';

type PlacementsProps = {
  image: ArtDirectionImage;
  draft: CropDraft;
  title: string;
  excerpt: string;
  host: string;
  selected: ImageCropShape | 'focal';
  onSelectShape: (shape: ImageCropShape) => void;
};

/** A frame of the given ratio showing exactly `rect` of the photo. */
function CropFrame({ src, rect, ratio, className = '', children }: { src: string; rect: CropRect; ratio: string; className?: string; children?: ReactNode }) {
  return (
    <div className={`byline-photo-crops-frame ${className}`} style={{ aspectRatio: ratio }}>
      <img src={src} alt="" style={frameImageStyle(rect)} draggable={false} />
      {children}
    </div>
  );
}

function ratioString(shape: ImageCropShape) {
  const [width, height] = IMAGE_CROP_SHAPE_DETAILS[shape].ratio;
  return `${width} / ${height}`;
}

/**
 * Every place readers will see this photo, redrawn as the editor moves the
 * focal point or a crop. The frames use the public site's ratios and the same
 * crop rule as CSS `object-position`, so what is shown here is what ships.
 */
export function PhotoPlacements({ image, draft, title, excerpt, host, selected, onSelectShape }: PlacementsProps) {
  const { previewUrl: src, width, height } = image;
  const crop = (shape: ImageCropShape) => effectiveCrop(draft, shape, width, height);
  const hero = (ratio: number) => autoCropForRatio(ratio, draft.focalPoint, width, height);
  const headline = title.trim() || __('Your headline', 'weekly-wildcat-headless');
  const isPortrait = height > width * 1.1;

  return (
    <div className="byline-photo-crops-placements" aria-label={__('Where this photo appears', 'weekly-wildcat-headless')}>
      <section>
        <h3>{__('Immersive opening', 'weekly-wildcat-headless')}</h3>
        <p className="byline-photo-crops-hint">{__('Fills the screen and follows the focal point.', 'weekly-wildcat-headless')}</p>
        <div className="byline-photo-crops-hero-row">
          <CropFrame src={src} rect={hero(16 / 10)} ratio="16 / 10" className="is-hero">
            <span className="byline-photo-crops-hero-headline">{headline}</span>
          </CropFrame>
          <CropFrame src={src} rect={hero(9 / 19.5)} ratio="9 / 19.5" className="is-hero is-phone">
            <span className="byline-photo-crops-hero-headline">{headline}</span>
          </CropFrame>
        </div>
        {isPortrait ? (
          <>
            <h3>{__('Standard article lead', 'weekly-wildcat-headless')}</h3>
            <p className="byline-photo-crops-hint">{__('Tall photos are shown 4:3 above the story.', 'weekly-wildcat-headless')}</p>
            <CropFrame src={src} rect={hero(4 / 3)} ratio="4 / 3" />
          </>
        ) : null}
      </section>

      <section>
        <h3>{__('Cards and lists', 'weekly-wildcat-headless')}</h3>
        <div className="byline-photo-crops-shape-grid">
          {IMAGE_CROP_SHAPES.filter((shape) => shape !== 'social').map((shape) => {
            const { rect, custom } = crop(shape);
            const details = IMAGE_CROP_SHAPE_DETAILS[shape];
            return (
              <button
                type="button"
                key={shape}
                className={`byline-photo-crops-shape${selected === shape ? ' is-selected' : ''}`}
                onClick={() => onSelectShape(shape)}
                aria-pressed={selected === shape}
              >
                <CropFrame src={src} rect={rect} ratio={ratioString(shape)} />
                <span className="byline-photo-crops-shape-label">
                  <strong>{__(details.label, 'weekly-wildcat-headless')}</strong>
                  <span className={`byline-photo-crops-badge${custom ? ' is-custom' : ''}`}>{custom ? __('Custom', 'weekly-wildcat-headless') : __('Auto', 'weekly-wildcat-headless')}</span>
                </span>
                <span className="byline-photo-crops-hint">{__(details.usedFor, 'weekly-wildcat-headless')}</span>
                {isLowResolution(shape, rect, width) ? <span className="byline-photo-crops-warning">{__('Low resolution', 'weekly-wildcat-headless')}</span> : null}
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <h3>{__('Shared and search', 'weekly-wildcat-headless')}</h3>
        <button type="button" className={`byline-photo-crops-social${selected === 'social' ? ' is-selected' : ''}`} onClick={() => onSelectShape('social')} aria-pressed={selected === 'social'}>
          <CropFrame src={src} rect={crop('social').rect} ratio={ratioString('social')} />
          <span className="byline-photo-crops-social-text">
            {host ? <span className="byline-photo-crops-social-host">{host}</span> : null}
            <strong>{headline}</strong>
            {excerpt ? <span className="byline-photo-crops-social-excerpt">{excerpt}</span> : null}
          </span>
        </button>
        {isLowResolution('social', crop('social').rect, width) ? (
          <p className="byline-photo-crops-warning">{__('This crop is smaller than 1200px wide; social cards may look soft.', 'weekly-wildcat-headless')}</p>
        ) : null}
        <div className="byline-photo-crops-search">
          <span className="byline-photo-crops-search-text">
            {host ? <span className="byline-photo-crops-social-host">{host}</span> : null}
            <strong>{headline}</strong>
            {excerpt ? <span className="byline-photo-crops-social-excerpt">{excerpt}</span> : null}
          </span>
          <CropFrame src={src} rect={crop('square').rect} ratio="1 / 1" className="is-search-thumb" />
        </div>
      </section>
    </div>
  );
}
