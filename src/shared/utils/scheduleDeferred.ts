/** Agenda trabalho não crítico após a UI pintar (ou após um pequeno atraso). */
export function scheduleDeferred(work: () => void, delayMs = 0): () => void {
  if (typeof window.requestIdleCallback === 'function' && delayMs <= 0) {
    const id = window.requestIdleCallback(() => work(), { timeout: 1200 })
    return () => window.cancelIdleCallback(id)
  }

  const id = window.setTimeout(work, Math.max(delayMs, 0))
  return () => window.clearTimeout(id)
}
