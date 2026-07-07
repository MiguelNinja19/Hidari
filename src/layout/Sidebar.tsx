import type { ReactNode } from 'react'
import type { NavTab } from './types'

type TabDef = { id: NavTab; label: string; icon: ReactNode }

const tabs: TabDef[] = [
  {
    id: 'discover',
    label: 'Explorar',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-4-4" />
      </svg>
    ),
  },
  {
    id: 'downloads',
    label: 'Downloads',
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
    label: 'Biblioteca',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="4" width="7" height="16" rx="1" />
        <rect x="14" y="4" width="7" height="16" rx="1" />
      </svg>
    ),
  },
  {
    id: 'settings',
    label: 'Configurações',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
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
  return (
    <aside className="sidebar">
      <div className="sidebar__logo">
        <span className="sidebar__logo-mark" aria-hidden="true">
          HX
        </span>
        <span className="sidebar__logo-name">HYDRAX</span>
      </div>
      <nav className="sidebar__nav" aria-label="Navegação">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={activeTab === tab.id ? 'sidebar-link sidebar-link--active' : 'sidebar-link'}
            type="button"
            onClick={() => onTabChange(tab.id)}
          >
            <span className="sidebar-link__icon">{tab.icon}</span>
            <span className="sidebar-link__label">{tab.label}</span>
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
