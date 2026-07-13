<p align="center">
  <img src="./assets/hidari-icon.png" alt="Hidari icon" width="72" />
</p>

# Getting started

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| [Node.js](https://nodejs.org/) | 18+ | Frontend (Vite) and Tauri CLI |
| [Rust](https://www.rust-lang.org/tools/install) | 1.77+ | Backend in `src-tauri/` |
| Windows SDK | — | Required on Windows |

See also [Tauri v2 prerequisites](https://v2.tauri.app/start/prerequisites/).

## Install

```bash
npm install
```

`postinstall` runs `npm run setup:binaries`:

- **7-Zip** (`7za.exe`, `7za.dll`) — automatic extraction
- **aria2c.exe** and **download-engine.exe** → `src-tauri/binaries/`

On first run, Rust compiles dependencies (may take a few minutes).

## Commands

| Command | Description |
|---------|-------------|
| `npm run tauri:dev` | **Recommended** — desktop app + hot reload |
| `npm run dev` | Browser only — **no** Tauri APIs |
| `npm run tauri:build` | Production installer / executable |
| `npm run build` | Frontend only → `dist/` |
| `npm run test` | Vitest |
| `npm run lint` | ESLint |
| `npm run setup:binaries` | Re-download native binaries |

## User flow

1. **Settings** — download folder + add at least one catalog source (see below)
2. **Discover** — type a game name → **Enter** or Search → pick a version → enqueue
3. **Downloads** — watch progress; post-download is **automatic**
4. **Library** — **Install** (setup) → **Play**

### How to add sources

Catalog sources are `.json` files in the Hydra / HydraLinks format.

1. Go to **Settings** → **Catalog sources**.
2. Click **Add source** to open the guide modal, then **Open sources** to open [https://library.hydra.wiki/sources/](https://library.hydra.wiki/sources/) in your browser, pick a source, and copy its `.json` URL.
3. Choose one method:
   - **By URL** — paste e.g. `https://hydralinks.cloud/sources/fitgirl.json` → **Add**.
   - **By file** — **Import .json** → pick a local `.json`. The app copies it to an internal folder; the original can be removed.
4. Keep the source **enabled** (toggle). Discover only searches active sources.
5. Use **Sync** / **Sync all** if the listed game count is missing or outdated.

Example public catalog URLs follow the pattern:

```text
https://hydralinks.cloud/sources/<name>.json
```

Source browser: [https://library.hydra.wiki/sources/](https://library.hydra.wiki/sources/).

### Active / inactive sources

In Settings you can **disable** a source without deleting it. State lives in `app_settings` (`disabled_hydra_source_ids`) and survives restarts. Discover search uses active sources only.

If search is empty with “active” sources, sync the catalog (per-source refresh or refresh all).

### What to expect per stage

| Stage | Where | What you see |
|-------|-------|--------------|
| Transferring | Downloads | Progress bar, speed |
| At 100% | Downloads | “Preparing files…” (seconds) |
| Ready | Downloads / Library | “Ready to install” or **Install** |
| Installed | Library | **Play** |

Errors show as a **toast** in the top-right (they do not block the page).

## Development

1. `npm run tauri:dev`
2. Vite at `http://localhost:5173` (`tauri.conf.json`)
3. **Hidari** window (1094×816 px)

### “Tauri unavailable” error

You are running `npm run dev` only. Use `npm run tauri:dev`.

### Extraction fails (`7z_not_found`)

```bash
npm run setup:binaries
```

### Missing download-engine

See [Build and release](./build-and-release.md) — place `download-engine.exe` under `src-tauri/`.

## Helper script

`scripts/read-hydra-sources.mjs` — exports sources from Hydra Launcher’s LevelDB (useful to migrate catalogs):

```bash
node scripts/read-hydra-sources.mjs [hydra-db-path] [snapshot-folder]
```

Default: `%APPDATA%\hydralauncher\hydra-db`.

## Next steps

- [Architecture](./architecture.md) — library, queue, DB, Steam
- [Tauri API](./api.md) — commands and events
- [Build and release](./build-and-release.md) — production
- [README](../README.md) — why Hidari and why Tauri
