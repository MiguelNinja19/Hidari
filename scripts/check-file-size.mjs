#!/usr/bin/env node
/**
 * Fails if handwritten source files exceed the line budget.
 * Excludes JSON, lockfiles, assets, generated, plans, snapshots.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, relative, extname } from 'node:path'

const ROOT = process.cwd()
const MAX_LINES = 100
const ROOTS = ['src', 'src-tauri/src', 'download-engine/src', 'scripts']
const ALLOW_EXTS = new Set(['.ts', '.tsx', '.rs', '.mjs', '.js', '.css', '.py'])
const SKIP_DIR = new Set([
  'node_modules',
  'target',
  'dist',
  '.git',
  'assets',
  'windows',
])

/**
 * Small justified allowlist only.
 * Prefer splitting over adding entries. Each entry needs a one-line reason.
 */
const ALLOWLIST = new Set([
  // Self: registry of exceptions grows with justified cases.
  'scripts/check-file-size.mjs',
  // Ordered build/precache pipelines — splitting hides sequential steps.
  'scripts/precache_covers.py',
  'scripts/setup-binaries.mjs',
  'scripts/build_nsis_assets.py',
  // Legacy CSS block kept as one visual unit until a dedicated restyle.
  'src/styles/legacy/08-settings.css',
  // Scenario suites keep shared fixtures + assertions together.
  'src-tauri/src/launch/tests/detection.rs',
  'src-tauri/src/launch/tests/resolution.rs',
])

function walk(dir, out = []) {
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    if (SKIP_DIR.has(name)) continue
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

const offenders = []
for (const root of ROOTS) {
  for (const file of walk(join(ROOT, root))) {
    const rel = relative(ROOT, file).replace(/\\/g, '/')
    if (!ALLOW_EXTS.has(extname(file))) continue
    if (ALLOWLIST.has(rel)) continue
    const text = readFileSync(file, 'utf8')
    const normalized = text.replace(/\r\n/g, '\n').replace(/\n$/, '')
    const lines = normalized.length === 0 ? 0 : normalized.split('\n').length
    const is_test_file =
      rel.includes('.test.') ||
      rel.endsWith('tests.rs') ||
      rel.includes('/tests/') ||
      /(?:^|\/)tests_[^/]+\.rs$/.test(rel) ||
      /(?:^|\/)[^/]+_tests\.rs$/.test(rel)
    const budget = is_test_file ? 150 : MAX_LINES
    if (lines > budget) offenders.push({ rel, lines, budget })
  }
}

if (offenders.length) {
  offenders.sort((a, b) => b.lines - a.lines)
  console.error(`check:file-size failed (${offenders.length} files over budget):\n`)
  for (const item of offenders) {
    console.error(`  ${item.lines}/${item.budget}\t${item.rel}`)
  }
  process.exit(1)
}

console.log('check:file-size ok')
