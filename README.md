<p align="center">
  <img src="./docs/assets/hidari-logo.webp" alt="Hidari" width="200" />
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

The name plays on **Hydra**: shared catalogs, its own identity (logo with an “H” and hydras). Not an official Hydra product.

| | |
|---|---|
| **Runtime** | [Tauri 2](https://v2.tauri.app/) — system WebView + Rust |
| **Catalog** | Local/remote sources (Hydra ecosystem) |
| **Downloads** | `download-engine` + `aria2c` |
| **Post-download** | 7-Zip extract → Library (install / play) |
| **Data** | SQLite (sources, queue, covers, settings) |

---

## Features

1. **Settings** — download folder, import/sync sources, enable/disable sources, speed, seed, language  
2. **Discover** — search the local catalog (Enter or button) → pick a link → enqueue  
3. **Downloads** — live progress; automatic extraction  
4. **Library** — install (`setup`) and play  

```
Settings → Discover → Downloads → Library → Play
```

---

## How to add sources

Sources are Hydra-style `.json` catalogs (HydraLinks). Without at least one **active** source, Discover search stays empty.

1. Open **Settings** → section **Catalog sources**.
2. Click **Add source** to open the modal — then **Open sources** to browse [library.hydra.wiki/sources](https://library.hydra.wiki/sources/) and copy a source `.json` link.
3. Add it in one of two ways:
   - **URL** — paste the link and click **Add**.
   - **File** — click **Import .json** and choose a local catalog (it is copied into the app cache; you can delete the original afterward).
4. Leave the source **on** (switch). Only enabled sources are searched.
5. If the game count looks empty, click **Sync** (or **Sync all**).

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
| Extraction / `7z_not_found` | `npm run setup:binaries` |
| Empty search | Active sources + sync catalog |

More in [docs/getting-started.md](./docs/getting-started.md).

---

## Documentation

| Doc | Contents |
|-----|----------|
| [docs/](./docs/README.md) | Index |
| [Getting started](./docs/getting-started.md) | Install and user flow |
| [Architecture](./docs/architecture.md) | Library, queue, DB |
| [Tauri API](./docs/api.md) | Commands and events |
| [Build](./docs/build-and-release.md) | Packaging |

---

## License

MIT — [LICENSE](./LICENSE).
