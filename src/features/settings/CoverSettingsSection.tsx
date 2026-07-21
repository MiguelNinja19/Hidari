import { useTranslation } from 'react-i18next'
import type { SettingsPageProps } from './settingsTypes'
import { SettingsSection } from './SettingsSection'

type Props = Pick<
  SettingsPageProps,
  | 'coverPrecacheStatus'
  | 'coverPrecacheBusy'
  | 'onStartCoverPrecache'
  | 'onStopCoverPrecache'
  | 'onRetryUnresolvedCovers'
>

export function CoverSettingsSection(props: Props) {
  const { t } = useTranslation()
  const status = props.coverPrecacheStatus
  return (
    <SettingsSection
      id="settings-covers"
      title={t('settings.coversTitle')}
      description={t('settings.coversDesc')}
      defaultOpen={false}
    >
      <p className="set-field__hint">
        {status
          ? status.running
            ? t('settings.coversProgress', {
                processed: status.processed,
                total: status.total,
                cached: status.cached,
              })
            : t('settings.coversIdle', {
                cached: status.cached,
                unresolved: status.unresolved,
                failed: status.failed,
              })
          : t('settings.coversIdleEmpty')}
      </p>
      <div className="set-card__actions set-card__actions--inline">
        <button
          type="button"
          className="set-btn set-btn--primary set-btn--compact"
          disabled={props.coverPrecacheBusy || Boolean(status?.running)}
          onClick={() => void props.onStartCoverPrecache()}
        >
          {t('settings.coversStart')}
        </button>
        <button
          type="button"
          className="set-btn set-btn--secondary set-btn--compact"
          disabled={props.coverPrecacheBusy || !status?.running}
          onClick={() => void props.onStopCoverPrecache()}
        >
          {t('settings.coversStop')}
        </button>
        <button
          type="button"
          className="set-btn set-btn--secondary set-btn--compact"
          disabled={props.coverPrecacheBusy || Boolean(status?.running)}
          onClick={() => void props.onRetryUnresolvedCovers()}
        >
          {t('settings.coversRetry')}
        </button>
      </div>
    </SettingsSection>
  )
}
