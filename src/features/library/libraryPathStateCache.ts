import type { LibraryPathState } from '../../shared/types/contracts'

type PathStateMap = Record<string, LibraryPathState>

const STORAGE_KEY = 'launcher.library.pathState.v1'

type StoredCache = {
  downloadPath: string
  entries: PathStateMap
}

/** Cache em memória — alinhado à pasta de downloads actual. */
let sessionCache: PathStateMap = {}

function normalizeDownloadPath(path: string): string {
  return path.trim().replace(/\\/g, '/').toLowerCase()
}

function persist(downloadPath: string): void {
  const path = downloadPath.trim()
  if (!path) return
  try {
    const payload: StoredCache = {
      downloadPath: path,
      entries: sessionCache,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // quota / modo privado
  }
}

export function readLibraryPathStateCache(): PathStateMap {
  return sessionCache
}

/** Carrega cache persistido se for da mesma pasta de downloads. */
export function hydrateLibraryPathStateCache(downloadPath: string): PathStateMap {
  const normalized = normalizeDownloadPath(downloadPath)
  if (!normalized) {
    sessionCache = {}
    return {}
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      sessionCache = {}
      return {}
    }
    const parsed = JSON.parse(raw) as StoredCache
    if (normalizeDownloadPath(parsed.downloadPath) !== normalized) {
      sessionCache = {}
      return {}
    }
    sessionCache = parsed.entries ?? {}
    return { ...sessionCache }
  } catch {
    sessionCache = {}
    return {}
  }
}

export function mergeLibraryPathStateCache(
  merged: PathStateMap,
  downloadPath: string,
): void {
  if (Object.keys(merged).length === 0) return
  sessionCache = { ...sessionCache, ...merged }
  persist(downloadPath)
}

export function setLibraryPathStateCacheEntry(
  key: string,
  state: LibraryPathState,
  downloadPath: string,
): void {
  sessionCache = { ...sessionCache, [key]: state }
  persist(downloadPath)
}

export function removeLibraryPathStateCacheKeys(
  predicate: (key: string) => boolean,
  downloadPath: string,
): void {
  const next: PathStateMap = {}
  for (const [key, state] of Object.entries(sessionCache)) {
    if (!predicate(key)) next[key] = state
  }
  sessionCache = next
  persist(downloadPath)
}

export function clearLibraryPathStateCache(): void {
  sessionCache = {}
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignora
  }
}
