<p align="center">
  <img src="./assets/hidari-logo.png" alt="Hidari" width="180" />
</p>

# Documentation — Hidari

Desktop launcher for discovering, downloading, and managing games.

**Tauri 2** · **React 19** · **TypeScript** · **Redux Toolkit** · **Rust** · **SQLite**

Inspired by [Hydra Launcher](https://github.com/hydralauncher/hydra), with its own identity and a native Tauri runtime. See the [README](../README.md) for naming and stack rationale.

## Index

| Document                                    | Contents                                             |
| ------------------------------------------- | ---------------------------------------------------- |
| [Getting started](./getting-started.md)     | Install, commands, **how to add sources**, user flow |
| [Architecture](./architecture.md)           | Layers, library, queue, DB, Steam, events            |
| [Tauri API](./api.md)                       | IPC commands, events, TypeScript modules             |
| [Build and release](./build-and-release.md) | Binaries, packaging, NSIS, updater keys, **Linux/mac downloads** |

## Quick overview

```
Discover → Downloads → Library → Play
     ↑         │            │
     └─ Hydra sources   sidecar + SQLite
```

| Tab           | Role                                             |
| ------------- | ------------------------------------------------ |
| **Discover**  | Search active-source catalogs (Enter or Search)  |
| **Downloads** | Active queue (transfer, automatic post-download) |
| **Library**   | Install (`setup`) then Play; deduped cards       |
| **Settings**  | Folder, sources, speed, seed, language (default EN; installer language on Windows), notifications |

Default UI language: **English** (or the language chosen in the Windows NSIS installer on first launch). Catalog-update desktop notifications default to **off**.

## Why Tauri?

- Lighter than Electron (no bundled Chromium)
- **Rust** backend for files, tray, and deep links (`hidari://`)
- React UI with hot reload in development (`npm run tauri:dev`)

## Essential commands

```bash
npm install          # deps + setup:binaries (7-Zip, aria2c, engine)
npm run tauri:dev    # development (desktop app + hot reload)
npm run tauri:build  # production build
npm run test         # Vitest
npm run lint         # ESLint
```

> Native features (files, downloads, dialogs) work **only** with `npm run tauri:dev` or a built executable — **not** with `npm run dev` alone.

## Where to look

| Need…                    | Go to…                                                     |
| ------------------------ | ---------------------------------------------------------- |
| Run the project          | [getting-started.md](./getting-started.md)                 |
| Library / queue / cache  | [architecture.md](./architecture.md)                       |
| Invoke a Rust command    | [api.md](./api.md)                                         |
| Release build / binaries | [build-and-release.md](./build-and-release.md)             |
| TS contracts             | `src/shared/types/contracts/`                              |
| Persisted settings       | `src/shared/config/appSettings.ts`                         |
| Logo / icon              | `docs/assets/`, `src/assets/logo.webp`, `src-tauri/icons/` |
