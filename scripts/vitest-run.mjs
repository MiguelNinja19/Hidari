import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** Vitest no Windows falha se o drive estiver em minúscula (vitest-dev/vitest#5251). */
const cwd =
  process.platform === 'win32' && /^[a-z]:/.test(root)
    ? root[0].toUpperCase() + root.slice(1)
    : root

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx'
const args = ['vitest', ...process.argv.slice(2)]

const result = spawnSync(npx, args, {
  cwd,
  stdio: 'inherit',
  shell: process.platform === 'win32',
})

process.exit(result.status ?? 1)
