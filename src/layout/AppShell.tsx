import type { ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { TitleBar } from './TitleBar'
import type { NavTab } from './types'

type AppShellProps = {
  activeTab: NavTab
  activeDownloadsCount: number
  onTabChange: (tab: NavTab) => void
  children: ReactNode
}

export function AppShell({ activeTab, activeDownloadsCount, onTabChange, children }: AppShellProps) {
  return (
    <div className="app-frame">
      <TitleBar />
      <main className="nova-shell">
        <Sidebar activeTab={activeTab} activeDownloadsCount={activeDownloadsCount} onTabChange={onTabChange} />
        <section className="main-panel">
          <section
            className={`main-content${
              activeTab === 'discover' ||
              activeTab === 'library' ||
              activeTab === 'downloads' ||
              activeTab === 'settings'
                ? ' main-content--wide'
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
