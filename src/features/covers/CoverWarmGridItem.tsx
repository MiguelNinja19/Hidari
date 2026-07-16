import { useEffect, useRef, type ReactNode } from 'react'

type CoverWarmGridItemProps = {
  title: string
  coverUrl?: string | null
  warmCover: (title: string, coverUrl: string) => void
  onNeedsCover?: (title: string) => void
  className?: string
  children: ReactNode
}

/** Um observer partilhado — evita N IntersectionObservers na grelha. */
const observedCallbacks = new WeakMap<Element, () => void>()
let sharedObserver: IntersectionObserver | null = null

function getSharedObserver(): IntersectionObserver {
  if (!sharedObserver) {
    sharedObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          observedCallbacks.get(entry.target)?.()
        }
      },
      { rootMargin: '200px', threshold: 0.01 },
    )
  }
  return sharedObserver
}

export function CoverWarmGridItem({
  title,
  coverUrl,
  warmCover,
  onNeedsCover,
  className,
  children,
}: CoverWarmGridItemProps) {
  const ref = useRef<HTMLDivElement>(null)
  const warmedRef = useRef(false)
  const lookupRef = useRef(false)
  const warmCoverRef = useRef(warmCover)
  const onNeedsCoverRef = useRef(onNeedsCover)
  const titleRef = useRef(title)
  const coverUrlRef = useRef(coverUrl)

  warmCoverRef.current = warmCover
  onNeedsCoverRef.current = onNeedsCover
  titleRef.current = title
  coverUrlRef.current = coverUrl

  useEffect(() => {
    warmedRef.current = false
    lookupRef.current = false
  }, [title, coverUrl])

  useEffect(() => {
    const element = ref.current
    if (!element) return

    const onIntersect = () => {
      const url = coverUrlRef.current?.trim()
      if (url && !warmedRef.current) {
        warmedRef.current = true
        warmCoverRef.current(titleRef.current, url)
        return
      }
      if (!url && onNeedsCoverRef.current && !lookupRef.current) {
        lookupRef.current = true
        onNeedsCoverRef.current(titleRef.current)
      }
    }

    observedCallbacks.set(element, onIntersect)
    getSharedObserver().observe(element)

    return () => {
      observedCallbacks.delete(element)
      sharedObserver?.unobserve(element)
    }
  }, [title, coverUrl])

  return (
    <div ref={ref} className={className} role="listitem">
      {children}
    </div>
  )
}
