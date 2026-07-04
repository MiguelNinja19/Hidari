# Primeiros passos

## Pré-requisitos

| Ferramenta | Versão mínima | Notas |
|------------|---------------|-------|
| [Node.js](https://nodejs.org/) | 18+ | Usado pelo frontend (Vite) e CLI do Tauri |
| [Rust](https://www.rust-lang.org/tools/install) | 1.77+ | Backend nativo em `src-tauri/` |
| Windows SDK | — | Necessário no Windows para compilar o Tauri |

No Windows, instale também as dependências indicadas na [documentação oficial do Tauri](https://v2.tauri.app/start/prerequisites/).

## Instalação

Na raiz do repositório:

```bash
npm install
```

O script `postinstall` (`npm run setup:binaries`) baixa automaticamente o **7-Zip** (7za.exe + 7za.dll) e copia `aria2c.exe` e `download-engine.exe` para `src-tauri/binaries/`. Sem isto, downloads podem funcionar mas a **extração automática** falha.

Na primeira execução, o Tauri pode compilar dependências Rust — isso demora alguns minutos.

## Comandos

| Comando | Descrição |
|---------|-----------|
| `npm run tauri:dev` | **Recomendado.** Abre a janela desktop com hot reload do React |
| `npm run dev` | Só o frontend no browser (`http://localhost:5173`) — APIs Tauri indisponíveis |
| `npm run tauri:build` | Gera o instalador/executável de produção |
| `npm run build` | Compila apenas o frontend para `dist/` |
| `npm run lint` | Verifica o código com ESLint |
| `npm run test` | Testes unitários (Vitest) |
| `npm run setup:binaries` | Baixa 7-Zip e sincroniza binários nativos |
| `npm run preview` | Pré-visualiza o build estático do Vite |

## Desenvolvimento

1. Execute `npm run tauri:dev`.
2. O Vite sobe em `http://localhost:5173` (configurado em `src-tauri/tauri.conf.json`).
3. O Tauri abre a janela **MyLauncher** (1094×816 px por defeito).

### Erro "Tauri indisponível"

Se vir mensagens como *"execute com npm run tauri:dev"*, está a correr só o Vite. Feche e use `npm run tauri:dev`.

### Downloads

A fila de downloads depende do binário `download-engine.exe` (sidecar). Em desenvolvimento, o launcher procura o executável em `src-tauri/download-engine.exe` ou em pastas irmãs do projeto `download-engine`. Ver [Build e release](./build-and-release.md).

## Script auxiliar

`scripts/read-hydra-sources.mjs` lê fontes de download da base LevelDB do Hydra Launcher (Windows):

```bash
node scripts/read-hydra-sources.mjs [caminho-hydra-db] [pasta-snapshot]
```

Por defeito usa `%APPDATA%\hydralauncher\hydra-db`.
