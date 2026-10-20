import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PresentedArticleView, usesImmersivePresentation, type ArticlePresentation } from '@byline/ui';

const image = { src: '/lead.jpg', alt: 'Lead', width: 1600, height: 1067 };
const article = (patch: Partial<ArticlePresentation> = {}) => ({
  id: 14, url: 'https://example.org/story/', title: 'The lunch squeeze', titleHtml: 'The lunch squeeze', excerptHtml: '<p>Deck.</p>', contentHtml: '<p>Body.</p>',
  category: { label: 'News', href: '/category/news/' }, athleteMeta: [], contributors: [], fallbackByline: 'Staff', publishedAt: '2026-10-19T09:00:00', publishedLabel: 'October 19, 2026',
  modifiedAt: null, modifiedLabel: null, readingTime: '1 min read', image, corrections: [], topics: [], update: null, relatedStories: [], moreByAuthorStories: [],
  publication: { shortName: 'Wildcat', contactHref: '/contact/' }, ...patch
}) as ArticlePresentation;

/**
 * Preview as Byline and the public article route both go through
 * PresentedArticleView, so an author's Immersive choice cannot render as a
 * standard article in one place and an Immersive one in the other.
 */
describe('Standard / Immersive resolution shared by the public route and Preview as Byline', () => {
  it('uses the Immersive opening only for an Immersive story that has a featured image', () => {
    expect(usesImmersivePresentation(article({ storyPresentation: 'immersive' }))).toBe(true);
    expect(usesImmersivePresentation(article({ storyPresentation: 'immersive', image: null }))).toBe(false);
    expect(usesImmersivePresentation(article({ storyPresentation: 'standard' }))).toBe(false);
    expect(usesImmersivePresentation(article({}))).toBe(false);
  });

  it('renders the Immersive hero, with the chosen headline position, or the standard article', () => {
    const immersive = renderToStaticMarkup(<PresentedArticleView presentation={article({ storyPresentation: 'immersive', immersiveAlignment: 'center' })} />);
    expect(immersive).toContain('immersive-article-center');
    expect(immersive).toContain('hero-reveal-image');
    const standard = renderToStaticMarkup(<PresentedArticleView presentation={article({ storyPresentation: 'standard' })} />);
    expect(standard).not.toContain('immersive-article');
    expect(standard).toContain('article-header');
    const imageless = renderToStaticMarkup(<PresentedArticleView presentation={article({ storyPresentation: 'immersive', image: null })} />);
    expect(imageless).not.toContain('hero-reveal');
  });
});
