import type { ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { TitleBar } from './TitleBar'
import type { NavTab } from './types'

type AppShellProps = {
  activeTab: NavTab
  activeDownloadsCount: number
  onTabChange: (tab: NavTab) => void
  banner?: ReactNode
  children: ReactNode
}

export function AppShell({
  activeTab,
  activeDownloadsCount,
  onTabChange,
  banner,
  children,
}: AppShellProps) {
  return (
    <div className="app-frame">
      <TitleBar />
      <main className="nova-shell">
        <Sidebar
          activeTab={activeTab}
          activeDownloadsCount={activeDownloadsCount}
          onTabChange={onTabChange}
        />
        <section className="main-panel">
          {banner}
          <section
            className={`main-content${
              activeTab === 'settings' || activeTab === 'downloads'
                ? ' main-content--full'
                : activeTab === 'library'
                  ? ' main-content--library'
                  : activeTab === 'discover' || activeTab === 'favorites' || activeTab === 'home'
                    ? ' main-content--discover'
                    : ''
            }`}
          >
            {children}
          </section>
        </section>
      </main>
    </div>
  )
}
