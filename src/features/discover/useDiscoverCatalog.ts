import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CATALOG_SEARCH_MIN_CHARS } from "../../shared/config/polling";
import { sourcesApi } from "../../shared/api/tauri/sourcesApi";
import { simplifySourceSearchQuery } from "../../shared/utils/titleMatching";
import {
  catalogGameGroupKey,
  cleanTitleForCover,
} from "../../shared/utils/normalizeTitleKey";
import { coverUrlFromScreenshots } from "../../shared/utils/coverCandidates";
import { formatUserError } from "../../shared/utils/formatUserError";
import { useToast } from "../../shared/components/ToastProvider";
import type {
  CatalogGame,
  DownloadOption,
  GetGameDetailInput,
} from "../../shared/types/contracts";

const DISCOVER_PAGE_SIZE = 24;

/** Mesma base de jogo (groupKey canónico ou título limpo) — evita local+API a duplicar. */
function catalogDedupeKey(game: CatalogGame): string {
  const group = game.groupKey?.trim();
  if (group) return catalogGameGroupKey(group);
  return catalogGameGroupKey(game.title);
}

function dedupeCatalogGames(games: CatalogGame[]): CatalogGame[] {
  const seen = new Set<string>();
  const out: CatalogGame[] = [];
  for (const game of games) {
    const key = catalogDedupeKey(game);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(game);
  }
  return out;
}

function mergeCatalogGames(
  base: CatalogGame[],
  incoming: CatalogGame[],
): CatalogGame[] {
  return dedupeCatalogGames([...base, ...incoming]);
}

const isDownloadableOption = (option: DownloadOption) =>
  option.downloadType === "torrent" ||
  (option.downloadType === "http" &&
    !option.url.includes("fitgirl-repacks.site/"));

type DiscoverPickPayload = {
  downloadable: DownloadOption[];
  rawCount: number;
  synopsis: string | null;
  screenshots: string[];
  enrichedGame: Partial<CatalogGame> | null;
};

async function fetchDownloadOptionsForGame(
  game: CatalogGame,
  language?: string,
): Promise<DiscoverPickPayload> {
  const groupKey = game.groupKey?.trim() || undefined;
  const title = game.title.trim();
  let rawCount = 0;
  let synopsis: string | null = null;
  let screenshots: string[] = [];
  let enrichedGame: Partial<CatalogGame> | null = null;

  if (groupKey || title) {
    try {
      const detail = await sourcesApi.getGameDetail({
        groupKey,
        title: title || undefined,
        includeSteam: true,
        language,
      });
      rawCount = detail.downloads.length;
      synopsis = detail.synopsis?.trim() || null;
      screenshots = detail.screenshots.filter((url) => url.trim().length > 0);
      enrichedGame = {
        title: detail.game.title || undefined,
        genre: detail.game.genre || undefined,
        coverUrl:
          coverUrlFromScreenshots(detail.game.coverUrl, screenshots) ?? undefined,
        groupKey: detail.game.groupKey ?? undefined,
      };
      const fromDetail = detail.downloads.filter(isDownloadableOption);
      if (fromDetail.length > 0) {
        return { downloadable: fromDetail, rawCount, synopsis, screenshots, enrichedGame };
      }
    } catch {
      // fallback por título / groupKey abaixo
    }
  }

  const queries = [
    cleanTitleForCover(title),
    simplifySourceSearchQuery(cleanTitleForCover(title)),
  ].filter(
    (query, index, all) => query.length >= 2 && all.indexOf(query) === index,
  );

  for (const query of queries) {
    const rows = await sourcesApi.searchDownloadOptions({
      query,
      groupKey,
    });
    rawCount = Math.max(rawCount, rows.length);
    const downloadable = rows.filter(isDownloadableOption);
    if (downloadable.length > 0) {
      return { downloadable, rawCount, synopsis, screenshots, enrichedGame };
    }
  }

  return { downloadable: [], rawCount, synopsis, screenshots, enrichedGame };
}

type UseDiscoverCatalogArgs = {
  discoverSearch: string;
  enabledSourcesCount: number;
  enabledSourcesKey: string;
  defaultDownloadPath: string;
};

function isCatalogGame(
  input: GetGameDetailInput | CatalogGame,
): input is CatalogGame {
  return "source" in input;
}

function catalogGameFromInput(
  input: GetGameDetailInput | CatalogGame,
  catalogGames: CatalogGame[],
): CatalogGame {
  if (isCatalogGame(input)) return input;

  const groupKey = input.groupKey?.trim();
  const title = input.title?.trim() ?? "";
  const fromCatalog = catalogGames.find(
    (game) =>
      (groupKey && game.groupKey === groupKey) ||
      (title &&
        game.title.localeCompare(title, undefined, { sensitivity: "base" }) ===
          0),
  );
  if (fromCatalog) return fromCatalog;

  return {
    id: groupKey ? `group:${groupKey}` : `title:${title}`,
    title,
    genre: "",
    coverUrl: null,
    localCoverPath: null,
    source: "catalog",
    groupKey: groupKey || null,
  };
}

export function useDiscoverCatalog({
  discoverSearch,
  enabledSourcesCount,
  enabledSourcesKey,
  defaultDownloadPath,
}: UseDiscoverCatalogArgs) {
  const { showError } = useToast();
  const { t, i18n } = useTranslation();
  const [catalogGames, setCatalogGames] = useState<CatalogGame[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogLoadingMore, setCatalogLoadingMore] = useState(false);
  const [catalogHasMore, setCatalogHasMore] = useState(false);
  const [discoverBusy, setDiscoverBusy] = useState<string | null>(null);
  const [discoverPickGame, setDiscoverPickGame] = useState<CatalogGame | null>(
    null,
  );
  const [discoverPickOptions, setDiscoverPickOptions] = useState<
    DownloadOption[]
  >([]);
  const [discoverPickSynopsis, setDiscoverPickSynopsis] = useState<
    string | null
  >(null);
  const [discoverPickScreenshots, setDiscoverPickScreenshots] = useState<
    string[]
  >([]);
  const [discoverPickLoading, setDiscoverPickLoading] = useState(false);
  const [discoverPickError, setDiscoverPickError] = useState<string | null>(
    null,
  );
  const pickRequestIdRef = useRef(0);

  const displayCatalogSource = useMemo(() => {
    const q = discoverSearch.trim();
    if (q.length < CATALOG_SEARCH_MIN_CHARS) return [];
    return catalogGames;
  }, [catalogGames, discoverSearch]);

  const searchRequestIdRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const query = discoverSearch.trim();
    if (query.length < CATALOG_SEARCH_MIN_CHARS) {
      setCatalogGames([]);
      setCatalogLoading(false);
      setCatalogLoadingMore(false);
      setCatalogHasMore(false);
      return;
    }

    if (enabledSourcesCount === 0) {
      setCatalogGames([]);
      setCatalogLoading(false);
      setCatalogLoadingMore(false);
      setCatalogHasMore(false);
      return;
    }

    const requestQuery = query;
    const requestId = ++searchRequestIdRef.current;
    const loadingStartedAt = Date.now();
    setCatalogLoading(true);
    setCatalogGames([]);
    setCatalogHasMore(false);

    void (async () => {
      const applyIfCurrent = (fn: () => void) => {
        if (
          !cancelled &&
          searchRequestIdRef.current === requestId &&
          discoverSearch.trim() === requestQuery
        ) {
          fn();
        }
      };

      const finishLoading = async () => {
        const elapsed = Date.now() - loadingStartedAt;
        const remaining = Math.max(0, 200 - elapsed);
        if (remaining > 0) {
          await new Promise<void>((resolve) => {
            window.setTimeout(resolve, remaining);
          });
        }
        applyIfCurrent(() => {
          setCatalogLoading(false);
        });
      };

      try {
        // 1) Cache/JSON local — UI imediata quando já há resultados
        const localRows = await sourcesApi.searchGameCatalog({
          query: requestQuery,
          includeSteam: false,
          onlyWithSources: true,
          attachCovers: true,
          localOnly: true,
          offset: 0,
          limit: DISCOVER_PAGE_SIZE + 1,
        });
        applyIfCurrent(() => {
          setCatalogHasMore(localRows.length > DISCOVER_PAGE_SIZE);
          setCatalogGames(dedupeCatalogGames(localRows.slice(0, DISCOVER_PAGE_SIZE)));
          // Só larga o loading cedo se já há algo para mostrar; senão espera a API.
          if (localRows.length > 0) {
            setCatalogLoading(false);
          }
        });

        // 2) API Hydra — títulos novos + gravação no cache local
        const fullRows = await sourcesApi.searchGameCatalog({
          query: requestQuery,
          includeSteam: false,
          onlyWithSources: true,
          attachCovers: false,
          localOnly: false,
          offset: 0,
          limit: DISCOVER_PAGE_SIZE + 1,
        });
        applyIfCurrent(() => {
          setCatalogGames((prev) => {
            const prevByKey = new Map(
              prev.map((game) => [catalogDedupeKey(game), game]),
            );
            const merged = fullRows.slice(0, DISCOVER_PAGE_SIZE).map((row) => {
              const existing = prevByKey.get(catalogDedupeKey(row));
              if (!existing) return row;
              return {
                ...row,
                coverUrl: row.coverUrl?.trim() || existing.coverUrl,
                localCoverPath:
                  row.localCoverPath?.trim() || existing.localCoverPath,
                groupKey: row.groupKey?.trim() || existing.groupKey,
              };
            });
            return dedupeCatalogGames(merged);
          });
          setCatalogHasMore(
            fullRows.length > DISCOVER_PAGE_SIZE ||
              localRows.length > DISCOVER_PAGE_SIZE,
          );
        });
      } catch (error) {
        applyIfCurrent(() => {
          showError(formatUserError(error, t("discover.searchError")));
        });
      } finally {
        await finishLoading();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [discoverSearch, enabledSourcesCount, enabledSourcesKey, showError, t]);

  const loadMoreInFlightRef = useRef(false);

  const loadMoreCatalog = useCallback(async () => {
    const query = discoverSearch.trim();
    if (
      query.length < CATALOG_SEARCH_MIN_CHARS ||
      catalogLoading ||
      catalogLoadingMore ||
      loadMoreInFlightRef.current ||
      !catalogHasMore
    ) {
      return;
    }

    loadMoreInFlightRef.current = true;
    setCatalogLoadingMore(true);
    try {
      const rows = await sourcesApi.searchGameCatalog({
        query,
        includeSteam: false,
        onlyWithSources: true,
        attachCovers: true,
        localOnly: false,
        offset: catalogGames.length,
        limit: DISCOVER_PAGE_SIZE + 1,
      });
      setCatalogHasMore(rows.length > DISCOVER_PAGE_SIZE);
      setCatalogGames((prev) =>
        mergeCatalogGames(prev, rows.slice(0, DISCOVER_PAGE_SIZE)),
      );
    } catch (error) {
      showError(formatUserError(error, t("discover.loadMoreError")));
    } finally {
      loadMoreInFlightRef.current = false;
      setCatalogLoadingMore(false);
    }
  }, [
    catalogGames.length,
    catalogHasMore,
    catalogLoading,
    catalogLoadingMore,
    discoverSearch,
    showError,
    t,
  ]);

  const closeDiscoverPicker = useCallback(() => {
    pickRequestIdRef.current += 1;
    setDiscoverPickGame(null);
    setDiscoverPickOptions([]);
    setDiscoverPickSynopsis(null);
    setDiscoverPickScreenshots([]);
    setDiscoverPickError(null);
    setDiscoverPickLoading(false);
  }, []);

  const reportPickError = useCallback(
    (message: string) => {
      setDiscoverPickError(message);
      showError(message);
    },
    [showError],
  );

  const openDiscoverPicker = useCallback(
    (game: CatalogGame) => {
      const requestId = ++pickRequestIdRef.current;
      setDiscoverPickGame(game);
      setDiscoverPickOptions([]);
      setDiscoverPickSynopsis(null);
      setDiscoverPickScreenshots([]);
      setDiscoverPickError(null);
      setDiscoverPickLoading(true);

      void (async () => {
        const isCurrent = () => pickRequestIdRef.current === requestId;

        if (enabledSourcesCount === 0) {
          if (!isCurrent()) return;
          reportPickError(t("discover.noActiveSourcesPick"));
          setDiscoverPickLoading(false);
          return;
        }

        const hasPath =
          defaultDownloadPath.trim().length > 0 ||
          (await sourcesApi.getDefaultDownloadPath());
        if (!isCurrent()) return;
        if (!hasPath) {
          reportPickError(t("discover.noDownloadPath"));
          setDiscoverPickLoading(false);
          return;
        }

        try {
          const { downloadable, synopsis, screenshots, enrichedGame } =
            await fetchDownloadOptionsForGame(game, i18n.language);
          if (!isCurrent()) return;

          setDiscoverPickOptions(downloadable);
          setDiscoverPickSynopsis(synopsis);
          setDiscoverPickScreenshots(screenshots);
          if (enrichedGame) {
            const nextCover =
              coverUrlFromScreenshots(
                enrichedGame.coverUrl ?? game.coverUrl,
                screenshots,
              ) ?? null;
            setDiscoverPickGame((prev) =>
              prev
                ? {
                    ...prev,
                    title: enrichedGame.title?.trim() || prev.title,
                    genre: enrichedGame.genre?.trim() || prev.genre,
                    coverUrl: nextCover ?? prev.coverUrl,
                    groupKey: enrichedGame.groupKey ?? prev.groupKey,
                  }
                : prev,
            );
            if (nextCover && !game.coverUrl?.trim()) {
              const coverKey = catalogDedupeKey(game);
              setCatalogGames((prev) =>
                prev.map((row) =>
                  catalogDedupeKey(row) === coverKey
                    ? { ...row, coverUrl: row.coverUrl?.trim() || nextCover }
                    : row,
                ),
              );
            }
          }
        } catch {
          if (!isCurrent()) return;
          setDiscoverPickOptions([]);
          setDiscoverPickSynopsis(null);
          setDiscoverPickScreenshots([]);
          reportPickError(t("discover.pickFetchError"));
        } finally {
          if (isCurrent()) {
            setDiscoverPickLoading(false);
          }
        }
      })();
    },
    [defaultDownloadPath, enabledSourcesCount, i18n.language, reportPickError, t],
  );

  const openGameDetail = useCallback(
    (input: GetGameDetailInput | CatalogGame) => {
      const game = catalogGameFromInput(input, catalogGames);
      openDiscoverPicker(game);
    },
    [catalogGames, openDiscoverPicker],
  );

  return {
    catalogGames,
    catalogLoading,
    catalogLoadingMore,
    catalogHasMore,
    loadMoreCatalog,
    discoverBusy,
    setDiscoverBusy,
    discoverPickGame,
    discoverPickOptions,
    discoverPickSynopsis,
    discoverPickScreenshots,
    discoverPickLoading,
    discoverPickError,
    displayCatalogSource,
    closeDiscoverPicker,
    openDiscoverPicker,
    openGameDetail,
  };
}
