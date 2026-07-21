//! Quando um download estagna, tenta outro magnet/URL do catálogo.

mod alternatives;
mod enqueue;
mod remove;
mod replace;
mod url;

pub use replace::try_failover_stalled_job;
