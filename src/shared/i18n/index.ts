import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import {
  APP_LANGUAGES,
  LANGUAGE_STORAGE_KEY,
  persistLanguage,
  readStoredLanguage,
  type AppLanguage,
} from '../config/locale'
import { sourcesApi } from '../api/tauri/sourcesApi'
import ptBR from './pt-BR.json'
import en from './en.json'
import es from './es.json'
import ru from './ru.json'

const supportedLngs = APP_LANGUAGES.map((lang) => lang.code)

function syncDocumentLang(code: string) {
  if (typeof document === 'undefined') return
  document.documentElement.lang = code
}

void i18n.use(initReactI18next).init({
  resources: {
    'pt-BR': { translation: ptBR },
    en: { translation: en },
    es: { translation: es },
    ru: { translation: ru },
  },
  lng: readStoredLanguage(),
  fallbackLng: 'en',
  supportedLngs: [...supportedLngs],
  nonExplicitSupportedLngs: false,
  interpolation: {
    escapeValue: false,
  },
})

syncDocumentLang(i18n.language)
i18n.on('languageChanged', syncDocumentLang)

export async function setAppLanguage(code: AppLanguage): Promise<void> {
  persistLanguage(code)
  await i18n.changeLanguage(code)
  try {
    await sourcesApi.setAppSetting(LANGUAGE_STORAGE_KEY, code)
  } catch {
    // Tauri indisponível (ex.: dev no browser)
  }
}

export default i18n
