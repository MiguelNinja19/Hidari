import type { AppDispatch } from '../../app/store'
import { queueApi } from '../../shared/api/tauri/queueApi'
import { sourcesApi } from '../../shared/api/tauri/sourcesApi'
import type { DownloadJob, LocalLibraryItem } from '../../shared/types/contracts'
import {
  isBenignDeleteError,
  resolveLibraryDeletePaths,
} from '../../shared/utils/libraryDelete'
import { cancelJob } from '../queue/queueSlice'
import type { LibraryEntry } from './types'

type Args = {
  item: LibraryEntry
  relatedJobs: DownloadJob[]
  localLibraryItems: LocalLibraryItem[]
  defaultDownloadPath: string
  dispatch: AppDispatch
  onUninstallError: (error: unknown) => void
}

async function removeRelatedJobs(jobs: DownloadJob[], dispatch: AppDispatch) {
  for (const job of jobs) {
    try {
      await queueApi.removeJobFromLibrary(job.id)
    } catch {
      try {
        await dispatch(cancelJob(job.id)).unwrap()
      } catch {
        // já removido localmente
      }
    }
  }
}

async function deletePaths(paths: string[], title: string) {
  const errors: unknown[] = []
  for (const path of paths) {
    try {
      await sourcesApi.deleteLocalLibraryItem(path, title)
    } catch (error) {
      if (!isBenignDeleteError(error)) errors.push(error)
    }
  }
  return errors
}

export async function executeLibraryDelete(args: Args) {
  const { item } = args

  // Jogos externos: só tirar da biblioteca Hidari (não desinstalar no Steam/disco).
  if (item.external) {
    const errors: unknown[] = []
    try {
      await sourcesApi.deleteLocalLibraryItem(item.destPath, item.title)
    } catch (error) {
      if (!isBenignDeleteError(error)) errors.push(error)
    }
    const scanned = await sourcesApi.scanDefaultDownloadPath()
    return { errors, scanned }
  }

  // Sempre tenta desinstalar do sistema (unins.exe); se não houver pasta, é no-op.
  try {
    await sourcesApi.uninstallLibraryItem(
      item.title,
      item.destPath,
      item.kind === 'job' ? item.id : undefined,
    )
  } catch (error) {
    args.onUninstallError(error)
  }
  const folders = await sourcesApi.scanDefaultDownloadPath()
    .catch(() => args.localLibraryItems)
  const paths = resolveLibraryDeletePaths(
    item,
    folders ?? args.localLibraryItems,
    args.defaultDownloadPath,
    args.relatedJobs,
  )
  await removeRelatedJobs(args.relatedJobs, args.dispatch)
  const errors = await deletePaths(paths, item.title)
  try {
    await sourcesApi.deleteLocalLibraryItem(item.destPath, item.title)
  } catch (error) {
    if (!isBenignDeleteError(error)) errors.push(error)
  }
  const scanned = await sourcesApi.scanDefaultDownloadPath()
  return { errors, scanned }
}
