use super::core::{
  is_path_under_root, reject_parent_components, validate_absolute_user_path,
};
use std::path::Path;

#[test]
fn rejects_parent_components() {
  assert!(reject_parent_components(Path::new(r"C:\Games\..\Windows")).is_err());
  assert!(reject_parent_components(Path::new(r"C:\Games\Hidari")).is_ok());
}

#[test]
fn requires_absolute() {
  assert!(validate_absolute_user_path("relative\\folder").is_err());
  #[cfg(windows)]
  assert!(validate_absolute_user_path(r"D:\Games").is_ok());
  #[cfg(not(windows))]
  assert!(validate_absolute_user_path("/tmp/games").is_ok());
}

#[test]
fn under_root_checks() {
  #[cfg(windows)]
  {
    let root = Path::new(r"D:\Games");
    assert!(is_path_under_root(Path::new(r"D:\Games\Foo"), root));
    assert!(is_path_under_root(Path::new(r"D:\Games"), root));
    assert!(!is_path_under_root(Path::new(r"C:\Windows"), root));
  }
  #[cfg(not(windows))]
  {
    let root = Path::new("/data/games");
    assert!(is_path_under_root(Path::new("/data/games/foo"), root));
    assert!(!is_path_under_root(Path::new("/etc"), root));
  }
}
