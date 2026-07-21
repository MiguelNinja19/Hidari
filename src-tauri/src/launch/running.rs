use std::path::Path;

/// Verifica se um executável já está a correr.
/// No Windows usa Toolhelp (rápido). Evita `sysinfo` com refresh de todos os
/// processos — isso atrasava o Play ~5–15s.
pub fn is_executable_running(target: &Path) -> bool {
    if target.as_os_str().is_empty() {
        return false;
    }
    let Some(want_name) = target.file_name().and_then(|name| name.to_str()) else {
        return false;
    };
    let want_name = want_name.to_ascii_lowercase();

    #[cfg(target_os = "windows")]
    {
        return windows_process_name_running(&want_name);
    }

    #[cfg(not(target_os = "windows"))]
    {
        use sysinfo::{ProcessesToUpdate, System};
        let target_norm = target.to_string_lossy().replace('/', "\\").to_lowercase();
        let mut system = System::new();
        system.refresh_processes(ProcessesToUpdate::All, true);
        for process in system.processes().values() {
            let name_match = process
                .name()
                .to_string_lossy()
                .eq_ignore_ascii_case(&want_name);
            if !name_match {
                continue;
            }
            if let Some(exe) = process.exe() {
                if exe.to_string_lossy().replace('/', "\\").to_lowercase() == target_norm {
                    return true;
                }
            } else {
                return true;
            }
        }
        false
    }
}

#[cfg(target_os = "windows")]
fn windows_process_name_running(want_name_lower: &str) -> bool {
    use std::mem::{size_of, zeroed};
    use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE};
    use windows_sys::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
        TH32CS_SNAPPROCESS,
    };

    unsafe {
        let snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if snap == INVALID_HANDLE_VALUE {
            return false;
        }

        let mut entry: PROCESSENTRY32W = zeroed();
        entry.dwSize = size_of::<PROCESSENTRY32W>() as u32;

        let mut running = false;
        if Process32FirstW(snap, &mut entry) != 0 {
            loop {
                let name = wchar_to_string(&entry.szExeFile);
                if name.eq_ignore_ascii_case(want_name_lower) {
                    running = true;
                    break;
                }
                if Process32NextW(snap, &mut entry) == 0 {
                    break;
                }
            }
        }
        CloseHandle(snap);
        running
    }
}

#[cfg(target_os = "windows")]
fn wchar_to_string(buf: &[u16]) -> String {
    let len = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
    String::from_utf16_lossy(&buf[..len])
}
