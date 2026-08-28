import { InspectorControls, useBlockProps } from "@wordpress/block-editor";
import { Button, PanelBody, SearchControl, SelectControl, ToggleControl } from "@wordpress/components";
import { useSelect } from "@wordpress/data";
import { registerBlockType } from "@wordpress/blocks";
import { __ } from "@wordpress/i18n";
import { useState } from "@wordpress/element";

import metadata from "./block.json";
import { ErrorNotice, GamePreview, PreviewFrame, queryPath, useBylineApi, type PreviewGame } from "../newsroom/common";
import "./style.css";

const PRIMARY_GAME_META_KEY = "weekly_wildcat_primary_game_id";

function GameScoreEdit({ attributes, setAttributes }: any) {
  const [search, setSearch] = useState("");
  const { postType, postId, meta } = useSelect((select: any) => {
    const editor = select("core/editor");
    return {
      postType: editor?.getCurrentPostType?.() as string,
      postId: Number(editor?.getCurrentPostId?.() || 0),
      meta: (editor?.getEditedPostAttribute?.("meta") || {}) as Record<string, unknown>
    };
  }, []);
  const primaryGameId = Number(meta[PRIMARY_GAME_META_KEY] || 0);
  const effectiveGameId = attributes.source === "manual" ? Number(attributes.gameId || 0) : primaryGameId;
  const game = useBylineApi<PreviewGame>(effectiveGameId > 0 ? `/byline/v1/sports/games/${effectiveGameId}` : null);
  const searchResults = useBylineApi<PreviewGame[]>(search ? queryPath("/weekly-wildcat/v1/sports-games/search", { search, per_page: 12 }) : null);
  const blockProps = useBlockProps({ className: "byline-newsroom-block-editor" });
  const empty = postType !== "post"
    ? __("Game Score can be used in posts only.", "weekly-wildcat-headless")
    : effectiveGameId <= 0
      ? attributes.source === "manual"
        ? __("Choose a published game for this scoreboard.", "weekly-wildcat-headless")
        : __("Choose a Primary Game in the post settings to preview this scoreboard.", "weekly-wildcat-headless")
      : "";

  return (
    <>
      <InspectorControls>
        <PanelBody title={__("Game score", "weekly-wildcat-headless")} initialOpen>
          <SelectControl
            __nextHasNoMarginBottom
            label={__("Game source", "weekly-wildcat-headless")}
            value={attributes.source || "primary"}
            options={[
              { label: __("Article Primary Game", "weekly-wildcat-headless"), value: "primary" },
              { label: __("Manually selected game", "weekly-wildcat-headless"), value: "manual" }
            ]}
            onChange={(source: string) => setAttributes({ source, gameId: source === "primary" ? 0 : attributes.gameId })}
          />
          <ToggleControl __nextHasNoMarginBottom label={__("Show team logos", "weekly-wildcat-headless")} checked={attributes.showLogos !== false} onChange={(showLogos) => setAttributes({ showLogos })} />
          <ToggleControl __nextHasNoMarginBottom label={__("Show date and location", "weekly-wildcat-headless")} checked={attributes.showDetails !== false} onChange={(showDetails) => setAttributes({ showDetails })} />
          <ToggleControl __nextHasNoMarginBottom label={__("Show Game Center link", "weekly-wildcat-headless")} checked={attributes.showLink !== false} onChange={(showLink) => setAttributes({ showLink })} />
        </PanelBody>
        {attributes.source === "manual" ? (
          <PanelBody title={__("Choose a game", "weekly-wildcat-headless")} initialOpen>
            <SearchControl value={search} onChange={setSearch} placeholder={__("Search published games…", "weekly-wildcat-headless")} />
            {searchResults.error ? <ErrorNotice message={searchResults.error} /> : null}
            {(searchResults.data || []).map((result) => (
              <Button key={result.id} variant={Number(attributes.gameId) === result.id ? "primary" : "secondary"} onClick={() => setAttributes({ gameId: result.id })}>
                {result.display?.matchup || result.title || `${result.sportLabel || __("Game", "weekly-wildcat-headless")} #${result.id}`}
              </Button>
            ))}
          </PanelBody>
        ) : null}
      </InspectorControls>

      <section {...blockProps}>
        <h2>{__("Game Score", "weekly-wildcat-headless")}</h2>
        <PreviewFrame label={__("Game score preview", "weekly-wildcat-headless")} isLoading={game.isLoading} error={game.error} empty={empty}>
          {game.data ? <GamePreview game={game.data} showDetails={attributes.showDetails !== false} showLogos={attributes.showLogos !== false} showLink={attributes.showLink !== false} /> : null}
        </PreviewFrame>
        {postId && attributes.source !== "manual" && primaryGameId > 0 ? <p className="byline-game-score-editor-note">{__("This preview follows the post's Primary Game setting.", "weekly-wildcat-headless")}</p> : null}
      </section>
    </>
  );
}

registerBlockType(metadata as any, { edit: GameScoreEdit, save: () => null });
