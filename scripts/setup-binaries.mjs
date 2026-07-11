/**
 * Baixa 7-Zip (7za.exe + 7za.dll) e sincroniza binários locais para src-tauri/binaries/.
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

const SEVEN_ZIP_EXTRA_URL = 'https://www.7-zip.org/a/7z2301-extra.7z'
const SEVEN_ZIP_MINI_URL = 'https://www.7-zip.org/a/7zr.exe'

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

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', windowsHide: true })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${command} terminou com código ${code}`))
    })
  })
}

async function ensure7Zip() {
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

async function syncBundledTools() {
  await mkdir(binariesDir, { recursive: true })

  const pairs = [
    ['aria2c.exe', 'aria2c.exe'],
    ['download-engine.exe', 'download-engine.exe'],
  ]

  for (const [fileName, destName] of pairs) {
    const from = path.join(srcTauri, fileName)
    const to = path.join(binariesDir, destName)
    if (!(await exists(from))) {
      console.warn(`Aviso: ${fileName} não encontrado em src-tauri/ — ignorado`)
      continue
    }
    await copyFile(from, to)
    console.log(`Sincronizado ${fileName} → binaries/${destName}`)
  }
}

async function writeReadme() {
  const readme = `Binários do Hidari (gerados por npm run setup:binaries)

- 7za.exe / 7za.dll — extração de ZIP, 7Z, RAR (7-Zip extra, licença LGPL)
- aria2c.exe — motor de download
- download-engine.exe — sidecar da fila de downloads

Em desenvolvimento, o launcher também procura estes ficheiros em src-tauri/.
`
  await writeFile(path.join(binariesDir, 'README.txt'), readme, 'utf8')
}

async function main() {
  console.log('Configurando binários do launcher...')
  if (process.platform !== 'win32') {
    console.log(
      `Plataforma ${process.platform}: a saltar download de binários Windows (.exe).`,
    )
    await mkdir(binariesDir, { recursive: true })
    await writeReadme()
    console.log('Setup concluído (sem sidecars Windows).')
    return
  }
  await ensure7Zip()
  await syncBundledTools()
  await writeReadme()
  console.log('Setup concluído.')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
