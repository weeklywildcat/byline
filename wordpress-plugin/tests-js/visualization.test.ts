import { describe, expect, it } from 'vitest';
import { visualizationUrl, visualizationHeight, visualizationMessageHeight } from '../../packages/ui/src/visualization';
describe('visualization provider boundary', () => {
  it('normalizes only supported HTTPS share/embed forms', () => {
    expect(visualizationUrl('https://www.datawrapper.de/_/AbCdE/')).toEqual({ provider: 'datawrapper', src: 'https://datawrapper.dwcdn.net/AbCdE/', id: 'AbCdE' });
    expect(visualizationUrl('https://datawrapper.dwcdn.net/AbCdE/2/')).toMatchObject({ id: 'AbCdE' });
    expect(visualizationUrl('https://public.flourish.studio/visualisation/1234/')).toEqual({ provider: 'flourish', src: 'https://flo.uri.sh/visualisation/1234/embed?auto=1', id: '1234' });
    expect(visualizationUrl('https://flo.uri.sh/story/42/embed')).toMatchObject({ provider: 'flourish' });
    expect(visualizationUrl('https://www.google.com/maps/embed?pb=example')).toMatchObject({ provider: 'google-maps' });
    expect(visualizationUrl('https://www.openstreetmap.org/export/embed.html?bbox=1,2,3,4')).toMatchObject({ provider: 'openstreetmap' });
    for (const input of ['javascript:alert(1)','data:text/html,hello','http://datawrapper.dwcdn.net/AbCdE/','https://datawrapper.dwcdn.net.evil.com/AbCdE/', 'https://evil.com','https://datawrapper.dwcdn.net@evil.com/AbCdE/', 'https://www.google.com/search?q=hello', 'https://flo.uri.sh/evil', 'https://datawrapper.dwcdn.net:444/AbCdE/']) expect(visualizationUrl(input), input).toBeNull();
  });
  it('accepts Google Maps only on its own embed endpoints and rejects look-alike hosts', () => {
    for (const input of ['https://www.google.com/maps/embed?pb=!1m18', 'https://www.google.com/maps/embed/v1/place?key=abc&q=Campus', 'https://maps.google.com/maps/embed?pb=x']) expect(visualizationUrl(input), input).toMatchObject({ provider: 'google-maps', src: input });
    // The saved URL never keeps a fragment.
    expect(visualizationUrl('https://www.google.com/maps/embed?pb=x#frag')!.src).toBe('https://www.google.com/maps/embed?pb=x');
    for (const input of [
      'https://www.google.com.evil.example/maps/embed?pb=x', 'https://maps.google.com.evil.example/maps/embed?pb=x', 'https://evil.example/maps/embed?pb=x',
      'https://www.google.com@evil.example/maps/embed?pb=x', 'https://www.google.com:8443/maps/embed?pb=x', 'http://www.google.com/maps/embed?pb=x',
      'https://google.com/maps/embed?pb=x', 'https://www.google.co.uk/maps/embed?pb=x', 'https://notgoogle.com/maps/embed?pb=x', 'https://www.google.com/maps/embed',
      'https://www.google.com/maps/embed/v1/unknown?key=abc', 'https://www.google.com/maps?pb=x', 'https://www.google.com/maps/d/embed?mid=1', 'https://www.google.com/url?q=https://evil.example&pb=x',
      'https://user:pass@www.google.com/maps/embed?pb=x', 'javascript://www.google.com/maps/embed?pb=x', 'https://www.google.com/maps/embed/../search?pb=x'
    ]) expect(visualizationUrl(input), input).toBeNull();
  });
  it('maps semantic heights and bounds authenticated resize payloads', () => {
    expect(['compact','standard','tall','map','invalid'].map(visualizationHeight)).toEqual([320,480,680,560,480]);
    expect(visualizationMessageHeight({ 'datawrapper-height': { AbCdE: 611 } }, 'datawrapper','AbCdE')).toBe(611);
    expect(visualizationMessageHeight(JSON.stringify({ source: 'Flourish', context: 'iframe.resize', height: 702 }), 'flourish','123')).toBe(702);
    for (const height of [-10,0,2500,Infinity,'500',null]) expect(visualizationMessageHeight({ 'datawrapper-height': { AbCdE: height } }, 'datawrapper','AbCdE')).toBeNull();
    expect(visualizationMessageHeight({ 'datawrapper-height': { other: 600 } }, 'datawrapper','AbCdE')).toBeNull();
    expect(visualizationMessageHeight('bad json', 'flourish','123')).toBeNull();
    expect(visualizationMessageHeight({ source: 'Other', context: 'iframe.resize', height: 600 }, 'flourish','123')).toBeNull();
  });
});
