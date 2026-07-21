const SEARCH_SKELETON_COUNT = 12

export function DiscoverSearchSkeleton() {
  return (
    <ul className="discover-grid discover-grid--skeleton" aria-hidden="true">
      {Array.from({ length: SEARCH_SKELETON_COUNT }, (_, index) => (
        <li key={index} className="discover-grid__item">
          <article className="discover-card discover-card--explore discover-card--skeleton">
            <div className="discover-card__panel">
              <div className="discover-card__cover--skeleton skeleton-pulse" />
            </div>
          </article>
        </li>
      ))}
    </ul>
  )
}
