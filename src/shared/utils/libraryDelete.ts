import type { LibraryEntry } from '../../features/library/types'
import type { DownloadJob, LocalLibraryItem } from '../types/contracts'
import { resolveDeletePath } from './archive'
import { normalizeLibraryPath } from './jobExtraction'
import { libraryTitlesMatch } from './libraryDedupe'

export function isFileLockDeleteError(error: unknown): boolean {
  const msg = (error instanceof Error ? error.message : String(error ?? '')).toLowerCase()
  return (
    msg.includes('os error 32') ||
    msg.includes('error 32') ||
    msg.includes('being used by another process') ||
    msg.includes('utilizado por outro processo') ||
    msg.includes('sendo usado por outro processo') ||
    msg.includes('used by another process')
  )
}

export function isBenignDeleteError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? '')
  return (
    msg.includes('local_item_not_found') ||
    msg.includes('path_outside_default_download_path') ||
    msg.includes('cannot_delete_default_download_root')
  )
}

export function resolveLibraryDeletePaths(
  item: LibraryEntry,
  folders: LocalLibraryItem[],
  defaultDownloadPath: string,
  relatedJobs: DownloadJob[] = [],
): string[] {
  const paths = new Set<string>()
  const defaultRoot = normalizeLibraryPath(defaultDownloadPath)

  const pushPath = (rawPath: string) => {
    const resolved = resolveDeletePath(rawPath)
    if (!resolved.trim()) return
    const normalized = normalizeLibraryPath(resolved)
    if (defaultRoot && normalized === defaultRoot) return
    paths.add(resolved)
  }

  pushPath(item.destPath)

  for (const folder of folders) {
    if (!folder.isDir) continue
    if (
      libraryTitlesMatch(folder.name, item.title) ||
      relatedJobs.some((job) => libraryTitlesMatch(folder.name, job.title))
    ) {
      pushPath(folder.path)
    }
  }

  for (const job of relatedJobs) {
    pushPath(job.destPath)
  }

  return [...paths]
}

export function formatLibraryDeleteError(errors: unknown[]): string {
  if (errors.length === 0) return ''

  if (errors.some(isFileLockDeleteError)) {
    return 'Não foi possível apagar os arquivos porque estão em uso. Feche o instalador do jogo (Setup) e apague a pasta manualmente, se necessário. O jogo já foi removido da biblioteca.'
  }

  const first = errors[0]
  const msg = first instanceof Error ? first.message : String(first ?? '')
  if (msg.includes('cannot_delete_default_download_root')) {
    return 'Não é possível apagar a pasta raiz de downloads. O jogo foi removido da biblioteca.'
  }

  return msg.trim() || 'Falha ao excluir item.'
}
