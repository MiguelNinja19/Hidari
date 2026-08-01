import { CatalogSettingsSection } from './CatalogSettingsSection'
import { DownloadSettingsSection } from './DownloadSettingsSection'
import { InstallSettingsSection } from './InstallSettingsSection'
import { LanguageSettingsSection } from './LanguageSettingsSection'
import { NotificationSettingsSection } from './NotificationSettingsSection'
import type { SettingsPageProps } from './settingsTypes'
import { TraySettingsSection } from './TraySettingsSection'
import { CloudSaveSettingsSection } from '../cloud-save/CloudSaveSettingsSection'
import { DownloadExtrasSettingsSection } from '../download-extras/DownloadExtrasSettingsSection'

export function SettingsPage(props: SettingsPageProps) {
  return (
    <section className="set-page">
      <div className="set-grid">
        <LanguageSettingsSection />
        <DownloadSettingsSection {...props} />
        <InstallSettingsSection {...props} />
        <TraySettingsSection {...props} />
        <NotificationSettingsSection {...props} />
        <CatalogSettingsSection {...props} />
        <CloudSaveSettingsSection />
        <DownloadExtrasSettingsSection />
      </div>
    </section>
  )
}
