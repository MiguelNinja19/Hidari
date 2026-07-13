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

function pathBaseName(path: string): string {
  const normalized = path.replace(/[/\\]+$/, '')
  const sep = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'))
  return sep >= 0 ? normalized.slice(sep + 1) : normalized
}

function isTorrentSidecarFile(name: string): boolean {
  return /\.(torrent|aria2)$/i.test(name)
}

function torrentSidecarStem(name: string): string {
  return name.replace(/\.(torrent|aria2)$/i, '')
}

function torrentSidecarMatchesTitle(stem: string, title: string): boolean {
  if (!stem.trim() || !title.trim()) return false
  return libraryTitlesMatch(stem, title)
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

  const deletedDirNames = [...paths].map(pathBaseName).filter(Boolean)

  for (const entry of folders) {
    if (entry.isDir || !isTorrentSidecarFile(entry.name)) continue
    const stem = torrentSidecarStem(entry.name)
    const matchesTitle =
      torrentSidecarMatchesTitle(stem, item.title) ||
      relatedJobs.some((job) => torrentSidecarMatchesTitle(stem, job.title))
    const matchesDeletedDir = deletedDirNames.some(
      (dirName) =>
        dirName.toLowerCase() === stem.toLowerCase() || libraryTitlesMatch(stem, dirName),
    )
    if (matchesTitle || matchesDeletedDir) {
      pushPath(entry.path)
    }
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
