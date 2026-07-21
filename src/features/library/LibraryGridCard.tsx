import { memo, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { CatalogCover } from '../../shared/components/CatalogCover'
import { cleanTitleForDisplay } from '../../shared/utils/normalizeTitleKey'
import { useTitleCover, useStableCoverActions } from '../covers/useTitleCover'
import { LibraryGameCard } from './LibraryGameCard'
import type { LibraryGridCardModel } from './libraryGridCardModel'

export type { LibraryGridCardModel } from './libraryGridCardModel'
import {
  formatLibraryStatusPct,
  libraryPendingActivity,
  libraryStatusLine,
} from './libraryGridCardStatus'

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
              pct: formatLibraryStatusPct(model.statusMeta.pct, model.language),
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
