import { useTranslation } from 'react-i18next'
import type { SettingsPageProps } from './settingsTypes'
import { SettingsSection } from './SettingsSection'

type Props = Pick<
  SettingsPageProps,
  | 'notifyReadyToInstall'
  | 'notifyReadyToPlay'
  | 'notifyCatalogChanges'
  | 'handleToggleNotifyReadyToInstall'
  | 'handleToggleNotifyReadyToPlay'
  | 'handleToggleNotifyCatalogChanges'
  | 'handleTestNotification'
  | 'notifyTestBusy'
>

export function NotificationSettingsSection(props: Props) {
  const { t } = useTranslation()
  const toggles = [
    {
      key: 'ReadyToInstall',
      enabled: props.notifyReadyToInstall,
      toggle: props.handleToggleNotifyReadyToInstall,
    },
    {
      key: 'ReadyToPlay',
      enabled: props.notifyReadyToPlay,
      toggle: props.handleToggleNotifyReadyToPlay,
    },
    {
      key: 'CatalogChanges',
      enabled: props.notifyCatalogChanges,
      toggle: props.handleToggleNotifyCatalogChanges,
    },
  ] as const

  return (
    <SettingsSection
      id="settings-notifications"
      title={t('settings.notificationsTitle')}
      description={t('settings.notificationsDesc')}
    >
      {toggles.map(({ key, enabled, toggle }) => (
        <div className="set-switch" key={key}>
          <div className="set-switch__copy">
            <span className="set-switch__label">
              {t(`settings.notify${key}`)}
            </span>
            <span className="set-switch__hint">
              {t(`settings.notify${key}Hint`)}
            </span>
          </div>
          <button
            type="button"
            className={enabled ? 'switch-btn switch-btn--on' : 'switch-btn'}
            aria-label={t(`settings.notify${key}`)}
            onClick={() => void toggle(!enabled)}
          />
        </div>
      ))}
      <div className="set-switch">
        <div className="set-switch__copy">
          <span className="set-switch__label">{t('settings.notifyTest')}</span>
          <span className="set-switch__hint">{t('settings.notifyTestHint')}</span>
        </div>
        <button
          type="button"
          className="set-btn set-btn--secondary set-btn--compact"
          disabled={props.notifyTestBusy}
          onClick={() => void props.handleTestNotification()}
        >
          {props.notifyTestBusy ? t('settings.notifyTestBusy') : t('settings.notifyTest')}
        </button>
      </div>
    </SettingsSection>
  )
}
