import type { ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { TitleBar } from './TitleBar'
import type { NavTab } from './types'

type AppShellProps = {
  activeTab: NavTab
  activeDownloadsCount: number
  activeDownloadSpeedBps?: number
  onTabChange: (tab: NavTab) => void
  children: ReactNode
}

export function AppShell({
  activeTab,
  activeDownloadsCount,
  activeDownloadSpeedBps = 0,
  onTabChange,
  children,
}: AppShellProps) {
  return (
    <div className="app-frame">
      <TitleBar />
      <main className="nova-shell">
        <Sidebar
          activeTab={activeTab}
          activeDownloadsCount={activeDownloadsCount}
          activeDownloadSpeedBps={activeDownloadSpeedBps}
          onTabChange={onTabChange}
        />
        <section className="main-panel">
          <section
            className={`main-content${
              activeTab === 'settings' || activeTab === 'downloads'
                ? ' main-content--full'
                : activeTab === 'library'
                  ? ' main-content--library'
                  : activeTab === 'discover'
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
