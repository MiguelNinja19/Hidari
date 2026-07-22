import { useCallback, useRef, useState } from 'react'
import type { TFunction } from 'i18next'
import { sourcesApi } from '../../shared/api/tauri/sourcesApi'
import { isAppLanguage } from '../../shared/config/locale'
import i18n from '../../shared/i18n'
import type { CatalogGame, FavoriteCatalogEntry } from '../../shared/types/contracts'
import { favoriteCatalogKeyForEntry, isUsableFavoriteCatalogKey } from '../../shared/utils/favoriteCatalogKey'
import { formatUserError } from '../../shared/utils/formatUserError'
import { favoriteToCatalogGame, type FavoriteDetailState } from './favoritePageModels'

export function useFavoriteDetail(t: TFunction) {
  const [detail, setDetail] = useState<FavoriteDetailState | null>(null)
  const requestIdRef = useRef(0)

  const openDetail = useCallback((entry: FavoriteCatalogEntry) => {
    const stub = favoriteToCatalogGame(entry)
    const requestId = ++requestIdRef.current
    setDetail({
      game: stub, loading: true, error: null, options: [],
      synopsis: null, screenshots: [], busyUrl: null,
    })
    const language = isAppLanguage(i18n.language) ? i18n.language : undefined
    const groupKey = favoriteCatalogKeyForEntry(entry.title, entry.catalogKey)
    void sourcesApi.getGameDetail({
      title: entry.title,
      groupKey: isUsableFavoriteCatalogKey(groupKey) ? groupKey : undefined,
      includeSteam: true,
      language,
    }).then((payload) => {
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
    }).catch((error) => {
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
  }, [t])

  const closeDetail = useCallback(() => {
    requestIdRef.current += 1
    setDetail(null)
  }, [])
  const openGame = useCallback((game: CatalogGame) => {
    openDetail({
      catalogKey: game.groupKey?.trim() || game.id,
      title: game.title,
      addedAt: '',
    })
  }, [openDetail])

  return { detail, setDetail, openDetail, openGame, closeDetail }
}
