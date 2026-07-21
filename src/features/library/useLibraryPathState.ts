import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { sourcesApi } from '../../shared/api/tauri/sourcesApi'
import type { DownloadJob, LocalLibraryItem } from '../../shared/types/contracts'
import { formatUserError } from '../../shared/utils/formatUserError'
import { useToast } from '../../shared/components/ToastProvider'
import { isJobFinished } from './libraryItemState'
import {
  clearLibraryPathStateCache,
  hydrateLibraryPathStateCache,
} from './libraryPathStateCache'
import { normalizeDownloadPath } from './libraryEntryHelpers'
import { inspectLibraryPaths } from './libraryPathInspection'
import type { PathStateMap } from './libraryControllerTypes'
import { useLibraryInstallWatch } from './useLibraryInstallWatch'
export function useLibraryPathState(
  defaultDownloadPath: string,
  jobs: DownloadJob[],
) {
  const { showError } = useToast()
  const { t } = useTranslation()
  const [pathStateByKey, setPathStateByKey] = useState<PathStateMap>({})
  const [localLibraryItems, setLocalLibraryItems] = useState<LocalLibraryItem[]>([])
  const [libraryScanSettled, setLibraryScanSettled] = useState(false)
  const pathStateByKeyRef = useRef(pathStateByKey)
  const jobsRef = useRef(jobs)
  const defaultDownloadPathRef = useRef(defaultDownloadPath)
  const knownDownloadPathRef = useRef('')
  const jobStatusRef = useRef<Map<string, string>>(new Map())
  const installWatch = useLibraryInstallWatch({
    defaultDownloadPathRef,
    setPathStateByKey,
  })
  useEffect(() => void (pathStateByKeyRef.current = pathStateByKey), [pathStateByKey])
  useEffect(() => void (jobsRef.current = jobs), [jobs])
  useEffect(
    () => void (defaultDownloadPathRef.current = defaultDownloadPath),
    [defaultDownloadPath],
  )
  const runBatchPathInspection = useCallback(
    (
      items: LocalLibraryItem[],
      jobList: DownloadJob[],
      options?: { onlyUnresolved?: boolean; isCancelled?: () => boolean },
    ) =>
      inspectLibraryPaths(
        items,
        jobList,
        { defaultDownloadPathRef, pathStateByKeyRef, setPathStateByKey },
        options,
      ),
    [],
  )
  const inspectAllLibraryPaths = useCallback(async () => {
    if (!defaultDownloadPathRef.current.trim()) {
      setLibraryScanSettled(true)
      return
    }
    try {
      const items = await sourcesApi.scanDefaultDownloadPath()
      setLocalLibraryItems(items)
      const hasCachedStates = Object.keys(pathStateByKeyRef.current).length > 0
      await runBatchPathInspection(items, jobsRef.current, {
        // Com cache hidratado: só paths novos. Sem cache: inspect completo uma vez.
        onlyUnresolved: hasCachedStates,
      })
    } catch (error) {
      showError(formatUserError(error, t('library.verifyPathError')))
    } finally {
      setLibraryScanSettled(true)
    }
  }, [runBatchPathInspection, showError, t])
  useEffect(() => {
    const path = defaultDownloadPath.trim()
    if (!path) return
    const normalized = normalizeDownloadPath(path)
    if (!knownDownloadPathRef.current) {
      setPathStateByKey({ ...hydrateLibraryPathStateCache(path) })
    } else if (knownDownloadPathRef.current !== normalized) {
      clearLibraryPathStateCache()
      setPathStateByKey({})
    } else return
    knownDownloadPathRef.current = normalized
    void inspectAllLibraryPaths()
  }, [defaultDownloadPath, inspectAllLibraryPaths])
  useEffect(() => {
    for (const job of jobs) {
      const previous = jobStatusRef.current.get(job.id)
      jobStatusRef.current.set(job.id, job.status)
      if (previous === job.status || !isJobFinished(job)) continue
      // Sempre reinspecionar no finish — estado pré-install/extract pode estar stale.
      void installWatch.refreshPathState(job.title, job.destPath, job.id)
    }
  }, [installWatch.refreshPathState, jobs])
  return {
    pathStateByKey, setPathStateByKey, pathStateByKeyRef,
    localLibraryItems, setLocalLibraryItems,
    libraryScanSettled, setLibraryScanSettled,
    jobsRef, defaultDownloadPathRef, runBatchPathInspection, installWatch,
  }
}
