export const APP_LANGUAGES = [
  { code: 'en', label: 'English', nativeLabel: 'English' },
  { code: 'pt-BR', label: 'Português', nativeLabel: 'Português (Brasil)' },
  { code: 'es', label: 'Español', nativeLabel: 'Español' },
  { code: 'ru', label: 'Русский', nativeLabel: 'Русский' },
] as const

export type AppLanguage = (typeof APP_LANGUAGES)[number]['code']

/** Locale padrão da interface (inglês). */
export const APP_LOCALE: AppLanguage = 'en'

/** Chave válida para SQLite (`[A-Za-z0-9_]`). */
export const LANGUAGE_STORAGE_KEY = 'hidari_language'

/** Chave antiga em localStorage / tentativas de mirror SQLite. */
const LANGUAGE_STORAGE_KEY_LEGACY = 'hidari.language'

/** One-shot: aplicar idioma do instalador NSIS após o bug do default EN. */
export const INSTALLER_LANGUAGE_MIGRATION_KEY = 'hidari_installer_lang_v1'

export function isAppLanguage(value: string | null | undefined): value is AppLanguage {
  return APP_LANGUAGES.some((lang) => lang.code === value)
}

/** Valor guardado, ou `null` se ainda não houver preferência. */
export function peekStoredLanguage(): AppLanguage | null {
  try {
    const stored =
      localStorage.getItem(LANGUAGE_STORAGE_KEY) ??
      localStorage.getItem(LANGUAGE_STORAGE_KEY_LEGACY)
    if (isAppLanguage(stored)) return stored
  } catch {
    /* ignore */
  }
  return null
}

export function readStoredLanguage(): AppLanguage {
  return peekStoredLanguage() ?? APP_LOCALE
}

export function persistLanguage(code: AppLanguage): void {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, code)
    localStorage.removeItem(LANGUAGE_STORAGE_KEY_LEGACY)
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
