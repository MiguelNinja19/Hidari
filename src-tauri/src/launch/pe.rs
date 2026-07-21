use super::*;
use std::{
    fs,
    io::{Read, Seek, SeekFrom},
    path::{Path, PathBuf},
    process::Command as StdCommand,
};

/// True when the file begins with a valid Windows PE executable header.
pub fn is_valid_pe_executable(path: &Path) -> bool {
    let mut file = match fs::File::open(path) {
        Ok(value) => value,
        Err(_) => return false,
    };

    let mut dos = [0u8; 64];
    if file.read_exact(&mut dos).is_err() {
        return false;
    }
    if dos[0] != b'M' || dos[1] != b'Z' {
        return false;
    }

    let pe_offset = u32::from_le_bytes([dos[0x3c], dos[0x3d], dos[0x3e], dos[0x3f]]);
    if pe_offset < 0x40 {
        return false;
    }

    if file.seek(SeekFrom::Start(pe_offset as u64)).is_err() {
        return false;
    }

    let mut pe = [0u8; 4];
    if file.read_exact(&mut pe).is_err() {
        return false;
    }

    pe == *b"PE\0\0"
}
/// Looser PE check for detection when strict validation fails on packed exes.
pub fn is_probably_executable(path: &Path) -> bool {
    if is_valid_pe_executable(path) {
        return true;
    }
    let mut buf = [0u8; 2];
    let Ok(mut file) = fs::File::open(path) else {
        return false;
    };
    file.read_exact(&mut buf).is_ok() && buf == [b'M', b'Z']
}
