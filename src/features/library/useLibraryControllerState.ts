import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { open } from "@tauri-apps/plugin-dialog";
import type { AppDispatch } from "../../app/store";
import { cancelJob, enqueueJob, fetchJobs, removeJobLocally } from "../queue/queueSlice";
import { queueApi } from "../../shared/api/tauri/queueApi";
import { sourcesApi } from "../../shared/api/tauri/sourcesApi";
import { resolveDeletePath } from "../../shared/utils/archive";
import {
  formatLibraryDeleteError,
  isBenignDeleteError,
  isFileLockDeleteError,
  resolveLibraryDeletePaths,
} from "../../shared/utils/libraryDelete";
import {
  activeJobBlocksLibraryFolder,
  normalizeLibraryPath,
} from "../../shared/utils/jobExtraction";
import {
  dedupeLibraryEntries,
  findRelatedLibraryJobs,
  libraryTitlesMatch,
} from "../../shared/utils/libraryDedupe";
import {
  getPathState,
  isActiveQueueJob,
  isJobFinished,
  jobBelongsInLibrary,
  jobPathCtx,
  itemPathCtx,
  pathStateKey,
} from "./libraryItemState";
import {
  coverTitleKey,
  libraryGameKeyCandidates,
} from "../../shared/utils/normalizeTitleKey";
import { useToast } from "../../shared/components/ToastProvider";
import { formatLaunchError } from "../../shared/utils/launchErrors";
import { formatUserError } from "../../shared/utils/formatUserError";
import {
  LIBRARY_COVER_LOOKUP_DEBOUNCE_MS,
  LIBRARY_INSPECT_BATCH_PAUSE_MS,
  LIBRARY_INSPECT_BATCH_SIZE,
  LIBRARY_SCAN_DEBOUNCE_MS,
} from "../../shared/config/polling";
import {
  parseLibrarySort,
  SETTING_KEY,
  type LibrarySort,
} from "../../shared/config/appSettings";
import type {
  CatalogGame,
  DownloadJob,
  DownloadOption,
  LocalLibraryItem,
} from "../../shared/types/contracts";
import type { NavTab } from "../../layout/types";
import type { LibraryControllerValue } from "./LibraryController";
import type { LibraryEntry } from "./types";
import { isAppLanguage } from "../../shared/config/locale";
import i18n from "../../shared/i18n";
import {
  clearLibraryPathStateCache,
  hydrateLibraryPathStateCache,
  mergeLibraryPathStateCache,
  removeLibraryPathStateCacheKeys,
  setLibraryPathStateCacheEntry,
} from "./libraryPathStateCache";
import {
  emptyPathState,
  normalizeDownloadPath,
  scoreLibraryEntry,
  sortLibraryEntries,
} from "./libraryEntryHelpers";
import { useLibraryInstallWatch } from "./useLibraryInstallWatch";

type LibraryDetailState = {
  item: LibraryEntry;
  game: CatalogGame | null;
  loading: boolean;
  error: string | null;
  options: DownloadOption[];
  synopsis: string | null;
  screenshots: string[];
  note: string;
  noteSaving: boolean;
  busyUrl: string | null;
};

type UseLibraryControllerStateArgs = {
  activeTab: NavTab;
  jobs: DownloadJob[];
  queueInitialized: boolean;
  defaultDownloadPath: string;
  dispatch: AppDispatch;
  onGoDiscover: () => void;
  onGoDownloads: () => void;
  resolveCover: LibraryControllerValue["resolveCover"];
  resolveCoversBatch: (titles: string[]) => void;
  invalidateLocalCover: (title: string, coverUrl?: string | null) => void;
};

export function useLibraryControllerState({
  activeTab,
  jobs,
  queueInitialized,
  defaultDownloadPath,
  dispatch,
  onGoDiscover,
  onGoDownloads,
  resolveCover,
  resolveCoversBatch,
  invalidateLocalCover,
}: UseLibraryControllerStateArgs): LibraryControllerValue {
  const { showError } = useToast();
  const { t } = useTranslation();
  const [libraryFilter, setLibraryFilter] = useState("");
  const [librarySort, setLibrarySortState] = useState<LibrarySort>("title-asc");
  const [localLibraryItems, setLocalLibraryItems] = useState<
    LocalLibraryItem[]
  >([]);
  const [libraryScanSettled, setLibraryScanSettled] = useState(false);
  const [pathStateByKey, setPathStateByKey] = useState<
    LibraryControllerValue["pathStateByKey"]
  >({});
  const [playBusyId, setPlayBusyId] = useState<string | null>(null);
  const [installBusyId, setInstallBusyId] = useState<string | null>(null);
  const [hiddenLibraryKeys, setHiddenLibraryKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [pendingDeleteItem, setPendingDeleteItem] =
    useState<LibraryEntry | null>(null);
  const [deletingLibraryKey, setDeletingLibraryKey] = useState<string | null>(
    null,
  );
  const [libraryDetail, setLibraryDetail] = useState<LibraryDetailState | null>(
    null,
  );
  const libraryDetailRequestRef = useRef(0);

  const pathStateByKeyRef = useRef(pathStateByKey);
  const jobsRef = useRef(jobs);
  const defaultDownloadPathRef = useRef(defaultDownloadPath);
  const knownDownloadPathRef = useRef("");
  const jobStatusRef = useRef<Map<string, string>>(new Map());
  const libraryCoverLookupAttemptedRef = useRef(new Set<string>());
  const libraryScanInFlightRef = useRef<Promise<void> | null>(null);
  const libraryScanQueuedRef = useRef(false);
  const libraryScanTimerRef = useRef<number | null>(null);

  const {
    installingKeys,
    installWatchRef,
    refreshPathState,
    removeInstallingKey,
    watchForInstalledGame,
  } = useLibraryInstallWatch({
    defaultDownloadPathRef,
    setPathStateByKey,
  });

  useEffect(() => {
    pathStateByKeyRef.current = pathStateByKey;
  }, [pathStateByKey]);

  useEffect(() => {
    jobsRef.current = jobs;
  }, [jobs]);

  useEffect(() => {
    defaultDownloadPathRef.current = defaultDownloadPath;
  }, [defaultDownloadPath]);

  const runBatchPathInspection = useCallback(
    async (
      folderItems: LocalLibraryItem[],
      jobList: DownloadJob[],
      options?: { onlyUnresolved?: boolean; isCancelled?: () => boolean },
    ) => {
      const onlyUnresolved = options?.onlyUnresolved === true;
      const isCancelled = options?.isCancelled ?? (() => false);
      const downloadPath = defaultDownloadPathRef.current;
      const candidates = new Map<
        string,
        { title: string; path: string; jobId?: string }
      >();

      for (const job of jobList) {
        const pathKey = pathStateKey(job.destPath, jobPathCtx(job));
        if (!job.destPath.trim()) continue;
        if (onlyUnresolved && pathStateByKeyRef.current[pathKey] !== undefined)
          continue;
        candidates.set(pathKey, {
          title: job.title,
          path: job.destPath,
          jobId: job.id,
        });
      }

      for (const item of folderItems) {
        if (!item.isDir) continue;
        const pathKey = pathStateKey(item.path, { title: item.name });
        if (candidates.has(pathKey)) continue;
        if (onlyUnresolved && pathStateByKeyRef.current[pathKey] !== undefined)
          continue;
        candidates.set(pathKey, { title: item.name, path: item.path });
      }

      if (candidates.size === 0 || isCancelled()) return;

      const entries = [...candidates.entries()].map(([pathKey, entry]) => ({
        key: pathKey,
        title: entry.title,
        path: entry.path,
        jobId: entry.jobId,
      }));

      const merged: LibraryControllerValue["pathStateByKey"] = {};

      for (
        let index = 0;
        index < entries.length;
        index += LIBRARY_INSPECT_BATCH_SIZE
      ) {
        if (isCancelled()) return;
        if (index > 0) {
          await new Promise<void>((resolve) => {
            window.setTimeout(resolve, LIBRARY_INSPECT_BATCH_PAUSE_MS);
          });
          // Cede ao browser entre lotes para a UI não congelar.
          await new Promise<void>((resolve) => {
            window.requestAnimationFrame(() => resolve());
          });
        }
        const chunk = entries.slice(index, index + LIBRARY_INSPECT_BATCH_SIZE);
        const chunkMerged: LibraryControllerValue["pathStateByKey"] = {};
        try {
          const results = await sourcesApi.inspectLibraryPaths(chunk);
          for (const item of results) {
            chunkMerged[item.key] = item.state;
            merged[item.key] = item.state;
          }
        } catch {
          for (const item of chunk) {
            chunkMerged[item.key] = emptyPathState();
            merged[item.key] = emptyPathState();
          }
        }
        if (isCancelled()) return;
        mergeLibraryPathStateCache(chunkMerged, downloadPath);
        setPathStateByKey((prev) => ({ ...prev, ...chunkMerged }));
      }
    },
    [],
  );

  const inspectAllLibraryPaths = useCallback(async () => {
    if (!defaultDownloadPathRef.current.trim()) {
      setLibraryScanSettled(true);
      return;
    }
    try {
      const items = await sourcesApi.scanDefaultDownloadPath();
      setLocalLibraryItems(items);
      await runBatchPathInspection(items, jobsRef.current);
    } catch (error) {
      showError(formatUserError(error, t("library.verifyPathError")));
    } finally {
      setLibraryScanSettled(true);
    }
  }, [runBatchPathInspection, showError, t]);

  useEffect(() => {
    const path = defaultDownloadPath.trim();
    if (!path) return;

    const normalized = normalizeDownloadPath(path);
    const previous = knownDownloadPathRef.current;

    if (!previous) {
      const persisted = hydrateLibraryPathStateCache(path);
      setPathStateByKey({ ...persisted });
      knownDownloadPathRef.current = normalized;
      void inspectAllLibraryPaths();
      return;
    }

    if (previous === normalized) return;

    clearLibraryPathStateCache();
    setPathStateByKey({});
    knownDownloadPathRef.current = normalized;
    void inspectAllLibraryPaths();
  }, [defaultDownloadPath, inspectAllLibraryPaths]);

  useEffect(() => {
    if (activeTab !== "library") return;
    void sourcesApi
      .getAppSetting(SETTING_KEY.librarySort)
      .then((value) => {
        setLibrarySortState(parseLibrarySort(value));
      })
      .catch(() => {
        // Tauri indisponível
      });
  }, [activeTab]);

  const setLibrarySort = useCallback((value: LibrarySort) => {
    setLibrarySortState(value);
    void sourcesApi.setAppSetting(SETTING_KEY.librarySort, value).catch(() => {
      // ignora falha de persistência
    });
  }, []);

  useEffect(() => {
    for (const job of jobs) {
      const previousStatus = jobStatusRef.current.get(job.id);
      jobStatusRef.current.set(job.id, job.status);
      if (previousStatus === job.status) continue;
      if (!isJobFinished(job)) continue;

      const key = pathStateKey(job.destPath, jobPathCtx(job));
      if (pathStateByKeyRef.current[key] !== undefined) continue;
      void refreshPathState(job.title, job.destPath, job.id);
    }
  }, [jobs, refreshPathState]);

  const refreshLibraryScan = useCallback(
    (options?: { background?: boolean }) => {
      if (!defaultDownloadPathRef.current.trim()) {
        setLibraryScanSettled(true);
        return Promise.resolve();
      }

      const debounceMs = options?.background ? LIBRARY_SCAN_DEBOUNCE_MS : 0;

      const runScan = async () => {
        if (libraryScanInFlightRef.current) {
          libraryScanQueuedRef.current = true;
          await libraryScanInFlightRef.current;
          if (!libraryScanQueuedRef.current) return;
          libraryScanQueuedRef.current = false;
        }

        const work = (async () => {
          try {
            const items = await sourcesApi.scanDefaultDownloadPath();
            setLocalLibraryItems(items);
            await runBatchPathInspection(items, jobsRef.current, {
              onlyUnresolved: true,
            });
          } catch (error) {
            showError(formatUserError(error, t("library.readPathError")));
          } finally {
            setLibraryScanSettled(true);
          }
        })();

        libraryScanInFlightRef.current = work.finally(() => {
          libraryScanInFlightRef.current = null;
        });
        await libraryScanInFlightRef.current;

        if (libraryScanQueuedRef.current) {
          libraryScanQueuedRef.current = false;
          await runScan();
        }
      };

      if (debounceMs <= 0) {
        return runScan();
      }

      return new Promise<void>((resolve) => {
        if (libraryScanTimerRef.current != null) {
          window.clearTimeout(libraryScanTimerRef.current);
        }
        libraryScanTimerRef.current = window.setTimeout(() => {
          libraryScanTimerRef.current = null;
          void runScan().finally(resolve);
        }, debounceMs);
      });
    },
    [runBatchPathInspection, showError, t],
  );

  useEffect(() => {
    return () => {
      if (libraryScanTimerRef.current != null) {
        window.clearTimeout(libraryScanTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (activeTab !== "library") return;
    // Só ao entrar na aba — não a cada mudança de identidade do callback.
    void refreshLibraryScan({ background: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- evitar rescans por deps instáveis
  }, [activeTab]);

  const baseLibraryEntries = useMemo(() => {
    const normalizedFilter = libraryFilter.trim().toLowerCase();

    const jobPaths = new Set(
      jobs
        .filter((job) => jobBelongsInLibrary(job))
        .map((job) => resolveDeletePath(job.destPath).toLowerCase())
        .filter(Boolean),
    );

    const folderEntries: LibraryEntry[] = localLibraryItems
      .filter((item) => item.isDir)
      .filter((item) => {
        const folderPath = item.path.toLowerCase();
        if (jobPaths.has(folderPath)) return false;

        const hasRelatedLibraryJob = jobs.some(
          (job) =>
            jobBelongsInLibrary(job) &&
            (libraryTitlesMatch(job.title, item.name) ||
              activeJobBlocksLibraryFolder(
                item.path,
                job.destPath,
                defaultDownloadPath,
              )),
        );
        if (hasRelatedLibraryJob) return false;

        const TERMINAL_LIBRARY_STATUSES = new Set([
          'completed',
          'seeding',
          'extracted',
          'skipped',
          'extracting',
        ])
        const transferIncomplete = (job: {
          totalBytes?: number
          bytesDownloaded?: number
        }) => {
          const total = Number(job.totalBytes) || 0
          const done = Number(job.bytesDownloaded) || 0
          return total >= 5 * 1024 * 1024 && done < total * 0.995
        }
        const hasIncompleteJob = jobs.some((job) => {
          if (!libraryTitlesMatch(job.title, item.name)) return false;
          if (
            job.status === "cancelled" ||
            job.status === "verify_failed" ||
            job.status === "failed"
          ) {
            return false;
          }
          // Download a 100% (mesmo paused) não esconde a pasta / jogo.
          if (
            !transferIncomplete(job) &&
            (jobBelongsInLibrary(job) ||
              TERMINAL_LIBRARY_STATUSES.has(job.status) ||
              isJobFinished(job))
          ) {
            return false;
          }
          return (
            transferIncomplete(job) ||
            (!jobBelongsInLibrary(job) &&
              !TERMINAL_LIBRARY_STATUSES.has(job.status))
          );
        });
        if (hasIncompleteJob) return false;

        const blockedByActiveJob = jobs.some(
          (job) =>
            isActiveQueueJob(job) &&
            activeJobBlocksLibraryFolder(
              item.path,
              job.destPath,
              defaultDownloadPath,
            ),
        );
        return !blockedByActiveJob;
      })
      .map((item) => ({
        id: `folder-${item.path}`,
        title: item.name,
        status: "installed",
        destPath: item.path,
        kind: "folder" as const,
      }));

    const jobEntries: LibraryEntry[] = jobs
      .filter((job) => jobBelongsInLibrary(job))
      .map((job) => ({
        id: job.id,
        title: job.title,
        status: job.status,
        destPath: job.destPath,
        kind: "job" as const,
        job,
      }));

    const merged = dedupeLibraryEntries(
      [...jobEntries, ...folderEntries],
      (item) =>
        scoreLibraryEntry(item, jobs, pathStateByKey, defaultDownloadPath),
    ).filter(
      (item) =>
        !libraryGameKeyCandidates(item.title).some((key) =>
          hiddenLibraryKeys.has(key),
        ),
    );

    if (!normalizedFilter) return merged;
    return merged.filter((item) =>
      item.title.toLowerCase().includes(normalizedFilter),
    );
  }, [
    jobs,
    localLibraryItems,
    libraryFilter,
    pathStateByKey,
    hiddenLibraryKeys,
    defaultDownloadPath,
  ]);

  const filteredEntries = useMemo(
    () => sortLibraryEntries(baseLibraryEntries, librarySort),
    [baseLibraryEntries, librarySort],
  );

  const libraryItems = filteredEntries;
  const libraryReady = queueInitialized && libraryScanSettled;

  useEffect(() => {
    if (activeTab !== "library") return;
    const missing = libraryItems
      .map((item) => item.title)
      .filter((title) => {
        const resolved = resolveCover(title);
        if (resolved.coverUrl || resolved.localPath) {
          // Já resolvido — libera retry futuro se a capa for apagada.
          libraryCoverLookupAttemptedRef.current.delete(coverTitleKey(title));
          return false;
        }
        return !libraryCoverLookupAttemptedRef.current.has(coverTitleKey(title));
      });
    if (missing.length === 0) return;
    const timer = window.setTimeout(() => {
      for (const title of missing) {
        libraryCoverLookupAttemptedRef.current.add(coverTitleKey(title));
      }
      resolveCoversBatch(missing);
      // Se o batch não preencher (rede/Steam), permite nova tentativa.
      window.setTimeout(() => {
        for (const title of missing) {
          const resolved = resolveCover(title);
          if (!resolved.coverUrl && !resolved.localPath) {
            libraryCoverLookupAttemptedRef.current.delete(coverTitleKey(title));
          }
        }
      }, 8_000);
    }, LIBRARY_COVER_LOOKUP_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [activeTab, libraryItems, resolveCover, resolveCoversBatch]);

  const handlePickGameInstallFolder = useCallback(
    async (
      title: string,
      destPath: string,
      busyKey: string,
      jobId?: string,
    ) => {
      setInstallBusyId(busyKey);
      try {
        const selected = await open({
          directory: true,
          multiple: false,
          title: t("library.pickInstallFolderTitle"),
          defaultPath: destPath || defaultDownloadPath || undefined,
        });
        if (typeof selected !== "string") return;

        const state = await sourcesApi.setLibraryGameRoot(
          title,
          destPath,
          selected,
          jobId,
        );
        const cacheKey = pathStateKey(destPath, { jobId, title });
        setLibraryPathStateCacheEntry(
          cacheKey,
          state,
          defaultDownloadPathRef.current,
        );
        setPathStateByKey((prev) => ({
          ...prev,
          [cacheKey]: state,
        }));
        if (!state.hasGame) {
          showError(t("library.pickInstallFolderWarning"));
        }
      } catch (error) {
        showError(formatUserError(error, t("library.pickInstallFolderError")));
      } finally {
        setInstallBusyId(null);
      }
    },
    [defaultDownloadPath, showError, t],
  );

  const handlePickLaunchExe = useCallback(
    async (item: LibraryEntry) => {
      const busyKey = item.kind === "job" ? item.id : item.destPath;
      setInstallBusyId(busyKey);
      try {
        const selected = await open({
          multiple: false,
          title: t("library.pickLaunchExeTitle"),
          defaultPath: item.destPath || defaultDownloadPath || undefined,
          filters: [{ name: t("library.exeFilter"), extensions: ["exe"] }],
        });
        if (typeof selected !== "string") return;
        await sourcesApi.setLibraryLaunchExe(
          item.title,
          item.destPath,
          selected,
        );
        const jobId = item.kind === "job" ? item.id : undefined;
        void refreshPathState(item.title, item.destPath, jobId);
      } catch (error) {
        showError(formatUserError(error, t("library.pickLaunchExeError")));
      } finally {
        setInstallBusyId(null);
      }
    },
    [defaultDownloadPath, refreshPathState, showError, t],
  );

  const closeLibraryDetail = useCallback(() => {
    libraryDetailRequestRef.current += 1;
    setLibraryDetail(null);
  }, []);

  const openLibraryDetail = useCallback(
    (item: LibraryEntry) => {
      const requestId = ++libraryDetailRequestRef.current;
      setLibraryDetail({
        item,
        game: null,
        loading: true,
        error: null,
        options: [],
        synopsis: null,
        screenshots: [],
        note: "",
        noteSaving: false,
        busyUrl: null,
      });

      void (async () => {
        const language = isAppLanguage(i18n.language) ? i18n.language : undefined;
        try {
          const [detail, note] = await Promise.all([
            sourcesApi.getGameDetail({
              title: item.title,
              includeSteam: true,
              language,
            }),
            sourcesApi.getLibraryNote(item.destPath, item.title).catch(() => ""),
          ]);
          if (libraryDetailRequestRef.current !== requestId) return;
          if (!detail?.game) {
            setLibraryDetail({
              item,
              game: null,
              loading: false,
              error: t("gameDetail.notFound"),
              options: [],
              synopsis: null,
              screenshots: [],
              note,
              noteSaving: false,
              busyUrl: null,
            });
            return;
          }
          setLibraryDetail({
            item,
            game: detail.game,
            loading: false,
            error: null,
            options: detail.downloads ?? [],
            synopsis: detail.synopsis ?? null,
            screenshots: detail.screenshots ?? [],
            note,
            noteSaving: false,
            busyUrl: null,
          });
        } catch (error) {
          if (libraryDetailRequestRef.current !== requestId) return;
          const note = await sourcesApi
            .getLibraryNote(item.destPath, item.title)
            .catch(() => "");
          setLibraryDetail({
            item,
            game: {
              id: item.id,
              title: item.title,
              genre: "",
              source: "library",
            },
            loading: false,
            error: formatUserError(error, t("discover.detailError")),
            options: [],
            synopsis: null,
            screenshots: [],
            note,
            noteSaving: false,
            busyUrl: null,
          });
        }
      })();
    },
    [t],
  );

  const setLibraryDetailNote = useCallback((note: string) => {
    setLibraryDetail((prev) => (prev ? { ...prev, note } : prev));
  }, []);

  const saveLibraryDetailNote = useCallback(async () => {
    if (!libraryDetail) return;
    const { item, note } = libraryDetail;
    setLibraryDetail((prev) => (prev ? { ...prev, noteSaving: true } : prev));
    try {
      await sourcesApi.setLibraryNote(item.destPath, item.title, note);
    } catch (error) {
      showError(formatUserError(error, t("library.noteSaveError")));
    } finally {
      setLibraryDetail((prev) => (prev ? { ...prev, noteSaving: false } : prev));
    }
  }, [libraryDetail, showError, t]);

  const handleEnqueueFromLibraryDetail = useCallback(
    async (title: string, url: string, coverUrl?: string | null) => {
      if (!libraryDetail) return;
      setLibraryDetail((prev) => (prev ? { ...prev, busyUrl: url } : prev));
      try {
        const hasPath = defaultDownloadPath.trim().length > 0;
        const fromDb = await sourcesApi.getDefaultDownloadPath();
        if (!hasPath && !fromDb) {
          showError(t("discover.noDownloadPath"));
          return;
        }
        const destPath = defaultDownloadPath.trim() || fromDb || undefined;
        await dispatch(
          enqueueJob({
            title,
            url,
            destPath: destPath ?? undefined,
            coverUrl: coverUrl ?? undefined,
          }),
        ).unwrap();
        closeLibraryDetail();
        onGoDownloads();
      } catch (error) {
        showError(formatUserError(error, t("discover.enqueueError")));
      } finally {
        setLibraryDetail((prev) => (prev ? { ...prev, busyUrl: null } : prev));
      }
    },
    [
      closeLibraryDetail,
      defaultDownloadPath,
      dispatch,
      libraryDetail,
      onGoDownloads,
      showError,
      t,
    ],
  );

  const handlePlayLibraryItem = useCallback(async (item: LibraryEntry) => {
    const busyKey = item.kind === "job" ? item.id : item.destPath;
    setPlayBusyId(busyKey);
    try {
      const jobId = item.kind === "job" ? item.id : undefined;
      // Lançar direto pela pasta (com exe em cache) — sem esperar o sidecar.
      await sourcesApi.launchGame(item.title, item.destPath, jobId);
    } catch (launchError) {
      const message = formatLaunchError(launchError)
      if (message.trim()) showError(message)
    } finally {
      setPlayBusyId(null);
    }
  }, [showError]);

  const handleExtractItem = useCallback(
    async (item: LibraryEntry) => {
      const busyKey = item.kind === "job" ? item.id : item.destPath;
      const jobId = item.kind === "job" ? item.id : undefined;
      setInstallBusyId(busyKey);
      try {
        await sourcesApi.extractLibraryFolder(item.title, item.destPath);
        void refreshPathState(item.title, item.destPath, jobId);
      } catch (error) {
        const message = formatUserError(error);
        if (message.trim()) showError(message);
      } finally {
        setInstallBusyId(null);
      }
    },
    [refreshPathState, showError],
  );

  const handleInstallItem = useCallback(
    async (item: LibraryEntry) => {
      const busyKey = item.kind === "job" ? item.id : item.destPath;
      const jobId = item.kind === "job" ? item.id : undefined;
      const knownSetup = getPathState(
        item.destPath,
        pathStateByKeyRef.current,
        itemPathCtx(item),
      )?.installPath;
      setInstallBusyId(busyKey);
      try {
        const setupPath = await sourcesApi.launchSetup(
          item.title,
          item.destPath,
          jobId,
          knownSetup,
        );
        watchForInstalledGame(
          item.title,
          item.destPath,
          busyKey,
          setupPath,
          jobId,
        );
        void refreshPathState(item.title, item.destPath, jobId);
      } catch (error) {
        const message = formatUserError(error);
        if (message.trim()) showError(message);
        removeInstallingKey(busyKey);
      } finally {
        setInstallBusyId(null);
      }
    },
    [refreshPathState, removeInstallingKey, watchForInstalledGame, showError],
  );

  const handleDeleteLibraryItem = useCallback((item: LibraryEntry) => {
    setPendingDeleteItem(item);
  }, []);

  const handleCancelDeleteLibraryItem = useCallback(() => {
    if (deletingLibraryKey) return;
    setPendingDeleteItem(null);
  }, [deletingLibraryKey]);

  const handleConfirmDeleteLibraryItem = useCallback(async () => {
    const item = pendingDeleteItem;
    if (!item || deletingLibraryKey) return;

    const busyKey = item.kind === "job" ? item.id : item.destPath;
    setDeletingLibraryKey(busyKey);

    const hideKeys = libraryGameKeyCandidates(item.title);
    const deletePath = resolveDeletePath(item.destPath);
    const relatedJobs = findRelatedLibraryJobs(item, jobs, defaultDownloadPath);
    const watchKey = pathStateKey(item.destPath, itemPathCtx(item));
    const activeWatch = installWatchRef.current.get(watchKey);
    if (activeWatch) {
      window.clearInterval(activeWatch.intervalId);
      installWatchRef.current.delete(watchKey);
    }
    removeInstallingKey(busyKey);

    const applyDeletedLocalState = () => {
      setHiddenLibraryKeys((prev) => new Set([...prev, ...hideKeys]));
      setLocalLibraryItems((prev) =>
        prev.filter((folder) => {
          if (!folder.isDir) return true;
          if (libraryTitlesMatch(folder.name, item.title)) return false;
          if (
            resolveDeletePath(folder.path).toLowerCase() ===
            deletePath.toLowerCase()
          )
            return false;
          return !relatedJobs.some(
            (job) =>
              libraryTitlesMatch(folder.name, job.title) ||
              normalizeLibraryPath(folder.path) ===
                normalizeLibraryPath(job.destPath),
          );
        }),
      );
      for (const job of relatedJobs) {
        dispatch(removeJobLocally(job.id));
      }
      setPathStateByKey((prev) => {
        const next = { ...prev };
        for (const key of Object.keys(next)) {
          const matchesPath = key.includes(deletePath.toLowerCase());
          const matchesJob = relatedJobs.some((job) => key === `job:${job.id}`);
          if (matchesPath || matchesJob) delete next[key];
        }
        removeLibraryPathStateCacheKeys(
          (key) =>
            key.includes(deletePath.toLowerCase()) ||
            relatedJobs.some((job) => key === `job:${job.id}`),
          defaultDownloadPathRef.current,
        );
        return next;
      });
    };

    try {
      const scannedFolders =
        (await sourcesApi
          .scanDefaultDownloadPath()
          .catch(() => localLibraryItems)) ?? localLibraryItems;
      const pathsToDelete = resolveLibraryDeletePaths(
        item,
        scannedFolders,
        defaultDownloadPath,
        relatedJobs,
      );

      for (const job of relatedJobs) {
        try {
          await queueApi.removeJobFromLibrary(job.id);
        } catch {
          try {
            await dispatch(cancelJob(job.id)).unwrap();
          } catch {
            /* já removido localmente */
          }
        }
      }

      const deleteErrors: unknown[] = [];
      for (const path of pathsToDelete) {
        try {
          await sourcesApi.deleteLocalLibraryItem(path, item.title);
        } catch (error) {
          if (isBenignDeleteError(error)) continue;
          deleteErrors.push(error);
        }
      }

      // Garante limpeza na BD mesmo se a pasta já não existia / dest era a raiz.
      try {
        await sourcesApi.deleteLocalLibraryItem(item.destPath, item.title);
      } catch (error) {
        if (!isBenignDeleteError(error)) {
          deleteErrors.push(error);
        }
      }

      const scanned = await sourcesApi.scanDefaultDownloadPath();
      setLocalLibraryItems(
        scanned.filter(
          (folder) =>
            !folder.isDir || !libraryTitlesMatch(folder.name, item.title),
        ),
      );

      if (deleteErrors.length > 0) {
        if (deleteErrors.some(isFileLockDeleteError)) {
          applyDeletedLocalState();
          showError(formatLibraryDeleteError(deleteErrors));
          setPendingDeleteItem(null);
          return;
        }
        throw deleteErrors[0];
      }
      applyDeletedLocalState();
      setPendingDeleteItem(null);
    } catch (error) {
      if (isFileLockDeleteError(error)) {
        applyDeletedLocalState();
        showError(formatLibraryDeleteError([error]));
        const scanned = await sourcesApi
          .scanDefaultDownloadPath()
          .catch(() => [] as LocalLibraryItem[]);
        setLocalLibraryItems(
          scanned.filter(
            (folder) =>
              !folder.isDir || !libraryTitlesMatch(folder.name, item.title),
          ),
        );
        setPendingDeleteItem(null);
        return;
      }

      showError(formatUserError(error, t("library.deleteError")));
      void dispatch(fetchJobs());
      const scanned = await sourcesApi
        .scanDefaultDownloadPath()
        .catch(() => [] as LocalLibraryItem[]);
      setLocalLibraryItems(scanned);
      setPendingDeleteItem(null);
    } finally {
      setDeletingLibraryKey(null);
    }
  }, [
    pendingDeleteItem,
    deletingLibraryKey,
    dispatch,
    jobs,
    defaultDownloadPath,
    localLibraryItems,
    removeInstallingKey,
    showError,
    t,
  ]);

  return {
    libraryItems,
    filteredEntries,
    libraryReady,
    refreshLibraryScan,
    defaultDownloadPath,
    jobs,
    pathStateByKey,
    libraryFilter,
    librarySort,
    playBusyId,
    installBusyId,
    installingKeys,
    setLibraryFilter,
    setLibrarySort,
    onGoDownloads,
    onGoDiscover,
    resolveCover,
    invalidateLocalCover,
    handlePlayLibraryItem,
    handleInstallItem,
    handleExtractItem,
    handlePickGameInstallFolder,
    handlePickLaunchExe,
    handleDeleteLibraryItem,
    handleConfirmDeleteLibraryItem,
    handleCancelDeleteLibraryItem,
    pendingDeleteItem,
    deletingLibraryKey,
    libraryDetail,
    openLibraryDetail,
    closeLibraryDetail,
    setLibraryDetailNote,
    saveLibraryDetailNote,
    handleEnqueueFromLibraryDetail,
  };
}
