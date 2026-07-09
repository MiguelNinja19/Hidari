# Arquitetura

Documento único de referência: estrutura, fluxos de dados, regras de negócio, base de dados e uso da API Steam.

## Visão geral

```
┌─────────────────────────────────────────────────────────┐
│  App.tsx — shell fino (tabs lazy, navegação, providers) │
│  features/* — tab autónoma (Controller + Provider)       │
│  Redux: sources, queue                                 │
│  ToastProvider — erros e sucessos (toast global)       │
└────────────────────┬────────────────────────────────────┘
                     │ invoke / listen
┌────────────────────▼────────────────────────────────────┐
│  API TypeScript (src/shared/api/tauri/*)                │
│  Contratos (src/shared/types/contracts/*)               │
│  Config (src/shared/config/*)                           │
└────────────────────┬────────────────────────────────────┘
                     │ Tauri IPC
┌────────────────────▼────────────────────────────────────┐
│  Rust (src-tauri/src/)                                  │
│  db · sidecar · catalog · covers · library · launch …   │
│  SQLite (pool r2d2) · HTTP (reqwest)                    │
└────────────┬───────────────────────┬────────────────────┘
             │                       │
    ┌────────▼────────┐     ┌────────▼────────────┐
    │  Hydra / JSON   │     │  download-engine    │
    │  (fontes locais)│     │  (sidecar HTTP)     │
    └─────────────────┘     └─────────────────────┘
```

## Estrutura de pastas

```
launcher-app/
├── docs/                    # documentação (este índice)
├── src/
│   ├── app/                 # hooks globais (bootstrap, queue sync, deep links)
│   ├── features/
│   │   ├── discover/        # Explorar
│   │   ├── downloads/       # Downloads
│   │   ├── library/         # Biblioteca
│   │   ├── queue/           # queueSlice + selectors
│   │   ├── settings/
│   │   ├── sources/
│   │   ├── covers/          # CoversProvider
│   │   └── favorites/     # FavoritesProvider (toggle no Explorar; sem tab)
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

## Tabs e padrão Controller

| Tab | Wrapper | Estado |
|-----|---------|--------|
| Explorar | `DiscoverTab` | `DiscoverController` + `useDiscoverControllerState` |
| Biblioteca | `LibraryTab` | `LibraryController` + `useLibraryControllerState` |
| Downloads | `DownloadsTab` | jobs do Redux (props mínimas) |
| Configurações | `SettingsTab` | `AppSettingsContext` + `sources` slice |

`CoversProvider` envolve Explorar, Biblioteca e Downloads.

### UI global

- **Toasts** (`ToastProvider` em `main.tsx`): erros e sucessos no canto superior direito; substitui banners inline (`PageNotice`) nas tabs.
- **Atalhos**: Ctrl+1–4 para as quatro tabs.

---

## Fluxo do utilizador

```
Configurações (pasta + fontes .json)
        ↓
Explorar (pesquisa Hydra, includeSteam: false)
        ↓
Downloads (fila sidecar, progresso em tempo real)
        ↓
Pós-download automático (verificar / extrair se necessário)
        ↓
Biblioteca (Instalar → Jogar)
```

---

## Biblioteca

A biblioteca **não** usa tabela `games` nem slice Redux dedicado.

### Fontes de dados

| Fonte | Papel |
|-------|--------|
| `queue.jobs` (Redux) | Jobs com download **concluído** |
| `scan_default_download_path` | Pastas no disco |
| `inspect_library_path(s)` | `hasGame`, `needsInstall`, `needsExtraction` |
| `pathStateByKey` (React) | Cache de inspeção por job/pasta |
| `libraryDedupe` | Um cartão por jogo (títulos equivalentes) |

### Regras de negócio

| Regra | Implementação |
|-------|----------------|
| Só downloads **concluídos** na biblioteca | `jobBelongsInLibrary` — estados `completed`, `seeding`, `extracting`, `extracted`, `skipped` |
| Downloads activos na tab **Downloads** | `downloading`, `pending`, `retrying`, `paused` não entram na biblioteca |
| Um cartão por jogo | `libraryTitlesMatch` + `dedupeLibraryEntries` (ex.: `Stardew` = `Stardew Valley`) |
| Excluir sempre disponível | Qualquer entrada pode ser removida (job + pastas relacionadas) |
| Scan sob demanda | Ao abrir a tab, após `extract://status` ou `library://folder-changed` |

### Deduplicação de títulos

`libraryGameKeyCandidates` e `libraryTitlePrefixMatch` em `normalizeTitleKey.ts` tratam:

- Repack vs nome limpo (`Stardew Valley (v1.6.0)` vs `Stardew Valley`)
- Pasta abreviada (`Stardew` vs título completo)
- Abreviações (`SBSP` vs `SpongeBob SquarePants`)

### Exclusão

`resolveLibraryDeletePaths` apaga subpastas do jogo sem remover a pasta raiz de downloads. Se ficheiros estão bloqueados (instalador aberto, erro 32), o job é removido da biblioteca mas o toast avisa para fechar o Setup.

---

## Downloads e pós-download

### Sidecar

O `download-engine` (HTTP local) gere a fila. O Rust observa progresso e emite `queue://job-progress`.

### Pós-download automático

Watcher em `sidecar/extraction.rs` (ciclo ~2s):

1. Job `completed` / `seeding` elegível → `process_job_post_download`
2. **Verificar** payload (busca recursiva em subpastas — torrents)
3. Se `setup.exe` encontrado → `skipped` (pronto para instalar)
4. Se arquivo `.zip`/`.7z`/`.rar` → `process_job_extraction` (7-Zip)
5. Eventos `extract://status` actualizam Redux

### Estados na UI (Downloads)

| Texto | Significado |
|-------|-------------|
| Transferindo… | Download em curso |
| Preparando arquivos… | 100% mas pós-download ainda não terminou |
| Extraindo arquivos… | 7-Zip a extrair |
| Pronto para instalar | Verificação concluída, setup disponível |
| Concluído | Job finalizado na fila |

O botão **Extrair** manual foi removido — o processo é automático.

`extractionStatus` no job (`skipped`, `verified`, `extracted`) evita ficar preso em "Preparando arquivos…".

---

## Sincronização da fila

`useQueueSync` — **sem polling constante** quando não há downloads activos.

| Gatilho | Acção |
|---------|--------|
| `queue://job-progress` | Actualização em tempo real no Redux |
| `extract://status` | Estado de extração + refresh biblioteca |
| Abrir tab Downloads/Biblioteca | `fetchJobs` |
| Downloads **activos** | `fetchJobs` silencioso a cada **4s** (`POLL_ACTIVE_JOBS_MS`) |
| Foco da janela | Reconciliação única |

Progresso visual vem sobretudo dos **eventos**, não de polling pesado.

---

## Frontend — Redux

| Slice | Responsabilidade |
|-------|------------------|
| `sources` | Fontes Hydra, sync, import |
| `queue` | Fila sidecar, progresso, jobs dismissed |

Selectors em `queueSelectors.ts` (`selectActiveDownloadsCount`, etc.).

---

## Backend — módulos Rust

| Módulo | Responsabilidade |
|--------|------------------|
| `config` | URLs, trackers, binários |
| `title` | Normalização (paridade TS ↔ Rust) |
| `db` | Pool, migrations, batch queries |
| `sidecar` | Engine HTTP, watcher, extração |
| `sources` | Hydra + hydralinks |
| `catalog` | Pesquisa, detalhe, cache Steam opcional |
| `covers` | Índice Steam local, precache, batch resolve |
| `library` | Scan, inspect, delete, launch roots, notify |
| `launch` | Detecção e spawn de `.exe` |
| `archive` | Busca recursiva de payloads (torrents) |

---

## Eventos em tempo real

| Evento | Payload | Emissor | Consumidor |
|--------|---------|---------|------------|
| `queue://job-progress` | `JobProgressEvent` | `sidecar/engine.rs` | `queueSlice` |
| `extract://status` | `ExtractStatusEvent` | `extraction.rs` | `queueSlice` + `libraryRefreshBridge` |
| `library://folder-changed` | `()` | `library/watcher.rs` | `LibraryTab` |
| `app://deep-link` | `DeepLinkPayload` | protocolo custom | `useDeepLinkNavigation` |

Listeners de `extract://status` centralizados em `useAppBootstrap`.

---

## Base de dados (SQLite)

Pool **r2d2** (`DbPool`), máx. **6** conexões. `init_database_pool` no setup de `lib.rs`.

### PRAGMAs

`journal_mode=WAL`, `synchronous=NORMAL`, `cache_size=-64000`, `temp_store=MEMORY`, `mmap_size=256MB`.

### Regra async

Libertar conexão (`drop(conn)`) **antes** de `.await` em comandos com rede ou sidecar.

### Tabelas principais

| Tabela | Uso |
|--------|-----|
| `hydra_source_catalogs` | Catálogo importado |
| `hydra_download_sources` | Fontes activas |
| `download_jobs` | Jobs locais (legado/complementar) |
| `extraction_log` | Estado pós-download por `job_id` |
| `game_covers` | URL e path local de capas |
| `steam_app_index` | AppID ↔ nome (lookup local) |
| `steam_game_details` | Cache JSON de `appdetails` |
| `catalog_steam_cache` | Resultados `storesearch` (24h) |
| `library_game_roots` | Pasta manual de instalação |
| `app_settings` | Configuração persistida |

### Índices

- `idx_hce_group_key` — agrupamento catálogo Hydra
- `idx_game_covers_updated_at` — capas por recência
- `idx_hce_source_title`, `idx_hce_source_group`
- `idx_steam_app_index_name_norm`

### Queries em batch

| Função | Uso |
|--------|-----|
| `batch_get_extraction_logs` | `sidecar_list_jobs` — um SELECT para N jobs |
| `batch_lookup_cover_rows` | `resolve_covers_for_titles` — chunks de 120 títulos |

---

## Steam e rede — evitar chamadas desnecessárias

Estratégia: **local primeiro, rede depois, cache agressivo**.

### Índice local (`steam_app_index`)

- Lista de appids Steam no SQLite
- Refresh automático só se **vazio** ou **> 7 dias** (`maybe_refresh_steam_app_index` no arranque)
- Capas resolvem por lookup local na maioria dos casos

### Explorar (pesquisa)

```typescript
// useDiscoverCatalog.ts
includeSteam: false
attachCovers: false
```

A pesquisa usa **apenas fontes Hydra** — não chama `storesearch` em cada busca.

### Cache de pesquisa Steam (`catalog_steam_cache`)

- TTL **24 horas** por query normalizada
- Usado só quando `include_steam: true` (não é o caso do Explorar actual)

### Detalhe do jogo (`get_game_detail`)

- `appdetails` Steam: **1 chamada** por jogo na primeira abertura
- Persistido em `steam_game_details` — não repete

### Capas (`resolve_covers_for_titles`)

Ordem de resolução:

1. Ficheiro local em disco
2. Tabela `game_covers`
3. Índice `steam_app_index` (sem API)
4. Rede só para títulos em falta (máx. 3 em paralelo)

Frontend (`useGameCovers`): debounce 120ms, retry 15–30 min, batch lookup.

### O que ainda usa rede Steam

| Quando | O quê |
|--------|--------|
| Arranque (~1×/7 dias) | Atualizar índice de appids |
| Primeira ficha do jogo | Sinopse, géneros, screenshots |
| Capa em falta | CDN `steamstatic.com` (imagem, não API) |
| Géneros no grid | Batch com cache (`resolve_game_genres_batch`) |

---

## Configuração

Chaves em `src/shared/config/appSettings.ts`; persistência via `get_app_setting` / `set_app_setting`.

Variável opcional `STEAM_WEB_API_KEY` (ou `.env` em `%APPDATA%/.../config/`) para refresh do índice via Web API.

---

## CSS

Estilos activos: `src/App.css`, `src/styles/premium-brutal.css`, `src/styles/index.css`.

Toasts: classes `.app-toast`, `.app-toast--error`, `.app-toast--success`.
