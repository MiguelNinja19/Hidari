import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { NavTab } from './types'

type TabDef = { id: NavTab; labelKey: string; icon: ReactNode }

const tabs: TabDef[] = [
  {
    id: 'discover',
    labelKey: 'nav.discover',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-4-4" />
      </svg>
    ),
  },
  {
    id: 'downloads',
    labelKey: 'nav.downloads',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3v12" />
        <path d="M7 10l5 5 5-5" />
        <path d="M5 21h14" />
      </svg>
    ),
  },
  {
    id: 'library',
    labelKey: 'nav.library',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" />
      </svg>
    ),
  },
  {
    id: 'settings',
    labelKey: 'nav.settings',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
  },
]

type SidebarProps = {
  activeTab: NavTab
  activeDownloadsCount: number
  onTabChange: (tab: NavTab) => void
}

export function Sidebar({ activeTab, activeDownloadsCount, onTabChange }: SidebarProps) {
  const { t } = useTranslation()

  return (
    <aside className="sidebar">
      <nav className="sidebar__nav" aria-label="Navegação">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={activeTab === tab.id ? 'sidebar-link sidebar-link--active' : 'sidebar-link'}
            type="button"
            onClick={() => onTabChange(tab.id)}
          >
            <span className="sidebar-link__icon">{tab.icon}</span>
            <span className="sidebar-link__label">{t(tab.labelKey)}</span>
            {tab.id === 'downloads' && activeDownloadsCount > 0 ? (
              <span className="sidebar-link__badge" aria-label={`${activeDownloadsCount} downloads ativos`}>
                {activeDownloadsCount > 99 ? '99+' : activeDownloadsCount}
              </span>
            ) : null}
          </button>
        ))}
      </nav>
    </aside>
  )
}
