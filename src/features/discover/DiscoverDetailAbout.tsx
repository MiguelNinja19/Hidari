import { useTranslation } from 'react-i18next'

type DiscoverDetailAboutProps = { synopsis: string }

export function DiscoverDetailAbout({ synopsis }: DiscoverDetailAboutProps) {
  const { t } = useTranslation()
  return (
    <section className="discover-detail__about" aria-labelledby="discover-detail-about-label">
      <p id="discover-detail-about-label" className="discover-detail__about-label">
        {t('discover.pickAbout')}
      </p>
      <p className="discover-detail__synopsis">{synopsis}</p>
    </section>
  )
}
