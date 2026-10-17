import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
const article = '/2026/08/20/news/weekly-wildcat-fixture-story/';
async function fixtures(page: Page) {
  await page.route('**/test-assets/**', async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop()!;
    const types: Record<string,string> = { svg: 'image/svg+xml', mp4: 'video/mp4', pdf: 'application/pdf', wav: 'audio/wav', vtt: 'text/vtt' };
    await route.fulfill({ body: await readFile(path.resolve(__dirname,'../../../../tests/fixtures/story-media',name)), contentType: types[name.split('.').pop()!] || 'text/plain' });
  });
  for (const provider of ['https://datawrapper.dwcdn.net/**','https://flo.uri.sh/**','https://www.openstreetmap.org/**']) await page.route(provider, (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body>Controlled graphic</body></html>' }));
}
test.beforeEach(async ({ page }) => { await fixtures(page); });
for (const width of [1440,1200,768,390,320,1600]) test(`editorial story geometry at ${width}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 }); await page.goto(article);
  const body = page.locator('.article-body');
  await body.locator('img').evaluateAll((images) => images.forEach((image) => (image as HTMLImageElement).loading = 'eager'));
  await page.waitForFunction(() => Array.from(document.querySelectorAll<HTMLImageElement>('.article-body img')).every((image) => image.complete && image.naturalWidth > 0));
  const geometry = await body.evaluate((body) => {
    const rect = (selector: string) => { const r = body.querySelector(selector)!.getBoundingClientRect(); return { x:r.x, right:r.right, y:r.y, bottom:r.bottom, width:r.width, height:r.height }; };
    const chapter = body.querySelector('.is-style-byline-visual-chapter')!;
    const table = body.querySelector('.is-style-byline-data-table')!;
    return { viewport:document.documentElement.clientWidth, overflow:document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      prose:rect('> p'.replace('> ', ':scope > ')), wide:rect('.wp-block-image.alignwide'), full:rect('.wp-block-image.alignfull'),
      chapter:rect('.is-style-byline-visual-chapter'), chapterText:rect('.is-style-byline-visual-chapter .wp-block-cover__inner-container'), chapterMedia:rect('.is-style-byline-visual-chapter img'),
      portrait:rect('.wp-block-image.alignfull img[alt="Campus portrait"]'), note:rect('.is-style-byline-margin-note'), afterNote:rect('.is-style-byline-margin-note + p + .alignwide'), noteFloat:getComputedStyle(body.querySelector('.is-style-byline-margin-note')!).float,
      tableScroll:table.scrollWidth > table.clientWidth, captionVisible:body.querySelector('.is-style-byline-data-table figcaption')!.getBoundingClientRect().width > 0,
      columns: getComputedStyle(body.querySelector('.is-style-byline-comparison')!).flexDirection,
      markerInside: Array.from(body.querySelectorAll('.byline-annotation-marker')).every((marker) => { const m=marker.getBoundingClientRect(), image=marker.parentElement!.querySelector('img')!.getBoundingClientRect(); return m.x>=image.x && m.right<=image.right && m.y>=image.y && m.bottom<=image.bottom; }),
      chapterClipped:chapter.scrollHeight > chapter.clientHeight + 1, chapterHeadingSize:parseFloat(getComputedStyle(chapter.querySelector('h2')!).fontSize),
      afterWidth: document.querySelector('.article-after')!.getBoundingClientRect().width
    };
  });
  expect(geometry.overflow).toBe(false); expect(geometry.prose.width).toBeLessThanOrEqual(760);
  for (const [rect,target] of [[geometry.wide,1040],[geometry.full,1440]] as const) {
    expect(rect.width).toBeCloseTo(Math.min(target, geometry.viewport-40),0);
    expect(Math.abs((rect.x+rect.right)/2-geometry.viewport/2)).toBeLessThan(2);
  }
  expect(geometry.afterWidth).toBeLessThanOrEqual(1040);
  expect(geometry.portrait.height).toBeLessThanOrEqual(900*.85+1);
  expect(geometry.portrait.height/geometry.portrait.width).toBeCloseTo(1.5,1);
  expect(geometry.chapterText.x).toBeGreaterThanOrEqual(geometry.chapter.x); expect(geometry.chapterText.bottom).toBeLessThanOrEqual(geometry.chapter.bottom);
  expect(geometry.chapterHeadingSize).toBeGreaterThanOrEqual(width >= 1200 ? 48 : 32);
  expect(geometry.chapterMedia.width).toBeCloseTo(geometry.chapter.width,0); expect(geometry.chapterClipped).toBe(false);
  expect(geometry.noteFloat).toBe(width>=1200?'right':'none');
  expect(geometry.afterNote.y).toBeGreaterThanOrEqual(geometry.note.bottom);
  expect(geometry.columns).toBe(width<=700?'column':'row'); expect(geometry.captionVisible).toBe(true);
  if(width<=768) {
    expect(geometry.tableScroll).toBe(true);
    const table = body.locator('.is-style-byline-data-table');
    await expect(table).toHaveAttribute('tabindex', '0');
    await table.focus(); await page.keyboard.press('ArrowRight');
    await expect.poll(() => table.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
  }
  expect(geometry.markerInside).toBe(true);
});

test('TOC, footnotes and native details retain local reader navigation',async({page})=>{
  await page.goto(article);
  const links=page.locator('.byline-table-of-contents a'); expect(await links.count()).toBeGreaterThan(2);
  expect(await links.evaluateAll((links)=>links.every((link)=>Boolean(document.getElementById(decodeURIComponent((link as HTMLAnchorElement).hash.slice(1))))))).toBe(true);
  expect(await page.locator('[id]').evaluateAll((nodes)=>nodes.length===new Set(nodes.map((node)=>node.id)).size)).toBe(true);
  const href=await links.first().getAttribute('href'); await links.first().click(); await expect(page).toHaveURL(new RegExp(href!+'$'));
  const reference=page.locator('sup.fn a').first(); const target=await reference.getAttribute('href'); await reference.click(); await expect(page).toHaveURL(new RegExp(target!+'$'));
  await page.locator('.wp-block-footnotes a[aria-label^="Jump to footnote reference"]').first().click(); await expect(reference).toBeFocused();
  const details=page.locator('.is-style-byline-methodology'); await expect(details).not.toHaveAttribute('open'); await details.locator('summary').click(); await expect(details).toHaveAttribute('open','');
});

test('annotation synchronization and native comparison range are keyboard usable',async({page})=>{
  await page.goto(article);
  const marker=page.locator('.byline-annotation-marker').nth(1); await marker.click(); await expect(page.locator('#annotation-campus-library')).toHaveClass(/is-active/);
  await page.locator('#annotation-campus-entrance').focus(); await expect(page.locator('.byline-annotation-marker').first()).toHaveAttribute('aria-current','true');
  const range=page.locator('.byline-before-after input[type=range]'); await expect(range).toHaveValue('50'); await range.focus(); await page.keyboard.press('ArrowRight'); await expect(range).toHaveValue('51');
  await expect.poll(()=>page.locator('.byline-before-after').evaluate((node)=> (node as HTMLElement).style.getPropertyValue('--comparison-position'))).toBe('51%');
  await expect(page.locator('.byline-before-after .byline-comparison-image').nth(1)).toHaveCSS('clip-path', 'inset(0px 49% 0px 0px)');
  await expect(page.locator('.byline-before-after img')).toHaveCount(2);
  await expect(page.locator('.byline-annotation-marker').first()).toHaveCSS('color', 'rgb(255, 255, 255)');
});

test('provider resize messages require matching source, origin, ID and bounded height',async({page})=>{
  await page.goto(article);
  for(const [selector,height,payload] of [
    ['.byline-visualization[data-provider="datawrapper"] iframe',620,{'datawrapper-height':{AbCdE:620}}],
    ['.byline-visualization[data-provider="flourish"] iframe',710,JSON.stringify({source:'Flourish',context:'iframe.resize',height:710})]
  ] as const){
    const frame=page.locator(selector); await frame.scrollIntoViewIfNeeded();
    const handle=await frame.elementHandle(); const child=await handle!.contentFrame(); await child!.waitForLoadState();
    await child!.evaluate((payload)=>window.parent.postMessage(payload,'*'),payload); await expect(frame).toHaveCSS('height',`${height}px`);
    await page.evaluate(({selector,payload})=>{ const invalidPayload = typeof payload === 'string' ? JSON.stringify({source:'Flourish',context:'iframe.resize',height:999}) : {'datawrapper-height':{AbCdE:999}}; const frame=document.querySelector<HTMLIFrameElement>(selector)!; window.dispatchEvent(new MessageEvent('message',{source:frame.contentWindow,origin:'https://evil.example',data:invalidPayload})); window.dispatchEvent(new MessageEvent('message',{source:window,origin:new URL(frame.src).origin,data:invalidPayload})); },{selector,payload});
    await child!.evaluate(()=>{window.parent.postMessage({'datawrapper-height':{AbCdE:99999}},'*');window.parent.postMessage(JSON.stringify({source:'Flourish',context:'iframe.resize',height:-2}),'*');},null);
    await expect(frame).toHaveCSS('height',`${height}px`);
  }
  await expect(page.locator('.byline-visualization[data-provider="openstreetmap"] iframe')).toHaveCSS('height','560px');
});

test('scrolly responds to steps, narrow viewports and reduced motion',async({page})=>{
  await page.setViewportSize({width:1200,height:900}); await page.goto(article);
  const story=page.locator('.byline-scrolly'); await expect(story).toHaveClass(/is-enhanced/);
  const stage=story.locator('.byline-scrolly-stage'); await expect(stage).toHaveAttribute('aria-hidden','true'); await expect(stage).toHaveAttribute('data-step','0');
  const second=story.locator('.byline-scrolly-step').nth(1);
  await second.evaluate((node)=>window.scrollTo(0,node.getBoundingClientRect().top+window.scrollY-200));
  await expect(stage).toHaveAttribute('data-step','1'); await expect(stage.locator('img')).toHaveAttribute('src',/landscape-after.svg/);
  await page.emulateMedia({reducedMotion:'reduce'}); await expect(story.locator('.byline-scrolly-stage')).toHaveCount(0);
  await page.emulateMedia({reducedMotion:'no-preference'}); await expect(stage).toHaveCount(1);
  await page.setViewportSize({width:390,height:844}); await expect(story.locator('.byline-scrolly-stage')).toHaveCount(0);
  await expect(story.locator('.byline-scrolly-step img')).toHaveCount(2);
});

test('all evidence remains useful without JavaScript',async({browser})=>{
  const context=await browser.newContext({javaScriptEnabled:false});const page=await context.newPage();await fixtures(page);
  await page.goto(`http://127.0.0.1:${process.env.BYLINE_BROWSER_PORT||4173}${article}`);
  await expect(page.locator('.byline-visualization iframe')).toHaveCount(0);await expect(page.locator('.byline-visualization-link a').first()).toBeVisible();await expect(page.locator('.byline-visualization img').first()).toBeVisible();
  await expect(page.locator('.byline-before-after img').nth(0)).toBeVisible();await expect(page.locator('.byline-before-after img').nth(1)).toBeVisible();await expect(page.locator('.byline-before-after input')).toHaveCount(0);
  await expect(page.locator('.byline-scrolly-step img').nth(0)).toBeVisible();await expect(page.locator('.byline-scrolly-step img').nth(1)).toBeVisible();
  const marker=page.locator('.byline-annotation-marker').first();await marker.click();await expect(page).toHaveURL(/#annotation-campus-entrance$/); await expect(page.locator('#annotation-campus-entrance')).toBeVisible();
  await context.close();
});
