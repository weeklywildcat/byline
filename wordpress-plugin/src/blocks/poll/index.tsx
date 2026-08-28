import { InspectorControls, useBlockProps } from "@wordpress/block-editor";
import { Button, PanelBody, SearchControl, SelectControl, TextControl } from "@wordpress/components";
import { registerBlockType } from "@wordpress/blocks";
import { __ } from "@wordpress/i18n";
import { useMemo, useState } from "@wordpress/element";

import metadata from "./block.json";
import { ErrorNotice, PollPreview, PreviewFrame, queryPath, useBylineApi, type PreviewPoll } from "../newsroom/common";
import "./style.css";

type PollDirectory = { polls: PreviewPoll[]; active?: PreviewPoll | null };

function PollEdit({ attributes, setAttributes }: any) {
  const [search, setSearch] = useState("");
  const directory = useBylineApi<PollDirectory>(queryPath("/byline/v1/editor/polls", { per_page: 50 }));
  const blockProps = useBlockProps({ className: "byline-newsroom-block-editor" });
  const polls = directory.data?.polls || [];
  const filteredPolls = useMemo(() => {
    const query = search.trim().toLowerCase();
    return polls.filter((poll) => !query || poll.question.toLowerCase().includes(query)).slice(0, 20);
  }, [polls, search]);
  const selectedPoll = attributes.source === "active"
    ? directory.data?.active || null
    : polls.find((poll) => String(poll.id) === String(attributes.pollId)) || null;
  const empty = !directory.isLoading && !selectedPoll
    ? attributes.source === "active"
      ? __("No active poll is available for preview.", "weekly-wildcat-headless")
      : __("Choose a poll to preview it in this post.", "weekly-wildcat-headless")
    : "";

  return (
    <>
      <InspectorControls>
        <PanelBody title={__("Poll", "weekly-wildcat-headless")} initialOpen>
          <TextControl __nextHasNoMarginBottom label={__("Heading", "weekly-wildcat-headless")} value={attributes.heading || ""} onChange={(heading: string) => setAttributes({ heading })} />
          <SelectControl
            __nextHasNoMarginBottom
            label={__("Source", "weekly-wildcat-headless")}
            value={attributes.source || "active"}
            options={[
              { label: __("Current active poll", "weekly-wildcat-headless"), value: "active" },
              { label: __("Selected poll", "weekly-wildcat-headless"), value: "selected" }
            ]}
            onChange={(source: string) => setAttributes({ source, pollId: source === "active" ? "" : attributes.pollId })}
          />
        </PanelBody>
        {attributes.source === "selected" ? (
          <PanelBody title={__("Choose a poll", "weekly-wildcat-headless")} initialOpen>
            <SearchControl value={search} onChange={setSearch} placeholder={__("Search poll questions…", "weekly-wildcat-headless")} />
            {directory.error ? <ErrorNotice message={directory.error} /> : null}
            {filteredPolls.map((poll) => (
              <Button key={poll.id} variant={String(attributes.pollId) === String(poll.id) ? "primary" : "secondary"} onClick={() => setAttributes({ pollId: poll.id })}>
                {poll.question}
              </Button>
            ))}
          </PanelBody>
        ) : null}
      </InspectorControls>

      <section {...blockProps}>
        <PreviewFrame label={__("Poll preview", "weekly-wildcat-headless")} isLoading={directory.isLoading} error={directory.error} empty={empty}>
          {selectedPoll ? <PollPreview poll={selectedPoll} heading={attributes.heading || __("Your Opinion", "weekly-wildcat-headless")} /> : null}
        </PreviewFrame>
      </section>
    </>
  );
}

registerBlockType(metadata as any, { edit: PollEdit, save: () => null });
