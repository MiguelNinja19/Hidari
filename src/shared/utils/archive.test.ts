import { describe, expect, it } from 'vitest'
import { isArchiveFile, resolveDeletePath } from './archive'

describe('isArchiveFile', () => {
  it('detects common archive extensions', () => {
    expect(isArchiveFile('game.zip')).toBe(true)
    expect(isArchiveFile('D:\\Downloads\\repack.7z')).toBe(true)
    expect(isArchiveFile('part1.rar')).toBe(true)
    expect(isArchiveFile('archive.001')).toBe(true)
    expect(isArchiveFile('setup.exe')).toBe(false)
  })
})

describe('resolveDeletePath', () => {
  it('returns parent folder for archive paths', () => {
    expect(resolveDeletePath('D:\\Games\\MyGame\\setup.part1.rar')).toBe('D:\\Games\\MyGame')
    expect(resolveDeletePath('D:\\Games\\file.zip')).toBe('D:\\Games')
  })

  it('returns folder path unchanged', () => {
    expect(resolveDeletePath('D:\\Games\\MyGame')).toBe('D:\\Games\\MyGame')
  })
})
