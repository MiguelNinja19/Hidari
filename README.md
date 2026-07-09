# MyLauncher (Hydrax)

Launcher desktop para descoberta, download e gestão de jogos — **Tauri 2** + **React** + **TypeScript** + **SQLite**.

## Início rápido

```bash
npm install
npm run tauri:dev
```

## Documentação

Toda a documentação está unificada em **[`docs/`](./docs/README.md)**:

| Documento | Conteúdo |
|-----------|----------|
| [Índice](./docs/README.md) | Visão geral e links |
| [Primeiros passos](./docs/getting-started.md) | Instalação, fluxo do utilizador |
| [Arquitetura](./docs/architecture.md) | Biblioteca, fila, DB, Steam, eventos |
| [API Tauri](./docs/api.md) | Comandos IPC e eventos |
| [Build e release](./docs/build-and-release.md) | Binários e empacotamento |

## Stack

- **Frontend:** React 19, Vite 8, Redux Toolkit, ToastProvider
- **Backend:** Rust, SQLite (pool r2d2), Tauri 2
- **Downloads:** sidecar `download-engine` + `aria2c`
- **Extração:** 7-Zip automático após download

## Licença

MIT — ver [LICENSE](./LICENSE).
