import { formatLaunchError } from './launchErrors'

const FALLBACK = 'Ocorreu um erro inesperado. Tente novamente.'

/** Falhas transitórias do download-engine / rede local — não spammar toast. */
export function isTransientQueueError(error: unknown): boolean {
  const raw = error instanceof Error ? error.message : String(error ?? '')
  const msg = raw.trim().toLowerCase()
  if (!msg) return false
  return (
    msg.includes('sidecar_not_running') ||
    msg.includes('sidecar_request_failed') ||
    msg.includes('sidecar_parse_failed') ||
    msg.includes('download-engine') ||
    msg.includes('download_engine') ||
    msg.includes('connection refused') ||
    msg.includes('error sending request') ||
    msg.includes('os error 10061') || // Windows: conexão recusada
    msg.includes('os error 10054') || // conexão resetada
    msg.includes('failed to fetch') ||
    msg.includes('error: connect') ||
    msg.includes('timed out') ||
    msg.includes('timeout')
  )
}

type ErrorPattern = {
  match: (message: string) => boolean
  message: string
}

const APP_ERROR_PATTERNS: ErrorPattern[] = [
  {
    match: (m) => m.includes('path_outside_default_download_path'),
    message: 'A pasta está fora do diretório de downloads configurado em Configurações.',
  },
  {
    match: (m) => m.includes('local_item_not_found'),
    message: 'Não encontrámos essa pasta na biblioteca.',
  },
  {
    match: (m) => m.includes('inspect_library_path'),
    message: 'Não foi possível verificar a instalação do jogo.',
  },
  {
    match: (m) => m.includes('scan_default_download_path') || m.includes('default_download_path'),
    message: 'Não foi possível ler a pasta de downloads. Verifique o caminho em Configurações.',
  },
  {
    match: (m) => m.includes('game_not_found') || m.includes('catalog_game_not_found'),
    message: 'Jogo não encontrado no catálogo.',
  },
  {
    match: (m) => m.includes('search') && m.includes('failed'),
    message: 'Não foi possível pesquisar o catálogo. Tente outra vez.',
  },
  {
    match: (m) => m.includes('enqueue') || m.includes('add_job'),
    message: 'Não foi possível adicionar o download à fila.',
  },
  {
    match: (m) => m.includes('network') || m.includes('fetch') || m.includes('timeout'),
    message: 'Falha de ligação. Verifique a internet e tente novamente.',
  },
]

/** "Exit 1", "exit code: 1", "powershell_process: exit code 1" — ruído técnico sem valor para o utilizador. */
export function isExitCodeNoise(message: string): boolean {
  const trimmed = message.trim()
  if (!trimmed) return false
  if (!/\bexit(?:\s*code)?\s*:?\s*-?\d+\b/i.test(trimmed)) return false

  const remainder = trimmed
    .replace(/\btorrent_client_exit_code\b/gi, '')
    .replace(/\bpowershell_process\b/gi, '')
    .replace(/\bcreate_process\b/gi, '')
    .replace(/\bcmd_start\b/gi, '')
    .replace(/\bstatus\b/gi, '')
    .replace(/\bexit(?:\s*code)?\s*:?\s*-?\d+\b/gi, '')
    .replace(/\baria2\b/gi, '')
    .replace(/[a-z0-9_]+_failed/gi, '')
    .replace(/[^a-záàâãéêíóôõúçA-Z0-9]+/gi, ' ')
    .trim()

  return remainder.length < 4
}

function looksTechnical(message: string): boolean {
  const trimmed = message.trim()
  if (!trimmed) return true
  if (isExitCodeNoise(trimmed)) return true
  if (trimmed.length > 160) return true
  if (/^[a-z0-9_]+$/i.test(trimmed)) return true
  if (/^(error|failed|panic):/i.test(trimmed)) return true
  if (trimmed.includes(' at ') && trimmed.includes('.rs:')) return true
  return false
}

function stripNoise(message: string): string {
  return message
    .replace(/^[a-z0-9_]+_failed:\s*/i, '')
    .replace(/^[a-z0-9_]+:\s*/i, '')
    .trim()
}

/**
 * Mensagem amigável para o utilizador.
 * Devolve string vazia quando o erro é ruído (ex.: "Exit 1") e não deve ser mostrado.
 */
export function formatUserError(error: unknown, fallback = FALLBACK): string {
  const raw = error instanceof Error ? error.message : String(error ?? '')
  const trimmed = raw.trim()
  if (!trimmed) return fallback
  // Motor a reiniciar / poll a falhar um instante — silêncio na UI.
  if (isTransientQueueError(trimmed)) return ''
  if (isExitCodeNoise(trimmed)) return ''

  const launchFormatted = formatLaunchError(error)
  if (!launchFormatted.trim()) return ''
  if (launchFormatted !== trimmed && !launchFormatted.includes('launch_error:')) {
    if (isExitCodeNoise(launchFormatted)) return ''
    return launchFormatted
  }

  for (const pattern of APP_ERROR_PATTERNS) {
    if (pattern.match(trimmed)) return pattern.message
  }

  const cleaned = stripNoise(trimmed)
  if (!cleaned || looksTechnical(cleaned)) return fallback
  if (isExitCodeNoise(cleaned)) return ''

  if (cleaned.endsWith('.') || cleaned.endsWith('!') || cleaned.endsWith('?')) {
    return cleaned
  }
  return `${cleaned.charAt(0).toUpperCase()}${cleaned.slice(1)}.`
}
