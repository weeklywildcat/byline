import { Notice, RadioControl, TextControl } from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { checkVideoUrl, STORY_FORMAT_OPTIONS, videoStoryProblem, type StoryFormat } from './story-video-model';

export type StoryFormatPanelProps = {
  format: StoryFormat;
  videoUrl: string;
  onChange: (change: { format?: StoryFormat; videoUrl?: string }) => void;
};

/**
 * Article or Video. A video story asks for one thing, its YouTube link; the
 * title, thumbnail, duration and search metadata are filled in automatically.
 */
export function StoryFormatPanel({ format, videoUrl, onChange }: StoryFormatPanelProps) {
  const check = checkVideoUrl(videoUrl);
  const problem = videoStoryProblem(format, videoUrl);

  return (
    <div className="byline-story-format">
      <RadioControl
        label={__('Format', 'weekly-wildcat-headless')}
        selected={format}
        options={STORY_FORMAT_OPTIONS.map((option) => ({ value: option.value, label: __(option.label, 'weekly-wildcat-headless') }))}
        onChange={(value: string) => onChange({ format: value as StoryFormat })}
      />
      {format === 'video' ? (
        <>
          <TextControl
            __nextHasNoMarginBottom
            __next40pxDefaultSize
            type="url"
            label={__('YouTube video', 'weekly-wildcat-headless')}
            placeholder={__('Paste a YouTube link', 'weekly-wildcat-headless')}
            value={videoUrl}
            onChange={(value: string) => onChange({ videoUrl: value })}
          />
          {problem ? <Notice status="warning" isDismissible={false}>{problem}</Notice> : null}
          {check.state === 'valid' ? (
            <a className="byline-story-format-preview" href={`https://www.youtube.com/watch?v=${check.videoId}`} target="_blank" rel="noreferrer">
              <img src={check.thumbnailUrl} alt="" width={120} height={68} />
              <span>{__('YouTube video · Opens on YouTube', 'weekly-wildcat-headless')}</span>
            </a>
          ) : null}
          <p className="byline-editorial-muted">
            {__('The player opens the story, above the text. Its title, thumbnail and length come from YouTube.', 'weekly-wildcat-headless')}
          </p>
        </>
      ) : null}
    </div>
  );
}
