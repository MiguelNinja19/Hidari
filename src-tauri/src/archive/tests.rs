use super::extensions::is_archive_extension;
use super::*;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

#[test]
fn is_archive_extension_recognizes_formats() {
  assert!(is_archive_extension(Path::new("game.zip")));
  assert!(is_archive_extension(Path::new("game.7Z")));
  assert!(is_archive_extension(Path::new("part1.rar")));
  assert!(is_archive_extension(Path::new("archive.001")));
  assert!(!is_archive_extension(Path::new("game.exe")));
  assert!(!is_archive_extension(Path::new("readme.txt")));
}

#[test]
fn find_job_archive_picks_largest_in_folder() {
  let dir = std::env::temp_dir().join(format!("launcher_test_{}", std::process::id()));
  let _ = fs::remove_dir_all(&dir);
  fs::create_dir_all(&dir).unwrap();

  let small = dir.join("a.zip");
  let large = dir.join("b.7z");
  let mut f1 = fs::File::create(&small).unwrap();
  f1.write_all(&[0u8; 10]).unwrap();
  f1.sync_all().unwrap();
  drop(f1);
  let mut f2 = fs::File::create(&large).unwrap();
  f2.write_all(&[0u8; 100]).unwrap();
  f2.sync_all().unwrap();
  drop(f2);

  let found = find_job_archive(dir.to_str().unwrap()).unwrap();
  assert_eq!(found, large);

  let _ = fs::remove_dir_all(&dir);
}

#[test]
fn find_job_archive_finds_nested_torrent_subfolder() {
  let dir = std::env::temp_dir().join(format!("launcher_nested_{}", std::process::id()));
  let _ = fs::remove_dir_all(&dir);
  let sub = dir.join("Terraria v1.4.4.1");
  fs::create_dir_all(&sub).unwrap();

  let archive = sub.join("Terraria.7z");
  let mut f = fs::File::create(&archive).unwrap();
  f.write_all(&[0u8; 128]).unwrap();
  f.sync_all().unwrap();
  drop(f);

  let found = find_job_archive(dir.to_str().unwrap()).unwrap();
  assert_eq!(found, archive);

  let _ = fs::remove_dir_all(&dir);
}

#[test]
fn find_download_payload_finds_setup_in_subfolder() {
  let dir = std::env::temp_dir().join(format!("launcher_setup_{}", std::process::id()));
  let _ = fs::remove_dir_all(&dir);
  let sub = dir.join("Game Repack");
  fs::create_dir_all(&sub).unwrap();

  let setup = sub.join("setup.exe");
  let mut f = fs::File::create(&setup).unwrap();
  f.write_all(&[0u8; 64]).unwrap();
  f.sync_all().unwrap();
  drop(f);

  let found = find_download_payload(dir.to_str().unwrap()).unwrap();
  assert_eq!(found, setup);

  let _ = fs::remove_dir_all(&dir);
}

#[test]
fn resolve_extract_destination_separate_folder() {
  let base = Path::new("D:\\Games");
  let dest = resolve_extract_destination("My Game!", base, "separate-folder");
  assert_eq!(dest, PathBuf::from("D:\\Games\\My Game_"));
}

#[test]
fn resolve_extract_destination_single_folder() {
  let base = Path::new("D:\\Games");
  let dest = resolve_extract_destination("My Game", base, "single-folder");
  assert_eq!(dest, base);
}
