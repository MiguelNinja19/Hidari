import { describe, expect, it } from 'vitest'
import { formatLaunchError, LAUNCH_ERROR_MESSAGES } from './launchErrors'

describe('formatLaunchError', () => {
  it('traduz códigos estáveis launch_error:<code>', () => {
    expect(formatLaunchError(new Error('launch_error:no_executable|detail'))).toBe(
      LAUNCH_ERROR_MESSAGES.no_executable,
    )
    expect(formatLaunchError(new Error('launch_error:path_not_found|x'))).toBe(
      LAUNCH_ERROR_MESSAGES.path_not_found,
    )
  })

  it('mapeia substrings legadas', () => {
    expect(formatLaunchError(new Error('no_executable in folder'))).toBe(
      LAUNCH_ERROR_MESSAGES.needs_install,
    )
    expect(formatLaunchError(new Error('7z_not_found'))).toBe(
      LAUNCH_ERROR_MESSAGES.seven_zip_missing,
    )
  })

  it('remove prefixo could_not_launch_game', () => {
    expect(formatLaunchError(new Error('could_not_launch_game: algo falhou'))).toBe('algo falhou')
  })
})
