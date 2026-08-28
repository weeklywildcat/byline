import { InspectorControls, useBlockProps } from "@wordpress/block-editor";
import { PanelBody, RangeControl, SelectControl, TextControl } from "@wordpress/components";
import { registerBlockType } from "@wordpress/blocks";
import { __ } from "@wordpress/i18n";
import { useMemo } from "@wordpress/element";

import metadata from "./block.json";
import { boundedNumber, ErrorNotice, PreviewFrame, queryPath, useBylineApi, type PreviewGame } from "../newsroom/common";
import "./style.css";

type Team = {
  key?: string;
  teamKey?: string;
  label?: string;
  displayName?: string;
  seasons?: string[];
  currentSeason?: string;
};

function gamePath(kind: "upcoming" | "recent", attributes: any) {
  return queryPath(`/byline/v1/sports/games/${kind}`, {
    per_page: boundedNumber(kind === "upcoming" ? attributes.upcomingLimit : attributes.recentLimit, 3, 1, 12),
    teamKey: attributes.teamKey || undefined,
    season: attributes.season || undefined
  });
}

function ScheduleGame({ game }: { game: PreviewGame }) {
  const board = game.display?.scoreboard;
  const team = board?.team || board?.wildcats;
  const hasScore = team?.score !== null && team?.score !== undefined && board?.opponent?.score !== null && board?.opponent?.score !== undefined;

  return (
    <li className="byline-sports-game">
      <div className="byline-sports-game-meta">
        <time dateTime={game.startDate}>{game.display?.date || game.startDate || __("Date pending", "weekly-wildcat-headless")}</time>
        <span>{game.display?.status || game.status || __("Status pending", "weekly-wildcat-headless")}</span>
      </div>
      <p className="byline-sports-game-matchup">{game.display?.matchup || game.title || `${team?.label || __("Team", "weekly-wildcat-headless")} vs. ${game.opponent || __("Opponent", "weekly-wildcat-headless")}`}</p>
      {hasScore ? <p className="byline-sports-game-score">{team?.label || __("Team", "weekly-wildcat-headless")} {team?.score} · {board?.opponent?.label || game.opponent || __("Opponent", "weekly-wildcat-headless")} {board?.opponent?.score}</p> : null}
      {game.display?.location ? <p className="byline-sports-game-location">{game.display.location}</p> : null}
    </li>
  );
}

function SportsScheduleEdit({ attributes, setAttributes }: any) {
  const teams = useBylineApi<Team[]>("/weekly-wildcat/v1/sports-teams");
  const upcoming = useBylineApi<PreviewGame[]>(attributes.display === "recent" ? null : gamePath("upcoming", attributes));
  const recent = useBylineApi<PreviewGame[]>(attributes.display === "upcoming" ? null : gamePath("recent", attributes));
  const blockProps = useBlockProps({ className: "byline-newsroom-block-editor" });
  const selectedTeam = (teams.data || []).find((team) => (team.key || team.teamKey) === attributes.teamKey);
  const seasonOptions = useMemo(() => {
    const seasons = selectedTeam?.seasons || [];
    const current = selectedTeam?.currentSeason;
    return Array.from(new Set([...(current ? [current] : []), ...seasons])).sort().reverse();
  }, [selectedTeam]);
  const games = [
    ...(attributes.display !== "recent" ? (upcoming.data || []) : []),
    ...(attributes.display !== "upcoming" ? (recent.data || []) : [])
  ];
  const loading = upcoming.isLoading || recent.isLoading || teams.isLoading;
  const error = teams.error || upcoming.error || recent.error;
  const empty = !loading && games.length === 0 ? __("No games found for this team and season.", "weekly-wildcat-headless") : "";

  return (
    <>
      <InspectorControls>
        <PanelBody title={__("Sports schedule", "weekly-wildcat-headless")} initialOpen>
          <TextControl __nextHasNoMarginBottom label={__("Heading", "weekly-wildcat-headless")} value={attributes.heading || ""} onChange={(heading: string) => setAttributes({ heading })} />
          <SelectControl
            __nextHasNoMarginBottom
            label={__("Team", "weekly-wildcat-headless")}
            value={attributes.teamKey || ""}
            options={[{ label: __("All teams", "weekly-wildcat-headless"), value: "" }, ...(teams.data || []).map((team) => ({ value: team.key || team.teamKey || "", label: team.displayName || team.label || team.key || team.teamKey || __("Team", "weekly-wildcat-headless") }))]}
            onChange={(teamKey: string) => setAttributes({ teamKey, season: "" })}
          />
          <SelectControl
            __nextHasNoMarginBottom
            label={__("Season", "weekly-wildcat-headless")}
            help={__("Leave blank to use the canonical current schedule.", "weekly-wildcat-headless")}
            value={attributes.season || ""}
            options={[{ label: __("All seasons", "weekly-wildcat-headless"), value: "" }, ...seasonOptions.map((season) => ({ label: season, value: season }))]}
            onChange={(season: string) => setAttributes({ season })}
          />
          <SelectControl
            __nextHasNoMarginBottom
            label={__("Show", "weekly-wildcat-headless")}
            value={attributes.display || "both"}
            options={[
              { label: __("Upcoming and recent", "weekly-wildcat-headless"), value: "both" },
              { label: __("Upcoming", "weekly-wildcat-headless"), value: "upcoming" },
              { label: __("Recent results", "weekly-wildcat-headless"), value: "recent" }
            ]}
            onChange={(display: string) => setAttributes({ display })}
          />
          <RangeControl __nextHasNoMarginBottom label={__("Upcoming games", "weekly-wildcat-headless")} value={boundedNumber(attributes.upcomingLimit, 3, 1, 12)} min={1} max={12} onChange={(upcomingLimit) => setAttributes({ upcomingLimit: boundedNumber(upcomingLimit, 3, 1, 12) })} />
          <RangeControl __nextHasNoMarginBottom label={__("Recent games", "weekly-wildcat-headless")} value={boundedNumber(attributes.recentLimit, 3, 1, 12)} min={1} max={12} onChange={(recentLimit) => setAttributes({ recentLimit: boundedNumber(recentLimit, 3, 1, 12) })} />
        </PanelBody>
      </InspectorControls>

      <section {...blockProps}>
        {error ? <ErrorNotice message={error} /> : null}
        <PreviewFrame label={__("Sports schedule preview", "weekly-wildcat-headless")} isLoading={loading} empty={empty}>
          <div className="byline-sports-schedule">
            <h2>{attributes.heading || __("Sports Schedule", "weekly-wildcat-headless")}</h2>
            <div className="byline-sports-schedule-sections">
              {attributes.display !== "recent" ? (
                <section className="byline-sports-schedule-section">
                  <h3>{__("Upcoming", "weekly-wildcat-headless")}</h3>
                  <ul className="byline-sports-game-list">{(upcoming.data || []).map((game) => <ScheduleGame key={game.id} game={game} />)}</ul>
                </section>
              ) : null}
              {attributes.display !== "upcoming" ? (
                <section className="byline-sports-schedule-section">
                  <h3>{__("Recent results", "weekly-wildcat-headless")}</h3>
                  <ul className="byline-sports-game-list">{(recent.data || []).map((game) => <ScheduleGame key={game.id} game={game} />)}</ul>
                </section>
              ) : null}
            </div>
          </div>
        </PreviewFrame>
      </section>
    </>
  );
}

registerBlockType(metadata as any, { edit: SportsScheduleEdit, save: () => null });
