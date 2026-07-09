# API Tauri

Comandos registados em `src-tauri/src/lib.rs` e expostos ao frontend em `src/shared/api/tauri/`.

Contratos TypeScript: `src/shared/types/contracts/` (`queue.ts`, `catalog.ts`, `library.ts`, `sources.ts`, …).

---

## Sistema

| Comando | Módulo TS | Descrição |
|---------|-----------|-----------|
| `ping` | `appApi` | Health check |
| `app_version` | `appApi` | Versão da aplicação |
| `get_paths` | `appApi` | Diretórios de dados, config e cache |
| `get_app_setting` | `sourcesApi` | Lê definição por chave |
| `set_app_setting` | `sourcesApi` | Grava definição |
| `get_disk_free_bytes_for_path` | `sourcesApi` | Espaço livre em disco |
| `open_deep_link` | — | Processa URL de deep link |
| `open_local_path` | — | Abre pasta no Explorer |

---

## Fontes e catálogo

| Comando | Módulo TS | Descrição |
|---------|-----------|-----------|
| `add_download_source` | `sourcesApi` | Adiciona fonte Hydra (ficheiro `.json`) |
| `get_download_sources` | `sourcesApi` | Lista fontes |
| `sync_download_sources` | `sourcesApi` | Sincroniza com API Hydra |
| `remove_download_source` | `sourcesApi` | Remove fonte |
| `test_download_source` | `sourcesApi` | Testa conectividade |
| `check_download_sources_changes` | `sourcesApi` | Novidades no catálogo |
| `search_download_options` | `sourcesApi` | Opções de download por query |
| `search_game_catalog` | `sourcesApi` | Pesquisa no catálogo (`only_with_sources`, `include_steam`) |
| `get_game_detail` | `sourcesApi` | Ficha do jogo (Hydra + cache Steam) |
| `resolve_game_genres_batch` | `sourcesApi` | Géneros em batch (cache Steam) |
| `check_catalog_changes` | `sourcesApi` | Alterações no catálogo embutido |

### Caminhos e biblioteca

| Comando | Módulo TS | Descrição |
|---------|-----------|-----------|
| `set_default_download_path` | `sourcesApi` | Pasta padrão de downloads |
| `get_default_download_path` | `sourcesApi` | Obtém pasta padrão |
| `scan_default_download_path` | `sourcesApi` | Lista entradas na pasta |
| `delete_local_library_item` | `sourcesApi` | Apaga pasta/ficheiro (não apaga raiz de downloads) |
| `inspect_library_path` | `sourcesApi` | Estado install/play de um caminho |
| `inspect_library_paths` | `sourcesApi` | Inspecção em batch |
| `set_library_game_root` | `sourcesApi` | Pasta de instalação manual |
| `launch_game_from_path` | `sourcesApi` | Inicia jogo |
| `launch_setup_from_path` | `sourcesApi` | Abre instalador (`setup.exe`) |
| `extract_library_folder` | `sourcesApi` | Extrai arquivo numa pasta da biblioteca |
| `set_seed_torrents_enabled` | `sourcesApi` | Seed de torrents on/off |
| `get_seed_torrents_enabled` | `sourcesApi` | Estado do seed |

---

## Fila de downloads (sidecar)

| Comando | Módulo TS | Descrição |
|---------|-----------|-----------|
| `sidecar_enqueue_job` | `queueApi` | Enfileira download |
| `sidecar_list_jobs` | `queueApi` | Lista jobs (enriquecidos com `extractionStatus`) |
| `sidecar_pause_job` | `queueApi` | Pausa |
| `sidecar_resume_job` | `queueApi` | Retoma |
| `sidecar_cancel_job` | `queueApi` | Cancela |
| `sidecar_open_job_folder` | `queueApi` | Abre pasta do job |
| `sidecar_launch_job` | `queueApi` | Lança executável detectado |
| `sidecar_status` | `queueApi` | `{ running, port }` |
| `extract_job_archive` | `queueApi` | Extração manual (legado; UI usa automático) |
| `remove_job_from_library` | `queueApi` | Remove job da fila e BD |
| `clear_completed_jobs` | `queueApi` | Limpa concluídos/cancelados/falhados |

---

## Capas

| Comando | Módulo TS | Descrição |
|---------|-----------|-----------|
| `list_game_covers` | `sourcesApi` | Capas em cache (sem I/O por entrada) |
| `ensure_game_cover_cached` | `sourcesApi` | Garante ficheiro local |
| `save_game_cover` | `sourcesApi` | Grava URL da capa |
| `resolve_game_cover_url` | `sourcesApi` | Resolve URL para um título |
| `resolve_covers_for_titles` | `sourcesApi` | Batch: DB → índice local → rede |
| `invalidate_game_cover_local` | `sourcesApi` | Invalida cache local |
| `get_cover_precache_status` | `sourcesApi` | Estado do pré-cache |
| `get_cover_cache_stats` | `sourcesApi` | Estatísticas |
| `start_cover_precache` | `sourcesApi` | Pré-cache em background |
| `stop_cover_precache` | `sourcesApi` | Para pré-cache |
| `retry_unresolved_covers` | `sourcesApi` | Re-tenta títulos sem capa |
| `get_steam_app_index_status` | `sourcesApi` | Estado do índice Steam local |
| `refresh_steam_app_index` | `sourcesApi` | Força atualização do índice |

---

## Eventos (`tauriClient` / `listen`)

| Evento | Payload | Uso |
|--------|---------|-----|
| `queue://job-progress` | `JobProgressEvent` | Progresso da fila |
| `extract://status` | `ExtractStatusEvent` | Pós-download / extração |
| `library://folder-changed` | `{}` | Pasta de downloads alterada |
| `app://deep-link` | `DeepLinkPayload` | Protocolo custom |

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

## Tipos principais

| Tipo | Ficheiro | Descrição |
|------|----------|-----------|
| `DownloadJob` | `queue.ts` | Job da fila (`extractionStatus` opcional) |
| `JobProgressEvent` | `queue.ts` | Evento de progresso |
| `ExtractStatusEvent` | `queue.ts` | `verified`, `skipped`, `extracting`, `extracted`, `failed` |
| `CatalogGame` | `catalog.ts` | Entrada do catálogo |
| `LibraryPathState` | `library.ts` | `hasGame`, `needsInstall`, `needsExtraction` |
| `LocalLibraryItem` | `library.ts` | Pasta listada no scan |

---

## Exemplo — enfileirar download

```typescript
import { queueApi } from '@/shared/api/tauri/queueApi'

const job = await queueApi.enqueueJob({
  title: 'Cuphead',
  url: 'magnet:?xt=...',
  destPath: 'D:\\Games\\Downloads',
})
```

---

## Exemplo — pesquisa no Explorar

O frontend envia `includeSteam: false` e `onlyWithSources: true` para evitar chamadas à API Steam durante a pesquisa.

```typescript
await sourcesApi.searchGameCatalog({
  query: 'cuphead',
  includeSteam: false,
  onlyWithSources: true,
  attachCovers: false,
  offset: 0,
  limit: 24,
})
```
