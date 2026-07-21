import type { DownloadJob } from '../../shared/types/contracts'
import type { PathStateMap } from './libraryControllerTypes'
import { getPathState, isPathStateResolved, itemPathCtx } from './libraryPathState'
import type { LibraryEntry } from './types'

/**
 * Biblioteca = jogável / instalável / já extraído.
 * Só .rar/.zip (ainda por extrair ou senha) fica em Downloads.
 */
export function libraryEntryHasPlayableContent(
  item: LibraryEntry,
  pathStateByKey: PathStateMap,
): boolean {
  if (item.kind === 'job' && item.job?.extractionStatus === 'failed') {
    return false
  }
  if (item.status === 'extracting' || item.job?.extractionStatus === 'extracting') {
    return true
  }
  if (item.status === 'extracted' || item.job?.extractionStatus === 'extracted') {
    return true
  }

  // Import externo: mostrar já (atalho/pasta escolhida pelo utilizador).
  if (item.external) {
    return true
  }

  if (!isPathStateResolved(item, pathStateByKey)) {
    // Sem inspect ainda: não esconder jogos já extraídos; resto espera.
    return item.status === 'extracted' || item.job?.extractionStatus === 'extracted'
  }

  const state = getPathState(item.destPath, pathStateByKey, itemPathCtx(item))
  if (!state) return false
  if (state.hasGame || state.playable) return true
  if (state.needsInstall) return true
  // Só arquivo compactado / pasta vazia → fora da biblioteca
  return false
}

export function filterLibraryEntriesWithContent(
  entries: LibraryEntry[],
  pathStateByKey: PathStateMap,
  _jobs?: DownloadJob[],
): LibraryEntry[] {
  return entries.filter((item) => libraryEntryHasPlayableContent(item, pathStateByKey))
}
