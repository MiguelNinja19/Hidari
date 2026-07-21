import type { MutableRefObject } from 'react'
import { sourcesApi } from '../../shared/api/tauri/sourcesApi'
import type { GameCover } from '../../shared/types/contracts'
import { coverTitleKey } from '../../shared/utils/normalizeTitleKey'
import { clearCoverLookupPending } from './coverLookup'

export function patchBatchCoverRows(
  rows: Awaited<ReturnType<typeof sourcesApi.resolveCoversForTitles>>,
  loadingKeysRef: MutableRefObject<Set<string>>,
) {
  const patched: GameCover[] = []
  for (const row of rows) {
    clearCoverLookupPending(row.title, loadingKeysRef.current)
    if (!row.coverUrl?.trim()) continue
    patched.push({
      titleKey: coverTitleKey(row.title),
      coverUrl: row.coverUrl,
      localPath: row.localCoverPath ?? null,
    })
  }
  return patched
}
