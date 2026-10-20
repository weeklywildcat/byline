import { visualizationHeights, visualizationProviders, visualizationUrl, type VisualizationPreset, type VisualizationProvider } from '@byline/ui/visualization';

/** What the writer has pasted, judged before anything is saved or shown. */
export type EmbedDiagnosis =
  | { state: 'empty' }
  | { state: 'accepted'; provider: VisualizationProvider; label: string; src: string }
  | { state: 'code' | 'insecure' | 'unsupported' };

export function diagnoseEmbedInput(input: string): EmbedDiagnosis {
  const text = input.trim();
  if (!text) return { state: 'empty' };
  // Embed code is never accepted: it can carry scripts and styles of its own.
  if (/[<>]|\biframe\b|\bsrc\s*=/i.test(text)) return { state: 'code' };
  const accepted = visualizationUrl(text);
  if (accepted) return { state: 'accepted', provider: accepted.provider, label: visualizationProviders[accepted.provider].label, src: accepted.src };
  return { state: /^http:\/\//i.test(text) ? 'insecure' : 'unsupported' };
}

/** Sentence shown under the address field for anything that is not accepted. */
export function embedProblem(diagnosis: EmbedDiagnosis): string {
  switch (diagnosis.state) {
    case 'code': return 'That looks like embed code. Byline only accepts the address itself: paste just the link, not the iframe.';
    case 'insecure': return 'That address starts with http://. Interactive charts and maps must use https://.';
    case 'unsupported': return 'Byline cannot show that address as an interactive chart or map. It publishes the fallback graphic instead.';
    default: return '';
  }
}

export const heightChoices: { value: VisualizationPreset; label: string; pixels: number; note: string }[] = [
  { value: 'compact', label: 'Compact', pixels: visualizationHeights.compact, note: 'A simple bar or line chart' },
  { value: 'standard', label: 'Standard', pixels: visualizationHeights.standard, note: 'Most charts' },
  { value: 'tall', label: 'Tall', pixels: visualizationHeights.tall, note: 'Long lists, ranked bars, tables' },
  { value: 'map', label: 'Map', pixels: visualizationHeights.map, note: 'Maps and anything geographic' }
];

type Attributes = { type: string; heightPreset: string; embedUrl: string };

/**
 * Attribute changes for a newly typed or pasted address. A map provider turns a
 * default chart block into a map of map height; anything the writer already
 * chose is left alone. `normalize` swaps a pasted share link for the embed form.
 */
export function embedAttributes(input: string, current: Pick<Attributes, 'type' | 'heightPreset'>, normalize = false): Partial<Attributes> & { provider: string } {
  const diagnosis = diagnoseEmbedInput(input);
  const provider = diagnosis.state === 'accepted' ? diagnosis.provider : '';
  const embedUrl = normalize && diagnosis.state === 'accepted' ? diagnosis.src : input;
  const isMap = provider === 'google-maps' || provider === 'openstreetmap';
  const isDefaultChart = current.type === 'chart' && current.heightPreset === 'standard';
  return { embedUrl, provider, ...(isMap && isDefaultChart ? { type: 'map', heightPreset: 'map' } : {}) };
}

/** What a reader cannot do without the fallback graphic: used by the setup checklist. */
export function setupGaps(a: { mode: string; embedUrl: string; image?: { url?: string; alt?: string } }): string[] {
  const gaps: string[] = [];
  if (a.mode === 'embed' && diagnoseEmbedInput(a.embedUrl).state !== 'accepted') gaps.push('address');
  if (!a.image?.url) gaps.push('graphic');
  else if (!a.image.alt) gaps.push('alt');
  return gaps;
}
