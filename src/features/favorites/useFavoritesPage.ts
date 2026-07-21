import { useCallback, useEffect, useMemo, useState } from 'react'
import type { TFunction } from 'i18next'
import { useAppDispatch } from '../../app/hooks'
import { sourcesApi } from '../../shared/api/tauri/sourcesApi'
import type { CatalogGame, FavoriteCatalogEntry } from '../../shared/types/contracts'
import { formatUserError } from '../../shared/utils/formatUserError'
import { enqueueJob } from '../queue/queueSlice'
import { favoriteToCatalogGame, sameFavoriteGame } from './favoritePageModels'
import { useFavoriteDetail } from './useFavoriteDetail'

type Args = {
  active: boolean
  defaultDownloadPath: string
  navigateDownloads: () => void
  showError: (message: string) => void
  refreshFavoriteIndex: () => Promise<void>
  isBusy: (game: CatalogGame) => boolean
  toggleFavorite: (game: CatalogGame) => Promise<boolean | null>
  resolveCoversBatch: (titles: string[]) => void
  t: TFunction
}

export function useFavoritesPage(args: Args) {
  const dispatch = useAppDispatch()
  const [entries, setEntries] = useState<FavoriteCatalogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const detailState = useFavoriteDetail(args.t)
  const refreshList = useCallback(async () => {
    setLoading(true)
    try {
      setEntries(await sourcesApi.listFavoriteCatalogEntries())
    } catch (error) {
      setEntries([])
      args.showError(formatUserError(error, args.t('discover.favoriteError')))
    } finally {
      setLoading(false)
    }
  }, [args.showError, args.t])
  useEffect(() => {
    if (!args.active || detailState.detail) return
    void refreshList()
    void args.refreshFavoriteIndex()
  }, [args.active, args.refreshFavoriteIndex, detailState.detail, refreshList])

  const games = useMemo(() => entries.map(favoriteToCatalogGame), [entries])
  useEffect(() => {
    if (games.length > 0) args.resolveCoversBatch(games.slice(0, 24).map((game) => game.title))
  }, [args.resolveCoversBatch, games])

  const toggle = useCallback(async (game: CatalogGame, closeIfRemoved = false) => {
    if (args.isBusy(game)) return
    const next = await args.toggleFavorite(game)
    if (next === false) {
      setEntries((prev) => prev.filter((entry) => !sameFavoriteGame(entry, game)))
      if (closeIfRemoved) detailState.closeDetail()
    }
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

  return { entries, games, loading, ...detailState, toggle, download }
}
