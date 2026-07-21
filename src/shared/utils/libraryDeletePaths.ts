import type { LibraryEntry } from '../../features/library/types'
import type { DownloadJob, LocalLibraryItem } from '../types/contracts'
import { resolveDeletePath } from './archive'
import { libraryTitlesMatch } from './libraryDedupe'
import { normalizeLibraryPath } from './jobExtraction'

function pathBaseName(path: string): string {
  const normalized = path.replace(/[/\\]+$/, '')
  const sep = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'))
  return sep >= 0 ? normalized.slice(sep + 1) : normalized
}

function sidecarMatchesTitle(name: string, title: string): boolean {
  const stem = name.replace(/\.(torrent|aria2)$/i, '')
  return Boolean(stem.trim() && title.trim() && libraryTitlesMatch(stem, title))
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
  for (const job of relatedJobs) pushPath(job.destPath)

  const deletedDirNames = [...paths].map(pathBaseName).filter(Boolean)
  for (const entry of folders) {
    if (entry.isDir || !/\.(torrent|aria2)$/i.test(entry.name)) continue
    const stem = entry.name.replace(/\.(torrent|aria2)$/i, '')
    const matchesTitle =
      sidecarMatchesTitle(entry.name, item.title) ||
      relatedJobs.some((job) => sidecarMatchesTitle(entry.name, job.title))
    const matchesDeletedDir = deletedDirNames.some(
      (dirName) =>
        dirName.toLowerCase() === stem.toLowerCase() || libraryTitlesMatch(stem, dirName),
    )
    if (matchesTitle || matchesDeletedDir) pushPath(entry.path)
  }
  return [...paths]
}
