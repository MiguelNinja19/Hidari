import { describe, expect, it } from 'vitest'
import {
  ARIA2_EXIT_MESSAGES,
  EXTRACTION_ERROR_MESSAGES,
  formatDownloadError,
  stripAria2ProgressNoise,
} from './downloadErrors'

describe('formatDownloadError', () => {
  it('traduz exit code 13 do sidecar e remove resumo do aria2', () => {
    const raw =
      'torrent_client_exit_code: exit code: 13 | aria2: *** Download Progress Summary as of Sat Jul 04 05:10:29 2026 ***'
    expect(formatDownloadError(raw)).toBe(ARIA2_EXIT_MESSAGES[13])
  })

  it('traduz exit code 9 (disco cheio)', () => {
    expect(formatDownloadError('torrent_client_exit_code: exit code: 9 | aria2: disk full')).toBe(
      ARIA2_EXIT_MESSAGES[9],
    )
  })

  it('deteta ficheiro existente pelo texto do aria2', () => {
    expect(
      formatDownloadError(
        'errorCode=13 File game.bin exists, but a control file(*.aria2) does not exist.',
      ),
    ).toBe(ARIA2_EXIT_MESSAGES[13])
  })

  it('traduz 7z Cannot open the file as archive', () => {
    const raw =
      "7z_extract_failed: status=exit code: 2 stderr=ERROR: J:\\dddd\\Megabonk\\game.rar Cannot open the file as archive stdout=Can't open as archive: 1"
    expect(formatDownloadError(raw)).toBe(EXTRACTION_ERROR_MESSAGES.cannotOpen)
  })

  it('traduz 7z_extract_failed genérico', () => {
    expect(formatDownloadError('7z_extract_failed: status=exit code: 2 stderr=other')).toBe(
      EXTRACTION_ERROR_MESSAGES.generic,
    )
  })

  it('traduz download parado / a retomar', () => {
    expect(formatDownloadError('download_stalled_recovering: x')).toBe(
      'Sem atividade — a retomar automaticamente…',
    )
    expect(formatDownloadError('download_stalled: x')).toBe(
      'Download parado (sem peers/velocidade). Tente outra fonte no catálogo.',
    )
  })

  it('remove bloco Download Progress Summary', () => {
    expect(
      stripAria2ProgressNoise('erro real *** Download Progress Summary as of hoje *** lixo'),
    ).toBe('erro real')
  })
})
