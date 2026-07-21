import type { TFunction } from 'i18next'
import type { AppLanguage } from '../../shared/config/locale'
import { localeForLanguage } from '../../shared/config/locale'
import type { GameTileAction } from '../../shared/components/GameTileAction'
import type { LibraryStatusMeta } from './libraryItemState'

export function formatLibraryStatusPct(pct: number, language: AppLanguage): string {
  const decimal = localeForLanguage(language) === 'en-US' ? '.' : ','
  return `${pct.toFixed(1).replace('.', decimal)}%`
}

export function libraryStatusLine(
  meta: LibraryStatusMeta,
  primary: GameTileAction | null,
  t: TFunction,
  language: AppLanguage,
): string | null {
  if (meta.tone === 'ready' || meta.tone === 'waiting') return null
  if (
    (primary?.id === 'play' || primary?.id === 'install') &&
    !['installing', 'starting', 'verifying'].includes(meta.tone)
  ) {
    return null
  }
  if (meta.pct != null) {
    return t(meta.labelKey, { pct: formatLibraryStatusPct(meta.pct, language) })
  }
  return t(meta.labelKey)
}

export function libraryPendingActivity(meta: LibraryStatusMeta): boolean {
  return (
    ['verifying', 'installing', 'starting'].includes(meta.tone) ||
    (meta.tone === 'downloading' && meta.pct == null)
  )
}
