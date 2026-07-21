import { useTranslation } from 'react-i18next'
import { AddSourcePanel } from './AddSourcePanel'
import type { SettingsPageProps } from './settingsTypes'
import { SettingsSection } from './SettingsSection'
import { SourceSettingsList } from './SourceSettingsList'

export function CatalogSettingsSection(props: SettingsPageProps) {
  const { t } = useTranslation()
  const catalogMeta =
    props.sources.length > 0
      ? t('settings.catalogSourcesCount', { count: props.sources.length })
      : t('settings.catalogSourcesNone')

  return (
    <SettingsSection
      id="settings-catalog"
      title={t('settings.catalogTitle')}
      description={catalogMeta}
      actions={
        <>
          <button
            type="button"
            className="set-btn set-btn--secondary"
            disabled={props.addingSource}
            onClick={() => void props.onOpenCatalogsFolder()}
          >
            {t('settings.openCatalogFolder')}
          </button>
          {props.sources.length > 0 ? (
            <button
              type="button"
              className={`set-btn set-btn--sync${props.syncingAllSources ? ' is-busy' : ''}`}
              disabled={
                props.syncingAllSources || props.addingSource || props.sourcesLoading
              }
              aria-busy={props.syncingAllSources}
              onClick={() => void props.onSyncAllSources()}
            >
              {props.syncingAllSources ? (
                <>
                  <span className="set-btn__spinner" aria-hidden />
                  {t('settings.syncingAll')}
                </>
              ) : (
                t('settings.syncAll')
              )}
            </button>
          ) : null}
        </>
      }
    >
      <AddSourcePanel {...props} />
      <SourceSettingsList {...props} />
    </SettingsSection>
  )
}
