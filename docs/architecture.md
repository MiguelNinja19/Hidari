# Architecture

Single reference for structure, data flows, business rules, database, and Steam API usage.

<p align="center">
  <img src="./assets/hidari-logo.webp" alt="Hidari" width="140" />
</p>

**Hidari** is a Tauri launcher inspired by the Hydra ecosystem (JSON sources/catalogs). The UI is React; the Rust backend handles SQLite, downloads (sidecar), covers, and game launching.

## Overview

```
┌─────────────────────────────────────────────────────────┐
│  App.tsx — thin shell (lazy tabs, navigation, providers)│
│  features/* — autonomous tab (Controller + Provider)    │
│  Redux: sources, queue                                  │
│  ToastProvider — errors and success (global toast)      │
└────────────────────┬────────────────────────────────────┘
                     │ invoke / listen
┌────────────────────▼────────────────────────────────────┐
│  TypeScript API (src/shared/api/tauri/*)                │
│  Contracts (src/shared/types/contracts/*)               │
│  Config (src/shared/config/*)                           │
└────────────────────┬────────────────────────────────────┘
                     │ Tauri IPC
┌────────────────────▼────────────────────────────────────┐
│  Rust (src-tauri/src/)                                  │
│  db · sidecar · catalog · covers · library · launch …   │
│  SQLite (r2d2 pool) · HTTP (reqwest)                    │
└────────────┬───────────────────────┬────────────────────┘
             │                       │
    ┌────────▼────────┐     ┌────────▼────────────┐
    │  Hydra / JSON   │     │  download-engine    │
    │  (local sources)│     │  (HTTP sidecar)     │
    └─────────────────┘     └─────────────────────┘
```

## Folder structure

```
launcher-app/
├── docs/                    # documentation
├── src/
│   ├── app/                 # global hooks (bootstrap, queue sync, deep links)
│   ├── features/
│   │   ├── discover/        # Discover
│   │   ├── downloads/       # Downloads
│   │   ├── library/         # Library
│   │   ├── queue/           # queueSlice + selectors
│   │   ├── settings/
│   │   ├── sources/
│   │   ├── covers/          # CoversProvider
│   │   └── genres/          # parseGenreList (Discover)
│   ├── layout/              # AppShell, Sidebar (4 tabs)
│   ├── shared/
│   │   ├── api/tauri/
│   │   ├── components/      # ToastProvider, CatalogCover, …
│   │   ├── config/
│   │   ├── hooks/
│   │   ├── types/contracts/
│   │   └── utils/           # libraryDedupe, jobExtraction, normalizeTitleKey
│   └── App.tsx
└── src-tauri/src/
    ├── catalog/
    ├── covers/              # steam_index, precache
    ├── db/
    ├── library/             # scan, inspect, watcher (notify)
    ├── sidecar/             # engine, extraction, commands
    └── launch/
```

## Tabs and Controller pattern

| Tab | Wrapper | State |
|-----|---------|-------|
| Discover | `DiscoverTab` | `DiscoverController` + `useDiscoverControllerState` |
| Library | `LibraryTab` | `LibraryController` + `useLibraryControllerState` |
| Downloads | `DownloadsTab` | Redux jobs (minimal props) |
| Settings | `SettingsTab` | `AppSettingsContext` + `sources` slice |

`CoversProvider` wraps Discover, Library, and Downloads.

### Global UI

- **Toasts** (`ToastProvider` in `main.tsx`): errors and success in the top-right; replaces inline banners (`PageNotice`) on tabs.
- **Shortcuts**: Ctrl+1–4 for the four tabs.

---

## User flow

```
Settings (folder + .json sources)
        ↓
Discover (Hydra search, includeSteam: false)
        ↓
Downloads (sidecar queue, live progress)
        ↓
Automatic post-download (verify / extract if needed)
        ↓
Library (Install → Play)
```

---

## Library

The library does **not** use a `games` table or a dedicated Redux slice.

### Data sources

| Source | Role |
|--------|------|
| `queue.jobs` (Redux) | Jobs with **completed** download |
| `scan_default_download_path` | Folders on disk |
| `inspect_library_path(s)` | `hasGame`, `needsInstall`, `needsExtraction` |
| `pathStateByKey` (React) | Inspection cache per job/folder |
| `libraryDedupe` | One card per game (equivalent titles) |

### Business rules

| Rule | Implementation |
|------|----------------|
| Only **completed** downloads in the library | `jobBelongsInLibrary` — states `completed`, `seeding`, `extracting`, `extracted`, `skipped` |
| Active downloads stay on **Downloads** | `downloading`, `pending`, `retrying`, `paused` do not enter the library |
| One card per game | `libraryTitlesMatch` + `dedupeLibraryEntries` (e.g. `Stardew` = `Stardew Valley`) |
| Delete always available | Any entry can be removed (job + related folders) |
| On-demand scan | On tab open, after `extract://status` or `library://folder-changed` |

### Title deduplication

`libraryGameKeyCandidates` and `libraryTitlePrefixMatch` in `normalizeTitleKey.ts` handle:

- Repack vs clean name (`Stardew Valley (v1.6.0)` vs `Stardew Valley`)
- Short folder name (`Stardew` vs full title)
- Abbreviations (`SBSP` vs `SpongeBob SquarePants`)

### Deletion

`resolveLibraryDeletePaths` deletes game subfolders without removing the download root. If files are locked (installer open, error 32), the job is removed from the library but a toast asks to close Setup.

---

## Downloads and post-download

### Sidecar

`download-engine` (local HTTP) owns the queue. Rust watches progress and emits `queue://job-progress`.

### Automatic post-download

Watcher in `sidecar/extraction.rs` (~2s cycle):

1. Eligible `completed` / `seeding` job → `process_job_post_download`
2. **Verify** payload (recursive search in subfolders — torrents)
3. If `setup.exe` found → `skipped` (ready to install)
4. If `.zip`/`.7z`/`.rar` archive → `process_job_extraction` (7-Zip)
5. `extract://status` events update Redux

### UI states (Downloads)

| Label | Meaning |
|-------|---------|
| Transferring… | Download in progress |
| Preparing files… | 100% but post-download not finished |
| Extracting files… | 7-Zip extracting |
| Ready to install | Verification done, setup available |
| Completed | Job finished in the queue |

The manual **Extract** button was removed — the process is automatic.

`extractionStatus` on the job (`skipped`, `verified`, `extracted`) avoids getting stuck on “Preparing files…”.

---

## Queue sync

`useQueueSync` — **no constant polling** when there are no active downloads.

| Trigger | Action |
|---------|--------|
| `queue://job-progress` | Live Redux update |
| `extract://status` | Extraction state + library refresh |
| Open Downloads/Library tab | `fetchJobs` |
| **Active** downloads | Silent `fetchJobs` every **4s** (`POLL_ACTIVE_JOBS_MS`) |
| Window focus | Single reconciliation |

Visual progress comes mostly from **events**, not heavy polling.

---

## Frontend — Redux

| Slice | Responsibility |
|-------|----------------|
| `sources` | Hydra sources, sync, import |
| `queue` | Sidecar queue, progress, dismissed jobs |

Selectors in `queueSelectors.ts` (`selectActiveDownloadsCount`, etc.).

---

## Backend — Rust modules

| Module | Responsibility |
|--------|----------------|
| `config` | URLs, trackers, binaries |
| `title` | Normalization (TS ↔ Rust parity) |
| `db` | Pool, migrations, batch queries |
| `sidecar` | HTTP engine, watcher, extraction |
| `sources` | Hydra + hydralinks |
| `catalog` | Search, detail, optional Steam cache |
| `covers` | Local Steam index, precache, batch resolve |
| `library` | Scan, inspect, delete, launch roots, notify |
| `launch` | Detect and spawn `.exe` |
| `archive` | Recursive payload search (torrents) |

---

## Real-time events

| Event | Payload | Emitter | Consumer |
|-------|---------|---------|----------|
| `queue://job-progress` | `JobProgressEvent` | `sidecar/engine.rs` | `queueSlice` |
| `extract://status` | `ExtractStatusEvent` | `extraction.rs` | `queueSlice` + `libraryRefreshBridge` |
| `library://folder-changed` | `()` | `library/watcher.rs` | `LibraryTab` |
| `app://deep-link` | `DeepLinkPayload` | custom protocol | `useDeepLinkNavigation` |

`extract://status` listeners are centralized in `useAppBootstrap`.

---

## Database (SQLite)

**r2d2** pool (`DbPool`), max **6** connections. `init_database_pool` in `lib.rs` setup.

### PRAGMAs

`journal_mode=WAL`, `synchronous=NORMAL`, `cache_size=-64000`, `temp_store=MEMORY`, `mmap_size=256MB`.

### Async rule

Drop the connection (`drop(conn)`) **before** `.await` in commands that hit the network or sidecar.

### Main tables

| Table | Use |
|-------|-----|
| `hydra_source_catalogs` | Imported catalog |
| `hydra_download_sources` | Sources |
| `download_jobs` | Local jobs (legacy/complementary) |
| `extraction_log` | Post-download state per `job_id` |
| `game_covers` | Cover URL and local path |
| `steam_app_index` | AppID ↔ name (local lookup) |
| `steam_game_details` | Cached `appdetails` JSON |
| `catalog_steam_cache` | `storesearch` results (24h) |
| `library_game_roots` | Manual install folder |
| `app_settings` | Persisted configuration |

### Indexes

- `idx_hce_group_key` — Hydra catalog grouping
- `idx_game_covers_updated_at` — covers by recency
- `idx_hce_source_title`, `idx_hce_source_group`
- `idx_steam_app_index_name_norm`

### Batch queries

| Function | Use |
|----------|-----|
| `batch_get_extraction_logs` | `sidecar_list_jobs` — one SELECT for N jobs |
| `batch_lookup_cover_rows` | `resolve_covers_for_titles` — chunks of 120 titles |

---

## Steam and network — avoid unnecessary calls

Strategy: **local first, network later, aggressive cache**.

### Local index (`steam_app_index`)

- Steam appids list in SQLite
- Auto-refresh only if **empty** or **> 7 days** (`maybe_refresh_steam_app_index` on startup)
- Covers resolve via local lookup in most cases

### Discover (search)

```typescript
// useDiscoverCatalog.ts
includeSteam: false
onlyWithSources: true
attachCovers: true
```

Search uses **active sources only** (not disabled in settings) and cached local `.json` files — it does not call `storesearch` on every query. The user confirms the query with **Enter** or Search (`discoverSearchDraft` → `discoverSearch`).

### Steam search cache (`catalog_steam_cache`)

- TTL **24 hours** per normalized query
- Used only when `include_steam: true` (not the current Discover path)

### Game detail (`get_game_detail`)

- Steam `appdetails`: **1 call** per game on first open
- Persisted in `steam_game_details` — not repeated

### Covers (`resolve_covers_for_titles`)

Resolution order:

1. Local file on disk
2. `game_covers` table
3. `steam_app_index` (no API)
4. Network only for missing titles (max 3 in parallel)

Frontend (`useGameCovers`): 120ms debounce, 15–30 min retry, batch lookup.

### What still uses Steam network

| When | What |
|------|------|
| Startup (~1×/7 days) | Refresh appid index |
| First game detail | Synopsis, genres, screenshots |
| Missing cover | CDN `steamstatic.com` (image, not API) |
| Genres in grid | Batch with cache (`resolve_game_genres_batch`) |

---

## Configuration

Keys in `src/shared/config/appSettings.ts`; persistence via `get_app_setting` / `set_app_setting`.

| Key | Use |
|-----|-----|
| `disabled_hydra_source_ids` | JSON `string[]` — disabled source IDs (denylist). Active = not in this list. |
| `default_download_path` | Default download folder |
| `seed_torrents_enabled` | Seed after download |
| `install_organization` | Install folder layout |
| `after_install_action` | Action after install |
| `remove_temp_files` | Remove temporary files |
| `download_speed_limit_bps` | Speed limit |

Source on/off state does **not** live in `hydra_download_sources`: only the denylist above. Bootstrap loads `disabled_hydra_source_ids` immediately on startup (before other deferred settings) so toggles do not overwrite an empty list.

Optional `STEAM_WEB_API_KEY` (or `.env` under `%APPDATA%/.../config/`) for index refresh via Web API.

---

## CSS

Active styles: `src/App.css`, `src/styles/premium-brutal.css`, `src/styles/index.css`.

Toasts: `.app-toast`, `.app-toast--error`, `.app-toast--success`.
