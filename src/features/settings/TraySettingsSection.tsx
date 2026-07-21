import { useTranslation } from 'react-i18next'
import type { SettingsPageProps } from './settingsTypes'
import { SettingsSection } from './SettingsSection'

type Props = Pick<
  SettingsPageProps,
  'minimizeToTray' | 'handleToggleMinimizeToTray'
>

export function TraySettingsSection(props: Props) {
  const { t } = useTranslation()
  return (
    <SettingsSection
      id="settings-tray"
      title={t('settings.trayTitle')}
      description={t('settings.trayDesc')}
    >
      <div className="set-switch">
        <div className="set-switch__copy">
          <span className="set-switch__label">{t('settings.minimizeToTray')}</span>
          <span className="set-switch__hint">{t('settings.minimizeToTrayHint')}</span>
        </div>
        <button
          type="button"
          className={props.minimizeToTray ? 'switch-btn switch-btn--on' : 'switch-btn'}
          aria-label={t('settings.minimizeToTrayAria')}
          onClick={() => void props.handleToggleMinimizeToTray(!props.minimizeToTray)}
        />
      </div>
    </SettingsSection>
  )
}
