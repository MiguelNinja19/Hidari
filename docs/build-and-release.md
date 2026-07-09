# Build e release

Ver também [Arquitetura](./architecture.md) (fluxo de downloads e extração) e [API](./api.md).

## Build de produção

```bash
npm run setup:binaries
npm run tauri:build
```

O Tauri:

1. Executa `npm run build` (TypeScript + Vite → `dist/`).
2. Compila o crate Rust em `src-tauri/`.
3. Empacota o instalador/executável conforme `tauri.conf.json`.

Saída típica: `src-tauri/target/release/bundle/`.

## Configuração Tauri

Arquivo: `src-tauri/tauri.conf.json`

| Campo | Valor atual |
|-------|-------------|
| `productName` | MyLauncher |
| `identifier` | com.mylauncher.app |
| `devUrl` | http://localhost:5173 |
| Janela | 1094×816, redimensionável |

## Binários necessários

### `download-engine`

Sidecar responsável pela fila de downloads (HTTP/torrent). O launcher procura `download-engine.exe` nesta ordem aproximada:

1. `src-tauri/download-engine.exe` (incluído no repo para dev)
2. Pastas de build do projeto irmão `../download-engine/target*/release|debug/`
3. Recursos empacotados do Tauri
4. Pasta de dados da aplicação

Para desenvolvimento local, coloque o executável compilado em `src-tauri/download-engine.exe` ou construa o projeto `download-engine` numa pasta adjacente.

### `7za.exe` / `7z.exe`

Usado para extrair arquivos após o download (ZIP, 7Z, RAR). O setup automático coloca em:

```
src-tauri/binaries/7za.exe
src-tauri/binaries/7za.dll
```

Execute `npm run setup:binaries` se esses arquivos não existirem. O launcher também procura `7z` no PATH ou em `Program Files\7-Zip`.

Para release, os binários são incluídos em `bundle.resources` no `tauri.conf.json`.

### `aria2c.exe`

Usado pelo motor de download para transferências. Coloque em:

```
src-tauri/binaries/aria2c.exe
```

Em release, o arquivo é incluído via `bundle.resources` no `tauri.conf.json`.

Em runtime, o launcher também procura:

- Ao lado de `download-engine.exe`
- `tools/aria2c.exe` relativo ao engine
- Recursos Tauri (`aria2c.exe`, `tools/`, `binaries/`)
- `PATH` do sistema

Detalhes em `src-tauri/binaries/README.txt`.

## Recursos embutidos

- `src-tauri/resources/embedded_catalog.json` — catálogo para pesquisa na aba Discover
- Ícones em `src-tauri/icons/`

## Plataformas

O projeto está orientado para **Windows** (`aria2c.exe`, `download-engine.exe`). Outras plataformas exigiriam binários equivalentes e ajustes em `lib.rs` (`cfg!(target_os = "windows")`).

## Licença

MIT — ver `LICENSE` na raiz do repositório.
