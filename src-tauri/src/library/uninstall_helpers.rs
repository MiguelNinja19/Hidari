use regex::Regex;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

/// Inno: sempre `unins` + números opcionais + `.exe` (unins.exe, unins000.exe, …).
fn unins_exe_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(?i)^unins\d*\.exe$").expect("unins regex"))
}

pub(crate) fn is_unins_exe_name(name: &str) -> bool {
    unins_exe_regex().is_match(name)
}

pub(crate) fn find_inno_uninstaller(dir: &Path) -> Option<PathBuf> {
    let mut matches: Vec<_> = fs::read_dir(dir)
        .ok()?
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| {
            path.is_file()
                && path
                    .file_name()
                    .and_then(|value| value.to_str())
                    .is_some_and(is_unins_exe_name)
        })
        .collect();
    if matches.is_empty() {
        return None;
    }
    // Preferir unins000.exe (Inno padrão), depois unins.exe, resto por nome.
    matches.sort_by(|a, b| {
        let rank = |path: &Path| -> u8 {
            let name = path
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("")
                .to_ascii_lowercase();
            if name == "unins000.exe" {
                0
            } else if name == "unins.exe" {
                1
            } else {
                2
            }
        };
        rank(a)
            .cmp(&rank(b))
            .then_with(|| a.file_name().cmp(&b.file_name()))
    });
    matches.into_iter().next()
}

/// A partir do .exe do jogo, sobe pastas até achar unins*.exe (raiz típica Inno).
pub(crate) fn find_install_root_from_exe(exe: &Path) -> Option<PathBuf> {
    let mut current = exe.parent()?.to_path_buf();
    for _ in 0..5 {
        if find_inno_uninstaller(&current).is_some() {
            return Some(current);
        }
        match current.parent() {
            Some(parent) if parent != current => current = parent.to_path_buf(),
            _ => break,
        }
    }
    // Sem desinstalador: pasta do .exe (instalação portátil / não-Inno).
    exe.parent().map(Path::to_path_buf)
}

fn run_inno_uninstaller(uninstaller: &Path) -> Result<(), String> {
    let work_dir = uninstaller
        .parent()
        .filter(|path| path.exists())
        .map(Path::to_path_buf)
        .unwrap_or_else(|| PathBuf::from("."));
    let mut command = std::process::Command::new(uninstaller);
    command
        .current_dir(&work_dir)
        .args(["/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART"]);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000);
    }
    let status = command
        .status()
        .map_err(|error| format!("could_not_run_uninstaller: {error}"))?;
    status
        .success()
        .then_some(())
        .ok_or_else(|| format!("uninstaller_exit_code: {}", status.code().unwrap_or(-1)))
}

fn remove_with_retries(path: &Path, attempts: u32) -> Result<(), String> {
    let mut last_error = String::new();
    for attempt in 0..attempts {
        if !path.exists() {
            return Ok(());
        }
        match fs::remove_dir_all(path) {
            Ok(()) => return Ok(()),
            Err(error) => {
                last_error = error.to_string();
                if attempt + 1 < attempts {
                    std::thread::sleep(std::time::Duration::from_millis(400));
                }
            }
        }
    }
    Err(format!("could_not_delete_install_directory: {last_error}"))
}

pub(crate) fn uninstall_install_folder(folder: &Path) -> Result<(), String> {
    // Procurar uninstaller na pasta e num nível acima (ex.: bin\..\unins000.exe).
    let uninstaller = find_inno_uninstaller(folder).or_else(|| {
        folder
            .parent()
            .and_then(find_inno_uninstaller)
    });
    if let Some(uninstaller) = uninstaller {
        let uninstall_root = uninstaller
            .parent()
            .map(Path::to_path_buf)
            .unwrap_or_else(|| folder.to_path_buf());
        // Cancelar o uninstaller NÃO pode apagar a pasta à força — o passo seguinte
        // na UI removia o jogo da biblioteca mesmo com os ficheiros no disco.
        run_inno_uninstaller(&uninstaller)?;
        let _ = remove_with_retries(&uninstall_root, 6);
        if folder != uninstall_root {
            let _ = remove_with_retries(folder, 2);
        }
        // Se o unins*.exe ainda existe, o utilizador cancelou ou a desinstalação falhou.
        if find_inno_uninstaller(&uninstall_root).is_some()
            || find_inno_uninstaller(folder).is_some()
        {
            return Err("uninstall_cancelled_or_incomplete".to_string());
        }
        return Ok(());
    }
    remove_with_retries(folder, 4)
}
