import type { DownloadOption } from '../types/contracts'
import { decodeHtmlEntities } from './normalizeTitleKey'

type PickOptionMeta = {
  source: string
  size: string | null
  downloadType: string
}

/** Título completo da entrada (para tooltip / fila / modal). */
export function pickOptionLabel(option: DownloadOption): string {
  const title = decodeHtmlEntities(option.title.trim())
  if (title) return title

  const quality = option.quality?.trim()
  if (quality && quality !== 'standard') return quality

  return option.sourceName.trim() || 'Download'
}

/** No modal: título completo de cada versão (o hero já mostra só o nome do jogo). */
export function pickOptionVariantLabel(option: DownloadOption, _baseTitle: string): string {
  return pickOptionLabel(option)
}

export function pickOptionMeta(option: DownloadOption): PickOptionMeta {
  const quality = option.quality?.trim()
  const looksLikeSize = quality && quality !== 'standard' && !/^link\s+\d+$/i.test(quality)

  return {
    source: option.sourceName.trim() || 'Fonte',
    size: looksLikeSize ? quality : null,
    downloadType:
      option.downloadType === 'torrent'
        ? 'Torrent'
        : option.downloadType === 'http'
          ? 'HTTP'
          : option.downloadType,
  }
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
