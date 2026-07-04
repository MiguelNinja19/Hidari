const ARCHIVE_EXTENSIONS = new Set(['zip', '7z', 'rar', '001', 'tar', 'gz', 'bz2', 'xz'])

export function isArchiveFile(path: string): boolean {
  const base = path.split(/[/\\]/).pop() ?? path
  const dot = base.lastIndexOf('.')
  if (dot < 0) return false
  const ext = base.slice(dot + 1).toLowerCase()
  return ARCHIVE_EXTENSIONS.has(ext)
}

export function resolveDeletePath(destPath: string): string {
  if (!destPath) return destPath
  const normalized = destPath.replace(/[/\\]+$/, '')
  if (/\.(zip|7z|rar|001|tar|gz)$/i.test(normalized)) {
    const sep = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'))
    return sep >= 0 ? normalized.slice(0, sep) : normalized
  }
  return normalized
}
