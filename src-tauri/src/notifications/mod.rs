//! Notificações de ambiente de trabalho (Windows: AUMID + toast silencioso).

mod send;
mod setup;
mod windows_aumid;

pub use send::send_desktop_notification;
pub use setup::setup_desktop_notifications;
