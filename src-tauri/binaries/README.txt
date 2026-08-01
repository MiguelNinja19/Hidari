Binários do Hidari (Linux / macOS)

- download-engine — sidecar da fila (compile: npm run build:download-engine)
- aria2c — no PATH (apt install aria2 / brew install aria2) ou em binaries/
- 7zz / 7z — no PATH (apt install p7zip-full / brew install sevenzip) ou em binaries/

O fluxo de downloads (HTTP → download-engine → aria2 → extract) é o mesmo que no Windows;
só muda a resolução dos binários nativos.
