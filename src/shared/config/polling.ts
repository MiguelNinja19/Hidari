/** Intervalo de refresh da fila na tab Downloads (ms). */
export const POLL_DOWNLOADS_MS = 2500

/** Intervalo com downloads activos fora da tab Downloads (ms). */
export const POLL_ACTIVE_JOBS_MS = 4000

/** Intervalo na biblioteca sem downloads activos (ms). */
export const POLL_LIBRARY_IDLE_MS = 12000

/** Debounce ao focar janela para inspeccionar pastas (ms). */
export const PATH_INSPECT_FOCUS_DEBOUNCE_MS = 1500

/** Intervalo enquanto aguarda instalação (ms). */
export const PENDING_INSTALL_POLL_MS = 6000

/** Debounce da pesquisa no catálogo (ms). */
export const CATALOG_SEARCH_DEBOUNCE_MS = 220

/** Debounce de capas em falta na biblioteca (ms). */
export const LIBRARY_COVER_LOOKUP_DEBOUNCE_MS = 500

/** Intervalo de watch após abrir instalador (ms). */
export const INSTALL_WATCH_INTERVAL_MS = 2000

/** Máximo de ticks do watch de instalação (~3 min). */
export const INSTALL_WATCH_MAX_TICKS = 90
