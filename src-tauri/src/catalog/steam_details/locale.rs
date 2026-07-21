const DEFAULT_STEAM_STORE_LOCALE: &str = "english";
const APP_LANGUAGE_SETTING_KEY: &str = "hidari.language";

pub fn steam_store_locale_for_language(code: &str) -> &'static str {
  let normalized = code.trim().to_ascii_lowercase().replace('_', "-");
  match normalized.as_str() {
    "en" | "en-us" | "en-gb" => DEFAULT_STEAM_STORE_LOCALE,
    "es" | "es-es" | "es-mx" | "es-419" => "spanish",
    "ru" | "ru-ru" => "russian",
    "pt" | "pt-br" | "pt-pt" => "brazilian",
    _ => DEFAULT_STEAM_STORE_LOCALE,
  }
}

pub(crate) fn read_app_steam_locale(conn: &rusqlite::Connection) -> String {
  crate::db::read_app_setting(conn, APP_LANGUAGE_SETTING_KEY)
    .map(|code| steam_store_locale_for_language(&code).to_string())
    .unwrap_or_else(|| DEFAULT_STEAM_STORE_LOCALE.to_string())
}

pub(crate) fn resolve_steam_locale(conn: &rusqlite::Connection, language: Option<&str>) -> String {
  language
    .map(str::trim)
    .filter(|code| !code.is_empty())
    .map(steam_store_locale_for_language)
    .map(str::to_string)
    .unwrap_or_else(|| read_app_steam_locale(conn))
}

pub(crate) fn default_steam_locale() -> String {
  String::new()
}
