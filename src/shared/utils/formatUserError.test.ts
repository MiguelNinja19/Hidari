import { describe, expect, it } from 'vitest'
import { formatUserError } from './formatUserError'
import { LAUNCH_ERROR_MESSAGES } from './launchErrors'

describe('formatUserError', () => {
  it('reutiliza mensagens de lançamento', () => {
    expect(formatUserError(new Error('launch_error:no_executable|x'))).toBe(
      LAUNCH_ERROR_MESSAGES.no_executable,
    )
  })

  it('traduz erros técnicos de pasta', () => {
    expect(formatUserError(new Error('scan_default_download_path_failed: access denied'))).toBe(
      'Não foi possível ler a pasta de downloads. Verifique o caminho em Configurações.',
    )
  })

  it('traduz erros de inspeção da biblioteca', () => {
    expect(formatUserError(new Error('inspect_library_paths_failed'))).toBe(
      'Não foi possível verificar a instalação do jogo.',
    )
  })
})
