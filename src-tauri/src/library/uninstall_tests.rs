use super::super::install_locations::{folder_name_matches_title, is_safe_install_folder};
use super::super::uninstall_helpers::{find_inno_uninstaller, uninstall_install_folder};
use std::fs;
use std::path::PathBuf;

fn temp_dir(label: &str) -> PathBuf {
    let dir =
        std::env::temp_dir().join(format!("launcher_uninstall_{label}_{}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    dir
}

#[test]
fn unins_regex_matches_numbered_and_plain() {
    use super::super::uninstall_helpers::is_unins_exe_name;
    assert!(is_unins_exe_name("unins.exe"));
    assert!(is_unins_exe_name("unins000.exe"));
    assert!(is_unins_exe_name("UNINS001.EXE"));
    assert!(is_unins_exe_name("Unins42.exe"));
    assert!(!is_unins_exe_name("uninstall.exe"));
    assert!(!is_unins_exe_name("setup.exe"));
    assert!(!is_unins_exe_name("unins000.txt"));
}

#[test]
fn finds_unins000_preferred_over_other_unins() {
    let root = temp_dir("unins");
    fs::write(root.join("unins001.exe"), b"x").unwrap();
    fs::write(root.join("unins000.exe"), b"x").unwrap();
    assert!(find_inno_uninstaller(&root)
        .unwrap()
        .ends_with("unins000.exe"));
    let _ = fs::remove_dir_all(root);
}

#[test]
fn refuses_to_remove_download_or_content_root() {
    let root = temp_dir("safe");
    let content = root.join("Game [FitGirl Repack]");
    fs::create_dir_all(&content).unwrap();
    assert!(!is_safe_install_folder(&root, Some(&root), &content));
    // Sem unins → content root não é candidato a desinstalar.
    assert!(!is_safe_install_folder(&content, Some(&root), &content));
    // Com unins.exe na pasta do jogo → pode desinstalar (corre o Inno).
    fs::write(content.join("unins.exe"), b"x").unwrap();
    assert!(is_safe_install_folder(&content, Some(&root), &content));
    let sibling = root.join("Game");
    fs::create_dir_all(&sibling).unwrap();
    assert!(is_safe_install_folder(&sibling, Some(&root), &content));
    let _ = fs::remove_dir_all(root);
}

#[test]
fn folder_name_matches_cleaned_title() {
    let root = temp_dir("title_match");
    let folder = root.join("Galaxy Rangers");
    fs::create_dir_all(&folder).unwrap();
    assert!(folder_name_matches_title(
        &folder,
        "Galaxy Rangers (v1.0, MULTi9) [FitGirl Repack]"
    ));
    assert!(!folder_name_matches_title(&folder, "Pixel Harvest"));
    let _ = fs::remove_dir_all(root);
}

#[test]
fn finds_install_root_via_unins_walking_up() {
    use super::super::uninstall_helpers::find_install_root_from_exe;
    let root = temp_dir("root_walk");
    let bin = root.join("bin");
    fs::create_dir_all(&bin).unwrap();
    fs::write(root.join("unins000.exe"), b"x").unwrap();
    let exe = bin.join("game.exe");
    fs::write(&exe, b"x").unwrap();
    assert_eq!(find_install_root_from_exe(&exe).unwrap(), root);
    let _ = fs::remove_dir_all(root);
}

#[test]
fn install_root_falls_back_to_exe_parent() {
    use super::super::uninstall_helpers::find_install_root_from_exe;
    let root = temp_dir("root_parent");
    let exe = root.join("game.exe");
    fs::write(&exe, b"x").unwrap();
    assert_eq!(find_install_root_from_exe(&exe).unwrap(), root);
    let _ = fs::remove_dir_all(root);
}

#[test]
fn fallback_deletes_folder_without_uninstaller() {
    let root = temp_dir("fallback");
    let game = root.join("Galaxy Rangers");
    fs::create_dir_all(&game).unwrap();
    fs::write(game.join("game.bin"), b"data").unwrap();
    uninstall_install_folder(&game).unwrap();
    assert!(!game.exists());
    let _ = fs::remove_dir_all(root);
}
