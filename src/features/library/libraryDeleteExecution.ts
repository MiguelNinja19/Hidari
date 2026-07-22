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

export type LibraryDeleteResult = {
  errors: unknown[]
  scanned: LocalLibraryItem[]
  /** Uninstall cancelado/falhou — biblioteca e pastas não foram alteradas. */
  aborted: boolean
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

export async function executeLibraryDelete(args: Args): Promise<LibraryDeleteResult> {
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
    return { errors, scanned, aborted: false }
  }

  const jobId = item.kind === 'job' ? item.id : undefined

  // Se houver instalação no sistema, o uninstaller tem de concluir.
  // Cancelar / falhar → abortar: o jogo mantém-se na biblioteca e no disco.
  try {
    const installedBefore = await sourcesApi.getLibraryInstalledLocations(
      item.title,
      item.destPath,
      jobId,
    )
    if (installedBefore.length > 0) {
      await sourcesApi.uninstallLibraryItem(item.title, item.destPath, jobId)
      const stillInstalled = await sourcesApi.getLibraryInstalledLocations(
        item.title,
        item.destPath,
        jobId,
      )
      if (stillInstalled.length > 0) {
        const error = new Error('uninstall_cancelled_or_incomplete')
        args.onUninstallError(error)
        const scanned = await sourcesApi.scanDefaultDownloadPath().catch(() => args.localLibraryItems)
        return { errors: [error], scanned, aborted: true }
      }
    }
  } catch (error) {
    args.onUninstallError(error)
    const scanned = await sourcesApi.scanDefaultDownloadPath().catch(() => args.localLibraryItems)
    return { errors: [error], scanned, aborted: true }
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
  return { errors, scanned, aborted: false }
}
