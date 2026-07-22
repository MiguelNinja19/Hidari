# Build and release

See also [Architecture](./architecture.md) (download and extraction flow) and [API](./api.md).

<p align="center">
  <img src="./assets/hidari-icon.png" alt="Hidari icon" width="64" />
</p>

## Production build

```bash
npm run setup:binaries
npm run installer:assets   # header/sidebar BMP no estilo Hidari (NSIS)
npm run tauri:build
```

Tauri will:

1. Run `npm run build` (TypeScript + Vite → `dist/`).
2. Compile the Rust crate in `src-tauri/`.
3. Package the installer/executable per `tauri.conf.json`.

Typical output: `src-tauri/target/release/bundle/` (NSIS em `bundle/nsis/`).

### NSIS branding

O instalador Windows usa imagens em `src-tauri/windows/nsis/` (fundo escuro + logo Hidari):

| Asset | Uso | Tamanho |
| ----- | --- | ------- |
| `header.bmp` | Cabeçalho das páginas | 150×57 |
| `sidebar.bmp` | Welcome / Finish | 164×314 |
| `icons/icon.ico` | Ícone do setup | — |

Regenerar: `npm run installer:assets`.

## Tauri configuration

File: `src-tauri/tauri.conf.json`

| Field         | Current value                         |
| ------------- | ------------------------------------- |
| `productName` | Hidari                                |
| `identifier`  | com.hidari.app                        |
| `devUrl`      | http://localhost:5173                 |
| Window        | 1280×816, resizable, title **Hidari** |
| Deep links    | `hidari://`                           |
| CSP           | Restrictive (self + Steam CDNs)       |
| Updater       | Active (GitHub Releases `latest.json`)|

App icons: `src-tauri/icons/` (from the Hidari brand). Docs logo: `docs/assets/`.

### AppData migration

Changing the identifier from `com.mylauncher.app` to `com.hidari.app` creates a new AppData folder. On startup Hidari copies `launcher.db` (and WAL/covers when present) from the legacy folder if the new database does not yet exist.

### Updater signing (chave pública / privada)

O Hidari pode verificar **updates automáticos** (plugin `updater` no `tauri.conf.json`). Isso usa um par de chaves:

| Chave | Onde fica | Função |
| ----- | --------- | ------ |
| **Pública** | `plugins.updater.pubkey` em `tauri.conf.json` (vai no repositório) | A app instalada usa-a para **verificar** que o update é legítimo |
| **Privada** | Ficheiro local (ex. `.tauri/hidari.key`) — **nunca no Git** | Assina os artefactos de update no **teu** PC ao fazer o release |

A pasta `.tauri/` está no `.gitignore`. A privada não se “descarrega” de lado nenhum: ou a guardaste quando a geraste, ou tens de gerar um par **novo** (e atualizar a pública no config).

#### Build local sem updates assinados (padrão atual)

`bundle.createUpdaterArtifacts` está a **`false`**.

- `npm run tauri:build` gera só o instalador / MSI — **não** precisa da chave privada.
- Instaladores tipicamente em:
  - `src-tauri/target/release/bundle/nsis/Hidari_*_x64-setup.exe` (recomendado)
  - `src-tauri/target/release/bundle/msi/Hidari_*_x64_*.msi`
- Na release do GitHub publicamos nomes simples: `Hidari-setup.exe` e `Hidari.msi` (sem versão/arch no nome do ficheiro). Release notes em **inglês**; título tipicamente **Hidari**.

### GitHub release (checklist)

1. Bump `version` em `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`.
2. `npm run tauri:build`.
3. Copiar para nomes simples:
   - `bundle/nsis/Hidari_*_x64-setup.exe` → `Hidari-setup.exe`
   - `bundle/msi/Hidari_*_x64_*.msi` → `Hidari.msi`
4. `gh release create vX.Y.Z --repo melx-999/Hidari --title "Hidari" --notes "…" Hidari-setup.exe Hidari.msi`

Repo canónico: [github.com/melx-999/Hidari](https://github.com/melx-999/Hidari).

Se `createUpdaterArtifacts` estiver a `true` e existir `pubkey` sem `TAURI_SIGNING_PRIVATE_KEY`, o Tauri pode **criar os instaladores e falhar no fim** com:

```text
A public key has been found, but no private key.
Make sure to set TAURI_SIGNING_PRIVATE_KEY environment variable.
```

Nesse caso os ficheiros em `bundle/nsis/` e `bundle/msi/` costumam já estar utilizáveis; o erro é só a assinatura dos artefactos de update.

#### Gerar um par de chaves (quando fores ativar updates)

```bash
npx tauri signer generate -w ./.tauri/hidari.key
```

1. Guarda `.tauri/hidari.key` num sítio seguro (backup fora do repo).
2. Copia a **chave pública** impressa pelo comando para `plugins.updater.pubkey` em `src-tauri/tauri.conf.json`.
3. Se mudares de par, apps antigas com a pública antiga **deixam de aceitar** updates assinados com a chave nova (é preciso republicar / comunicar aos utilizadores).

#### Release com artefactos de update

1. Em `tauri.conf.json`, põe `"createUpdaterArtifacts": true`.
2. Define as variáveis de ambiente **antes** do build:

**Git Bash / Linux / macOS:**

```bash
export TAURI_SIGNING_PRIVATE_KEY="$(cat ./.tauri/hidari.key)"
# só se definiste password ao gerar:
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="tua-password"
npm run tauri:build
```

**PowerShell:**

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content -Raw .\.tauri\hidari.key
# $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "tua-password"
npm run tauri:build
```

3. Publica o instalador e o `latest.json` (e ficheiros `.sig` associados) no endpoint configurado em `plugins.updater.endpoints` (hoje: GitHub Releases do projeto).

Não commits `.tauri/*.key`. Builds e releases neste repo são feitos **localmente** (sem workflow CI de assinatura).

## Required binaries

### `download-engine`

Sidecar HTTP for the download queue. Look-up order (platform-native name: `download-engine.exe` on Windows, `download-engine` elsewhere):

1. `src-tauri/binaries/`
2. `src-tauri/`
3. `../download-engine/target/{release,debug}/`
4. Packaged Tauri resources
5. Application data folder

```bash
npm run build:download-engine
```

### 7-Zip / p7zip

Used to extract archives after download (ZIP, 7Z, RAR).

| OS | How |
|----|-----|
| Windows | `npm run setup:binaries` → `binaries/7za.exe` + `7za.dll`; also `Program Files\7-Zip` |
| Linux | `apt install p7zip-full` (`7z` / `7za`) or copy `7zz` into `binaries/` |
| macOS | `brew install sevenzip` (`7zz`) or `p7zip` |

### `aria2c`

Used by the download engine for transfers.

| OS | How |
|----|-----|
| Windows | Place `aria2c.exe` in `src-tauri/binaries/` (synced by `setup:binaries` when present under `src-tauri/`) |
| Linux / macOS | `apt install aria2` / `brew install aria2`, or place `aria2c` in `binaries/` |

At runtime the launcher also looks next to the engine, under `tools/`, Tauri resources, and `PATH`.

### Bundle resources by platform

| File | Role |
|------|------|
| `tauri.conf.json` | Base resources: `binaries/README.txt` |
| `tauri.windows.conf.json` | `aria2c.exe`, `download-engine.exe`, `7za.exe`, `7za.dll` |
| `tauri.linux.conf.json` / `tauri.macos.conf.json` | `binaries/README.txt` — rely on PATH or copy native binaries before release |

Linux/mac release builds do **not** require Windows `.exe` files. For a self-contained Unix bundle, copy native `download-engine` (+ optional `aria2c` / `7zz`) into `src-tauri/binaries/` and extend the platform config `resources` list.

## Platforms and download parity

**Downloads** (Discover → queue → extract) use the **same** logic on Windows, Linux, and macOS: IPC → `download-engine` HTTP API → aria2 → 7z. Only binary **file names** and packaging differ.

**Library Play/Install** for Windows repacks (`setup.exe`, PE) is **Windows-only**. On **macOS**, **Play** supports native `.app` bundles; Hydra/FitGirl repacks → open folder. On **Linux**, use Wine/Proton manually.

### Unix smoke checklist

1. Install `aria2` + `p7zip`/`sevenzip`
2. `npm run build:download-engine && npm run setup:binaries`
3. `npm run tauri:dev`
4. Enqueue a small HTTP or magnet job → progress updates → pause/resume
5. After completion, extract if an archive is present; open job folder

## Embedded resources

- `src-tauri/resources/embedded_catalog.json` — embedded catalog (search without sources)
- Imported catalogs — AppData cache (`catalogs/`)
- Icons in `src-tauri/icons/`
- UI logo: `src/assets/logo.webp`

## License

MIT — see `LICENSE` at the repository root.
