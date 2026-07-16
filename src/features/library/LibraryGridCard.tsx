import { memo, useMemo } from 'react'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { CatalogCover } from '../../shared/components/CatalogCover'
import { cleanTitleForDisplay } from '../../shared/utils/normalizeTitleKey'
import { localeForLanguage, type AppLanguage } from '../../shared/config/locale'
import { useTitleCover, useStableCoverActions } from '../covers/useTitleCover'
import type { LibraryStatusMeta } from './libraryItemState'
import { LibraryGameCard } from './LibraryGameCard'
import type { LibraryEntry } from './types'
import type { GameTileAction } from '../../shared/components/GameTileAction'

function formatStatusPct(pct: number, language: AppLanguage): string {
  const decimal = localeForLanguage(language) === 'en-US' ? '.' : ','
  return `${pct.toFixed(1).replace('.', decimal)}%`
}

function libraryStatusLine(
  meta: LibraryStatusMeta,
  primary: GameTileAction | null,
  t: TFunction,
  language: AppLanguage,
): string | null {
  if (meta.tone === 'ready' || meta.tone === 'waiting') return null
  if (
    (primary?.id === 'play' || primary?.id === 'install') &&
    meta.tone !== 'installing' &&
    meta.tone !== 'starting' &&
    meta.tone !== 'verifying'
  ) {
    return null
  }
  if (meta.pct != null) {
    return t(meta.labelKey, { pct: formatStatusPct(meta.pct, language) })
  }
  return t(meta.labelKey)
}

function libraryPendingActivity(meta: LibraryStatusMeta): boolean {
  return (
    meta.tone === 'verifying' ||
    meta.tone === 'installing' ||
    meta.tone === 'starting' ||
    (meta.tone === 'downloading' && meta.pct == null)
  )
}

export type LibraryGridCardModel = {
  item: LibraryEntry
  statusMeta: LibraryStatusMeta
  primary: GameTileAction | null
  secondary: GameTileAction[]
  isDeleting: boolean
  manualRoot: boolean
  language: AppLanguage
}

type LibraryGridCardProps = {
  model: LibraryGridCardModel
  className?: string
}

export const LibraryGridCard = memo(function LibraryGridCard({
  model,
  className = 'library-grid__item',
}: LibraryGridCardProps) {
  const { t } = useTranslation()
  const { invalidateLocalCover } = useStableCoverActions()
  const cover = useTitleCover(model.item.title)

  const hasCover =
    cover.status !== 'error' &&
    Boolean(cover.localPath?.trim() || cover.coverUrl?.trim())
  const statusLine = libraryStatusLine(
    model.statusMeta,
    model.primary,
    t,
    model.language,
  )
  const pendingActivity =
    libraryPendingActivity(model.statusMeta) || model.isDeleting

  const titleAttr = useMemo(
    () =>
      [
        cleanTitleForDisplay(model.item.title),
        model.statusMeta.pct != null
          ? t(model.statusMeta.labelKey, {
              pct: formatStatusPct(model.statusMeta.pct, model.language),
            })
          : t(model.statusMeta.labelKey),
        model.manualRoot ? t('library.manualFolder') : '',
      ]
        .filter(Boolean)
        .join(' · '),
    [model.item.title, model.language, model.manualRoot, model.statusMeta, t],
  )

  return (
    <div
      className={[className, model.isDeleting ? 'library-grid__item--deleting' : '']
        .filter(Boolean)
        .join(' ')}
      role="listitem"
    >
      <LibraryGameCard
        title={cleanTitleForDisplay(model.item.title)}
        titleAttr={titleAttr}
        showTitle={!hasCover}
        metaLine={model.isDeleting ? t('library.deleting') : statusLine}
        pendingActivity={pendingActivity}
        isDeleting={model.isDeleting}
        cover={
          <CatalogCover
            title={model.item.title}
            coverUrl={cover.coverUrl}
            localPath={cover.localPath}
            cached={cover.status === 'cached'}
            status={cover.status}
            priority
            onLocalCoverError={() =>
              invalidateLocalCover(model.item.title, cover.coverUrl)
            }
          />
        }
        primaryAction={model.isDeleting ? null : model.primary}
        secondaryActions={model.isDeleting ? [] : model.secondary}
      />
    </div>
  )
})
