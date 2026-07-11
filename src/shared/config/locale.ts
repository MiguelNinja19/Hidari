export const APP_LANGUAGES = [
  { code: 'pt-BR', label: 'Português', nativeLabel: 'Português (Brasil)' },
  { code: 'en', label: 'English', nativeLabel: 'English' },
  { code: 'es', label: 'Español', nativeLabel: 'Español' },
  { code: 'ru', label: 'Русский', nativeLabel: 'Русский' },
] as const

export type AppLanguage = (typeof APP_LANGUAGES)[number]['code']

/** Locale padrão da interface (português do Brasil). */
export const APP_LOCALE: AppLanguage = 'pt-BR'

export const LANGUAGE_STORAGE_KEY = 'hidari.language'

export function isAppLanguage(value: string | null | undefined): value is AppLanguage {
  return APP_LANGUAGES.some((lang) => lang.code === value)
}

export function readStoredLanguage(): AppLanguage {
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY)
    if (isAppLanguage(stored)) return stored
  } catch {
    /* ignore */
  }
  return APP_LOCALE
}

export function persistLanguage(code: AppLanguage): void {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, code)
  } catch {
    /* ignore */
  }
}

/** Locale BCP-47 para formatação de números/datas. */
export function localeForLanguage(code: AppLanguage): string {
  switch (code) {
    case 'en':
      return 'en-US'
    case 'es':
      return 'es-ES'
    case 'ru':
      return 'ru-RU'
    default:
      return 'pt-BR'
  }
}
