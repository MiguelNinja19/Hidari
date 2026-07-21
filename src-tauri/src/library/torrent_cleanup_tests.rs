use super::{cleanup_torrent_sidecar_files, matches_title};
use std::fs;
use std::path::PathBuf;

fn temp_dir(label: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!(
        "launcher_torrent_cleanup_{label}_{}",
        std::process::id()
    ));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    dir
}

#[test]
fn matches_title_to_fitgirl_style_torrent_stem() {
    assert!(matches_title(
        "Stardew Valley-FitGirl Repack",
        "Stardew Valley"
    ));
}

#[test]
fn deletes_matching_sidecars_beside_game_folder() {
    let root = temp_dir("match");
    let game = root.join("Stardew Valley");
    fs::create_dir_all(&game).unwrap();
    for name in [
        "Stardew Valley.torrent",
        "Stardew Valley.aria2",
        "Other Game.torrent",
    ] {
        fs::write(root.join(name), b"x").unwrap();
    }
    cleanup_torrent_sidecar_files(&game.to_string_lossy(), "Stardew Valley");
    assert!(!root.join("Stardew Valley.torrent").exists());
    assert!(!root.join("Stardew Valley.aria2").exists());
    assert!(root.join("Other Game.torrent").exists());
    let _ = fs::remove_dir_all(root);
}

#[test]
fn deletes_torrent_inside_dest_folder() {
    let root = temp_dir("inside");
    let game = root.join("Pixel Harvest");
    fs::create_dir_all(&game).unwrap();
    let torrent = game.join("Pixel Harvest.torrent");
    fs::write(&torrent, b"x").unwrap();
    cleanup_torrent_sidecar_files(&game.to_string_lossy(), "Pixel Harvest");
    assert!(!torrent.exists());
    let _ = fs::remove_dir_all(root);
}

#[test]
fn preserves_unrelated_hash_named_torrent() {
    let root = temp_dir("hash");
    let game = root.join("Galaxy Rangers");
    fs::create_dir_all(&game).unwrap();
    let torrent = root.join("a1b2c3d4e5f67890.torrent");
    fs::write(&torrent, b"x").unwrap();
    cleanup_torrent_sidecar_files(&game.to_string_lossy(), "Galaxy Rangers");
    assert!(torrent.exists());
    let _ = fs::remove_dir_all(root);
}
