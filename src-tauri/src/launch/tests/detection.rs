use super::common::*;
use crate::launch::*;
use std::{fs, io::Write};

#[test]
fn rejects_non_pe_files() {
    let dir = std::env::temp_dir().join(format!("launcher_pe_test_{}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();

    let fake = dir.join("fake.exe");
    let mut file = fs::File::create(&fake).unwrap();
    file.write_all(b"not a real executable").unwrap();
    drop(file);

    assert!(!is_valid_pe_executable(&fake));

    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn prefers_title_matching_executable() {
    let dir = std::env::temp_dir().join(format!("launcher_score_test_{}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();

    let blocked = dir.join("setup.exe");
    let preferred = dir.join("GalaxyRangers.exe");
    fs::write(&blocked, b"MZ").unwrap();
    fs::write(&preferred, b"MZ").unwrap();

    assert!(!is_likely_game_exe("setup.exe"));
    assert!(is_likely_game_exe("GalaxyRangers.exe"));

    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn detects_playable_executable_without_archive() {
    let dir = std::env::temp_dir().join(format!("launcher_playable_test_{}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();

    // O exe tem de corresponder ao título — senão o launcher rejeita (evitar lançar outro jogo).
    fs::write(dir.join("GalaxyRangers.exe"), pe_stub()).unwrap();

    assert!(job_has_playable_executable(GAME_A, &dir.to_string_lossy()));
    assert!(!job_has_playable_executable(GAME_A, "/nonexistent/path"));

    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn finds_fitgirl_style_setup_without_strict_pe_header() {
    let dir = std::env::temp_dir().join(format!("launcher_setup_test_{}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();

    fs::write(dir.join("setup.exe"), vec![0u8; 60_000]).unwrap();

    assert!(find_setup_executable(GAME_A, &dir.to_string_lossy()).is_some());
    assert!(job_has_playable_executable(GAME_A, &dir.to_string_lossy()));
    assert!(!job_has_game_executable(GAME_A, &dir.to_string_lossy()));

    let _ = fs::remove_dir_all(&dir);
}
#[test]
fn detects_mach_o_magic() {
    let dir = std::env::temp_dir().join(format!("launcher_macho_test_{}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();

    let binary = dir.join("GameBinary");
    fs::write(&binary, mach_o_stub()).unwrap();
    assert!(is_mach_o_executable(&binary));
    assert!(!is_mach_o_executable(&dir.join("not_binary.txt")));

    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn detects_mac_app_bundle_structure() {
    let dir = std::env::temp_dir().join(format!("launcher_app_test_{}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();

    let app = write_mac_app_bundle(&dir, "Galaxy Rangers", "GalaxyRangers", &mach_o_stub());
    assert!(is_mac_app_bundle(&app));
    assert!(!is_mac_app_bundle(&dir.join("Fake.app")));

    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn mac_playable_requires_title_match() {
    let dir = std::env::temp_dir().join(format!("launcher_mac_play_test_{}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();

    write_mac_app_bundle(&dir, "Galaxy Rangers", "GalaxyRangers", &mach_o_stub());
    write_mac_app_bundle(&dir, "Other Game", "OtherGame", &mach_o_stub());

    assert!(folder_has_playable_game_mac(GAME_A, &dir));
    assert!(!folder_has_playable_game_mac(GAME_B, &dir));

    let _ = fs::remove_dir_all(&dir);
}
