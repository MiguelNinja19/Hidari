import type { NavTab } from './types'

const tabs: Array<{ id: NavTab; label: string }> = [
  { id: 'discover', label: 'Explorar' },
  { id: 'downloads', label: 'Downloads' },
  { id: 'library', label: 'Biblioteca' },
  { id: 'settings', label: 'Config' },
]

type SidebarProps = {
  activeTab: NavTab
  onTabChange: (tab: NavTab) => void
}

export function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar__logo">HYDRAX</div>
      <nav className="sidebar__nav">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={activeTab === tab.id ? 'sidebar-link sidebar-link--active' : 'sidebar-link'}
            type="button"
            onClick={() => onTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      <div className="sidebar__divider" aria-hidden="true">
        ────────
      </div>
    </aside>
  )
}
