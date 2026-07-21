import { catalogGameDisplayTitle } from '../../shared/utils/normalizeTitleKey'

type DiscoverDetailHeroProps = { title: string }

export function DiscoverDetailHero({ title }: DiscoverDetailHeroProps) {
  return (
    <header className="discover-detail__hero">
      <h1 id="discover-detail-title" className="discover-detail__title" title={title}>
        {catalogGameDisplayTitle(title)}
      </h1>
    </header>
  )
}
