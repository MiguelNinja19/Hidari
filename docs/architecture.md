# Arquitetura

## Visão geral

```
┌─────────────────────────────────────────────────────────┐
│  React UI (features/* pages + hooks)                    │
│  Redux: sources, queue                                  │
└────────────────────┬────────────────────────────────────┘
                     │ invoke / listen
┌────────────────────▼────────────────────────────────────┐
│  API TypeScript (src/shared/api/tauri/*)                │
│  Contratos (src/shared/types/contracts.ts)              │
│  Config (src/shared/config/*)                           │
└────────────────────┬────────────────────────────────────┘
                     │ Tauri IPC
┌────────────────────▼────────────────────────────────────┐
│  Rust backend (src-tauri/src/)                          │
│  lib.rs · launch · archive · config · title · db …      │
│  SQLite (rusqlite) · HTTP (reqwest) · tray               │
└────────────┬───────────────────────┬────────────────────┘
             │                       │
    ┌────────▼────────┐     ┌────────▼────────────┐
    │  Hydra / FitGirl  │     │  download-engine    │
    │  (fontes HTTP)    │     │  (sidecar, fila)    │
    └─────────────────┘     └─────────────────────┘
```

## Estrutura de pastas

```
launcher-app/
├── docs/
├── src/
│   ├── app/                 # Store Redux (sources + queue)
│   ├── features/
│   │   ├── covers/
│   │   ├── discover/
│   │   ├── downloads/       # DownloadsPage (UI)
│   │   ├── library/         # LibraryPage + types + hooks
│   │   ├── queue/
│   │   ├── settings/
│   │   └── sources/
│   ├── layout/              # AppShell, Sidebar
│   ├── shared/
│   │   ├── api/tauri/
│   │   ├── config/          # Constantes (settings, polling, Steam)
│   │   ├── types/
│   │   └── utils/
│   └── App.tsx              # Composição de tabs (a reduzir)
└── src-tauri/src/
    ├── archive.rs
    ├── launch.rs
    ├── config.rs
    ├── title.rs
    ├── db/
    ├── sidecar/
    ├── sources/
    ├── catalog/
    ├── covers/
    ├── library/
    ├── queue/
    └── lib.rs               # Bootstrap + invoke_handler
```

## Modelo da biblioteca (actual)

A biblioteca **não** usa a tabela `games` nem o slice Redux `library` removido.

| Fonte | Papel |
|-------|--------|
| `queue.jobs` | Downloads e estados (pending → extracted) |
| `scan_default_download_path` | Pastas na pasta de downloads |
| `inspect_library_path` | `hasGame`, `needsInstall`, `customGameRoot` |
| `pathStateByKey` (React) | Cache de inspeção por job/pasta |
| `libraryDedupe` | Um cartão por jogo (job + pasta) |

Fluxo: **Explorar** → enqueue → **Downloads** → concluído → **Biblioteca** (Instalar/Jogar).

## Frontend — Redux

| Slice | Responsabilidade |
|-------|------------------|
| `sources` | Fontes Hydra, sync, testes |
| `queue` | Fila sidecar, progresso, jobs dismissed |

## Backend — módulos Rust

| Módulo | Responsabilidade |
|--------|------------------|
| `config` | URLs, trackers, nomes de binários |
| `title` | Normalização de títulos (paridade com TS) |
| `db` | SQLite, migrations |
| `sidecar` | download-engine HTTP |
| `sources` | FitGirl, Hydra |
| `catalog` | Pesquisa discover |
| `covers` | Cache Steam/local |
| `library` | scan, inspect, delete, launch roots |
| `launch` | Deteção e spawn de .exe |

## Eventos em tempo real

| Evento | Uso |
|--------|-----|
| `queue://job-progress` | Progresso da fila |
| `extract://status` | Extração automática |
| `app://deep-link` | Protocolo custom |

## Configuração

Chaves em `src/shared/config/appSettings.ts`; persistência via `get_app_setting` / `set_app_setting`.
