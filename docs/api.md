# Tauri API

Commands registered in `src-tauri/src/lib.rs` and exposed to the frontend in `src/shared/api/tauri/`.

TypeScript contracts: `src/shared/types/contracts/` (`queue.ts`, `catalog.ts`, `library.ts`, `sources.ts`, …).

<p align="center">
  <img src="./assets/hidari-icon.png" alt="Hidari icon" width="56" />
</p>

---

## System

| Command | TS module | Description |
|---------|-----------|-------------|
| `ping` | — (invoke) | Health check |
| `app_version` | — (invoke) | App version |
| `get_paths` | — (invoke) | Data, config, and cache directories |
| `get_app_setting` | `sourcesApi` | Read setting by key (e.g. `disabled_hydra_source_ids`) |
| `set_app_setting` | `sourcesApi` | Write setting |
| `get_installer_language` | `sourcesApi` | Windows: NSIS installer LCID → app language (`en` / `pt-BR` / `es` / `ru`); otherwise `null` |
| `get_disk_free_bytes_for_path` | `sourcesApi` | Free disk space |
| `open_deep_link` | — | Handle deep-link URL (`hidari://`) |
| `open_local_path` | — | Open folder in Explorer |
| `send_desktop_notification` | `osNotification` / invoke | OS toast (silent; Windows AUMID) |

---

## Sources and catalog

| Command | TS module | Description |
|---------|-----------|-------------|
| `add_download_source` | `sourcesApi` | Add source (local `.json` file or URL) |
| `get_download_sources` | `sourcesApi` | List sources |
| `sync_local_source_catalog` | `sourcesApi` | Sync one source (JSON/API → cache) |
| `sync_all_local_source_catalogs` | `sourcesApi` | Sync all sources |
| `remove_download_source` | `sourcesApi` | Remove source |
| `open_catalogs_cache_folder` | `sourcesApi` | Open AppData catalogs folder |
| `search_download_options` | `sourcesApi` | Download options by query |
| `search_game_catalog` | `sourcesApi` | Catalog search (`only_with_sources`, `include_steam`) |
| `get_game_detail` | `sourcesApi` | Game detail (sources + Steam cache) |
| `resolve_game_genres_batch` | `sourcesApi` | Genres in batch (Steam cache) |
| `check_catalog_changes` | `sourcesApi` | Changes in the embedded catalog |

Disabled sources: ID list in `disabled_hydra_source_ids` (via `get_app_setting` / `set_app_setting`). Search and game detail ignore those sources.

### Paths and library

| Command | TS module | Description |
|---------|-----------|-------------|
| `set_default_download_path` | `sourcesApi` | Default download folder |
| `get_default_download_path` | `sourcesApi` | Get default folder |
| `scan_default_download_path` | `sourcesApi` | List entries in the folder |
| `delete_local_library_item` | `sourcesApi` | Delete folder/file + related torrent sidecars (does not delete download root) |
| `inspect_library_path` | `sourcesApi` | Install/play state for a path (`needsInstall` if setup without game root) |
| `inspect_library_paths` | `sourcesApi` | Batch inspection |
| `set_library_game_root` | `sourcesApi` | Manual install folder (enables **Play** after setup) |
| `set_library_launch_exe` | `sourcesApi` | Cache preferred launch executable |
| `get_library_note` / `set_library_note` | `sourcesApi` | Per-path library note |
| `launch_game_from_path` | `sourcesApi` | Launch game |
| `launch_setup_from_path` | `sourcesApi` | Open installer (`setup.exe`) |
| `extract_library_folder` | `sourcesApi` | Extract archive in a library folder |
| `set_seed_torrents_enabled` | `sourcesApi` | Torrent seed on/off (controls post-download `.torrent` cleanup) |
| `get_seed_torrents_enabled` | `sourcesApi` | Seed state |

---

## Download queue (sidecar)

| Command | TS module | Description |
|---------|-----------|-------------|
| `sidecar_enqueue_job` | `queueApi` | Enqueue download |
| `sidecar_list_jobs` | `queueApi` | List jobs (enriched with `extractionStatus`) |
| `sidecar_pause_job` | `queueApi` | Pause |
| `sidecar_resume_job` | `queueApi` | Resume |
| `sidecar_cancel_job` | `queueApi` | Cancel |
| `sidecar_open_job_folder` | `queueApi` | Open job folder |
| `sidecar_launch_job` | `queueApi` | Launch detected executable |
| `sidecar_status` | `queueApi` | `{ running, port }` |
| `extract_job_archive` | `queueApi` | Manual extract (legacy; UI uses automatic) |
| `remove_job_from_library` | `queueApi` | Remove job from queue and DB |
| `clear_completed_jobs` | `queueApi` | Clear completed/canceled/failed |

---

## Covers

| Command | TS module | Description |
|---------|-----------|-------------|
| `list_game_covers` | `sourcesApi` | Cached covers (no per-entry I/O) |
| `ensure_game_cover_cached` | `sourcesApi` | Ensure local file |
| `save_game_cover` | `sourcesApi` | Store cover URL |
| `resolve_game_cover_url` | `sourcesApi` | Resolve URL for a title |
| `resolve_covers_for_titles` | `sourcesApi` | Batch: DB → local index → network |
| `invalidate_game_cover_local` | `sourcesApi` | Invalidate local cache |
| `get_cover_precache_status` | `sourcesApi` | Precache status |
| `get_cover_cache_stats` | `sourcesApi` | Stats |
| `start_cover_precache` | `sourcesApi` | Background precache |
| `stop_cover_precache` | `sourcesApi` | Stop precache |
| `retry_unresolved_covers` | `sourcesApi` | Retry titles without cover |
| `get_steam_app_index_status` | `sourcesApi` | Local Steam index status |
| `refresh_steam_app_index` | `sourcesApi` | Force index refresh |

---

## Events (`tauriClient` / `listen`)

| Event | Payload | Use |
|-------|---------|-----|
| `queue://job-progress` | `JobProgressEvent` | Queue progress |
| `extract://status` | `ExtractStatusEvent` | Post-download / extraction |
| `library://folder-changed` | `{}` | Download folder changed |
| `app://deep-link` | `DeepLinkPayload` | Custom protocol |

```typescript
import { tauriClient } from '@/shared/api/tauri/client'

const unlisten = await tauriClient.listenJobProgress((event) => {
  console.log(event.jobId, event.progress, event.status)
})

const unlistenExtract = await tauriClient.listenExtractStatus((event) => {
  console.log(event.jobId, event.status, event.message)
})

unlisten()
```

---

## Main types

| Type | File | Description |
|------|------|-------------|
| `DownloadJob` | `queue.ts` | Queue job (`extractionStatus` optional) |
| `JobProgressEvent` | `queue.ts` | Progress event |
| `ExtractStatusEvent` | `queue.ts` | `verified`, `skipped`, `extracting`, `extracted`, `failed` |
| `CatalogGame` | `catalog.ts` | Catalog entry |
| `LibraryPathState` | `library.ts` | `hasGame`, `needsInstall`, `needsExtraction`, `playable`, `customGameRoot` |
| `LocalLibraryItem` | `library.ts` | Folder listed by scan |

`inspect_library_path`: with `setup.exe` and no `customGameRoot`, `needsInstall` is true and `playable` / `hasGame` are false — even if other executables exist in the download folder.

---

## Example — enqueue download

```typescript
import { queueApi } from '@/shared/api/tauri/queueApi'

const job = await queueApi.enqueueJob({
  title: 'Cuphead',
  url: 'magnet:?xt=...',
  destPath: 'D:\\Games\\Downloads',
})
```

---

## Example — Discover search

The frontend sends `includeSteam: false` and `onlyWithSources: true` to search only active sources (local JSON), without the Steam API during search.

```typescript
await sourcesApi.searchGameCatalog({
  query: 'cuphead',
  includeSteam: false,
  onlyWithSources: true,
  attachCovers: true,
  offset: 0,
  limit: 25,
})
```
