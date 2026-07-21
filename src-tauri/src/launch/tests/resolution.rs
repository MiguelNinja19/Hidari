use super::common::*;
use crate::launch::*;
use std::{fs, io::Write};

#[test]
fn content_root_stays_on_dest_folder_not_download_parent_children() {
    let parent = std::env::temp_dir().join(format!("launcher_parent_test_{}", std::process::id()));
    let _ = fs::remove_dir_all(&parent);
    let game_dir = parent.join(format!("{GAME_A} [FitGirl Repack]"));
    let other_dir = parent.join(format!("{GAME_B} [FitGirl Repack]"));
    let md5_dir = other_dir.join("MD5");
    fs::create_dir_all(&md5_dir).unwrap();
    fs::create_dir_all(&game_dir).unwrap();

    fs::write(game_dir.join("setup.exe"), vec![0u8; 60_000]).unwrap();
    fs::write(md5_dir.join("QuickSFV.EXE"), vec![0u8; 0x100]).unwrap();

    // dest = pasta do jogo → fica nessa pasta; dest = parent → não escolhe outros jogos.
    assert_eq!(
        resolve_game_content_root(GAME_A, &game_dir.to_string_lossy()),
        game_dir
    );
    assert_eq!(
        resolve_game_content_root(GAME_A, &parent.to_string_lossy()),
        parent
    );
    assert!(find_setup_executable(GAME_A, &game_dir.to_string_lossy())
        .unwrap()
        .ends_with("setup.exe"));

    let _ = fs::remove_dir_all(&parent);
}

#[test]
fn does_not_pick_other_game_from_download_parent() {
    let parent = std::env::temp_dir().join(format!("launcher_multi_test_{}", std::process::id()));
    let _ = fs::remove_dir_all(&parent);
    let game_a_dir = parent.join(format!("{GAME_A} [FitGirl Repack]"));
    let game_b_dir = parent.join(format!("{GAME_B} [FitGirl Repack]"));
    fs::create_dir_all(&game_a_dir).unwrap();
    fs::create_dir_all(&game_b_dir).unwrap();
    fs::write(game_a_dir.join("setup.exe"), vec![0u8; 60_000]).unwrap();
    fs::write(game_b_dir.join("setup.exe"), vec![0u8; 60_000]).unwrap();

    assert_eq!(
        resolve_game_content_root(GAME_B, &parent.to_string_lossy()),
        parent
    );
    assert_eq!(
        resolve_game_content_root(GAME_A, &game_a_dir.to_string_lossy()),
        game_a_dir
    );

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
fn does_not_scan_sibling_install_folders() {
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

    // Só a pasta do job: não salta para irmãos nem outros jogos.
    let resolved = resolve_game_content_root(GAME_LEGACY, &repack_dir.to_string_lossy());
    assert_eq!(resolved, repack_dir);
    assert!(resolve_launch_candidates(GAME_LEGACY, &repack_dir.to_string_lossy()).is_err());

    // Root explícita deste jogo (locate / instalado) continua a funcionar.
    let candidates = resolve_launch_candidates_with_extra_roots(
        GAME_LEGACY,
        &repack_dir.to_string_lossy(),
        &[install_dir.clone()],
    )
    .unwrap();
    assert_eq!(candidates[0], install_dir.join("Crystal Quest Legacy.exe"));

    let _ = fs::remove_dir_all(&parent);
}
