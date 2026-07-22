<p align="center">
  <img src="./docs/assets/hidari-logo.png" alt="Hidari" width="200" />
</p>

<h1 align="center">Hidari</h1>

<p align="center">
  Desktop launcher to discover, download, install, and play games.<br />
  <strong>Tauri 2</strong> · React · TypeScript · Rust · SQLite
</p>

<p align="center">
  <a href="./docs/README.md">Docs</a> ·
  <a href="./docs/getting-started.md">Getting started</a> ·
  <a href="./docs/architecture.md">Architecture</a> ·
  <a href="./docs/api.md">API</a>
</p>

---

## What it is

**Hidari** is inspired by [Hydra Launcher](https://github.com/hydralauncher/hydra) (`.json` / HydraLinks sources, local search, torrent/HTTP), but runs as a **native Tauri** app — React UI, Rust backend, no Electron.



| | |
|---|---|
| **Runtime** | [Tauri 2](https://v2.tauri.app/) — system WebView + Rust |
| **Catalog** | Local/remote sources (Hydra ecosystem) |
| **Downloads** | `download-engine` + `aria2c` |
| **Post-download** | 7-Zip extract → Library (install / play) |
| **Data** | SQLite (sources, queue, covers, settings) |

---

## Features

1. **Settings** — download folder, import/sync sources, enable/disable sources, speed, seed, language (default **English**; Windows installer language is applied on first launch)  
2. **Discover** — search the local catalog (Enter or button) → pick a link → enqueue  
3. **Downloads** — live progress; automatic post-download  
4. **Library** — **Install** (`setup`) then **Play** (not Play while only the installer is present); import external games from the toolbar  

```
Settings → Discover → Downloads → Library → Play
```

**Seed:** with seeding on, `.torrent` / `.aria2` stay on disk; with seeding off, they are removed after a verified download.
---

## How to add sources

Sources are Hydra-style `.json` catalogs (HydraLinks). Without at least one **active** source, Discover search stays empty.

1. Open **Settings** → section **Catalog sources**.
2. Add a source in one of two ways (inline panel, not a modal):
   - **URL** — paste a `.json` link and click **Add** (use **Open URL site** to browse [library.hydra.wiki/sources](https://library.hydra.wiki/sources/)).
   - **JSON** — click **Choose file** and pick a local catalog (it is copied into the app cache; you can delete the original afterward).
3. Leave the source **on** (switch). Only enabled sources are searched.
4. If the game count looks empty, click **Sync**.

Browse sources: [https://library.hydra.wiki/sources/](https://library.hydra.wiki/sources/).
Public JSON catalogs are typically under `https://hydralinks.cloud/sources/…`.

Migrating from Hydra Launcher: see [getting-started.md](./docs/getting-started.md) (`scripts/read-hydra-sources.mjs`).

---

## Quick start

**Prerequisites:** Node.js 18+, Rust 1.77+, Windows SDK — see [Tauri](https://v2.tauri.app/start/prerequisites/).

```bash
npm install          # includes setup:binaries (7-Zip, aria2c, engine)
npm run tauri:dev    # desktop app (required for native APIs)
```

| Command | Use |
|---------|-----|
| `npm run tauri:dev` | Development |
| `npm run tauri:build` | Release → `src-tauri/target/release/bundle/` |
| `npm run test` / `test:rust` | Tests |
| `npm run setup:binaries` | Restore native binaries |

> `npm run dev` alone has **no** Tauri (files, downloads, dialogs).

---

## Architecture (summary)

```
React (UI)  ──IPC──►  Rust / Tauri  ──►  SQLite + JSON sources
                              │
                              └──►  download-engine + aria2c
```

Details, events, settings, and Steam: [docs/architecture.md](./docs/architecture.md).  
IPC commands: [docs/api.md](./docs/api.md).  
Build and binaries: [docs/build-and-release.md](./docs/build-and-release.md).

---

## Common issues

| Symptom | Fix |
|---------|-----|
| “Tauri unavailable” | Use `npm run tauri:dev` |
| Extraction / `7z_not_found` | Windows: `npm run setup:binaries`. Linux/mac: install `p7zip`/`sevenzip` |
| Empty search | Active sources + sync catalog |
| Library shows **Play** but only setup exists | Rebuild / update — inspect treats `setup.exe` as Install until a game root is set |
| `.torrent` not deleted after download | Expected if **Seed after download** is on |
| Build ends with `TAURI_SIGNING_PRIVATE_KEY` | Normal if updater artefacts are on without a private key — see [Build → Updater signing](./docs/build-and-release.md#updater-signing-chave-pública--privada). Installers in `bundle/` may already exist; local builds keep `createUpdaterArtifacts: false` |
| Downloads fail on Linux/mac | `npm run build:download-engine`; install `aria2` + `p7zip`/`sevenzip`; see [Getting started](./docs/getting-started.md) |

More in [docs/getting-started.md](./docs/getting-started.md).

---

## Documentation

| Doc | Contents |
|-----|----------|
| [docs/](./docs/README.md) | Index |
| [Getting started](./docs/getting-started.md) | Install and user flow |
| [Architecture](./docs/architecture.md) | Library, queue, DB |
| [Tauri API](./docs/api.md) | Commands and events |
| [Build](./docs/build-and-release.md) | Packaging, NSIS branding, updater keys |

---

## License

MIT — [LICENSE](./LICENSE).
