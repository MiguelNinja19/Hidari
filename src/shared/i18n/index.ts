import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { APP_LOCALE } from '../config/locale'
import ptBR from './pt-BR.json'
import en from './en.json'

void i18n.use(initReactI18next).init({
  resources: {
    'pt-BR': { translation: ptBR },
    en: { translation: en },
  },
  lng: APP_LOCALE,
  fallbackLng: 'pt-BR',
  supportedLngs: ['pt-BR'],
  nonExplicitSupportedLngs: false,
  interpolation: {
    escapeValue: false,
  },
})

export default i18n
