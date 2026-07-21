import { formatLaunchError } from './launchErrors'
import { APP_ERROR_PATTERNS, looksTechnical, stripUserErrorNoise } from './userErrorPatterns'

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

  const cleaned = stripUserErrorNoise(trimmed)
  if (!cleaned || looksTechnical(cleaned, isExitCodeNoise)) return fallback
  if (isExitCodeNoise(cleaned)) return ''

  if (cleaned.endsWith('.') || cleaned.endsWith('!') || cleaned.endsWith('?')) {
    return cleaned
  }
  return `${cleaned.charAt(0).toUpperCase()}${cleaned.slice(1)}.`
}
