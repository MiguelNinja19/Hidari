import type { DownloadJob } from '../types/contracts'
import { resolveDeletePath } from './archive'

/** Converte path para comparação consistente (minúsculas, barras `/`). */
export function normalizeLibraryPath(path: string): string {
  return resolveDeletePath(path).trim().toLowerCase().replace(/\\/g, '/').replace(/\/+$/, '')
}

/** Não pedimos extrair — o download já é o instalável. */
export function jobNeedsExtraction(_job: DownloadJob): boolean {
  return false
}

/** Botão Extrair desactivado. */
export function jobCanExtract(_job: DownloadJob): boolean {
  return false
}

export function jobPathsOverlap(a: string, b: string): boolean {
  const left = normalizeLibraryPath(a)
  const right = normalizeLibraryPath(b)
  if (!left || !right) return false
  if (left === right) return true
  return left.startsWith(`${right}/`) || right.startsWith(`${left}/`)
}

/**
 * Um job activo deve ocultar uma pasta da biblioteca só se partilham o mesmo destino
 * específico — não quando o job usa a pasta raiz de downloads (torrents/http).
 */
export function activeJobBlocksLibraryFolder(
  folderPath: string,
  jobDestPath: string,
  defaultDownloadPath = '',
): boolean {
  const folder = normalizeLibraryPath(folderPath)
  const jobDest = normalizeLibraryPath(jobDestPath)
  const defaultRoot = normalizeLibraryPath(defaultDownloadPath)
  if (!folder || !jobDest) return false
  if (folder === jobDest) return true
  if (defaultRoot && jobDest === defaultRoot) return false
  return folder.startsWith(`${jobDest}/`) || jobDest.startsWith(`${folder}/`)
}
