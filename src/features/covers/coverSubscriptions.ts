import { coverTitleKeyCandidates } from '../../shared/utils/normalizeTitleKey'

type CoverListener = () => void

const listenersByKey = new Map<string, Set<CoverListener>>()

/** Subscreve alterações de capa para as chaves do título. */
export function subscribeCoverKeys(
  keys: readonly string[],
  listener: CoverListener,
): () => void {
  for (const key of keys) {
    let set = listenersByKey.get(key)
    if (!set) {
      set = new Set()
      listenersByKey.set(key, set)
    }
    set.add(listener)
  }
  return () => {
    for (const key of keys) {
      const set = listenersByKey.get(key)
      if (!set) continue
      set.delete(listener)
      if (set.size === 0) listenersByKey.delete(key)
    }
  }
}

export function notifyCoverKeys(keys: Iterable<string>) {
  const seen = new Set<CoverListener>()
  for (const key of keys) {
    const set = listenersByKey.get(key)
    if (!set) continue
    for (const listener of set) {
      if (seen.has(listener)) continue
      seen.add(listener)
      listener()
    }
  }
}

export function notifyCoverTitle(title: string) {
  notifyCoverKeys(coverTitleKeyCandidates(title))
}

export function collectCoverKeysFromTitles(titles: Iterable<string>): string[] {
  const keys: string[] = []
  const seen = new Set<string>()
  for (const title of titles) {
    for (const key of coverTitleKeyCandidates(title)) {
      if (seen.has(key)) continue
      seen.add(key)
      keys.push(key)
    }
  }
  return keys
}
