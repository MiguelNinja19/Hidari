pub(crate) const STALL_AFTER: std::time::Duration = std::time::Duration::from_secs(120);
/// Magnet/metadados/peers: pause/resume cedo corta DHT — esperar bem mais.
pub(crate) const STALL_AFTER_EARLY: std::time::Duration = std::time::Duration::from_secs(300);
pub(crate) const STALL_KICK_COOLDOWN: std::time::Duration = std::time::Duration::from_secs(60);
/// After the initial kick burst, keep retrying forever with a longer gap.
pub(crate) const STALL_RETRY_COOLDOWN: std::time::Duration = std::time::Duration::from_secs(120);
pub(crate) const STALL_MAX_KICKS_BEFORE_FAILOVER: u32 = 3;
pub(crate) const STALL_KICK_PAUSE_MS: u64 = 2500;
pub(crate) const STALL_MSG_RECOVERING: &str =
  "download_stalled_recovering: Sem atividade — a retomar automaticamente…";
pub(crate) const STALL_MSG_FAILOVER: &str =
  "download_failover: A procurar outra fonte no catálogo…";
pub(crate) const STALL_MSG_WAITING_PEERS: &str =
  "download_waiting_peers: A ligar a peers — ainda sem atividade…";
