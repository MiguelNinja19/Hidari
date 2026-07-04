import type { ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import type { NavTab } from './types'

type AppShellProps = {
  activeTab: NavTab
  onTabChange: (tab: NavTab) => void
  children: ReactNode
}

export function AppShell({ activeTab, onTabChange, children }: AppShellProps) {
  return (
    <main className="nova-shell">
      <Sidebar activeTab={activeTab} onTabChange={onTabChange} />
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
  )
}
