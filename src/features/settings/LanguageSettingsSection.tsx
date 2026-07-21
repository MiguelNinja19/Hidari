import { useTranslation } from 'react-i18next'
import {
  APP_LANGUAGES,
  APP_LOCALE,
  isAppLanguage,
  type AppLanguage,
} from '../../shared/config/locale'
import { setAppLanguage } from '../../shared/i18n'
import { SettingsSection } from './SettingsSection'

export function LanguageSettingsSection() {
  const { t, i18n } = useTranslation()
  const language: AppLanguage = isAppLanguage(i18n.language) ? i18n.language : APP_LOCALE

  return (
    <SettingsSection
      id="settings-language"
      title={t('settings.languageTitle')}
      description={t('settings.languageDesc')}
    >
      <label className="set-field">
        <span className="set-field__label">{t('settings.languageLabel')}</span>
        <select
          className="set-input set-input--select"
          value={language}
          aria-label={t('settings.languageTitle')}
          onChange={(event) => {
            if (isAppLanguage(event.target.value)) void setAppLanguage(event.target.value)
          }}
        >
          {APP_LANGUAGES.map((item) => (
            <option key={item.code} value={item.code}>
              {item.nativeLabel}
            </option>
          ))}
        </select>
      </label>
    </SettingsSection>
  )
}
