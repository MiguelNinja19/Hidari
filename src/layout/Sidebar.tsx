import { useTranslation } from 'react-i18next'
import type { NavTab } from './types'
import { sidebarTabs } from './sidebarTabs'

type SidebarProps = {
  activeTab: NavTab
  activeDownloadsCount: number
  onTabChange: (tab: NavTab) => void
}

export function Sidebar({ activeTab, activeDownloadsCount, onTabChange }: SidebarProps) {
  const { t } = useTranslation()
  const downloadsBadge =
    activeDownloadsCount > 0
      ? activeDownloadsCount > 99
        ? '99+'
        : String(activeDownloadsCount)
      : null
  const downloadsAria =
    activeDownloadsCount > 0
      ? t('library.activeDownloads', { count: activeDownloadsCount })
      : undefined

  return (
    <aside className="sidebar">
      <nav className="sidebar__nav" aria-label={t('nav.ariaLabel')}>
        {sidebarTabs.map((tab) => (
          <button
            key={tab.id}
            className={activeTab === tab.id ? 'sidebar-link sidebar-link--active' : 'sidebar-link'}
            type="button"
            title={
              tab.id === 'downloads' && downloadsAria
                ? downloadsAria
                : t(tab.labelKey)
            }
            aria-label={
              tab.id === 'downloads' && downloadsAria
                ? `${t(tab.labelKey)} — ${downloadsAria}`
                : t(tab.labelKey)
            }
            aria-current={activeTab === tab.id ? 'page' : undefined}
            onClick={() => onTabChange(tab.id)}
          >
            <span className="sidebar-link__icon">{tab.icon}</span>
            <span className="sidebar-link__label">{t(tab.labelKey)}</span>
            {tab.id === 'downloads' && downloadsBadge ? (
              <span className="sidebar-link__badge" aria-hidden="true">
                {downloadsBadge}
              </span>
            ) : null}
          </button>
        ))}
      </nav>
    </aside>
  )
}
