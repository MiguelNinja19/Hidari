# Arquitetura

## Visão geral

```
┌─────────────────────────────────────────────────────────┐
│  React UI (src/App.tsx)                                 │
│  Redux slices (features/*)                              │
└────────────────────┬────────────────────────────────────┘
                     │ invoke / listen
┌────────────────────▼────────────────────────────────────┐
│  API TypeScript (src/shared/api/tauri/*)                │
│  Contratos (src/shared/types/contracts.ts)              │
└────────────────────┬────────────────────────────────────┘
                     │ Tauri IPC
┌────────────────────▼────────────────────────────────────┐
│  Rust backend (src-tauri/src/lib.rs)                    │
│  SQLite (rusqlite) · HTTP (reqwest) · tray · notificações│
└────────────┬───────────────────────┬────────────────────┘
             │                       │
    ┌────────▼────────┐     ┌────────▼────────────┐
    │  Hydra API      │     │  download-engine    │
    │  (fontes HTTP)  │     │  (sidecar, fila)    │
    └─────────────────┘     └─────────────────────┘
```

## Estrutura de pastas

```
launcher-app/
├── docs/                    # Documentação do projeto
├── public/                  # Assets estáticos do Vite
├── scripts/                 # Utilitários Node (ex.: leitura Hydra DB)
├── src/
│   ├── app/                 # Store Redux e hooks tipados
│   ├── features/            # Slices por domínio
│   │   ├── collections/
│   │   ├── downloads/
│   │   ├── library/
│   │   ├── queue/
│   │   └── sources/
│   ├── shared/
│   │   ├── api/tauri/       # Wrappers dos comandos Tauri
│   │   └── types/           # Tipos partilhados frontend/backend
│   ├── App.tsx              # UI principal e navegação
│   └── main.tsx             # Entry point React
└── src-tauri/
    ├── binaries/            # aria2c.exe e README de runtime
    ├── resources/           # Catálogo embutido (embedded_catalog.json)
    ├── src/
    │   ├── lib.rs           # Lógica principal e comandos Tauri
    │   └── main.rs          # Entry point Rust
    ├── download-engine.exe  # Sidecar de downloads (dev/build)
    └── tauri.conf.json      # Configuração Tauri
```

## Frontend

### Estado (Redux)

| Slice         | Responsabilidade                                 |
| ------------- | ------------------------------------------------ |
| `sources`     | Fontes de download Hydra, sincronização e testes |
| `queue`       | Fila de jobs do sidecar (enqueue, pause, resume) |
| `downloads`   | Progresso de downloads (eventos)                 |
| `library`     | Jogos instalados na biblioteca local             |
| `collections` | Coleções de jogos                                |

### Abas da UI

Definidas em `App.tsx`: **Discover**, **Library**, **Downloads**, **Settings**.

### Cliente Tauri

`src/shared/api/tauri/client.ts` centraliza `invoke` e `listen`, com deteção de runtime Tauri. Fora do Tauri, as chamadas falham com erro explícito.

## Backend (Rust)

Toda a lógica nativa vive em `src-tauri/src/lib.rs`:

- **Persistência:** SQLite na pasta de dados da app (`app_data_dir`).
- **Fontes:** integração com API Hydra + scraping local (ex.: FitGirl).
- **Fila:** jobs geridos pelo sidecar `download-engine` via HTTP local.
- **Sistema:** bandeja do sistema (tray), notificações, deep links (`app://deep-link`).

### Sidecar `download-engine`

Processo separado que expõe uma API HTTP numa porta dinâmica. O Rust:

1. Arranca o binário e lê a porta no stdout.
2. Encaminha comandos da UI (`sidecar_*`) para esse serviço.
3. Emite eventos `queue://job-progress` para o frontend.

## Eventos em tempo real

| Evento                 | Payload                     | Uso                                |
| ---------------------- | --------------------------- | ---------------------------------- |
| `download://progress`  | `DownloadProgressEvent`     | Progresso de download mock/legado  |
| `queue://job-progress` | `JobProgressEvent`          | Progresso da fila do sidecar       |
| `extract://status`     | `ExtractStatusEvent`        | Estado da extração automática      |
| `app://deep-link`      | `{ url, gameId?, action? }` | Links profundos / protocolo custom |

## Configuração da app

Chaves de definições guardadas via `get_app_setting` / `set_app_setting` (ex.: pasta de instalação, limites de velocidade, fontes Hydra desativadas). Ver constantes `SETTING_KEY` em `App.tsx`.
