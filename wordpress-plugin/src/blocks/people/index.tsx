import { InspectorControls, useBlockProps } from "@wordpress/block-editor";
import { Button, PanelBody, SearchControl, SelectControl, TextControl, ToggleControl } from "@wordpress/components";
import { registerBlockType } from "@wordpress/blocks";
import { __ } from "@wordpress/i18n";
import { useMemo, useState } from "@wordpress/element";

import metadata from "./block.json";
import { ErrorNotice, PersonPreviewCard, PreviewFrame, useBylineApi, type PreviewPerson } from "../newsroom/common";
import "./style.css";

const layoutOptions = [
  { label: __("Portrait grid", "weekly-wildcat-headless"), value: "portrait-grid" },
  { label: __("Compact list", "weekly-wildcat-headless"), value: "compact-list" }
];

function PeopleEdit({ attributes, setAttributes }: any) {
  const [search, setSearch] = useState("");
  const [roleSearch, setRoleSearch] = useState("");
  const people = useBylineApi<PreviewPerson[]>("/byline/v1/authors");
  const blockProps = useBlockProps({ className: "byline-newsroom-block-editor" });
  const selectedIds = Array.isArray(attributes.selectedIds) ? attributes.selectedIds.map(Number) : [];
  const visiblePeople = useMemo(() => {
    const query = search.trim().toLowerCase();
    const role = String(attributes.roleFilter || "").trim().toLowerCase();
    return (people.data || []).filter((person) => {
      const matchesSearch = !query || person.name.toLowerCase().includes(query) || (person.description || "").toLowerCase().includes(query);
      const matchesRole = !role || (person.bylineProfile?.role || "").toLowerCase().includes(role);
      return matchesSearch && matchesRole;
    });
  }, [people.data, search, attributes.roleFilter]);
  const pickerPeople = visiblePeople.slice(0, 20);
  const previewPeople = attributes.source === "selected"
    ? visiblePeople.filter((person) => selectedIds.includes(person.id))
    : visiblePeople;

  function togglePerson(id: number) {
    const next = selectedIds.includes(id) ? selectedIds.filter((selected: number) => selected !== id) : [...selectedIds, id];
    setAttributes({ selectedIds: next });
  }

  const empty = attributes.source === "selected" && selectedIds.length === 0
    ? __("Choose one or more public people for this block.", "weekly-wildcat-headless")
    : !previewPeople.length && !people.isLoading
      ? __("No public people match these settings.", "weekly-wildcat-headless")
      : "";

  return (
    <>
      <InspectorControls>
        <PanelBody title={__("People", "weekly-wildcat-headless")} initialOpen>
          <TextControl __nextHasNoMarginBottom label={__("Heading", "weekly-wildcat-headless")} value={attributes.heading || ""} onChange={(heading: string) => setAttributes({ heading })} />
          <SelectControl
            __nextHasNoMarginBottom
            label={__("Source", "weekly-wildcat-headless")}
            value={attributes.source || "all"}
            options={[
              { label: __("All public people", "weekly-wildcat-headless"), value: "all" },
              { label: __("Selected people", "weekly-wildcat-headless"), value: "selected" }
            ]}
            onChange={(source: string) => setAttributes({ source })}
          />
          <TextControl
            __nextHasNoMarginBottom
            label={__("Optional role filter", "weekly-wildcat-headless")}
            help={__("Matches the canonical role on a public profile.", "weekly-wildcat-headless")}
            value={attributes.roleFilter || ""}
            onChange={(roleFilter: string) => setAttributes({ roleFilter })}
          />
          <SelectControl __nextHasNoMarginBottom label={__("Layout", "weekly-wildcat-headless")} value={attributes.layout || "portrait-grid"} options={layoutOptions} onChange={(layout: string) => setAttributes({ layout })} />
          <ToggleControl __nextHasNoMarginBottom label={__("Show photos", "weekly-wildcat-headless")} checked={attributes.showPhoto !== false} onChange={(showPhoto) => setAttributes({ showPhoto })} />
          <ToggleControl __nextHasNoMarginBottom label={__("Show roles", "weekly-wildcat-headless")} checked={attributes.showRole !== false} onChange={(showRole) => setAttributes({ showRole })} />
          <ToggleControl __nextHasNoMarginBottom label={__("Show bios", "weekly-wildcat-headless")} checked={attributes.showBio !== false} onChange={(showBio) => setAttributes({ showBio })} />
          <ToggleControl __nextHasNoMarginBottom label={__("Show social links", "weekly-wildcat-headless")} checked={Boolean(attributes.showSocials)} onChange={(showSocials) => setAttributes({ showSocials })} />
        </PanelBody>
        {attributes.source === "selected" ? (
          <PanelBody title={__("Choose people", "weekly-wildcat-headless")} initialOpen>
            <SearchControl value={search} onChange={setSearch} placeholder={__("Search public people…", "weekly-wildcat-headless")} />
            {people.error ? <ErrorNotice message={people.error} /> : null}
            {pickerPeople.map((person) => (
              <Button key={person.id} variant={selectedIds.includes(person.id) ? "primary" : "secondary"} onClick={() => togglePerson(person.id)}>
                {person.name}
              </Button>
            ))}
          </PanelBody>
        ) : (
          <PanelBody title={__("Preview filters", "weekly-wildcat-headless")} initialOpen={false}>
            <SearchControl value={search} onChange={setSearch} placeholder={__("Filter public people…", "weekly-wildcat-headless")} />
            <SearchControl value={roleSearch} onChange={(value) => { setRoleSearch(value); setAttributes({ roleFilter: value }); }} placeholder={__("Filter by role…", "weekly-wildcat-headless")} />
          </PanelBody>
        )}
      </InspectorControls>

      <section {...blockProps}>
        <PreviewFrame label={__("People preview", "weekly-wildcat-headless")} isLoading={people.isLoading} error={people.error} empty={empty}>
          <div className={`byline-people byline-people-layout-${attributes.layout || "portrait-grid"}`}>
            <h2>{attributes.heading || __("People", "weekly-wildcat-headless")}</h2>
            <div className="byline-people-grid">
              {previewPeople.map((person) => (
                <PersonPreviewCard
                  key={person.id}
                  person={person}
                  layout={attributes.layout || "portrait-grid"}
                  showPhoto={attributes.showPhoto !== false}
                  showRole={attributes.showRole !== false}
                  showBio={attributes.showBio !== false}
                  showSocials={Boolean(attributes.showSocials)}
                />
              ))}
            </div>
          </div>
        </PreviewFrame>
      </section>
    </>
  );
}

registerBlockType(metadata as any, { edit: PeopleEdit, save: () => null });
