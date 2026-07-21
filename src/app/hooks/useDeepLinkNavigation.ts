import { useEffect, useRef } from 'react'
import { sourcesApi } from '../../shared/api/tauri/sourcesApi'
import { tauriClient } from '../../shared/api/tauri/client'
import { formatLaunchError } from '../../shared/utils/launchErrors'
import type { DeepLinkPayload, GetGameDetailInput } from '../../shared/types/contracts'

type UseDeepLinkNavigationArgs = {
  onNavigateDiscover: () => void
  onNavigateLibrary: () => void
  applyDiscoverSearch: (query: string) => void
  openGameDetail: (input: GetGameDetailInput) => void
  showError: (message: string) => void
}

/** Reage a `app://deep-link` (pesquisa, jogo, launch via atalho). */
export function useDeepLinkNavigation({
  onNavigateDiscover,
  onNavigateLibrary,
  applyDiscoverSearch,
  openGameDetail,
  showError,
}: UseDeepLinkNavigationArgs) {
  const lastUrlRef = useRef<string | null>(null)

  useEffect(() => {
    let unlisten: (() => void) | undefined
    let cancelled = false

    const handlePayload = (payload: DeepLinkPayload) => {
      const url = payload.url?.trim()
      if (url && lastUrlRef.current === url) return
      if (url) lastUrlRef.current = url

      const action = payload.action?.trim().toLowerCase()
      const title = payload.title?.trim()
      const path = payload.path?.trim()

      if (action === 'launch' && title && path) {
        onNavigateLibrary()
        void sourcesApi
          .launchGame(title, path)
          .catch((error: unknown) => {
            const message = formatLaunchError(error)
            if (message.trim()) showError(message)
          })
        return
      }

      onNavigateDiscover()

      const searchQuery = payload.searchQuery?.trim()
      if (searchQuery) {
        applyDiscoverSearch(searchQuery)
      }

      const groupKey = payload.groupKey?.trim()
      if (groupKey || title) {
        openGameDetail({
          groupKey: groupKey || undefined,
          title: title || undefined,
        })
      }
    }

    void tauriClient
      .listenDeepLink(handlePayload)
      .then(async (fn) => {
        if (cancelled) {
          fn()
          return
        }
        unlisten = fn
        try {
          const pending = await sourcesApi.takePendingDeepLink()
          if (!cancelled && pending) handlePayload(pending)
        } catch {
          // Ignorar se o comando não existir em builds antigos.
        }
      })

    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [
    onNavigateDiscover,
    onNavigateLibrary,
    openGameDetail,
    applyDiscoverSearch,
    showError,
  ])
}
