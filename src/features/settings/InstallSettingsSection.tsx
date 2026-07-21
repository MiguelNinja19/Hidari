import { useTranslation } from 'react-i18next'
import { formatSize } from '../../shared/utils/formatters'
import type { SettingsPageProps } from './settingsTypes'
import { SettingsSection } from './SettingsSection'

type Props = Pick<
  SettingsPageProps,
  | 'defaultDownloadPath'
  | 'diskFreeBytes'
  | 'installOrganization'
  | 'afterInstallAction'
  | 'setDefaultDownloadPath'
  | 'setInstallOrganization'
  | 'setAfterInstallAction'
  | 'handleSelectDefaultPath'
  | 'handleSaveInstallSettings'
>

export function InstallSettingsSection(props: Props) {
  const { t } = useTranslation()
  const freeSpace =
    props.diskFreeBytes != null && props.diskFreeBytes >= 0
      ? t('settings.freeSpace', { size: formatSize(props.diskFreeBytes) })
      : null
  return (
    <SettingsSection
      id="settings-folder"
      title={t('settings.installTitle')}
      description={t('settings.installDesc')}
      actions={
        <button
          className="set-btn set-btn--primary set-card__action"
          type="button"
          onClick={() => void props.handleSaveInstallSettings()}
        >
          {t('common.save')}
        </button>
      }
    >
      <div className="set-card__body--grid">
        <div className="set-field set-field--span">
          <span className="set-field__label">{t('settings.destinationFolder')}</span>
          {freeSpace ? <span className="set-field__hint">{freeSpace}</span> : null}
          <div className="set-input-group">
            <input
              className="set-input set-input--grow"
              placeholder="C:\\Games"
              value={props.defaultDownloadPath}
              onChange={(event) => props.setDefaultDownloadPath(event.target.value)}
            />
            <button
              className="set-btn set-btn--secondary"
              type="button"
              onClick={() => void props.handleSelectDefaultPath()}
            >
              {t('common.browse')}
            </button>
          </div>
        </div>
        <label className="set-field">
          <span className="set-field__label">{t('settings.folderOrganization')}</span>
          <select
            className="set-input set-input--select"
            value={props.installOrganization}
            onChange={(event) => props.setInstallOrganization(event.target.value)}
          >
            <option value="separate-folder">{t('settings.orgSeparate')}</option>
            <option value="single-folder">{t('settings.orgSingle')}</option>
          </select>
        </label>
        <label className="set-field">
          <span className="set-field__label">{t('settings.afterInstall')}</span>
          <select
            className="set-input set-input--select"
            value={props.afterInstallAction}
            onChange={(event) => props.setAfterInstallAction(event.target.value)}
          >
            <option value="ask">{t('settings.afterAsk')}</option>
            <option value="open-folder">{t('settings.afterOpenFolder')}</option>
            <option value="launch-game">{t('settings.afterLaunch')}</option>
          </select>
        </label>
      </div>
    </SettingsSection>
  )
}
