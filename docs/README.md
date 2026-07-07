# Documentação — MyLauncher (Hydrax)

Launcher desktop construído com **Tauri 2**, **React 19**, **TypeScript** e **Redux Toolkit**.

## Índice

| Documento | Conteúdo |
|-----------|----------|
| [Primeiros passos](./getting-started.md) | Pré-requisitos, instalação e comandos para rodar o projeto |
| [Arquitetura](./architecture.md) | Estrutura de pastas, camadas frontend/backend e fluxo de dados |
| [API Tauri](./api.md) | Comandos, eventos e módulos TypeScript que os expõem |
| [Build e release](./build-and-release.md) | `download-engine`, `aria2c`, empacotamento e binários |

## Comandos rápidos

```bash
npm install          # instalar dependências
npm run tauri:dev    # desenvolvimento (app desktop + hot reload)
npm run tauri:build  # build de produção
npm run lint         # ESLint
```

> **Importante:** funcionalidades nativas (arquivos, downloads, diálogos) só funcionam com `npm run tauri:dev` ou o executável compilado — **não** com `npm run dev` sozinho.
