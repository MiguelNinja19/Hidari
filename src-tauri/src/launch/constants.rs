use super::*;
use std::{
    fs,
    io::{Read, Seek, SeekFrom},
    path::{Path, PathBuf},
    process::Command as StdCommand,
};

pub(crate) const SCAN_DEPTH_FAST: usize = 3;
pub(crate) const SCAN_DEPTH_FULL: usize = 6;
pub(crate) const MAX_LAUNCH_CANDIDATES: usize = 8;
