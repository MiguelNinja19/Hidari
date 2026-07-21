/**
 * Compila o download-engine e copia o binário nativo para src-tauri/ e binaries/.
 */
import { access, copyFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const isWindows = process.platform === 'win32'
const engineName = isWindows ? 'download-engine.exe' : 'download-engine'
const engineManifest = path.resolve(root, '..', 'download-engine', 'Cargo.toml')
const releaseBin = path.resolve(
  root,
  '..',
  'download-engine',
  'target',
  'release',
  engineName,
)

async function exists(filePath) {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      windowsHide: true,
      shell: isWindows,
      cwd: root,
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${command} exited ${code}`))
    })
  })
}

async function main() {
  if (!(await exists(engineManifest))) {
    throw new Error(`download-engine não encontrado em ${engineManifest}`)
  }
  console.log('A compilar download-engine (release)...')
  await run('cargo', ['build', '--release', '--manifest-path', engineManifest])
  if (!(await exists(releaseBin))) {
    throw new Error(`Binário não gerado: ${releaseBin}`)
  }
  const destinations = [
    path.join(root, 'src-tauri', engineName),
    path.join(root, 'src-tauri', 'binaries', engineName),
  ]
  for (const dest of destinations) {
    await mkdir(path.dirname(dest), { recursive: true })
    await copyFile(releaseBin, dest)
    console.log('copied ->', dest)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
