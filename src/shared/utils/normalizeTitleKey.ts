export function normalizeTitleKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/[™®©]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6)
    .join(' ')
}

export function cleanTitleForCover(title: string): string {
  return title
    .replace(/\(.*?fitgirl.*?\)/gi, '')
    .replace(/fitgirl[- ]?repack/gi, '')
    .replace(/\[.*?\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Título legível na UI — remove repack, builds, DLCs e ruído técnico. */
export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#0?38;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

export function cleanTitleForDisplay(title: string): string {
  let cleaned = decodeHtmlEntities(title)
    .replace(/\(.*?fitgirl.*?\)/gi, '')
    .replace(/\[.*?\]/g, '')
    .replace(/fitgirl[- ]?repack/gi, '')
    .replace(/,?\s*builds?\s+[\d/]+/gi, '')
    .replace(/,?\s*\+?\s*\d+\s*dlcs?(?:\/bonuses?)?/gi, '')
    .replace(/,?\s*\+?\s*bonuses?/gi, '')
    .replace(/\s*\+\s*$/g, '')
    .replace(/\s*,\s*,/g, ',')
    .replace(/\s+/g, ' ')
    .trim()

  if (!cleaned) cleaned = title.trim()
  if (cleaned.length > 72) {
    cleaned = `${cleaned.slice(0, 69).trim()}…`
  }
  return cleaned
}

/** Chave para agrupar o mesmo jogo na biblioteca (ex.: Terraria vs Terraria v1.4.5). */
export function libraryGameKey(title: string): string {
  let cleaned = cleanTitleForDisplay(title)
  cleaned = cleaned.replace(/\s*[-–:]\s*v?\d[\d.]*.*$/i, '').trim()
  const key = normalizeTitleKey(cleaned || title)
  const first = key.split(/\s+/)[0] ?? key
  return first.length >= 3 ? first : key
}
