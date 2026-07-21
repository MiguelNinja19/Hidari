use super::common::*;
use crate::launch::*;
use std::{fs, io::Write};

#[test]
fn does_not_launch_steam_or_generic_launcher() {
    let dir = std::env::temp_dir().join(format!("launcher_steam_test_{}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();

    let stub = pe_stub();
    fs::write(dir.join("Steam.exe"), &stub).unwrap();
    fs::write(dir.join("Launcher.exe"), &stub).unwrap();
    fs::write(dir.join("Crystal Quest Legacy.exe"), &stub).unwrap();

    assert!(!is_likely_game_exe("Steam.exe"));
    assert!(!is_likely_game_exe("Launcher.exe"));
    assert!(is_store_or_platform_launcher_exe(
        "Steam.exe",
        &dir.join("Steam.exe")
    ));
    assert!(is_store_or_platform_launcher_exe(
        "Launcher.exe",
        &dir.join("Launcher.exe")
    ));

    let candidates = resolve_launch_candidates(GAME_LEGACY, &dir.to_string_lossy()).unwrap();
    assert_eq!(candidates[0], dir.join("Crystal Quest Legacy.exe"));

    let _ = fs::remove_dir_all(&dir);
}
#[cfg(target_os = "macos")]
#[test]
fn resolves_mac_app_launch_candidate() {
    let dir =
        std::env::temp_dir().join(format!("launcher_mac_resolve_test_{}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();

    let app = write_mac_app_bundle(&dir, "Galaxy Rangers", "GalaxyRangers", &mach_o_stub());
    let candidates = resolve_launch_candidates(GAME_A, &dir.to_string_lossy()).unwrap();
    assert_eq!(candidates[0], app);

    let _ = fs::remove_dir_all(&dir);
}
