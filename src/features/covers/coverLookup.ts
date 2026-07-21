import { coverTitleKeyCandidates, normalizeTitleKey } from '../../shared/utils/normalizeTitleKey'

export function findCatalogCover(
  title: string,
  coverByTitleKey: Map<string, { coverUrl: string; localPath?: string | null }>,
): { coverUrl: string; localPath?: string | null } | null {
  for (const key of coverTitleKeyCandidates(title)) {
    const row = coverByTitleKey.get(key)
    if (row) return row
  }
  return null
}

export function isCoverLookupPending(title: string, loadingKeys: Set<string>): boolean {
  return coverTitleKeyCandidates(title).some((key) => loadingKeys.has(key))
}

export function markCoverLookupPending(title: string, loadingKeys: Set<string>) {
  for (const key of coverTitleKeyCandidates(title)) {
    loadingKeys.add(key)
  }
}

export function clearCoverLookupPending(title: string, loadingKeys: Set<string>) {
  for (const key of coverTitleKeyCandidates(title)) {
    loadingKeys.delete(key)
  }
}

export function isTitleKeyLoading(title: string, loadingKeys: Set<string>): boolean {
  return (
    loadingKeys.has(normalizeTitleKey(title)) ||
    isCoverLookupPending(title, loadingKeys)
  )
}
