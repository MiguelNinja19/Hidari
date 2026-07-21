use std::ffi::OsStr;
use std::os::windows::ffi::OsStrExt;
use std::path::Path;
use winreg::enums::HKEY_CURRENT_USER;
use winreg::RegKey;

/// Regista o AUMID em HKCU para toasts WinRT funcionarem sem instalador
/// (e em dev / portable). Também associa o processo ao mesmo ID.
pub fn register(aumid: &str, display_name: &str, icon_path: Option<&Path>) {
  if aumid.trim().is_empty() {
    return;
  }

  let hkcu = RegKey::predef(HKEY_CURRENT_USER);
  let path = format!(r"Software\Classes\AppUserModelId\{aumid}");
  if let Ok((key, _)) = hkcu.create_subkey(&path) {
    let _ = key.set_value("DisplayName", &display_name);
    if let Some(icon) = icon_path.filter(|p| p.is_file()) {
      let icon_uri = icon.to_string_lossy().to_string();
      let _ = key.set_value("IconUri", &icon_uri);
    }
  }

  let wide: Vec<u16> = OsStr::new(aumid)
    .encode_wide()
    .chain(std::iter::once(0))
    .collect();
  unsafe {
    let _ = windows_sys::Win32::UI::Shell::SetCurrentProcessExplicitAppUserModelID(
      wide.as_ptr(),
    );
  }
}
