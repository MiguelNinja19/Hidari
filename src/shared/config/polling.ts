/** Intervalo de refresh da fila na tab Downloads (ms). */
export const POLL_DOWNLOADS_MS = 2500

/** Intervalo com downloads ativos fora da aba Downloads (ms). */
export const POLL_ACTIVE_JOBS_MS = 4000

/** Intervalo na biblioteca sem downloads ativos (ms). */
export const POLL_LIBRARY_IDLE_MS = 12000

/** Debounce ao focar janela para inspecionar pastas (ms). */
export const PATH_INSPECT_FOCUS_DEBOUNCE_MS = 1500

/** Debounce antes de inspecionar pastas da biblioteca (ms). */
export const PATH_INSPECT_DEBOUNCE_MS = 800

/** Intervalo enquanto aguarda instalação (ms). */
export const PENDING_INSTALL_POLL_MS = 6000

/** Intervalo de reconciliação lenta quando eventos de progresso estão ativos (ms). */
export const POLL_RECONCILE_MS = 30000

/** Debounce da pesquisa no catálogo (ms). */
export const CATALOG_SEARCH_DEBOUNCE_MS = 400

/** Mínimo de caracteres para pesquisar nas fontes. */
export const CATALOG_SEARCH_MIN_CHARS = 3

/** Debounce de capas em falta na biblioteca (ms). */
export const LIBRARY_COVER_LOOKUP_DEBOUNCE_MS = 2000

/** Atraso antes de carregar a fila no arranque (deixa a UI respirar). */
export const STARTUP_JOBS_DEFER_MS = 1800

/** Pausa entre lotes de inspeção de pastas da biblioteca (ms). */
export const LIBRARY_INSPECT_BATCH_PAUSE_MS = 24

/** Tamanho do lote de inspeção de pastas (menor = UI mais fluida). */
export const LIBRARY_INSPECT_BATCH_SIZE = 4

/** Intervalo de watch após abrir instalador (ms). */
export const INSTALL_WATCH_INTERVAL_MS = 2000

/** Máximo de ticks do watch de instalação (~3 min). */
export const INSTALL_WATCH_MAX_TICKS = 90

/** Intervalo para verificar novidades no catálogo (ms). */
export const CATALOG_CHANGES_POLL_MS = 5 * 60 * 1000
