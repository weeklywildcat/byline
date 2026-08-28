import { InspectorControls, useBlockProps } from "@wordpress/block-editor";
import { Button, PanelBody, RangeControl, SearchControl, SelectControl, TextControl, ToggleControl } from "@wordpress/components";
import { registerBlockType } from "@wordpress/blocks";
import { __ } from "@wordpress/i18n";
import { useMemo, useState } from "@wordpress/element";

import metadata from "./block.json";
import {
  boundedNumber,
  ErrorNotice,
  PreviewFrame,
  queryPath,
  StoryPreviewCard,
  useBylineApi,
  type PreviewStory
} from "../newsroom/common";
import "./style.css";

type Term = { id: number; name: string; count?: number };
type Author = { id: number; name: string };

const sourceOptions = [
  { label: __("Latest published stories", "weekly-wildcat-headless"), value: "latest" },
  { label: __("Category", "weekly-wildcat-headless"), value: "category" },
  { label: __("Tag", "weekly-wildcat-headless"), value: "tag" },
  { label: __("Author", "weekly-wildcat-headless"), value: "author" },
  { label: __("Manually selected stories", "weekly-wildcat-headless"), value: "manual" }
];

const layoutOptions = [
  { label: __("Grid", "weekly-wildcat-headless"), value: "grid" },
  { label: __("List", "weekly-wildcat-headless"), value: "list" },
  { label: __("Featured + list", "weekly-wildcat-headless"), value: "featured" }
];

function termPath(taxonomy: "categories" | "tags", search: string) {
  return queryPath(`/wp/v2/${taxonomy}`, { per_page: 20, search: search || undefined, orderby: "name", order: "asc" });
}

function postsPath(attributes: any) {
  const source = String(attributes.source || "latest");
  const ids = Array.isArray(attributes.postIds) ? attributes.postIds.map(Number).filter((id: number) => id > 0) : [];

  if (source === "manual") {
    return ids.length > 0
      ? queryPath("/wp/v2/posts", { status: "publish", per_page: ids.length, include: ids.join(","), orderby: "include", _embed: 1 })
      : null;
  }

  return queryPath("/wp/v2/posts", {
    status: "publish",
    per_page: boundedNumber(attributes.limit, 6, 1, 12),
    orderby: "date",
    order: "desc",
    categories: source === "category" && Number(attributes.termId) > 0 ? Number(attributes.termId) : undefined,
    tags: source === "tag" && Number(attributes.termId) > 0 ? Number(attributes.termId) : undefined,
    author: source === "author" && Number(attributes.authorId) > 0 ? Number(attributes.authorId) : undefined,
    _embed: 1
  });
}

function StoriesEdit({ attributes, setAttributes }: any) {
  const [termSearch, setTermSearch] = useState("");
  const [authorSearch, setAuthorSearch] = useState("");
  const [manualSearch, setManualSearch] = useState("");
  const source = String(attributes.source || "latest");
  const taxonomy = source === "tag" ? "tags" : "categories";
  const stories = useBylineApi<PreviewStory[]>(postsPath(attributes));
  const terms = useBylineApi<Term[]>(source === "category" || source === "tag" ? termPath(taxonomy, termSearch) : null);
  const authors = useBylineApi<Author[]>(source === "author" ? queryPath("/byline/v1/authors", {}) : null);
  const manualStories = useBylineApi<PreviewStory[]>(source === "manual" && manualSearch ? queryPath("/wp/v2/posts", {
    status: "publish",
    per_page: 20,
    search: manualSearch,
    orderby: "date",
    order: "desc",
    _embed: 1
  }) : null);
  const blockProps = useBlockProps({ className: "byline-newsroom-block-editor" });
  const selectedIds = Array.isArray(attributes.postIds) ? attributes.postIds.map(Number) : [];
  const filteredAuthors = useMemo(() => {
    const search = authorSearch.trim().toLowerCase();
    return (authors.data || []).filter((author) => !search || author.name.toLowerCase().includes(search)).slice(0, 12);
  }, [authors.data, authorSearch]);

  function setSource(value: string) {
    setAttributes({ source: value, termId: 0, authorId: 0, postIds: [] });
  }

  function toggleStory(id: number) {
    const next = selectedIds.includes(id) ? selectedIds.filter((selected: number) => selected !== id) : [...selectedIds, id];
    setAttributes({ postIds: next.slice(0, 12) });
  }

  const previewEmpty = source === "manual" && selectedIds.length === 0
    ? __("Choose one or more published stories for this block.", "weekly-wildcat-headless")
    : source === "category" && !Number(attributes.termId)
      ? __("Choose a category to preview its published stories.", "weekly-wildcat-headless")
      : source === "tag" && !Number(attributes.termId)
        ? __("Choose a tag to preview its published stories.", "weekly-wildcat-headless")
        : source === "author" && !Number(attributes.authorId)
          ? __("Choose an author to preview their published stories.", "weekly-wildcat-headless")
          : !stories.data?.length && !stories.isLoading
            ? __("No published stories match these settings.", "weekly-wildcat-headless")
            : "";

  return (
    <>
      <InspectorControls>
        <PanelBody title={__("Stories", "weekly-wildcat-headless")} initialOpen>
          <TextControl
            __nextHasNoMarginBottom
            label={__("Heading", "weekly-wildcat-headless")}
            value={attributes.heading || ""}
            onChange={(heading: string) => setAttributes({ heading })}
          />
          <SelectControl
            __nextHasNoMarginBottom
            label={__("Source", "weekly-wildcat-headless")}
            value={source}
            options={sourceOptions}
            onChange={setSource}
          />
          <RangeControl
            __nextHasNoMarginBottom
            label={__("Story count", "weekly-wildcat-headless")}
            value={boundedNumber(attributes.limit, 6, 1, 12)}
            min={1}
            max={12}
            onChange={(limit) => setAttributes({ limit: boundedNumber(limit, 6, 1, 12) })}
          />
          <SelectControl
            __nextHasNoMarginBottom
            label={__("Layout", "weekly-wildcat-headless")}
            value={attributes.layout || "grid"}
            options={layoutOptions}
            onChange={(layout: string) => setAttributes({ layout })}
          />
          <ToggleControl __nextHasNoMarginBottom label={__("Show images", "weekly-wildcat-headless")} checked={attributes.showImage !== false} onChange={(showImage) => setAttributes({ showImage })} />
          <ToggleControl __nextHasNoMarginBottom label={__("Show excerpts", "weekly-wildcat-headless")} checked={Boolean(attributes.showExcerpt)} onChange={(showExcerpt) => setAttributes({ showExcerpt })} />
          <ToggleControl __nextHasNoMarginBottom label={__("Show bylines", "weekly-wildcat-headless")} checked={attributes.showByline !== false} onChange={(showByline) => setAttributes({ showByline })} />
          <ToggleControl __nextHasNoMarginBottom label={__("Show dates", "weekly-wildcat-headless")} checked={attributes.showDate !== false} onChange={(showDate) => setAttributes({ showDate })} />
        </PanelBody>
        {source === "category" || source === "tag" ? (
          <PanelBody title={source === "tag" ? __("Choose a tag", "weekly-wildcat-headless") : __("Choose a category", "weekly-wildcat-headless")} initialOpen>
            <SearchControl value={termSearch} onChange={setTermSearch} placeholder={__("Search published terms…", "weekly-wildcat-headless")} />
            {terms.error ? <ErrorNotice message={terms.error} /> : null}
            {(terms.data || []).slice(0, 12).map((term) => (
              <Button key={term.id} variant={Number(attributes.termId) === term.id ? "primary" : "secondary"} onClick={() => setAttributes({ termId: term.id })}>
                {term.name}
              </Button>
            ))}
          </PanelBody>
        ) : null}
        {source === "author" ? (
          <PanelBody title={__("Choose an author", "weekly-wildcat-headless")} initialOpen>
            <SearchControl value={authorSearch} onChange={setAuthorSearch} placeholder={__("Search public authors…", "weekly-wildcat-headless")} />
            {authors.error ? <ErrorNotice message={authors.error} /> : null}
            {filteredAuthors.map((author) => (
              <Button key={author.id} variant={Number(attributes.authorId) === author.id ? "primary" : "secondary"} onClick={() => setAttributes({ authorId: author.id })}>
                {author.name}
              </Button>
            ))}
          </PanelBody>
        ) : null}
        {source === "manual" ? (
          <PanelBody title={__("Choose stories", "weekly-wildcat-headless")} initialOpen>
            <SearchControl value={manualSearch} onChange={setManualSearch} placeholder={__("Search published stories…", "weekly-wildcat-headless")} />
            {(manualStories.data || []).map((story) => (
              <Button key={story.id} variant={selectedIds.includes(story.id) ? "primary" : "secondary"} onClick={() => toggleStory(story.id)}>
                <span dangerouslySetInnerHTML={{ __html: story.title?.rendered || __("Untitled story", "weekly-wildcat-headless") }} />
              </Button>
            ))}
          </PanelBody>
        ) : null}
      </InspectorControls>

      <section {...blockProps}>
        <PreviewFrame label={__("Stories preview", "weekly-wildcat-headless")} isLoading={stories.isLoading} error={stories.error} empty={previewEmpty}>
          <div className={`byline-newsroom-stories byline-newsroom-stories-layout-${attributes.layout || "grid"}`}>
            <h2>{attributes.heading || __("Stories", "weekly-wildcat-headless")}</h2>
            <div className={attributes.layout === "list" ? "byline-newsroom-stories-list" : attributes.layout === "featured" ? "byline-newsroom-stories-featured-list" : "byline-newsroom-stories-grid"}>
              {(stories.data || []).map((story, index) => (
                <StoryPreviewCard
                  key={story.id}
                  story={story}
                  variant={attributes.layout === "featured" && index === 0 ? "lead" : attributes.layout === "list" ? "list" : "standard"}
                  showImage={attributes.showImage !== false}
                  showExcerpt={Boolean(attributes.showExcerpt)}
                  showByline={attributes.showByline !== false}
                  showDate={attributes.showDate !== false}
                />
              ))}
            </div>
          </div>
        </PreviewFrame>
      </section>
    </>
  );
}

registerBlockType(metadata as any, { edit: StoriesEdit, save: () => null });
