import { useTranslation } from 'react-i18next'
import type { SettingsPageProps } from './settingsTypes'

type Props = Pick<
  SettingsPageProps,
  | 'sources'
  | 'sourcesLoading'
  | 'disabledSourceIds'
  | 'disabledSourcesReady'
  | 'deletingSourceId'
  | 'syncingSourceId'
  | 'onToggleSourceEnabled'
  | 'onSyncSource'
  | 'onDeleteSource'
>

export function SourceSettingsList(props: Props) {
  const { t, i18n } = useTranslation()
  if (props.sources.length === 0 && !props.sourcesLoading) {
    return (
      <div className="set-empty">
        <p className="set-empty__title">{t('settings.noSourcesHint')}</p>
        <p className="set-empty__text">{t('settings.catalogEmptyHint')}</p>
      </div>
    )
  }
  if (props.sources.length === 0) return null

  return (
    <ul className="set-sources" role="list">
      {props.sources.map((source) => {
        const syncing = props.syncingSourceId === source.id
        const deleting = props.deletingSourceId === source.id
        const enabled = !props.disabledSourceIds.includes(source.id)
        return (
          <li
            key={source.id}
            className={`set-source${enabled ? '' : ' set-source--disabled'}`}
          >
            <div className="set-source__main">
              <strong className="set-source__name">{source.name}</strong>
              <span className="set-source__meta">
                {source.downloadCount > 0
                  ? t('settings.gamesCount', {
                      count: source.downloadCount.toLocaleString(i18n.language),
                    })
                  : t('settings.gamesCountEmpty')}
              </span>
            </div>
            <div
              className="set-source__actions"
              role="group"
              aria-label={t('settings.sourceActions', { name: source.name })}
            >
              <button
                type="button"
                className={enabled ? 'switch-btn switch-btn--on' : 'switch-btn'}
                disabled={!props.disabledSourcesReady || deleting}
                aria-pressed={enabled}
                aria-label={t(enabled ? 'settings.disableSource' : 'settings.enableSource', {
                  name: source.name,
                })}
                onClick={() => void props.onToggleSourceEnabled(source.id, !enabled)}
              />
              <button
                type="button"
                className={`set-btn set-btn--sync set-btn--compact${syncing ? ' is-busy' : ''}`}
                disabled={syncing || deleting}
                aria-busy={syncing}
                onClick={() => void props.onSyncSource(source.id, source.name)}
              >
                {syncing ? (
                  <>
                    <span className="set-btn__spinner" aria-hidden />
                    {t('settings.syncing')}
                  </>
                ) : (
                  t('common.sync')
                )}
              </button>
              <button
                type="button"
                className="set-btn set-btn--danger set-btn--compact"
                disabled={syncing || deleting}
                aria-label={t('common.delete')}
                onClick={() => void props.onDeleteSource(source.id, source.name)}
              >
                {deleting ? t('settings.deleting') : t('common.delete')}
              </button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
