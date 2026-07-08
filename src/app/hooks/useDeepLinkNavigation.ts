import { useEffect } from 'react'
import { tauriClient } from '../../shared/api/tauri/client'
import type { GetGameDetailInput } from '../../shared/types/contracts'

type UseDeepLinkNavigationArgs = {
  onNavigateDiscover: () => void
  setDiscoverSearch: (query: string) => void
  openGameDetail: (input: GetGameDetailInput) => void
}

/** Reage a `app://deep-link` (pesquisa, jogo, ação). */
export function useDeepLinkNavigation({
  onNavigateDiscover,
  setDiscoverSearch,
  openGameDetail,
}: UseDeepLinkNavigationArgs) {
  useEffect(() => {
    let unlisten: (() => void) | undefined

    void tauriClient
      .listenDeepLink((payload) => {
        onNavigateDiscover()

        const searchQuery = payload.searchQuery?.trim()
        if (searchQuery) {
          setDiscoverSearch(searchQuery)
        }

        const groupKey = payload.groupKey?.trim()
        const title = payload.title?.trim()
        if (groupKey || title) {
          openGameDetail({
            groupKey: groupKey || undefined,
            title: title || undefined,
          })
        }

        const action = payload.action?.trim().toLowerCase()
        if (action === 'search' && searchQuery) {
          return
        }
      })
      .then((fn) => {
        unlisten = fn
      })

    return () => {
      unlisten?.()
    }
  }, [onNavigateDiscover, openGameDetail, setDiscoverSearch])
}
