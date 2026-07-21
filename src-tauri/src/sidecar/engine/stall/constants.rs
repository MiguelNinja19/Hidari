pub(crate) const STALL_AFTER: std::time::Duration = std::time::Duration::from_secs(75);
pub(crate) const STALL_KICK_COOLDOWN: std::time::Duration = std::time::Duration::from_secs(45);
/// After the initial kick burst, keep retrying forever with a longer gap.
pub(crate) const STALL_RETRY_COOLDOWN: std::time::Duration = std::time::Duration::from_secs(90);
pub(crate) const STALL_MAX_KICKS_BEFORE_FAILOVER: u32 = 3;
pub(crate) const STALL_KICK_PAUSE_MS: u64 = 2500;
pub(crate) const STALL_MSG_RECOVERING: &str =
  "download_stalled_recovering: Sem atividade — a retomar automaticamente…";
pub(crate) const STALL_MSG_FAILOVER: &str =
  "download_failover: A procurar outra fonte no catálogo…";
