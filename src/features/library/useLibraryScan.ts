import { useCallback, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { sourcesApi } from '../../shared/api/tauri/sourcesApi'
import { LIBRARY_SCAN_DEBOUNCE_MS } from '../../shared/config/polling'
import type { DownloadJob, LocalLibraryItem } from '../../shared/types/contracts'
import { formatUserError } from '../../shared/utils/formatUserError'
import { useToast } from '../../shared/components/ToastProvider'
import type { NavTab } from '../../layout/types'
import type { LocalItemsSetter, StringRef } from './libraryControllerTypes'

type Args = {
  activeTab: NavTab
  defaultDownloadPathRef: StringRef
  jobsRef: React.MutableRefObject<DownloadJob[]>
  setLocalLibraryItems: LocalItemsSetter
  setLibraryScanSettled: React.Dispatch<React.SetStateAction<boolean>>
  inspect: (
    items: LocalLibraryItem[],
    jobs: DownloadJob[],
    options?: { onlyUnresolved?: boolean },
  ) => Promise<void>
}

export function useLibraryScan(args: Args) {
  const { showError } = useToast()
  const { t } = useTranslation()
  const inFlightRef = useRef<Promise<void> | null>(null)
  const queuedRef = useRef(false)
  const timerRef = useRef<number | null>(null)

  const refreshLibraryScan = useCallback(
    (options?: { background?: boolean }) => {
      const runScan = async (): Promise<void> => {
        if (inFlightRef.current) {
          queuedRef.current = true
          await inFlightRef.current
          if (!queuedRef.current) return
          queuedRef.current = false
        }
        const work = (async () => {
          try {
            const items = await sourcesApi.scanDefaultDownloadPath()
            args.setLocalLibraryItems(items)
            await args.inspect(items, args.jobsRef.current, {
              // Sempre só unresolved no scan da aba/watch — evita re-varrer pastas já resolvidas.
              onlyUnresolved: true,
            })
          } catch (error) {
            showError(formatUserError(error, t('library.readPathError')))
          } finally {
            args.setLibraryScanSettled(true)
          }
        })()
        inFlightRef.current = work.finally(() => void (inFlightRef.current = null))
        await inFlightRef.current
        if (queuedRef.current) {
          queuedRef.current = false
          await runScan()
        }
      }
      if (!options?.background) return runScan()
      return new Promise<void>((resolve) => {
        if (timerRef.current != null) window.clearTimeout(timerRef.current)
        timerRef.current = window.setTimeout(() => {
          timerRef.current = null
          void runScan().finally(resolve)
        }, LIBRARY_SCAN_DEBOUNCE_MS)
      })
    },
    [args, showError, t],
  )

  useEffect(
    () => () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current)
    },
    [],
  )
  useEffect(() => {
    if (args.activeTab !== 'library') return
    void refreshLibraryScan({ background: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só ao entrar na aba
  }, [args.activeTab])

  return refreshLibraryScan
}
