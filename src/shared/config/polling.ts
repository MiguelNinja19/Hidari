/** Intervalo com downloads ativos fora da aba Downloads (ms). */
export const POLL_ACTIVE_JOBS_MS = 4000

/** Mínimo de caracteres para pesquisar nas fontes. */
export const CATALOG_SEARCH_MIN_CHARS = 2

/** Debounce de capas em falta na biblioteca (ms). */
export const LIBRARY_COVER_LOOKUP_DEBOUNCE_MS = 0

/** Atraso antes de carregar a fila no arranque (deixa a UI respirar). */
export const STARTUP_JOBS_DEFER_MS = 0

/** Pausa entre lotes de inspeção de pastas da biblioteca (ms). */
export const LIBRARY_INSPECT_BATCH_PAUSE_MS = 0

/** Tamanho do lote de inspeção de pastas (maior = menos round-trips IPC). */
export const LIBRARY_INSPECT_BATCH_SIZE = 16

/** Intervalo de watch após abrir instalador (ms). */
export const INSTALL_WATCH_INTERVAL_MS = 2000

/** Máximo de ticks do watch de instalação (~15 min). */
export const INSTALL_WATCH_MAX_TICKS = 450

/** Ticks antes de confiar que o instalador ainda não abriu. */
export const INSTALL_WATCH_START_GRACE_TICKS = 2

/** Ticks após fechar o instalador para ainda procurar o jogo (~20s). */
export const INSTALL_WATCH_POST_CLOSE_TICKS = 10
