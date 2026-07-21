import type { MutableRefObject } from 'react'
import { sourcesApi } from '../../shared/api/tauri/sourcesApi'
import {
  LIBRARY_INSPECT_BATCH_PAUSE_MS,
  LIBRARY_INSPECT_BATCH_SIZE,
} from '../../shared/config/polling'
import type { DownloadJob, LocalLibraryItem } from '../../shared/types/contracts'
import { emptyPathState } from './libraryEntryHelpers'
import { jobPathCtx, pathStateKey } from './libraryItemState'
import { mergeLibraryPathStateCache } from './libraryPathStateCache'
import type { PathStateMap, PathStateSetter, StringRef } from './libraryControllerTypes'

type InspectionRefs = {
  defaultDownloadPathRef: StringRef
  pathStateByKeyRef: MutableRefObject<PathStateMap>
  setPathStateByKey: PathStateSetter
}

export async function inspectLibraryPaths(
  folderItems: LocalLibraryItem[],
  jobs: DownloadJob[],
  refs: InspectionRefs,
  options?: { onlyUnresolved?: boolean; isCancelled?: () => boolean },
) {
  const onlyUnresolved = options?.onlyUnresolved === true
  const isCancelled = options?.isCancelled ?? (() => false)
  const candidates = new Map<
    string,
    { title: string; path: string; jobId?: string }
  >()

  for (const job of jobs) {
    const key = pathStateKey(job.destPath, jobPathCtx(job))
    if (!job.destPath.trim()) continue
    if (onlyUnresolved && refs.pathStateByKeyRef.current[key] !== undefined) continue
    candidates.set(key, { title: job.title, path: job.destPath, jobId: job.id })
  }
  for (const item of folderItems) {
    // Pastas + atalhos/exe importados (dest_path = ficheiro).
    const lower = item.path.toLowerCase()
    const isShortcutFile =
      !item.isDir &&
      (lower.endsWith('.url') || lower.endsWith('.lnk') || lower.endsWith('.exe'))
    if (!item.isDir && !isShortcutFile) continue
    const key = pathStateKey(item.path, { title: item.name })
    if (candidates.has(key)) continue
    if (onlyUnresolved && refs.pathStateByKeyRef.current[key] !== undefined) continue
    candidates.set(key, { title: item.name, path: item.path })
  }
  const entries = [...candidates].map(([key, value]) => ({ key, ...value }))
  if (entries.length === 0 || isCancelled()) return

  for (let index = 0; index < entries.length; index += LIBRARY_INSPECT_BATCH_SIZE) {
    if (isCancelled()) return
    if (index > 0) {
      await new Promise<void>((resolve) =>
        window.setTimeout(resolve, LIBRARY_INSPECT_BATCH_PAUSE_MS),
      )
      await new Promise<void>((resolve) =>
        window.requestAnimationFrame(() => resolve()),
      )
    }
    const chunk = entries.slice(index, index + LIBRARY_INSPECT_BATCH_SIZE)
    const merged: PathStateMap = {}
    try {
      for (const item of await sourcesApi.inspectLibraryPaths(chunk)) {
        merged[item.key] = item.state
      }
    } catch {
      for (const item of chunk) merged[item.key] = emptyPathState()
    }
    if (isCancelled()) return
    mergeLibraryPathStateCache(merged, refs.defaultDownloadPathRef.current)
    refs.setPathStateByKey((prev) => ({ ...prev, ...merged }))
  }
}
