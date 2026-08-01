# 🔨 Build Automático via GitHub Actions

Este projeto tem 2 workflows do GitHub Actions que compilam o Hidari para Windows automaticamente. Você só precisa fazer push do código — o GitHub cuida do build e disponibiliza os instaladores para download.

## 📋 Workflows Disponíveis

### 1. `build-windows.yml` (COMPLETO)
- **Trigger**: push na `main`/`master`, tags `v*`, ou manual
- **O que faz**: baixa aria2c, 7za, e extrai `download-engine.exe` do instalador oficial do Hidari
- **Resultado**: `Hidari-setup.exe` + `Hidari.msi` + Release automática (em tags)
- **Tempo**: ~20-30 minutos
- **Recomendado para**: builds completos com downloads funcionando

### 2. `build-simple.yml` (SIMPLIFICADO)
- **Trigger**: apenas manual (workflow_dispatch)
- **O que faz**: compila o Tauri app sem tentar resolver o `download-engine`
- **Resultado**: `Hidari-setup.exe` + `Hidari.msi` (downloads não funcionarão)
- **Tempo**: ~15-25 minutos
- **Recomendado para**: testar se o build passa, ou se o workflow principal falhar

## 🚀 Como Usar

### Opção A: Build automático a cada push na main

1. Faça push do código para a branch `main` do seu GitHub
2. Vá em **Actions** tab no seu repo
3. Veja o workflow rodando ( leva ~20-30 min )
4. Quando terminar, clique no run concluído
5. Role até **Artifacts** no final da página
6. Baixe `Hidari-setup-exe` e/ou `Hidari-msi`

### Opção B: Release com tag (cria Release no GitHub)

```bash
# Marca uma versão
git tag v1.0.0
git push origin v1.0.0
```

O workflow vai:
1. Compilar tudo
2. Criar uma Release no GitHub automaticamente
3. Anexar `Hidari-setup.exe` e `Hidari.msi` na release
4. Qualquer pessoa pode baixar pela URL pública:
   `https://github.com/MiguelNinja19/Hidari/releases/tag/v1.0.0`

### Opção C: Build manual (sem tag)

1. Vá em **Actions** tab
2. Selecione **Build Hidari (Simple)** ou **Build Hidari (Windows)**
3. Clique em **Run workflow**
4. Escolha as opções (debug mode, etc.)
5. Clique em **Run workflow** (botão verde)
6. Aguarde e baixe os artifacts

## 📦 O que você baixa

| Arquivo | Tamanho | O que é |
|---|---|---|
| `Hidari-setup.exe` | ~25 MB | Instalador NSIS (recomendado) — instala em ~10s |
| `Hidari.msi` | ~30 MB | Instalador MSI — para enterprise/deployment |

## ⚙️ Configuração Técnica

### Runner
- `windows-latest` (Windows Server 2022)
- 4 cores, 16 GB RAM, 14 GB SSD
- Tempo limite: 45 minutos

### Caching
- Cache de Cargo (`~/.cargo/registry`, `~/.cargo/git`, `src-tauri/target`)
- Cache de npm (`node_modules`)
- Reduz tempo de build de ~30 min para ~10 min em builds subsequentes

### Dependências Instaladas
- Rust stable (target: `x86_64-pc-windows-msvc`)
- Node.js 20
- Python 3.11 (para scripts NSIS)
- 7-Zip + NSIS (via Chocolatey)
- aria2c (download direto do GitHub releases)
- 7za.exe + 7za.dll (download do 7-zip.org)

### Download-Engine
O `download-engine.exe` é um sibling repo separado que não é público. O workflow `build-windows.yml` resolve isso extraindo o binário do instalador oficial do Hidari (v1.0.0). Se isso falhar, o build ainda assim completa — mas a funcionalidade de downloads não funcionará até você compilar o `download-engine` manualmente.

## 🐛 Troubleshooting

### "Build failed" — o que fazer?

1. **Abra o run falhou** na aba Actions
2. **Expanda os steps** até encontrar o que falhou (X vermelho)
3. **Leia a mensagem de erro** — geralmente é clara

### Erros comuns

#### `error: failed to run custom build command for tauri-build`
Faltam dependências de sistema. O workflow instala tudo via choco, mas se falhar:
- Verifique se o step "Install NSIS" passou
- Veja se há erros no step "Install 7-Zip + NSIS"

#### `error: patch failed` (no npm install)
Conflito no `package-lock.json`. Tente:
- Deletar `package-lock.json` localmente
- Rodar `npm install`
- Commitar o novo `package-lock.json`
- Push novamente

#### `error: download-engine.exe not found`
O workflow `build-windows.yml` tenta extrair do instalador oficial. Se falhar:
- Use o `build-simple.yml` (cria placeholder vazio)
- Ou compile o download-engine manualmente e commite o binário

#### Build muito lento (> 45 min)
- Cache pode estar falhando. Verifique se o step "Cache Cargo" passou
- TenteCancelar e rodar de novo

### Verificar se funcionou

Depois do build, o log final deve mostrar algo como:
```
Hidari-setup.exe - 24.8 MB
Hidari.msi - 29.5 MB
```

E os artifacts devem aparecer no final do run:
- `Hidari-setup-exe` (~25 MB)
- `Hidari-msi` (~30 MB)

## 💡 Dicas

### Builds mais rápidos
Se você mexer só no frontend (React/TS), pode usar:
```yaml
- name: Build frontend only
  run: npm run build
```
Isso compila só o Vite (~5 seg) sem recompilar o Rust.

### Notificações
No GitHub, vá em **Settings → Notifications → Actions** e ative email para:
- Workflow failures (sempre)
- Workflow successes (opcional)

### Branch protection
Se quiser impedir push direto na main:
1. Settings → Branches → Add rule
2. Marque "Require status checks to pass"
3. Selecione o workflow `Build Hidari (Windows)`
4. Agora todo PR precisa passar no build antes de merge

## 🔗 Links Úteis

- [GitHub Actions docs](https://docs.github.com/en/actions)
- [Tauri build guide](https://v2.tauri.app/distribute/sign/)
- [NSIS docs](https://nsis.sourceforge.io/Docs/)

## 📞 Suporte

Se o build falhar, me chame com:
1. O link do run que falhou (ex: `https://github.com/MiguelNinja19/Hidari/actions/runs/123456`)
2. O step que falhou (ex: "Build Tauri app")
3. A mensagem de erro completa (últimas 30 linhas do log)

Que eu te ajudo a debugar!
