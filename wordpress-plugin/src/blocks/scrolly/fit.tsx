import { useInstanceId } from '@wordpress/compose';
import { __ } from '@wordpress/i18n';

const TEXT = 'weekly-wildcat-headless';

/** How the sticky stage frames each photograph. `contain` and `cover` are the saved values of the `fit` attribute. */
export const FIT_OPTIONS = [
  { value: 'contain', label: __('Whole photograph', TEXT), help: __('Nothing is cropped. A portrait photograph leaves empty space beside it.', TEXT) },
  { value: 'cover', label: __('Fill the stage', TEXT), help: __('The photograph fills the stage and its edges are cropped. Keep the subject near the centre.', TEXT) }
] as const;

/** A drawing of the stage (outline) with a portrait photograph in it. */
function FitDiagram({ fit }: { fit: string }) {
  return <svg className="byline-fit-diagram" viewBox="0 0 64 48" width="64" height="48" aria-hidden="true" focusable="false">
    <rect x="1" y="1" width="62" height="46" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray={fit === 'contain' ? '3 2' : undefined} />
    {fit === 'contain'
      ? <rect x="2" y="2" width="30" height="44" fill="currentColor" opacity=".28" />
      : <>
        <rect x="2" y="2" width="60" height="44" fill="currentColor" opacity=".28" />
        <path d="M2 14h60M2 34h60" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2" opacity=".7" />
      </>}
  </svg>;
}

/**
 * Two radio choices that show what they do. Native radio inputs, so the arrow
 * keys and screen readers work as for any radio group.
 */
export function FitChoice({ value, onChange }: { value: string; onChange: (fit: string) => void }) {
  const name = `byline-scrolly-fit-${useInstanceId(FitChoice)}`;
  return <fieldset className="byline-fit-choice">
    <legend>{__('Photograph fit', TEXT)}</legend>
    {FIT_OPTIONS.map((option) => <label key={option.value} className="byline-fit-option">
      <input type="radio" name={name} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} />
      <span className="byline-fit-card">
        <FitDiagram fit={option.value} />
        <strong>{option.label}</strong>
        <small>{option.help}</small>
      </span>
    </label>)}
  </fieldset>;
}
