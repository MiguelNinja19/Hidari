# API Tauri

Comandos registrados em `src-tauri/src/lib.rs` e expostos ao frontend pelos módulos em `src/shared/api/tauri/`.

## Sistema

| Comando | Módulo TS | Descrição |
|---------|-----------|-----------|
| `ping` | `appApi` | Health check |
| `app_version` | `appApi` | Versão da aplicação |
| `get_paths` | `appApi` | Diretórios de dados, config e cache |
| `get_app_setting` | `sourcesApi` | Lê definição por chave |
| `set_app_setting` | `sourcesApi` | Grava definição |
| `get_disk_free_bytes_for_path` | `sourcesApi` | Espaço livre em disco |
| `open_deep_link` | — | Abre/processa URL de deep link |

## Fontes e catálogo

| Comando | Módulo TS | Descrição |
|---------|-----------|-----------|
| `add_download_source` | `sourcesApi` | Adiciona fonte Hydra por URL |
| `get_download_sources` | `sourcesApi` | Lista fontes locais |
| `sync_download_sources` | `sourcesApi` | Sincroniza com API Hydra |
| `remove_download_source` | `sourcesApi` | Remove fonte |
| `test_download_source` | `sourcesApi` | Testa conectividade |
| `check_download_sources_changes` | `sourcesApi` | Verifica novas opções por jogo |
| `search_download_options` | `sourcesApi` | Pesquisa opções por query |
| `search_game_catalog` | `sourcesApi` | Pesquisa no catálogo importado |

### Caminhos e biblioteca local

| Comando | Módulo TS | Descrição |
|---------|-----------|-----------|
| `set_default_download_path` | `sourcesApi` | Pasta padrão de downloads |
| `get_default_download_path` | `sourcesApi` | Obtém pasta padrão |
| `scan_default_download_path` | `sourcesApi` | Lista arquivos na pasta |
| `delete_local_library_item` | `sourcesApi` | Apaga item da pasta |
| `remove_job_from_library` | `queueApi` | Remove job da fila e BD |
| `inspect_library_path` | `sourcesApi` | Estado install/play da pasta |
| `set_library_game_root` | `sourcesApi` | Pasta de instalação manual |
| `launch_game_from_path` | `sourcesApi` | Inicia jogo |
| `launch_setup_from_path` | `sourcesApi` | Abre instalador |
| `set_seed_torrents_enabled` | `sourcesApi` | Ativa/desativa seed de torrents |
| `get_seed_torrents_enabled` | `sourcesApi` | Estado do seed |

## Fila de downloads (sidecar)

Preferir estes comandos em vez dos `enqueue_job` / `list_jobs` legados internos.

| Comando | Módulo TS | Descrição |
|---------|-----------|-----------|
| `sidecar_enqueue_job` | `queueApi` | Enfileira download |
| `sidecar_list_jobs` | `queueApi` | Lista jobs |
| `sidecar_pause_job` | `queueApi` | Pausa job |
| `sidecar_resume_job` | `queueApi` | Retoma job |
| `sidecar_cancel_job` | `queueApi` | Cancela job |
| `sidecar_open_job_folder` | `queueApi` | Abre pasta do job |
| `sidecar_launch_job` | `queueApi` | Lança executável do jogo |
| `sidecar_status` | `queueApi` | Estado do sidecar (`running`, `port`) |
| `extract_job_archive` | `queueApi` | Extração manual de um job |

### Fila legada (SQLite interno)

| Comando | Descrição |
|---------|-----------|
| `enqueue_job` | Enfileira no gestor interno |
| `list_jobs` | Lista jobs internos |
| `pause_job` / `resume_job` / `cancel_job` | Controlo de job |
| `clear_completed_jobs` | Remove concluídos/cancelados/falhados do sidecar e da base local; devolve IDs removidos |

## Capas (Steam)

| Comando | Módulo TS | Descrição |
|---------|-----------|-----------|
| `list_game_covers` | `sourcesApi` | Lista capas em cache |
| `ensure_game_cover_cached` | `sourcesApi` | Garante ficheiro local da capa |
| `save_game_cover` | `sourcesApi` | Grava URL da capa |
| `resolve_game_cover_url` | `sourcesApi` | Resolve URL para um título |
| `resolve_covers_for_titles` | `sourcesApi` | Resolve capas em batch |
| `invalidate_game_cover_local` | `sourcesApi` | Invalida cache local |
| `get_cover_precache_status` | `sourcesApi` | Estado do pré-cache |
| `get_cover_cache_stats` | `sourcesApi` | Estatísticas de cache |
| `start_cover_precache` | `sourcesApi` | Inicia pré-cache em background |
| `stop_cover_precache` | `sourcesApi` | Para pré-cache |
| `retry_unresolved_covers` | `sourcesApi` | Tenta novamente títulos sem capa |
| `get_steam_app_index_status` | `sourcesApi` | Estado do índice Steam local |
| `refresh_steam_app_index` | `sourcesApi` | Atualiza índice de appids Steam |

## Tipos TypeScript

Contratos partilhados em `src/shared/types/contracts.ts`:

- `Source`, `DownloadOption`, `CatalogGame`
- `Game`, `Collection`, `LocalLibraryItem`
- `DownloadJob`, `EnqueueJobInput`, `JobProgressEvent`
- `AppPaths`, `DownloadProgressEvent`

## Exemplo de chamada

```typescript
import { queueApi } from './shared/api/tauri/queueApi'

const job = await queueApi.enqueueJob({
  title: 'Meu Jogo',
  url: 'magnet:?xt=...',
  destPath: 'D:\\Games',
})
```

## Eventos (listen)

```typescript
import { tauriClient } from './shared/api/tauri/client'

const unlisten = await tauriClient.listenJobProgress((event) => {
  console.log(event.jobId, event.progress, event.status)
})

// cleanup
unlisten()
```
