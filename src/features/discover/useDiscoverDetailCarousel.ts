import { useEffect, useState } from 'react'

export function useDiscoverDetailCarousel(shots: string[], gameId: string, onBack: () => void) {
  const [carouselIndex, setCarouselIndex] = useState(0)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const lightboxOpen = lightboxIndex != null && shots[lightboxIndex] != null
  const activeShot = shots[Math.min(carouselIndex, Math.max(shots.length - 1, 0))] ?? null

  useEffect(() => {
    setCarouselIndex(0)
    setLightboxIndex(null)
  }, [gameId])

  useEffect(() => {
    if (carouselIndex >= shots.length) {
      setCarouselIndex(0)
    }
  }, [carouselIndex, shots.length])

  const goCarousel = (delta: number) => {
    if (shots.length <= 1) return
    setCarouselIndex((index) => (index + delta + shots.length) % shots.length)
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (lightboxIndex != null) {
          setLightboxIndex(null)
          return
        }
        onBack()
        return
      }
      if (shots.length <= 1) return
      if (lightboxIndex != null) {
        if (event.key === 'ArrowRight') {
          event.preventDefault()
          const next = (lightboxIndex + 1) % shots.length
          setLightboxIndex(next)
          setCarouselIndex(next)
        }
        if (event.key === 'ArrowLeft') {
          event.preventDefault()
          const next = (lightboxIndex - 1 + shots.length) % shots.length
          setLightboxIndex(next)
          setCarouselIndex(next)
        }
        return
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        setCarouselIndex((index) => (index + 1) % shots.length)
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        setCarouselIndex((index) => (index - 1 + shots.length) % shots.length)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [lightboxIndex, onBack, shots.length])

  useEffect(() => {
    if (!lightboxOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [lightboxOpen])

  return {
    carouselIndex,
    lightboxIndex,
    lightboxOpen,
    activeShot,
    setCarouselIndex,
    setLightboxIndex,
    goCarousel,
  }
}
