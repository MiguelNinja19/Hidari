//! Deteção e lançamento genérico de executáveis a partir do título do job.
#![allow(unused_imports)]

pub(crate) use crate::{archive, title};

mod constants;
pub(crate) use constants::*;
mod pe;
pub use pe::*;
mod store_filter;
pub(crate) use store_filter::*;
mod exe_filter;
pub use exe_filter::*;
mod score;
pub(crate) use score::*;
mod mac_detect;
pub use mac_detect::*;
mod mac_score;
pub(crate) use mac_score::*;
mod mac_collect;
pub use mac_collect::*;
mod mac_resolve;
pub(crate) use mac_resolve::*;
mod mac_spawn;
pub(crate) use mac_spawn::*;
mod collect;
pub(crate) use collect::*;
mod utility;
pub(crate) use utility::*;
mod playable;
pub use playable::*;
pub(crate) use playable::folder_has_playable_game_exe_depth;
mod content;
pub use content::*;
mod roots;
pub use roots::*;
mod candidates;
pub(crate) use candidates::*;
mod spawn;
pub use spawn::*;
mod launch_candidates;
pub use launch_candidates::*;
mod launch_resolve;
pub use launch_resolve::*;
mod setup;
pub use setup::*;
mod running;
pub use running::*;
mod shell_open;
pub use shell_open::open_shell_target;

#[cfg(test)]
mod tests;
