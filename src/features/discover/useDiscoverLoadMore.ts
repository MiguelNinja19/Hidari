import { useEffect, useRef } from 'react'

type UseDiscoverLoadMoreArgs = {
  disabled: boolean
  loading: boolean
  hasMore: boolean
  resultCount: number
  loadMore: () => Promise<void>
}

export function useDiscoverLoadMore({
  disabled,
  loading,
  hasMore,
  resultCount,
  loadMore,
}: UseDiscoverLoadMoreArgs) {
  const sentinelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (disabled || loading || !hasMore || resultCount === 0) return
    const node = sentinelRef.current
    if (!node) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) void loadMore()
      },
      { rootMargin: '480px 0px', threshold: 0 },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [disabled, hasMore, loadMore, loading, resultCount])

  return sentinelRef
}
