import { PlainText } from '@wordpress/block-editor';
import { TextControl, TextareaControl } from '@wordpress/components';
import { useEffect, useRef, useState } from '@wordpress/element';

/**
 * Text typed into a block attribute reaches the field again only after the
 * editor store has re-rendered, which can be a frame later. A plain controlled
 * field then briefly shows the older value and drops characters typed quickly
 * in between. Keep what the writer typed locally and accept a value from the
 * store only when it is not an echo of something the writer already typed (an
 * undo, a reset, a change from elsewhere).
 */
function useBufferedText(value: string, onChange: (value: string) => void): [string, (value: string) => void] {
  const [local, setLocal] = useState(value);
  const emitted = useRef<string[]>([]);
  useEffect(() => {
    const echo = emitted.current.indexOf(value);
    if (echo >= 0) { emitted.current = emitted.current.slice(echo + 1); return; }
    emitted.current = [];
    setLocal(value);
  }, [value]);
  return [local, (next) => { emitted.current.push(next); setLocal(next); onChange(next); }];
}

type Fieldprops = { value?: string; onChange: (value: string) => void; [key: string]: any };
export function StoryTextControl({ value, onChange, ...props }: Fieldprops) {
  const [local, change] = useBufferedText(value ?? '', onChange);
  return <TextControl __nextHasNoMarginBottom {...props} value={local} onChange={change} />;
}
export function StoryTextareaControl({ value, onChange, ...props }: Fieldprops) {
  const [local, change] = useBufferedText(value ?? '', onChange);
  return <TextareaControl __nextHasNoMarginBottom {...props} value={local} onChange={change} />;
}

/**
 * A caption (or any short line of copy) edited where it appears, styled by the
 * block's own figcaption rules. Plain text, so what is typed is what is saved.
 * `singleLine` is for headlines and attribution lines: Enter does nothing and a
 * pasted line break becomes a space.
 */
export function StoryCaption({ value, onChange, placeholder, className = 'byline-story-caption', label, singleLine }: { value?: string; onChange: (value: string) => void; placeholder: string; className?: string; label: string; singleLine?: boolean }) {
  const [local, change] = useBufferedText(value ?? '', onChange);
  const lineProps = singleLine ? { onKeyDown: (event: { key: string; preventDefault: () => void }) => { if (event.key === 'Enter') event.preventDefault(); } } : {};
  return <PlainText className={className} value={local} placeholder={placeholder} aria-label={label} onChange={(next: string) => change(singleLine ? next.replace(/\s*\n\s*/g, ' ') : next)} {...lineProps} />;
}
