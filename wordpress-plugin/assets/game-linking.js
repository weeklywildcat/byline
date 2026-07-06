(function (wp) {
  const { apiFetch, blockEditor, blocks, components, coreData, data, editPost, element, i18n, plugins } = wp;
  const { InspectorControls } = blockEditor;
  const { Button, PanelBody, Placeholder, SelectControl, Spinner, TextControl } = components;
  const { useEntityProp } = coreData || {};
  const { useSelect } = data;
  const { PluginDocumentSettingPanel } = editPost || {};
  const { createElement: el, Fragment, useEffect, useMemo, useState } = element;
  const { __ } = i18n;
  const config = window.wwhGameLinking || {};
  // The article sidebar stores only this existing Sports Game post ID in post meta.
  const PRIMARY_GAME_META_KEY = config.primaryGameMetaKey || "weekly_wildcat_primary_game_id";
  const REST_NAMESPACE = config.restNamespace || "weekly-wildcat/v1";
  const DISPLAY_OPTIONS = [
    { label: "Full", value: "full" },
    { label: "Compact", value: "compact" },
    { label: "Score only", value: "score-only" },
  ];

  function gameSearchPath(search) {
    const params = new URLSearchParams({ per_page: "12" });

    if (search) {
      params.set("search", search);
    }

    return `/${REST_NAMESPACE}/sports-games/search?${params.toString()}`;
  }

  function gamePath(gameId) {
    return `/${REST_NAMESPACE}/sports-games/${parseInt(gameId, 10)}`;
  }

  function gameSummary(game) {
    if (!game) {
      return "";
    }

    return [game.display?.matchup || game.title, game.display?.date, game.display?.sportLevel || game.sportLabel]
      .filter(Boolean)
      .join(" · ");
  }

  function GamePreview({ game }) {
    const status = game.display?.status || game.status || "";

    return el(
      "div",
      { className: "wwh-game-picker-preview" },
      el("strong", null, game.display?.matchup || game.title || __("Selected game", "weekly-wildcat-headless")),
      el("span", null, [game.display?.sportLevel || game.sportLabel, status].filter(Boolean).join(" · ")),
      game.display?.date ? el("span", null, game.display.date) : null,
      game.display?.location ? el("span", null, game.display.location) : null
    );
  }

  function GamePicker({ label, selectedGameId, onSelect }) {
    const numericGameId = parseInt(selectedGameId, 10) || 0;
    const [query, setQuery] = useState("");
    const [results, setResults] = useState([]);
    const [selectedGame, setSelectedGame] = useState(null);
    const [isChanging, setIsChanging] = useState(!numericGameId);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState("");
    const [debouncedQuery, setDebouncedQuery] = useState(query);

    useEffect(() => {
      const timeout = window.setTimeout(() => setDebouncedQuery(query), 250);

      return () => window.clearTimeout(timeout);
    }, [query]);

    useEffect(() => {
      let cancelled = false;

      if (!numericGameId) {
        setSelectedGame(null);
        return;
      }

      apiFetch({ path: gamePath(numericGameId) })
        .then((game) => {
          if (!cancelled) {
            setSelectedGame(game);
            setError("");
          }
        })
        .catch(() => {
          if (!cancelled) {
            setSelectedGame(null);
            setError(__("The selected game could not be found.", "weekly-wildcat-headless"));
          }
        });

      return () => {
        cancelled = true;
      };
    }, [numericGameId]);

    useEffect(() => {
      let cancelled = false;

      if (!isChanging) {
        return undefined;
      }

      setIsLoading(true);
      apiFetch({ path: gameSearchPath(debouncedQuery) })
        .then((games) => {
          if (!cancelled) {
            setResults(Array.isArray(games) ? games : []);
            setError("");
          }
        })
        .catch(() => {
          if (!cancelled) {
            setResults([]);
            setError(__("Game search is unavailable right now.", "weekly-wildcat-headless"));
          }
        })
        .finally(() => {
          if (!cancelled) {
            setIsLoading(false);
          }
        });

      return () => {
        cancelled = true;
      };
    }, [debouncedQuery, isChanging]);

    function chooseGame(game) {
      onSelect(game);
      setSelectedGame(game);
      setIsChanging(false);
      setQuery("");
    }

    function removeGame() {
      onSelect(null);
      setSelectedGame(null);
      setIsChanging(true);
      setQuery("");
    }

    return el(
      "div",
      { className: "wwh-game-picker" },
      label ? el("p", { className: "wwh-game-picker-label" }, label) : null,
      selectedGame && !isChanging
        ? el(
            Fragment,
            null,
            el(GamePreview, { game: selectedGame }),
            el(
              "div",
              { className: "wwh-game-picker-actions" },
              el(Button, { variant: "secondary", onClick: () => setIsChanging(true) }, __("Change", "weekly-wildcat-headless")),
              el(Button, { variant: "link", isDestructive: true, onClick: removeGame }, __("Remove", "weekly-wildcat-headless"))
            )
          )
        : el(
            Fragment,
            null,
            el(TextControl, {
              label: __("Search games", "weekly-wildcat-headless"),
              value: query,
              onChange: setQuery,
              placeholder: __("Sport, level, opponent, or date", "weekly-wildcat-headless"),
            }),
            isLoading ? el(Spinner, null) : null,
            error ? el("p", { className: "wwh-game-picker-error" }, error) : null,
            el(
              "div",
              { className: "wwh-game-picker-results" },
              results.map((game) =>
                el(
                  Button,
                  {
                    key: game.id,
                    className: "wwh-game-picker-result",
                    onClick: () => chooseGame(game),
                    variant: "secondary",
                  },
                  el("strong", null, game.display?.matchup || game.title),
                  el("span", null, gameSummary(game))
                )
              )
            ),
            selectedGame
              ? el(Button, { variant: "link", onClick: () => setIsChanging(false) }, __("Cancel change", "weekly-wildcat-headless"))
              : null
          )
    );
  }

  function PrimaryGameMetaPanel({ postType }) {
    const [meta, setMeta] = useEntityProp("postType", postType, "meta");
    const selectedGameId = meta?.[PRIMARY_GAME_META_KEY] || 0;

    return el(
      PluginDocumentSettingPanel,
      {
        name: "weekly-wildcat-primary-game",
        title: __("Primary Game", "weekly-wildcat-headless"),
        className: "wwh-primary-game-panel",
      },
      el(GamePicker, {
        label: __("Choose one schedule game for the automatic article card.", "weekly-wildcat-headless"),
        selectedGameId,
        onSelect: (game) => setMeta({ ...(meta || {}), [PRIMARY_GAME_META_KEY]: game ? game.id : 0 }),
      })
    );
  }

  function PrimaryGamePanel() {
    const postType = useSelect((select) => select("core/editor").getCurrentPostType(), []);

    if (postType !== "post" || typeof useEntityProp !== "function" || !PluginDocumentSettingPanel) {
      return null;
    }

    return el(PrimaryGameMetaPanel, { postType });
  }

  function GameEmbedEdit({ attributes, setAttributes }) {
    const { gameId = 0, display = "full" } = attributes;
    const displayValue = useMemo(() => DISPLAY_OPTIONS.some((option) => option.value === display) ? display : "full", [display]);

    return el(
      Fragment,
      null,
      el(
        InspectorControls,
        null,
        el(
          PanelBody,
          { title: __("Game Display", "weekly-wildcat-headless") },
          el(SelectControl, {
            label: __("Card style", "weekly-wildcat-headless"),
            value: displayValue,
            options: DISPLAY_OPTIONS,
            onChange: (nextDisplay) => setAttributes({ display: nextDisplay }),
          })
        )
      ),
      el(
        Placeholder,
        {
          label: __("Weekly Wildcat Game Embed", "weekly-wildcat-headless"),
          instructions: __("Select a sports schedule game. The block saves only the game ID and renders current schedule data.", "weekly-wildcat-headless"),
        },
        el(GamePicker, {
          selectedGameId: gameId,
          onSelect: (game) => setAttributes({ gameId: game ? game.id : 0 }),
        })
      )
    );
  }

  if (PluginDocumentSettingPanel) {
    plugins.registerPlugin("weekly-wildcat-primary-game", {
      render: PrimaryGamePanel,
    });
  }

  blocks.registerBlockType("weekly-wildcat/game-embed", {
    apiVersion: 2,
    title: __("Weekly Wildcat Game Embed", "weekly-wildcat-headless"),
    description: __("Embed a live sports schedule card by selecting an existing game.", "weekly-wildcat-headless"),
    icon: "awards",
    category: "widgets",
    attributes: {
      // Block attributes intentionally store only IDs/options, never copied scores or dates.
      gameId: {
        type: "integer",
        default: 0,
      },
      display: {
        type: "string",
        default: "full",
      },
    },
    edit: GameEmbedEdit,
    save: () => null,
  });
})(window.wp);
