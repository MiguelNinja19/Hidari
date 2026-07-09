import { useEffect } from 'react'
import type { NavTab } from '../../layout/types'

const TAB_BY_KEY: Record<string, NavTab> = {
  '1': 'discover',
  '2': 'downloads',
  '3': 'library',
  '4': 'settings',
}

type UseKeyboardShortcutsArgs = {
  activeTab: NavTab
  setActiveTab: (tab: NavTab) => void
}

/** Atalhos globais: Ctrl+1–4 para abas, Ctrl+F para focar pesquisa. */
export function useKeyboardShortcuts({ activeTab, setActiveTab }: UseKeyboardShortcutsArgs) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return

      const key = event.key.toLowerCase()
      if (key === 'f') {
        event.preventDefault()
        const selector = `[data-search-focus="${activeTab}"]`
        const input = document.querySelector<HTMLInputElement>(selector)
        input?.focus()
        input?.select()
        return
      }

      const tab = TAB_BY_KEY[event.key]
      if (tab) {
        event.preventDefault()
        setActiveTab(tab)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activeTab, setActiveTab])
}
