/** Mensagens para códigos de saída comuns do aria2 (ver manual aria2c). */
export const ARIA2_EXIT_MESSAGES: Record<number, string> = {
  3: 'Recurso não encontrado. O torrent ou link pode estar indisponível.',
  6: 'Problema de rede durante o download. Verifique a conexão e tente retomar.',
  8: 'O servidor não permite retomar este download. Pode ser necessário começar de novo.',
  9: 'Disco sem espaço livre. Libere espaço ou altere a pasta de destino em Configurações.',
  11: 'O aria2 já está transferindo o mesmo arquivo em outro job.',
  12: 'Este torrent já está sendo transferido em outro job.',
  13:
    'Já existem arquivos deste download na pasta de destino (sem arquivo .aria2 para retomar). ' +
    'Exclua a subpasta do jogo, ou escolha outra pasta, e enfileire novamente.',
  15: 'Não foi possível abrir o arquivo de destino. Verifique as permissões da pasta.',
  16: 'Não foi possível criar o arquivo de destino. Verifique as permissões da pasta.',
  19: 'Falha ao resolver o endereço (DNS). Verifique a conexão com a internet.',
  25: 'Arquivo .torrent inválido ou corrompido.',
  26: 'Torrent incompleto ou corrompido — tente outra fonte.',
  27: 'Link magnet inválido ou incompleto.',
}

const TORRENT_EXIT_PREFIX = /torrent_client_exit_code:\s*exit code:\s*(\d+)/i
const FILE_EXISTS_HINT =
  /file already exists|errorCode=13|control file\(\*\.aria2\)|\.aria2\) does not exist/i
const PROGRESS_SUMMARY = /\*\*\* Download Progress Summary[\s\S]*/i

export function stripAria2ProgressNoise(message: string): string {
  return message.replace(PROGRESS_SUMMARY, '').replace(/\|\s*aria2:\s*$/i, '').trim()
}

export function formatDownloadError(error: unknown): string {
  const raw =
    error == null
      ? ''
      : typeof error === 'string'
        ? error
        : error instanceof Error
          ? error.message
          : String(error)

  const msg = raw.trim()
  if (!msg) return 'Falha no download.'

  const cleaned = stripAria2ProgressNoise(msg)

  const torrentMatch = cleaned.match(TORRENT_EXIT_PREFIX)
  if (torrentMatch) {
    const code = Number(torrentMatch[1])
    if (Number.isFinite(code) && ARIA2_EXIT_MESSAGES[code]) {
      return ARIA2_EXIT_MESSAGES[code]!
    }
    return `Falha no motor de torrent (aria2, código ${code}). Abra a pasta do download, remova arquivos parciais se existirem e tente novamente.`
  }

  if (FILE_EXISTS_HINT.test(cleaned)) {
    return ARIA2_EXIT_MESSAGES[13]!
  }

  const withoutPrefix = cleaned
    .replace(/^torrent_client_exit_code:\s*/i, '')
    .replace(/^\|\s*aria2:\s*/i, '')
    .trim()

  return withoutPrefix || 'Falha no download.'
}
