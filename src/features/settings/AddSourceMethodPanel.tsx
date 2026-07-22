import { useTranslation } from 'react-i18next'
import { EXAMPLE_SOURCE_URL } from '../../shared/config/hydraLinks'
import type { SettingsPageProps } from './settingsTypes'

type Props = Pick<
  SettingsPageProps,
  | 'addingSource'
  | 'sourceUrlInput'
  | 'setSourceUrlInput'
  | 'onAddSourceByUrl'
  | 'onOpenHydraLinksSite'
>

export function AddSourceUrlPanel(props: Props) {
  const { t } = useTranslation()
  const canAdd = props.sourceUrlInput.trim().length > 0
  return (
    <div className="set-add__panel">
      <div className="set-add__row set-add__row--inline">
        <input
          className="set-input set-input--grow"
          type="url"
          placeholder={EXAMPLE_SOURCE_URL}
          value={props.sourceUrlInput}
          disabled={props.addingSource}
          aria-label={t('settings.catalogUrl')}
          onChange={(event) => props.setSourceUrlInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && canAdd) {
              event.preventDefault()
              void props.onAddSourceByUrl()
            }
          }}
        />
        <button
          type="button"
          className="set-btn set-btn--secondary set-add__submit"
          disabled={props.addingSource || !canAdd}
          onClick={() => void props.onAddSourceByUrl()}
        >
          {props.addingSource ? t('settings.adding') : t('settings.addSourceConfirm')}
        </button>
      </div>
      <div className="set-add__example">
        <span className="set-add__example-label">{t('settings.addSourceExampleLabel')}</span>
        <button
          type="button"
          className="set-add__example-url"
          disabled={props.addingSource}
          title={t('settings.addSourceUseExample')}
          onClick={() => props.setSourceUrlInput(EXAMPLE_SOURCE_URL)}
        >
          {EXAMPLE_SOURCE_URL}
        </button>
        <button
          type="button"
          className="set-add__link"
          disabled={props.addingSource}
          onClick={() => void props.onOpenHydraLinksSite()}
        >
          {t('settings.openHydraLinks')}
        </button>
      </div>
    </div>
  )
}

export function AddSourceJsonPanel() {
  const { t } = useTranslation()
  return (
    <div className="set-add__format">
      <p className="set-add__hint">{t('settings.addSourceJsonFormatHint')}</p>
      <pre className="set-add__code" tabIndex={0}>{`{
  "name": "Minha fonte",
  "downloads": [{
    "title": "Nome do jogo",
    "fileSize": "10 GB",
    "uris": ["magnet:?xt=urn:btih:..."]
  }]
}`}</pre>
    </div>
  )
}
