/** Remoto primeiro (CDN); local só como fallback. */
export function buildCatalogCoverSources(
  localSrc: string | null,
  localSkipped: boolean,
  remoteCandidates: string[],
): string[] {
  const sources: string[] = []
  for (const url of remoteCandidates) {
    if (!sources.includes(url)) sources.push(url)
  }
  if (localSrc && !localSkipped && !sources.includes(localSrc)) {
    sources.push(localSrc)
  }
  return sources
}
