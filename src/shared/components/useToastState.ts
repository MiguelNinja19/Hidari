import { useCallback, useEffect, useRef, useState } from 'react'
import type { ToastVariant } from './ToastProvider'

export type ToastState = {
  message: string
  variant: ToastVariant
  key: number
  exiting: boolean
}

export function useToastState() {
  const [toast, setToast] = useState<ToastState | null>(null)
  const timerRef = useRef<number | null>(null)
  const keyRef = useRef(0)
  const clearTimer = useCallback(() => {
    if (timerRef.current != null) window.clearTimeout(timerRef.current)
    timerRef.current = null
  }, [])
  const dismissAnimated = useCallback(() => {
    clearTimer()
    setToast((prev) => prev ? { ...prev, exiting: true } : null)
    timerRef.current = window.setTimeout(() => {
      setToast(null)
      timerRef.current = null
    }, 300)
  }, [clearTimer])
  const showToast = useCallback(
    (message: string, variant: ToastVariant = 'info') => {
      const trimmed = message.trim()
      if (!trimmed) return
      clearTimer()
      keyRef.current += 1
      setToast({ message: trimmed, variant, key: keyRef.current, exiting: false })
      timerRef.current = window.setTimeout(
        dismissAnimated,
        variant === 'error' ? 5000 : 3200,
      )
    },
    [clearTimer, dismissAnimated],
  )
  const showError = useCallback((message: string) => showToast(message, 'error'), [showToast])
  const showSuccess = useCallback(
    (message: string) => showToast(message, 'success'),
    [showToast],
  )
  useEffect(() => () => clearTimer(), [clearTimer])
  return { toast, showToast, showError, showSuccess }
}
