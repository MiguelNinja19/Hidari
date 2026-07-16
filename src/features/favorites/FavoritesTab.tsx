import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppDispatch } from '../../app/hooks'
import { useAppSettings } from '../../app/context/AppSettingsContext'
import { useNavigation } from '../../app/context/NavigationContext'
import { CoversProvider, useCovers } from '../covers/CoversProvider'
import { CoverWarmGridItem } from '../covers/CoverWarmGridItem'
import { DiscoverGameCard } from '../discover/DiscoverGameCard'
import { DiscoverGameDetailPage } from '../discover/DiscoverGameDetailPage'
import { CatalogCover } from '../../shared/components/CatalogCover'
import { sourcesApi } from '../../shared/api/tauri/sourcesApi'
import { enqueueJob } from '../queue/queueSlice'
import { formatUserError } from '../../shared/utils/formatUserError'
import { useToast } from '../../shared/components/ToastProvider'
import { catalogGameDisplayTitle } from '../../shared/utils/normalizeTitleKey'
import {
  favoriteCatalogKeyForEntry,
  favoriteCatalogKeyForGame,
  isUsableFavoriteCatalogKey,
} from '../../shared/utils/favoriteCatalogKey'
import { isAppLanguage } from '../../shared/config/locale'
import i18n from '../../shared/i18n'
import type {
  CatalogGame,
  DownloadOption,
  FavoriteCatalogEntry,
} from '../../shared/types/contracts'

const SKELETON_COUNT = 12

function favoriteToCatalogGame(entry: FavoriteCatalogEntry): CatalogGame {
  const catalogKey = favoriteCatalogKeyForEntry(entry.title, entry.catalogKey)
  return {
    id: catalogKey,
    title: entry.title,
    genre: '',
    source: 'favorite',
    groupKey: isUsableFavoriteCatalogKey(catalogKey) ? catalogKey : null,
  }
}

type DetailState = {
  game: CatalogGame
  loading: boolean
  error: string | null
  options: DownloadOption[]
  synopsis: string | null
  screenshots: string[]
  busyUrl: string | null
}

function FavoritesPageInner({ active }: { active: boolean }) {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const { defaultDownloadPath } = useAppSettings()
  const { navigateDownloads } = useNavigation()
  const { showError } = useToast()
  const { resolveCover, warmCover, invalidateLocalCover, resolveCoversBatch } = useCovers()

  const [entries, setEntries] = useState<FavoriteCatalogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState<DetailState | null>(null)
  const [favorite, setFavorite] = useState(true)
  const [favoriteBusy, setFavoriteBusy] = useState(false)
  const requestIdRef = useRef(0)

  const refreshList = useCallback(async () => {
    setLoading(true)
    try {
      const rows = await sourcesApi.listFavoriteCatalogEntries()
      setEntries(rows)
    } catch (error) {
      setEntries([])
      showError(formatUserError(error, t('discover.favoriteError')))
    } finally {
      setLoading(false)
    }
  }, [showError, t])

  useEffect(() => {
    if (!active || detail) return
    void refreshList()
  }, [active, detail, refreshList])

  const games = useMemo(() => entries.map(favoriteToCatalogGame), [entries])

  useEffect(() => {
    if (games.length === 0) return
    resolveCoversBatch(games.slice(0, 24).map((game) => game.title))
  }, [games, resolveCoversBatch])

  const onNeedsCover = useCallback(
    (title: string) => {
      resolveCoversBatch([title])
    },
    [resolveCoversBatch],
  )

  const openDetail = useCallback(
    (entry: FavoriteCatalogEntry) => {
      const stub = favoriteToCatalogGame(entry)
      const requestId = ++requestIdRef.current
      setDetail({
        game: stub,
        loading: true,
        error: null,
        options: [],
        synopsis: null,
        screenshots: [],
        busyUrl: null,
      })
      setFavorite(true)

      const language = isAppLanguage(i18n.language) ? i18n.language : undefined
      const groupKey = favoriteCatalogKeyForEntry(entry.title, entry.catalogKey)
      void sourcesApi
        .getGameDetail({
          title: entry.title,
          groupKey: isUsableFavoriteCatalogKey(groupKey) ? groupKey : undefined,
          includeSteam: true,
          language,
        })
        .then((payload) => {
          if (requestIdRef.current !== requestId) return
          setDetail({
            game: payload.game,
            loading: false,
            error: null,
            options: payload.downloads ?? [],
            synopsis: payload.synopsis ?? null,
            screenshots: payload.screenshots ?? [],
            busyUrl: null,
          })
          if (payload.game.coverUrl) {
            warmCover(payload.game.title, payload.game.coverUrl)
          }
        })
        .catch((error) => {
          if (requestIdRef.current !== requestId) return
          setDetail({
            game: stub,
            loading: false,
            error: formatUserError(error, t('discover.detailError')),
            options: [],
            synopsis: null,
            screenshots: [],
            busyUrl: null,
          })
        })
    },
    [t, warmCover],
  )

  const closeDetail = useCallback(() => {
    requestIdRef.current += 1
    setDetail(null)
  }, [])

  const handleToggleFavorite = useCallback(async () => {
    if (!detail?.game || favoriteBusy) return
    setFavoriteBusy(true)
    try {
      const next = await sourcesApi.toggleFavoriteCatalogEntry(
        detail.game.title,
        favoriteCatalogKeyForGame(detail.game),
      )
      setFavorite(next)
      await refreshList()
      if (!next) closeDetail()
    } catch (error) {
      showError(formatUserError(error, t('discover.favoriteError')))
    } finally {
      setFavoriteBusy(false)
    }
  }, [closeDetail, detail?.game, favoriteBusy, refreshList, showError, t])

  const handleDownload = useCallback(
    async (title: string, url: string, coverUrl?: string | null) => {
      if (!detail) return
      setDetail((prev) => (prev ? { ...prev, busyUrl: url } : prev))
      try {
        const hasPath = defaultDownloadPath.trim().length > 0
        const fromDb = await sourcesApi.getDefaultDownloadPath()
        if (!hasPath && !fromDb) {
          showError(t('discover.noDownloadPath'))
          return
        }
        const destPath = defaultDownloadPath.trim() || fromDb || undefined
        const resolvedCover = coverUrl ?? detail.game.coverUrl ?? null
        await dispatch(
          enqueueJob({
            title,
            url,
            destPath: destPath ?? undefined,
            coverUrl: resolvedCover ?? undefined,
          }),
        ).unwrap()
        closeDetail()
        navigateDownloads()
      } catch (error) {
        showError(formatUserError(error, t('discover.enqueueError')))
      } finally {
        setDetail((prev) => (prev ? { ...prev, busyUrl: null } : prev))
      }
    },
    [closeDetail, defaultDownloadPath, detail, dispatch, navigateDownloads, showError, t],
  )

  if (detail) {
    return (
      <DiscoverGameDetailPage
        game={detail.game}
        loading={detail.loading}
        error={detail.error}
        options={detail.options}
        synopsis={detail.synopsis}
        screenshots={detail.screenshots}
        busyUrl={detail.busyUrl}
        favorite={favorite}
        favoriteBusy={favoriteBusy}
        onToggleFavorite={() => void handleToggleFavorite()}
        onBack={closeDetail}
        onDownload={handleDownload}
      />
    )
  }

  return (
    <section className="browse-page">
      {loading ? (
        <ul className="discover-grid discover-grid--skeleton" aria-hidden="true">
          {Array.from({ length: SKELETON_COUNT }, (_, index) => (
            <li key={index} className="discover-grid__item">
              <article className="discover-card discover-card--explore discover-card--skeleton">
                <div className="discover-card__panel">
                  <div className="discover-card__cover--skeleton skeleton-pulse" />
                </div>
              </article>
            </li>
          ))}
        </ul>
      ) : null}

      {!loading && games.length === 0 ? (
        <div className="favorites-empty" role="status">
          <p className="favorites-empty__label">{t('favorites.empty')}</p>
        </div>
      ) : null}

      {!loading && games.length > 0 ? (
        <ul className="discover-grid" role="list" aria-label={t('nav.favorites')}>
          {games.map((game, index) => {
            const cover = resolveCover(game.title, game.coverUrl, game.localCoverPath)
            const itemCoverUrl = game.coverUrl?.trim() || cover.coverUrl
            const itemLocalPath = cover.localPath || game.localCoverPath?.trim() || null
            const displayTitle = catalogGameDisplayTitle(game.title)
            const hasCover =
              cover.status !== 'error' && Boolean(itemLocalPath || itemCoverUrl)

            return (
              <CoverWarmGridItem
                key={game.id}
                title={game.title}
                coverUrl={itemCoverUrl}
                warmCover={warmCover}
                onNeedsCover={onNeedsCover}
                className="discover-grid__item"
              >
                <DiscoverGameCard
                  title={displayTitle}
                  titleAttr={game.title}
                  genre=""
                  showTitle={!hasCover}
                  cover={
                    <CatalogCover
                      title={game.title}
                      coverUrl={itemCoverUrl}
                      localPath={itemLocalPath}
                      cached={Boolean(itemLocalPath)}
                      status={cover.status}
                      priority={index < 8}
                      onLocalCoverError={() =>
                        invalidateLocalCover(game.title, itemCoverUrl ?? game.coverUrl)
                      }
                    />
                  }
                  actionLabel={t('discover.viewSources')}
                  onOpen={() =>
                    openDetail({
                      catalogKey: game.id,
                      title: game.title,
                      addedAt: '',
                    })
                  }
                />
              </CoverWarmGridItem>
            )
          })}
        </ul>
      ) : null}
    </section>
  )
}

export function FavoritesTab() {
  const { activeTab } = useNavigation()
  return (
    <CoversProvider catalogGames={[]} eager>
      <FavoritesPageInner active={activeTab === 'favorites'} />
    </CoversProvider>
  )
}
