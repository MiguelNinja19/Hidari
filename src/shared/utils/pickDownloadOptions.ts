import type { DownloadOption } from '../types/contracts'

const MIRROR_LABEL =
  /1337x|fuckingfast|torrage|rutor|rustork|tapochek|online-fix|linux|macos|windows|magnet \d+/i

function looksLikeTorrentTitle(value: string): boolean {
  if (value.length > 36) return true
  if (/\bv?\d[\d.]+/i.test(value) && /[+(]/.test(value)) return true
  if (/repack|fitgirl|update|dlc|bonus/i.test(value)) return true
  return false
}

export function pickOptionLabel(option: DownloadOption): string {
  const source = option.sourceName.trim() || 'Fonte'
  const quality = option.quality?.trim()

  if (quality && quality !== 'standard') {
    if (MIRROR_LABEL.test(quality) || (!looksLikeTorrentTitle(quality) && quality.length <= 28)) {
      return quality
    }
  }

  return source
}

export function pickOptionSubtitle(option: DownloadOption): string | null {
  const label = pickOptionLabel(option)
  const source = option.sourceName.trim()

  if (source && label !== source) return source
  return 'Torrent'
}

export function dedupeDownloadOptions(options: DownloadOption[]): DownloadOption[] {
  const seenUrl = new Set<string>()
  const seenBtih = new Set<string>()
  const out: DownloadOption[] = []

  for (const opt of options) {
    const url = opt.url.trim()
    if (!url || seenUrl.has(url)) continue

    const btih = magnetBtih(url)
    if (btih && seenBtih.has(btih)) continue

    seenUrl.add(url)
    if (btih) seenBtih.add(btih)
    out.push(opt)
  }

  return out
}

function magnetBtih(magnet: string): string | null {
  if (!magnet.toLowerCase().startsWith('magnet:?')) return null
  try {
    const params = new URL(magnet).searchParams
    const xt = params.get('xt')?.toLowerCase()
    if (xt?.startsWith('urn:btih:')) return xt
  } catch {
    return null
  }
  return null
}
