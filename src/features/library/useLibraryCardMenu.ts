import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'

type MenuPosition = { left: number; top: number }

export function useLibraryCardMenu(enabled: boolean, isDeleting: boolean) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPos, setMenuPos] = useState<MenuPosition | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()

  useEffect(() => {
    if (isDeleting) setMenuOpen(false)
  }, [isDeleting])

  useEffect(() => {
    if (!menuOpen) return
    const onPointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    const onScroll = () => setMenuOpen(false)
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [menuOpen])

  useLayoutEffect(() => {
    if (!menuOpen || !menuRef.current || !menuPos) return
    const rect = menuRef.current.getBoundingClientRect()
    const pad = 8
    let left = menuPos.left
    let top = menuPos.top
    if (left + rect.width > window.innerWidth - pad) {
      left = Math.max(pad, window.innerWidth - rect.width - pad)
    }
    if (top + rect.height > window.innerHeight - pad) {
      top = Math.max(pad, window.innerHeight - rect.height - pad)
    }
    if (left !== menuPos.left || top !== menuPos.top) setMenuPos({ left, top })
  }, [menuOpen, menuPos])

  const openMenu = (clientX: number, clientY: number) => {
    if (!enabled || isDeleting) return
    setMenuPos({ left: clientX, top: clientY })
    setMenuOpen(true)
  }

  return { menuOpen, menuPos, menuRef, menuId, openMenu, closeMenu: () => setMenuOpen(false) }
}
