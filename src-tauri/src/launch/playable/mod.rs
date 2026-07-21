mod exe_depth;
mod install_or_game;

pub use exe_depth::folder_has_playable_game_exe;
pub use install_or_game::folder_has_playable_game;
pub(crate) use exe_depth::folder_has_playable_game_exe_depth;
pub(crate) use install_or_game::folder_has_install_or_game;
