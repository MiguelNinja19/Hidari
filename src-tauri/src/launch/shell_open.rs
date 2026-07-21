//! Abertura rápida de URLs / atalhos / pastas via shell (sem `cmd.exe`).

/// Abre um alvo (`steam://…`, caminho de ficheiro/pasta) sem bloquear.
pub fn open_shell_target(target: &str) -> Result<(), String> {
    let target = target.trim();
    if target.is_empty() {
        return Err("could_not_open_target: empty".to_string());
    }

    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStrExt;
        use windows_sys::Win32::UI::Shell::ShellExecuteW;

        const SW_SHOWNORMAL: i32 = 1;

        let operation: Vec<u16> = std::ffi::OsStr::new("open")
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        let file: Vec<u16> = std::ffi::OsStr::new(target)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();

        // > 32 = sucesso (HINSTANCE reinterpretado).
        let result = unsafe {
            ShellExecuteW(
                std::ptr::null_mut(),
                operation.as_ptr(),
                file.as_ptr(),
                std::ptr::null(),
                std::ptr::null(),
                SW_SHOWNORMAL,
            )
        };
        if (result as isize) <= 32 {
            return Err(format!(
                "could_not_open_target: ShellExecute failed ({})",
                result as isize
            ));
        }
        return Ok(());
    }

    #[cfg(not(windows))]
    {
        open::that(target).map_err(|error| format!("could_not_open_target: {error}"))
    }
}
