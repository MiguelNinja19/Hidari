Place `aria2c.exe` in this folder for Windows release builds.

Recommended path:
- src-tauri/binaries/aria2c.exe

At runtime, the launcher tries these locations automatically:
1) next to `download-engine.exe`
2) `tools/aria2c.exe` next to `download-engine.exe`
3) Tauri resource dir (`aria2c.exe`, `tools/aria2c.exe`, `binaries/aria2c.exe`)
4) system PATH (`aria2c.exe`)

