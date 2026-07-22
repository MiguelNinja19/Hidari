import { useCallback, useEffect, useMemo } from 'react'
import type { TFunction } from 'i18next'
import { useAppDispatch } from '../../app/hooks'
import { sourcesApi } from '../../shared/api/tauri/sourcesApi'
import type { CatalogGame, FavoriteCatalogEntry } from '../../shared/types/contracts'
import { formatUserError } from '../../shared/utils/formatUserError'
import { enqueueJob } from '../queue/queueSlice'
import { favoriteToCatalogGame } from './favoritePageModels'
import { useFavoriteDetail } from './useFavoriteDetail'

type Args = {
  active: boolean
  entries: FavoriteCatalogEntry[]
  loading: boolean
  defaultDownloadPath: string
  navigateDownloads: () => void
  showError: (message: string) => void
  refreshFavorites: () => Promise<void>
  isBusy: (game: CatalogGame) => boolean
  toggleFavorite: (game: CatalogGame) => Promise<boolean | null>
  resolveCoversBatch: (titles: string[]) => void
  t: TFunction
}

export function useFavoritesPage(args: Args) {
  const dispatch = useAppDispatch()
  const detailState = useFavoriteDetail(args.t)

  useEffect(() => {
    if (!args.active || detailState.detail) return
    void args.refreshFavorites()
  }, [args.active, args.refreshFavorites, detailState.detail])

  const games = useMemo(() => args.entries.map(favoriteToCatalogGame), [args.entries])
  useEffect(() => {
    if (games.length > 0) args.resolveCoversBatch(games.slice(0, 24).map((game) => game.title))
  }, [args.resolveCoversBatch, games])

  const toggle = useCallback(async (game: CatalogGame, closeIfRemoved = false) => {
    if (args.isBusy(game)) return
    const next = await args.toggleFavorite(game)
    if (next === false && closeIfRemoved) detailState.closeDetail()
  }, [args.isBusy, args.toggleFavorite, detailState.closeDetail])

  const download = useCallback(async (title: string, url: string, coverUrl?: string | null) => {
    const detail = detailState.detail
    if (!detail) return
    detailState.setDetail((prev) => prev ? { ...prev, busyUrl: url } : prev)
    try {
      const fromDb = await sourcesApi.getDefaultDownloadPath()
      if (!args.defaultDownloadPath.trim() && !fromDb) {
        args.showError(args.t('discover.noDownloadPath'))
        return
      }
      await dispatch(enqueueJob({
        title,
        url,
        destPath: args.defaultDownloadPath.trim() || fromDb || undefined,
        coverUrl: coverUrl ?? detail.game.coverUrl ?? undefined,
      })).unwrap()
      detailState.closeDetail()
      args.navigateDownloads()
    } catch (error) {
      args.showError(formatUserError(error, args.t('discover.enqueueError')))
    } finally {
      detailState.setDetail((prev) => prev ? { ...prev, busyUrl: null } : prev)
    }
  }, [args.defaultDownloadPath, args.navigateDownloads, args.showError, args.t, detailState, dispatch])

  return {
    entries: args.entries,
    games,
    loading: args.loading,
    ...detailState,
    toggle,
    download,
  }
}
