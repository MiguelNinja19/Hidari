import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { SettingsPageProps } from './settingsTypes'
import { AddSourceJsonPanel, AddSourceUrlPanel } from './AddSourceMethodPanel'

type Props = Pick<
  SettingsPageProps,
  | 'addingSource'
  | 'sourceUrlInput'
  | 'setSourceUrlInput'
  | 'onAddSourceByUrl'
  | 'onImportSource'
  | 'onOpenHydraLinksSite'
>

export function AddSourcePanel(props: Props) {
  const { t } = useTranslation()
  const [method, setMethod] = useState<'url' | 'json'>('url')
  return (
    <div className="set-add">
      <div className="set-add__toolbar">
        <div
          className="set-add__tabs"
          role="tablist"
          aria-label={t('settings.addSourceChooseLabel')}
        >
          {(['url', 'json'] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={method === value}
              className={`set-add__tab${method === value ? ' is-active' : ''}`}
              disabled={props.addingSource}
              onClick={() => setMethod(value)}
            >
              {t(value === 'url' ? 'settings.addSourceByUrlTitle' : 'settings.addSourceByFileTitle')}
            </button>
          ))}
        </div>
        {method === 'json' ? (
          <button
            type="button"
            className="set-btn set-btn--secondary set-add__submit"
            disabled={props.addingSource}
            onClick={() => void props.onImportSource()}
          >
            {props.addingSource ? t('settings.importing') : t('settings.importJsonFile')}
          </button>
        ) : null}
      </div>
      <div className="set-add__body">
        {method === 'url' ? (
          <AddSourceUrlPanel {...props} />
        ) : (
          <AddSourceJsonPanel />
        )}
      </div>
    </div>
  )
}
