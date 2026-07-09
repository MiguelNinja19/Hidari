# Documentação — MyLauncher (Hydrax)

Launcher desktop: **Tauri 2** · **React 19** · **TypeScript** · **Redux Toolkit** · **SQLite**.

## Índice

| Documento | Conteúdo |
|-----------|----------|
| [Primeiros passos](./getting-started.md) | Instalação, comandos, fluxo do utilizador |
| [Arquitetura](./architecture.md) | Camadas, biblioteca, fila, DB, Steam, eventos |
| [API Tauri](./api.md) | Comandos IPC, eventos, módulos TypeScript |
| [Build e release](./build-and-release.md) | Binários, empacotamento, recursos |

## Visão rápida

```
Explorar → Downloads → Biblioteca → Jogar
     ↑         │            │
     └─ fontes Hydra    sidecar + SQLite
```

| Tab | Função |
|-----|--------|
| **Explorar** | Pesquisa no catálogo Hydra local; favoritos no cartão |
| **Downloads** | Fila ativa (transferência, pós-download automático) |
| **Biblioteca** | Jogos prontos para instalar/jogar (deduplicados) |
| **Configurações** | Pasta de downloads, fontes, velocidade, seed |

## Comandos essenciais

```bash
npm install          # dependências + setup:binaries (7-Zip, aria2c, engine)
npm run tauri:dev    # desenvolvimento (app desktop + hot reload)
npm run tauri:build  # build de produção
npm run test         # Vitest
npm run lint         # ESLint
```

> Funcionalidades nativas (ficheiros, downloads, diálogos) **só** funcionam com `npm run tauri:dev` ou o executável compilado — **não** com `npm run dev` sozinho.

## Onde está o quê

| Precisas de… | Vai a… |
|--------------|--------|
| Correr o projeto | [getting-started.md](./getting-started.md) |
| Entender biblioteca / fila / cache | [architecture.md](./architecture.md) |
| Invocar um comando Rust | [api.md](./api.md) |
| Compilar release / binários | [build-and-release.md](./build-and-release.md) |
| Contratos TS | `src/shared/types/contracts/` |
| Settings persistidos | `src/shared/config/appSettings.ts` |
