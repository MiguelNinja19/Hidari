# Architecture map

Target: handwritten modules ≤100 lines, one responsibility per file.
Gate: `npm run check:file-size` (small allowlist only).

## Layers

```
UI (pages/components)
  → hooks / controllers (one use-case each)
    → shared/api/tauri
    → Tauri commands (thin)
    → domain services
    → db / filesystem
```

## Frontend

| Area | Layout |
|------|--------|
| `library/` | page shell + tile actions + hooks (`useLibraryInstall`, delete, scan, …) |
| `discover/` | catalog search, detail sections, virtualized grid |
| `covers/` | indexing, warm queue, resolve hooks |
| `queue/` | types, thunks, handlers |
| `favorites/` | provider + key helpers |
| `styles/` | `tokens/` + `components/` + `features/*` via `@import` |

## Backend (`src-tauri/src`)

| Area | Layout |
|------|--------|
| `favorites/` | key, store, migrate, commands, repair |
| `launch/` | content, playable, score, spawn, tests |
| `library/` | inspect, extract, uninstall, scan, delete, … |
| `sources/hydralinks/` | parse, sync, search, db, cache |
| `sources/hydra/` | Hydra API client pieces |
| `catalog/` | search, game_detail, steam_details |
| `covers/` | resolve, precache, steam_index |
| `sidecar/` | engine, extraction, commands, failover |
| `db/` | pool, settings, migrations (+ favorite migrate on boot) |
| `dto/` | DTO groups |
| `queue/persist/` | schema, write, restore |
| `app/` | setup, lifecycle, `invoke_handler` macro |

## Size policy

- Handwritten `.ts` / `.tsx` / `.rs` / `.css` / scripts ≤100 lines
- Tests ≤150 when under `.test.` / `tests.rs` / `/tests/`
- Allowlist only for cohesive pipelines, legacy CSS, scenario suites, and the Tauri handler macro
