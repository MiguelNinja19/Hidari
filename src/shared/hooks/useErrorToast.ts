import { useEffect, useRef } from 'react'
import { useToast } from '../components/ToastProvider'
import { formatUserError, isTransientQueueError } from '../utils/formatUserError'

/** Mostra toast quando `error` muda para um valor não vazio. */
export function useErrorToast(error: string | null | undefined, fallback?: string) {
  const { showError } = useToast()
  const lastShownRef = useRef<string | null>(null)

  useEffect(() => {
    const trimmed = error?.trim()
    if (!trimmed) {
      lastShownRef.current = null
      return
    }
    if (isTransientQueueError(trimmed)) return
    if (trimmed === lastShownRef.current) return
    const message = formatUserError(
      trimmed,
      fallback ?? 'Ocorreu um erro inesperado. Tente novamente.',
    )
    if (!message.trim()) return
    lastShownRef.current = trimmed
    showError(message)
  }, [error, fallback, showError])
}
