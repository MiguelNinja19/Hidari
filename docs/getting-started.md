# Primeiros passos

## Pré-requisitos

| Ferramenta | Versão | Notas |
|------------|--------|-------|
| [Node.js](https://nodejs.org/) | 18+ | Frontend (Vite) e CLI Tauri |
| [Rust](https://www.rust-lang.org/tools/install) | 1.77+ | Backend em `src-tauri/` |
| Windows SDK | — | Obrigatório no Windows |

Ver também [pré-requisitos Tauri v2](https://v2.tauri.app/start/prerequisites/).

## Instalação

```bash
npm install
```

O `postinstall` executa `npm run setup:binaries`:

- **7-Zip** (`7za.exe`, `7za.dll`) — extração automática
- **aria2c.exe** e **download-engine.exe** → `src-tauri/binaries/`

Na primeira execução, o Rust compila dependências (pode demorar alguns minutos).

## Comandos

| Comando | Descrição |
|---------|-----------|
| `npm run tauri:dev` | **Recomendado** — app desktop + hot reload |
| `npm run dev` | Só browser — **sem** APIs Tauri |
| `npm run tauri:build` | Instalador / executável de produção |
| `npm run build` | Só frontend → `dist/` |
| `npm run test` | Vitest |
| `npm run lint` | ESLint |
| `npm run setup:binaries` | Re-download de binários nativos |

## Fluxo do utilizador

1. **Configurações** — pasta de downloads + importar fonte `.json` (Hydra)
2. **Explorar** — pesquisar jogo → escolher versão/torrent → enfileirar
3. **Downloads** — acompanhar progresso; pós-download é **automático**
4. **Biblioteca** — **Instalar** (setup) → **Jogar**

### O que esperar em cada fase

| Fase | Onde | O que vês |
|------|------|-----------|
| A transferir | Downloads | Barra de progresso, velocidade |
| A 100% | Downloads | "Preparando arquivos…" (segundos) |
| Pronto | Downloads / Biblioteca | "Pronto para instalar" ou botão **Instalar** |
| Instalado | Biblioteca | **Jogar** |

Erros aparecem como **toast** no canto superior direito (não bloqueiam a página).

## Desenvolvimento

1. `npm run tauri:dev`
2. Vite em `http://localhost:5173` (`tauri.conf.json`)
3. Janela **MyLauncher** (1094×816 px)

### Erro "Tauri indisponível"

Estás a correr só `npm run dev`. Usa `npm run tauri:dev`.

### Extração falha (`7z_not_found`)

```bash
npm run setup:binaries
```

### Download-engine em falta

Ver [Build e release](./build-and-release.md) — colocar `download-engine.exe` em `src-tauri/`.

## Script auxiliar

`scripts/read-hydra-sources.mjs` — exporta fontes da LevelDB do Hydra Launcher:

```bash
node scripts/read-hydra-sources.mjs [caminho-hydra-db] [pasta-snapshot]
```

Por defeito: `%APPDATA%\hydralauncher\hydra-db`.

## Próximos passos

- [Arquitetura](./architecture.md) — biblioteca, fila, DB, Steam
- [API Tauri](./api.md) — comandos e eventos
- [Build e release](./build-and-release.md) — produção
