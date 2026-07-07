# MyLauncher (Hydrax)

Launcher desktop para descoberta, download e gestão de jogos — **Tauri 2** + **React** + **TypeScript**.

## Início rápido

```bash
npm install
npm run tauri:dev
```

O `npm install` executa automaticamente `setup:binaries`, que baixa o **7-Zip** (7za) e sincroniza `aria2c` e `download-engine` para `src-tauri/binaries/`.

Se a extração falhar com `7z_not_found`, execute manualmente:

```bash
npm run setup:binaries
```

## Documentação

Toda a documentação do projeto está em **[`docs/`](./docs/README.md)**:

- [Primeiros passos](./docs/getting-started.md) — instalação e comandos
- [Arquitetura](./docs/architecture.md) — estrutura e fluxo de dados
- [API Tauri](./docs/api.md) — comandos e eventos
- [Build e release](./docs/build-and-release.md) — binários e empacotamento

## Scripts

| Comando | Descrição |
|---------|-----------|
| `npm run setup:binaries` | Baixa 7-Zip e sincroniza binários nativos |
| `npm run tauri:dev` | Desenvolvimento (app desktop) |
| `npm run tauri:build` | Build de produção |
| `npm run dev` | Só frontend (sem APIs nativas) |
| `npm run lint` | ESLint |
| `npm run test` | Testes Vitest |

## Fluxo completo

1. **Configurações** — defina a pasta de download e importe fontes de catálogo (`.json` Hydra)
2. **Explorar** — pesquise um jogo e escolha um torrent
3. **Downloads** — acompanhe o progresso; ao concluir, a extração inicia automaticamente
4. **Biblioteca** — quando o status for *Pronto para jogar*, clique em **JOGAR**

## Stack

- Frontend: React 19, Vite 8, Redux Toolkit
- Backend: Rust, SQLite (rusqlite), Tauri plugins (dialog, notification, log)
- Downloads: sidecar `download-engine` + `aria2c`
- Extração: 7-Zip (`7za.exe`) incluído via setup
