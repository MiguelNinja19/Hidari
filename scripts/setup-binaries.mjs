/**
 * Prepara binários nativos em src-tauri/binaries/ para o OS atual.
 * Windows: baixa 7-Zip extra + sync aria2c.exe / download-engine.exe
 * Linux/macOS: sync download-engine; usa aria2c/7z do PATH se disponível
 *
 * Executar: npm run setup:binaries
 */
import { access, copyFile, mkdir, writeFile } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const srcTauri = path.join(root, 'src-tauri')
const binariesDir = path.join(srcTauri, 'binaries')
const tmpDir = path.join(root, '.tmp-7z-setup')
const isWindows = process.platform === 'win32'

const SEVEN_ZIP_EXTRA_URL = 'https://www.7-zip.org/a/7z2301-extra.7z'
const SEVEN_ZIP_MINI_URL = 'https://www.7-zip.org/a/7zr.exe'

const ENGINE_NAME = isWindows ? 'download-engine.exe' : 'download-engine'
const ARIA2_NAME = isWindows ? 'aria2c.exe' : 'aria2c'

async function exists(filePath) {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

async function download(url, dest) {
  const response = await fetch(url)
  if (!response.ok || !response.body) {
    throw new Error(`Falha ao baixar ${url} (HTTP ${response.status})`)
  }
  await pipeline(response.body, createWriteStream(dest))
}

function runCommand(command, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      windowsHide: true,
      shell: opts.shell ?? false,
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${command} terminou com código ${code}`))
    })
  })
}

function commandExists(command) {
  return new Promise((resolve) => {
    const checker = isWindows ? 'where' : 'which'
    const child = spawn(checker, [command], {
      stdio: 'ignore',
      windowsHide: true,
      shell: isWindows,
    })
    child.on('error', () => resolve(false))
    child.on('close', (code) => resolve(code === 0))
  })
}

async function ensure7ZipWindows() {
  const sevenZa = path.join(binariesDir, '7za.exe')
  const sevenDll = path.join(binariesDir, '7za.dll')
  if ((await exists(sevenZa)) && (await exists(sevenDll))) {
    console.log('7-Zip já presente em src-tauri/binaries/')
    return
  }

  console.log('A baixar 7-Zip (extra)...')
  await mkdir(tmpDir, { recursive: true })
  await mkdir(binariesDir, { recursive: true })

  const mini7z = path.join(tmpDir, '7zr.exe')
  const extraArchive = path.join(tmpDir, '7z-extra.7z')
  const extractedDir = path.join(tmpDir, 'extracted')

  if (!(await exists(mini7z))) {
    await download(SEVEN_ZIP_MINI_URL, mini7z)
  }
  if (!(await exists(extraArchive))) {
    await download(SEVEN_ZIP_EXTRA_URL, extraArchive)
  }

  await mkdir(extractedDir, { recursive: true })
  await runCommand(mini7z, ['x', extraArchive, `-o${extractedDir}`, '-y'])

  const x64Dir = path.join(extractedDir, 'x64')
  await copyFile(path.join(x64Dir, '7za.exe'), sevenZa)
  await copyFile(path.join(x64Dir, '7za.dll'), sevenDll)
  console.log('7za.exe e 7za.dll instalados em src-tauri/binaries/')
}

async function checkUnixExtractTools() {
  for (const name of ['7zz', '7z', '7za']) {
    if (await commandExists(name)) {
      console.log(`7-Zip/p7zip encontrado no PATH: ${name}`)
      return
    }
  }
  console.warn(
    'Aviso: 7z/7zz não encontrado. Instale p7zip ou 7zip (apt install p7zip-full / brew install sevenzip).',
  )
}

async function syncEngineFromSibling() {
  const releaseCandidates = [
    path.join(srcTauri, ENGINE_NAME),
    path.join(root, '..', 'download-engine', 'target', 'release', ENGINE_NAME),
    path.join(root, '..', 'download-engine', 'target', 'debug', ENGINE_NAME),
  ]
  const dest = path.join(binariesDir, ENGINE_NAME)
  for (const from of releaseCandidates) {
    if (!(await exists(from))) continue
    await mkdir(binariesDir, { recursive: true })
    await copyFile(from, dest)
    console.log(`Sincronizado download-engine → binaries/${ENGINE_NAME}`)
    return true
  }
  console.warn(
    `Aviso: ${ENGINE_NAME} não encontrado. Compile com: npm run build:download-engine`,
  )
  return false
}

async function syncAria2() {
  await mkdir(binariesDir, { recursive: true })
  const fromLocal = path.join(srcTauri, ARIA2_NAME)
  const to = path.join(binariesDir, ARIA2_NAME)
  if (await exists(fromLocal)) {
    await copyFile(fromLocal, to)
    console.log(`Sincronizado ${ARIA2_NAME} → binaries/${ARIA2_NAME}`)
    return
  }
  if (await exists(to)) {
    console.log(`${ARIA2_NAME} já presente em binaries/`)
    return
  }
  if (await commandExists(isWindows ? 'aria2c' : 'aria2c')) {
    console.log('aria2c encontrado no PATH (será usado em runtime).')
    return
  }
  if (isWindows) {
    console.warn(
      'Aviso: aria2c.exe não encontrado em src-tauri/ — coloque-o em src-tauri/binaries/',
    )
  } else {
    console.warn(
      'Aviso: aria2c não encontrado. Instale com: apt install aria2 / brew install aria2',
    )
  }
}

async function writeReadme() {
  const readme = isWindows
    ? `Binários do Hidari (gerados por npm run setup:binaries)

- 7za.exe / 7za.dll — extração de ZIP, 7Z, RAR (7-Zip extra, licença LGPL)
- aria2c.exe — motor de download
- download-engine.exe — sidecar da fila de downloads

Em desenvolvimento, o launcher também procura estes ficheiros em src-tauri/.
`
    : `Binários do Hidari (Linux / macOS)

- download-engine — sidecar da fila (compile: npm run build:download-engine)
- aria2c — no PATH (apt install aria2 / brew install aria2) ou em binaries/
- 7zz / 7z — no PATH (apt install p7zip-full / brew install sevenzip) ou em binaries/

O fluxo de downloads (HTTP → download-engine → aria2 → extract) é o mesmo que no Windows;
só muda a resolução dos binários nativos.
`
  await writeFile(path.join(binariesDir, 'README.txt'), readme, 'utf8')
}

async function main() {
  console.log(`Configurando binários do launcher (${process.platform})...`)
  await mkdir(binariesDir, { recursive: true })

  if (isWindows) {
    await ensure7ZipWindows()
    await syncAria2()
    await syncEngineFromSibling()
  } else {
    await checkUnixExtractTools()
    await syncAria2()
    await syncEngineFromSibling()
  }

  await writeReadme()
  console.log('Setup concluído.')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
