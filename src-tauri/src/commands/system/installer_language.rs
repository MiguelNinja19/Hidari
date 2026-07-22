/// Lê o idioma escolhido no instalador NSIS (`Installer Language` LCID).
/// Chave: `HKCU\Software\{publisher}\{productName}` — ver `tauri.conf.json`.

#[cfg(windows)]
fn map_nsis_lcid(lcid: u32) -> Option<&'static str> {
  match lcid {
    1033 => Some("en"),       // English
    1034 => Some("es"),       // Spanish
    1046 => Some("pt-BR"),    // PortugueseBR
    1049 => Some("ru"),       // Russian
    _ => None,
  }
}

#[cfg(windows)]
fn read_installer_language_lcid() -> Option<u32> {
  use winreg::enums::HKEY_CURRENT_USER;
  use winreg::RegKey;

  let hkcu = RegKey::predef(HKEY_CURRENT_USER);
  // publisher + productName em tauri.conf.json
  let key = hkcu
    .open_subkey(r"Software\Hidari\Hidari")
    .ok()?;
  // NSIS MUI grava DWORD; alguns builds podem ser string
  if let Ok(v) = key.get_value::<u32, _>("Installer Language") {
    return Some(v);
  }
  if let Ok(s) = key.get_value::<String, _>("Installer Language") {
    return s.trim().parse().ok();
  }
  None
}

#[tauri::command]
pub fn get_installer_language() -> Option<String> {
  #[cfg(windows)]
  {
    return read_installer_language_lcid()
      .and_then(map_nsis_lcid)
      .map(str::to_string);
  }
  #[cfg(not(windows))]
  {
    None
  }
}
