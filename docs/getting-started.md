<p align="center">
  <img src="./assets/hidari-icon.png" alt="Hidari icon" width="72" />
</p>

# Getting started

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| [Node.js](https://nodejs.org/) | 18+ | Frontend (Vite) and Tauri CLI |
| [Rust](https://www.rust-lang.org/tools/install) | 1.77+ | Backend in `src-tauri/` |
| Windows SDK | — | Required **on Windows** |
| [aria2](https://aria2.github.io/) | — | **Linux/macOS:** `apt install aria2` / `brew install aria2` (or place `aria2c` in `src-tauri/binaries/`) |
| 7-Zip / p7zip | — | **Windows:** via `setup:binaries`. **Linux/macOS:** `apt install p7zip-full` / `brew install sevenzip` |

See also [Tauri v2 prerequisites](https://v2.tauri.app/start/prerequisites/).

## Install

```bash
npm install
npm run build:download-engine   # compile sidecar (required for downloads)
```

`postinstall` runs `npm run setup:binaries`:

- **Windows:** 7-Zip (`7za.exe`, `7za.dll`) + sync `aria2c.exe` / `download-engine.exe` when present
- **Linux / macOS:** sync `download-engine` if built; expects `aria2c` and `7z`/`7zz` on `PATH`

On first run, Rust compiles dependencies (may take a few minutes).

### Linux / macOS notes

Downloads use the **same** HTTP pipeline as Windows (UI → Tauri → `download-engine` → aria2 → extract). Only native binary names differ.

Play/Install of Windows repacks (`setup.exe`) is **Windows-only**. On **macOS**, **Play** works for native games (`.app` bundles); for Hydra/FitGirl repacks, use **Open folder** after download. On **Linux**, use Wine/Proton manually — the launcher does not change that flow.

```bash
# Debian/Ubuntu
sudo apt install aria2 p7zip-full
# macOS
brew install aria2 sevenzip

npm run build:download-engine
npm run setup:binaries
npm run tauri:dev
```

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
4. **Library** — **Install** (`setup.exe` repacks, Windows) → choose/locate game folder → **Play**. On **macOS**, **Play** targets native `.app` games; Windows repacks → open folder.

> First launch uses the **Windows installer language** when available; otherwise **English**. Change it anytime under **Settings → Language**.

### How to add sources

Catalog sources are `.json` files in the Hydra / HydraLinks format.

1. Go to **Settings** → **Catalog sources**.
2. Use the inline **URL** / **JSON** panel (not a modal):
   - **URL** — paste e.g. `https://hydralinks.cloud/sources/fitgirl.json` → **Add**. Use **Open URL site** to browse [https://library.hydra.wiki/sources/](https://library.hydra.wiki/sources/).
   - **JSON** — **Choose file** → pick a local `.json`. The app copies it to an internal folder; the original can be removed.
3. Keep the source **enabled** (toggle). Discover only searches active sources.
4. Click **Sync** if the listed game count is missing or outdated.

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
| At 100% | Downloads | “Preparing files…” (seconds); may stay as seeding if seed is on |
| Ready to install | Downloads / Library | **Install** — download folder still has `setup.exe` (not Play yet) |
| Installed | Library | **Play** after the real game folder is known |
| Seed on | Disk | `.torrent` / `.aria2` kept so the engine can keep seeding |
| Seed off | Disk | Matching `.torrent` / `.aria2` removed after the download is verified |

Errors show as a **toast** in the top-right (they do not block the page). Desktop notifications (install / play ready) are silent; catalog-update toasts are off by default.

## Development

1. `npm run tauri:dev`
2. Vite at `http://localhost:5173` (`tauri.conf.json`)
3. **Hidari** window (1280×816 px)

### “Tauri unavailable” error

You are running `npm run dev` only. Use `npm run tauri:dev`.

### Extraction fails (`7z_not_found`)

```bash
# Windows
npm run setup:binaries
# Linux / macOS
sudo apt install p7zip-full   # or: brew install sevenzip
```

### Missing download-engine

```bash
npm run build:download-engine
```

See [Build and release](./build-and-release.md).

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
