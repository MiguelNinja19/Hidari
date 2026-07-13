import { useEffect, useRef, type ReactNode } from 'react'

type CoverWarmGridItemProps = {
  title: string
  coverUrl?: string | null
  warmCover: (title: string, coverUrl: string) => void
  onNeedsCover?: (title: string) => void
  className?: string
  children: ReactNode
}

export function CoverWarmGridItem({
  title,
  coverUrl,
  warmCover,
  onNeedsCover,
  className,
  children,
}: CoverWarmGridItemProps) {
  const ref = useRef<HTMLLIElement>(null)
  const warmedRef = useRef(false)
  const lookupRef = useRef(false)
  const warmCoverRef = useRef(warmCover)
  const onNeedsCoverRef = useRef(onNeedsCover)

  warmCoverRef.current = warmCover
  onNeedsCoverRef.current = onNeedsCover

  useEffect(() => {
    warmedRef.current = false
    lookupRef.current = false
  }, [title, coverUrl])

  useEffect(() => {
    const url = coverUrl?.trim()
    const element = ref.current
    if (!element) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return

        if (url && !warmedRef.current) {
          warmedRef.current = true
          warmCoverRef.current(title, url)
          return
        }

        if (!url && onNeedsCoverRef.current && !lookupRef.current) {
          lookupRef.current = true
          onNeedsCoverRef.current(title)
        }
      },
      { rootMargin: '200px', threshold: 0.01 },
    )

    observer.observe(element)
    return () => observer.disconnect()
  }, [title, coverUrl])

  return (
    <li ref={ref} className={className}>
      {children}
    </li>
  )
}
