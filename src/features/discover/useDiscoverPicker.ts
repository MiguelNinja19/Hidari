import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { useTranslation } from 'react-i18next'
import { sourcesApi } from '../../shared/api/tauri/sourcesApi'
import { useToast } from '../../shared/components/ToastProvider'
import type { CatalogGame, DownloadOption } from '../../shared/types/contracts'
import { fetchDownloadOptionsForGame } from './discoverCatalogDetail'
import { applyPickerEnrichment } from './discoverPickerGame'

type PickerArgs = {
  enabledSourcesCount: number
  defaultDownloadPath: string
  setCatalogGames: Dispatch<SetStateAction<CatalogGame[]>>
}

export function useDiscoverPicker({
  enabledSourcesCount,
  defaultDownloadPath,
  setCatalogGames,
}: PickerArgs) {
  const { showError } = useToast()
  const { t, i18n } = useTranslation()
  const [game, setGame] = useState<CatalogGame | null>(null)
  const [options, setOptions] = useState<DownloadOption[]>([])
  const [synopsis, setSynopsis] = useState<string | null>(null)
  const [screenshots, setScreenshots] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestIdRef = useRef(0)

  const close = useCallback(() => {
    requestIdRef.current += 1
    setGame(null)
    setOptions([])
    setSynopsis(null)
    setScreenshots([])
    setError(null)
    setLoading(false)
  }, [])

  const reportError = useCallback(
    (message: string) => {
      setError(message)
      showError(message)
    },
    [showError],
  )

  const open = useCallback(
    (selected: CatalogGame) => {
      const requestId = ++requestIdRef.current
      const isCurrent = () => requestIdRef.current === requestId
      setGame(selected)
      setOptions([])
      setSynopsis(null)
      setScreenshots([])
      setError(null)
      setLoading(true)

      void (async () => {
        if (enabledSourcesCount === 0) {
          reportError(t('discover.noActiveSourcesPick'))
          setLoading(false)
          return
        }
        const hasPath =
          defaultDownloadPath.trim().length > 0 ||
          (await sourcesApi.getDefaultDownloadPath())
        if (!isCurrent()) return
        if (!hasPath) {
          reportError(t('discover.noDownloadPath'))
          setLoading(false)
          return
        }
        try {
          const detail = await fetchDownloadOptionsForGame(selected, i18n.language)
          if (!isCurrent()) return
          setOptions(detail.downloadable)
          setSynopsis(detail.synopsis)
          setScreenshots(detail.screenshots)
          if (!detail.enrichedGame) return
          applyPickerEnrichment(
            selected,
            detail.enrichedGame,
            detail.screenshots,
            setGame,
            setCatalogGames,
          )
        } catch {
          if (isCurrent()) reportError(t('discover.pickFetchError'))
        } finally {
          if (isCurrent()) setLoading(false)
        }
      })()
    },
    [defaultDownloadPath, enabledSourcesCount, i18n.language, reportError, setCatalogGames, t],
  )

  return { game, options, synopsis, screenshots, loading, error, open, close }
}
