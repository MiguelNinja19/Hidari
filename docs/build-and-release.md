# Build and release

See also [Architecture](./architecture.md) (download and extraction flow) and [API](./api.md).

<p align="center">
  <img src="./assets/hidari-icon.png" alt="Hidari icon" width="64" />
</p>

## Production build

```bash
npm run setup:binaries
npm run tauri:build
```

Tauri will:

1. Run `npm run build` (TypeScript + Vite → `dist/`).
2. Compile the Rust crate in `src-tauri/`.
3. Package the installer/executable per `tauri.conf.json`.

Typical output: `src-tauri/target/release/bundle/`.

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

### Updater signing

1. Generate keys: `npx tauri signer generate -w ./.tauri/hidari.key`
2. Put the **public** key in `plugins.updater.pubkey` (`tauri.conf.json`).
3. For signed release builds locally, set env vars before `npm run tauri:build`:
   - `TAURI_SIGNING_PRIVATE_KEY`
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

Never commit `.tauri/*.key`. There is no GitHub Actions workflow in this repo — builds and releases are done locally.

## Required binaries

### `download-engine`

Sidecar that owns the download queue (HTTP/torrent). The launcher looks for `download-engine.exe` roughly in this order:

1. `src-tauri/download-engine.exe` (in the repo for dev)
2. Sibling project build folders `../download-engine/target*/release|debug/`
3. Packaged Tauri resources
4. Application data folder

For local development, put the built executable at `src-tauri/download-engine.exe` or build the `download-engine` project in an adjacent folder.

### `7za.exe` / `7z.exe`

Used to extract archives after download (ZIP, 7Z, RAR). Automatic setup places them at:

```
src-tauri/binaries/7za.exe
src-tauri/binaries/7za.dll
```

Run `npm run setup:binaries` if those files are missing. The launcher also looks for `7z` on `PATH` or under `Program Files\7-Zip`.

For release, binaries are included via `bundle.resources` in `tauri.conf.json`.

### `aria2c.exe`

Used by the download engine for transfers. Place at:

```
src-tauri/binaries/aria2c.exe
```

In release, the file is included via `bundle.resources` in `tauri.conf.json`.

At runtime the launcher also looks:

- Next to `download-engine.exe`
- `tools/aria2c.exe` relative to the engine
- Tauri resources (`aria2c.exe`, `tools/`, `binaries/`)
- System `PATH`

Details in `src-tauri/binaries/README.txt`.

## Embedded resources

- `src-tauri/resources/embedded_catalog.json` — embedded catalog (search without sources)
- Imported catalogs — AppData cache (`catalogs/`)
- Icons in `src-tauri/icons/`
- UI logo: `src/assets/logo.webp`

## Platforms

The project targets **Windows** (`aria2c.exe`, `download-engine.exe`). Other platforms would need equivalent binaries and changes in `lib.rs` (`cfg!(target_os = "windows")`).

## License

MIT — see `LICENSE` at the repository root.
