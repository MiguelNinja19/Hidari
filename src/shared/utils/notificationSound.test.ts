import { describe, expect, it } from 'vitest'
import { notificationSoundOptions } from './notificationSound'

describe('notificationSoundOptions', () => {
  it('silencia quando o som está desligado', () => {
    expect(notificationSoundOptions(false)).toEqual({ silent: true })
  })

  it('pede som Default no Windows (evita silent implícito do WinRT)', () => {
    expect(notificationSoundOptions(true)).toEqual({ sound: 'Default' })
  })
})
