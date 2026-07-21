use super::common::*;
use crate::launch::*;
use std::{fs, io::Write};

#[test]
fn resolves_title_subfolder_when_dest_is_parent_download_dir() {
    let parent = std::env::temp_dir().join(format!("launcher_parent_test_{}", std::process::id()));
    let _ = fs::remove_dir_all(&parent);
    let game_dir = parent.join(format!("{GAME_A} [FitGirl Repack]"));
    let other_dir = parent.join(format!("{GAME_B} [FitGirl Repack]"));
    let md5_dir = other_dir.join("MD5");
    fs::create_dir_all(&md5_dir).unwrap();
    fs::create_dir_all(&game_dir).unwrap();

    fs::write(game_dir.join("setup.exe"), vec![0u8; 60_000]).unwrap();
    fs::write(md5_dir.join("QuickSFV.EXE"), vec![0u8; 0x100]).unwrap();

    let resolved = resolve_game_content_root(GAME_A, &parent.to_string_lossy());
    assert_eq!(resolved, game_dir);
    assert!(!job_has_game_executable(GAME_A, &parent.to_string_lossy()));
    assert!(find_setup_executable(GAME_A, &parent.to_string_lossy())
        .unwrap()
        .ends_with("setup.exe"));

    let _ = fs::remove_dir_all(&parent);
}

#[test]
fn does_not_pick_other_game_setup_folder() {
    let parent = std::env::temp_dir().join(format!("launcher_multi_test_{}", std::process::id()));
    let _ = fs::remove_dir_all(&parent);
    let game_a_dir = parent.join(format!("{GAME_A} [FitGirl Repack]"));
    let game_b_dir = parent.join(format!("{GAME_B} [FitGirl Repack]"));
    fs::create_dir_all(&game_a_dir).unwrap();
    fs::create_dir_all(&game_b_dir).unwrap();
    fs::write(game_a_dir.join("setup.exe"), vec![0u8; 60_000]).unwrap();
    fs::write(game_b_dir.join("setup.exe"), vec![0u8; 60_000]).unwrap();

    let resolved_b = resolve_game_content_root(GAME_B, &parent.to_string_lossy());
    let resolved_a = resolve_game_content_root(GAME_A, &parent.to_string_lossy());
    assert!(resolved_b
        .to_string_lossy()
        .to_lowercase()
        .contains("pixel"));
    assert!(resolved_a
        .to_string_lossy()
        .to_lowercase()
        .contains("galaxy"));

    let _ = fs::remove_dir_all(&parent);
}

#[test]
fn setup_present_means_install_not_play_even_with_game_exe() {
    let dir = std::env::temp_dir().join(format!("launcher_both_test_{}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();

    fs::write(dir.join("setup.exe"), vec![0u8; 60_000]).unwrap();
    fs::write(dir.join("Pixel Harvest.exe"), pe_stub()).unwrap();

    // Ainda há setup.exe → o utilizador deve Instalar, não Jogar.
    assert!(find_setup_executable(GAME_B, &dir.to_string_lossy()).is_some());
    assert!(job_has_game_executable(GAME_B, &dir.to_string_lossy()));

    let _ = fs::remove_dir_all(&dir);
}
#[test]
fn does_not_pick_unrelated_game_exe_when_title_not_installed() {
    let parent =
        std::env::temp_dir().join(format!("launcher_wrong_game_test_{}", std::process::id()));
    let _ = fs::remove_dir_all(&parent);
    let terraria = parent.join("Terraria (v1.4.4.1 - Labor of Love Update + Bonus OST, MULTi9)");
    let nfs = parent.join("Need for Speed Heat");
    fs::create_dir_all(&terraria).unwrap();
    fs::create_dir_all(&nfs).unwrap();

    fs::write(terraria.join("setup.exe"), vec![0u8; 60_000]).unwrap();
    fs::write(nfs.join("NeedForSpeedHeat.exe"), pe_stub()).unwrap();

    let title = "Terraria (v1.4.4.1 - Labor of Love Update + Bonus OST, MULTi9)";
    assert!(resolve_launch_candidates(title, &terraria.to_string_lossy()).is_err());
    assert!(resolve_launch_candidates(title, &parent.to_string_lossy()).is_err());
    assert!(!folder_has_playable_game_exe(title, &parent));

    let _ = fs::remove_dir_all(&parent);
}

#[test]
fn resolves_installed_sibling_folder_instead_of_parent_scan() {
    let parent = std::env::temp_dir().join(format!("launcher_sibling_test_{}", std::process::id()));
    let _ = fs::remove_dir_all(&parent);
    let repack_dir = parent.join(format!("{GAME_LEGACY} [FitGirl Repack]"));
    let install_dir = parent.join(GAME_LEGACY);
    fs::create_dir_all(&repack_dir).unwrap();
    fs::create_dir_all(&install_dir).unwrap();

    fs::write(repack_dir.join("setup.exe"), vec![0u8; 60_000]).unwrap();
    fs::write(install_dir.join("Crystal Quest Legacy.exe"), pe_stub()).unwrap();

    let other_game = parent.join("Other Game [FitGirl Repack]");
    fs::create_dir_all(&other_game).unwrap();
    fs::write(other_game.join("Launcher.exe"), pe_stub()).unwrap();

    // A pasta do job continua a ser o repack; o exe instalado vem só do irmão com o nome do jogo.
    let resolved = resolve_game_content_root(GAME_LEGACY, &repack_dir.to_string_lossy());
    assert_eq!(resolved, repack_dir);

    let candidates = resolve_launch_candidates(GAME_LEGACY, &repack_dir.to_string_lossy()).unwrap();
    assert_eq!(candidates[0], install_dir.join("Crystal Quest Legacy.exe"));

    let _ = fs::remove_dir_all(&parent);
}
