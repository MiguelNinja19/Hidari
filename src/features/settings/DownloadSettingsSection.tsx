import { useTranslation } from 'react-i18next'
import type { SettingsPageProps } from './settingsTypes'
import { SettingsSection } from './SettingsSection'

type Props = Pick<
  SettingsPageProps,
  | 'downloadSpeedLimit'
  | 'removeTemporaryFiles'
  | 'seedTorrentsEnabled'
  | 'handleSpeedLimitChange'
  | 'handleToggleRemoveTemp'
  | 'handleToggleSeed'
>

export function DownloadSettingsSection(props: Props) {
  const { t } = useTranslation()
  return (
    <SettingsSection
      id="settings-downloads"
      title={t('settings.downloadsTitle')}
      description={t('settings.downloadsDesc')}
    >
      <label className="set-field set-field--row">
        <span className="set-field__label">{t('settings.speedLimit')}</span>
        <select
          className="set-input set-input--select set-input--narrow"
          value={props.downloadSpeedLimit}
          onChange={(event) => void props.handleSpeedLimitChange(event.target.value)}
        >
          <option value="ilimitado">{t('settings.speedUnlimited')}</option>
          <option value="50mb">50 MB/s</option>
          <option value="20mb">20 MB/s</option>
          <option value="10mb">10 MB/s</option>
        </select>
      </label>
      <Toggle
        label={t('settings.removeTemp')}
        hint={t('settings.removeTempHint')}
        ariaLabel={t('settings.removeTempAria')}
        enabled={props.removeTemporaryFiles}
        onToggle={props.handleToggleRemoveTemp}
      />
      <Toggle
        label={t('settings.seedAfter')}
        hint={t('settings.seedHint')}
        ariaLabel={t('settings.seedAria')}
        enabled={props.seedTorrentsEnabled}
        onToggle={props.handleToggleSeed}
      />
    </SettingsSection>
  )
}

function Toggle(props: {
  label: string
  hint: string
  ariaLabel: string
  enabled: boolean
  onToggle: (enabled: boolean) => Promise<void>
}) {
  return (
    <div className="set-switch">
      <div className="set-switch__copy">
        <span className="set-switch__label">{props.label}</span>
        <span className="set-switch__hint">{props.hint}</span>
      </div>
      <button
        type="button"
        className={props.enabled ? 'switch-btn switch-btn--on' : 'switch-btn'}
        aria-label={props.ariaLabel}
        onClick={() => void props.onToggle(!props.enabled)}
      />
    </div>
  )
}
