/** One allowlist for authoring, serialization and browser construction. */
export const visualizationHeights = { compact: 320, standard: 480, tall: 680, map: 560 } as const;
export type VisualizationPreset = keyof typeof visualizationHeights;
export type VisualizationProvider = 'datawrapper' | 'flourish' | 'google-maps' | 'openstreetmap';
export function visualizationHeight(preset: string): number {
  return visualizationHeights[preset as VisualizationPreset] || visualizationHeights.standard;
}
export function visualizationUrl(input: string): { provider: VisualizationProvider; src: string; id: string } | null {
  try {
    const url = new URL(input.trim());
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    let match: RegExpMatchArray | null;
    if (url.hostname === 'datawrapper.dwcdn.net' && (match = url.pathname.match(/^\/([a-zA-Z0-9]{5})\/(\d+)?\/?$/))) {
      return { provider: 'datawrapper', src: `https://datawrapper.dwcdn.net/${match[1]}/${match[2] ? match[2] + '/' : ''}`, id: match[1] };
    }
    if (url.hostname === 'www.datawrapper.de' && (match = url.pathname.match(/^\/_\/([a-zA-Z0-9]{5})\/?$/))) {
      return { provider: 'datawrapper', src: `https://datawrapper.dwcdn.net/${match[1]}/`, id: match[1] };
    }
    if ((url.hostname === 'public.flourish.studio' || url.hostname === 'flo.uri.sh') && (match = url.pathname.match(/^\/(visualisation|story)\/(\d+)(?:\/embed)?\/?$/))) {
      return { provider: 'flourish', src: `https://flo.uri.sh/${match[1]}/${match[2]}/embed?auto=1`, id: match[2] };
    }
    if ((url.hostname === 'www.google.com' || url.hostname === 'maps.google.com') && /^\/maps\/embed(?:\/v1\/(?:place|view|directions|search|streetview))?\/?$/.test(url.pathname) && (url.searchParams.has('pb') || url.searchParams.has('key'))) {
      url.hash = '';
      return { provider: 'google-maps', src: url.href, id: '' };
    }
    if ((url.hostname === 'www.openstreetmap.org' || url.hostname === 'openstreetmap.org') && url.pathname === '/export/embed.html' && url.searchParams.has('bbox')) {
      url.hash = '';
      return { provider: 'openstreetmap', src: url.href, id: '' };
    }
    return null;
  } catch { return null; }
}

/** Provider wire formats; caller also validates the frame source and origin. */
export function visualizationMessageHeight(data: unknown, provider: VisualizationProvider, id: string): number | null {
  if (typeof data === 'string') {
    if (data.length > 10000) return null;
    try { data = JSON.parse(data); } catch { return null; }
  }
  if (!data || typeof data !== 'object') return null;
  const message = data as Record<string, any>;
  const height = provider === 'datawrapper' ? message['datawrapper-height']?.[id]
    : provider === 'flourish' && message.source === 'Flourish' && message.context === 'iframe.resize' ? message.height : null;
  return typeof height === 'number' && Number.isFinite(height) && height >= 100 && height <= 2400 ? height : null;
}
