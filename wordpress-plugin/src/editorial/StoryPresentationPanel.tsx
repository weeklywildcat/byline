import { Notice, RadioControl } from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import {
  IMMERSIVE_ALIGNMENT_OPTIONS,
  STORY_PRESENTATION_OPTIONS,
  type ImmersiveAlignment,
  type StoryPresentation
} from './story-presentation-model';

export type StoryPresentationPanelProps = {
  presentation: StoryPresentation;
  alignment: ImmersiveAlignment;
  hasFeaturedImage: boolean;
  onChange: (change: { presentation?: StoryPresentation; alignment?: ImmersiveAlignment }) => void;
};

/**
 * The only presentation controls an author gets. Colors, fonts and layout are
 * the site's code, not a setting.
 */
export function StoryPresentationPanel({ presentation, alignment, hasFeaturedImage, onChange }: StoryPresentationPanelProps) {
  return (
    <div className="byline-story-presentation">
      <RadioControl
        label={__('Story presentation', 'weekly-wildcat-headless')}
        selected={presentation}
        options={STORY_PRESENTATION_OPTIONS.map((option) => ({ value: option.value, label: __(option.label, 'weekly-wildcat-headless') }))}
        onChange={(value: string) => onChange({ presentation: value as StoryPresentation })}
      />
      {presentation === 'immersive' ? (
        <>
          <RadioControl
            label={__('Headline position', 'weekly-wildcat-headless')}
            selected={alignment}
            options={IMMERSIVE_ALIGNMENT_OPTIONS.map((option) => ({ value: option.value, label: __(option.label, 'weekly-wildcat-headless') }))}
            onChange={(value: string) => onChange({ alignment: value as ImmersiveAlignment })}
          />
          <p className="byline-editorial-muted">
            {__('The featured image fills the first screen, with the category, headline and excerpt over it.', 'weekly-wildcat-headless')}
          </p>
          {!hasFeaturedImage ? (
            <Notice status="warning" isDismissible={false}>
              {__('Add a featured image. Until then this story is shown as a standard story.', 'weekly-wildcat-headless')}
            </Notice>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
