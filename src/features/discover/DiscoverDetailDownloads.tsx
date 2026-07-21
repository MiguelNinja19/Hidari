import { useTranslation } from 'react-i18next'
import { Spinner } from '../../shared/components/Spinner'
import type { CatalogGame, DownloadOption } from '../../shared/types/contracts'
import { DiscoverDetailDownloadOption } from './DiscoverDetailDownloadOption'

type DiscoverDetailDownloadsProps = {
  game: CatalogGame
  loading: boolean
  error: string | null
  hideDownloads: boolean
  pickOptions: DownloadOption[]
  busyUrl: string | null
  downloadCoverUrl: string | null
  onDownload?: (title: string, url: string, coverUrl?: string | null, sourceName?: string | null) => Promise<void>
}

export function DiscoverDetailDownloads({
  game,
  loading,
  error,
  hideDownloads,
  pickOptions,
  busyUrl,
  downloadCoverUrl,
  onDownload,
}: DiscoverDetailDownloadsProps) {
  const { t } = useTranslation()

  if (hideDownloads && loading) {
    return (
      <div className="discover-detail__loading">
        <Spinner size="md" label={t('common.loadingTab')} />
      </div>
    )
  }
  if (!hideDownloads && loading) {
    return (
      <div className="discover-detail__loading">
        <Spinner size="md" label={t('discover.loadingOptions')} />
        <p className="discover-detail__loading-label">{t('discover.loadingOptions')}</p>
      </div>
    )
  }
  if (!loading && error) {
    return <p className="discover-detail__empty discover-detail__empty--error">{error}</p>
  }
  if (!hideDownloads && !loading && !error && pickOptions.length === 0) {
    return <p className="discover-detail__empty">{t('discover.noDownloadsAvailable')}</p>
  }
  if (!hideDownloads && !loading && pickOptions.length > 0 && onDownload) {
    return (
      <section className="discover-detail__downloads" aria-label={t('discover.pickVersion')}>
        <div className="discover-detail__downloads-head">
          <p className="discover-detail__section-label">{t('discover.pickVersion')}</p>
          <span className="discover-detail__count">{pickOptions.length}</span>
        </div>
        <ul className="discover-detail__options">
          {pickOptions.map((opt, index) => (
            <DiscoverDetailDownloadOption
              key={`${opt.url}-${index}`}
              opt={opt}
              index={index}
              gameTitle={game.title}
              busy={busyUrl === opt.url}
              downloadCoverUrl={downloadCoverUrl}
              onDownload={onDownload}
              downloadLabel={t('common.download')}
            />
          ))}
        </ul>
      </section>
    )
  }
  return null
}
