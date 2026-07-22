import { resolveSourcePasswordHint, type SourcePasswordHint } from './sourcePasswordHints'

export const EXTRACTION_ERROR_MESSAGES = {
  cannotOpen: 'Arquivo inválido ou incompleto',
  unsupportedMethod: 'Formato não suportado',
  busy: 'Extração em andamento',
  noArchive: 'Nenhum arquivo encontrado',
  passwordRequired: 'Extraia com senha manualmente',
  generic: 'Falha ao extrair',
} as const

export function isArchivePasswordRequiredError(message: string): boolean {
  const msg = message.trim()
  if (!msg) return false
  if (msg.includes('archive_password_required')) return true
  return /wrong password|enter password|password required|cannot open encrypted|data error in encrypted/i.test(
    msg,
  )
}

export function formatPasswordExtractionError(
  _message: string,
  ...hintParts: Array<string | null | undefined>
): { text: string; hint: SourcePasswordHint | null } {
  const hint = resolveSourcePasswordHint(...hintParts)
  return { text: EXTRACTION_ERROR_MESSAGES.passwordRequired, hint }
}

export function formatExtractionError(message: string): string | null {
  const msg = message.trim()
  if (!msg) return null
  if (msg.includes('extraction_busy')) return EXTRACTION_ERROR_MESSAGES.busy
  if (msg.includes('no_archive_found')) return EXTRACTION_ERROR_MESSAGES.noArchive
  if (isArchivePasswordRequiredError(msg)) {
    return formatPasswordExtractionError(msg).text
  }
  if (/cannot open the file as archive|can't open as archive/i.test(msg)) {
    return EXTRACTION_ERROR_MESSAGES.cannotOpen
  }
  if (/unsupported method/i.test(msg)) {
    return EXTRACTION_ERROR_MESSAGES.unsupportedMethod
  }
  if (msg.includes('7z_extract_failed')) return EXTRACTION_ERROR_MESSAGES.generic
  if (msg.includes('download_failover')) {
    return 'A tentar outra fonte…'
  }
  if (msg.includes('download_stalled_recovering') || msg.includes('download_stalled')) {
    return 'Sem atividade — a retomar…'
  }
  if (msg.includes('already registered') || /infohash\s+[a-f0-9]+\s+is already registered/i.test(msg)) {
    return 'Torrent já na fila'
  }
  if (msg.includes('download_payload_too_small') || msg.includes('verify_too_small')) {
    return 'A obter metadados…'
  }
  if (msg.includes('verify_failed') || msg.includes('verify_no_file')) {
    return 'Download incompleto ou corrompido'
  }
  return null
}
