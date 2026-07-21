import { CatalogSettingsSection } from './CatalogSettingsSection'
import { CoverSettingsSection } from './CoverSettingsSection'
import { DownloadSettingsSection } from './DownloadSettingsSection'
import { InstallSettingsSection } from './InstallSettingsSection'
import { LanguageSettingsSection } from './LanguageSettingsSection'
import { NotificationSettingsSection } from './NotificationSettingsSection'
import type { SettingsPageProps } from './settingsTypes'
import { TraySettingsSection } from './TraySettingsSection'

export function SettingsPage(props: SettingsPageProps) {
  return (
    <section className="set-page">
      <div className="set-grid">
        <LanguageSettingsSection />
        <DownloadSettingsSection {...props} />
        <InstallSettingsSection {...props} />
        <TraySettingsSection {...props} />
        <NotificationSettingsSection {...props} />
        <CoverSettingsSection {...props} />
        <CatalogSettingsSection {...props} />
      </div>
    </section>
  )
}
