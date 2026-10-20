/** The reporting a Story Step may contain, and what a new step starts with. */
export const STEP_CONTENT = ['core/heading', 'core/paragraph', 'core/list', 'core/quote'];
export const STEP_TEMPLATE: [string, Record<string, unknown>][] = [
  ['core/heading', { level: 2, placeholder: 'Step heading…' }],
  ['core/paragraph', { placeholder: 'Say what the reader should notice in this photograph…' }]
];
