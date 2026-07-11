import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'

export type ToastVariant = 'success' | 'error' | 'info'

type ToastState = {
  message: string
  variant: ToastVariant
  key: number
  exiting: boolean
}

type ToastContextValue = {
  showToast: (message: string, variant?: ToastVariant) => void
  showError: (message: string) => void
  showSuccess: (message: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const TOAST_DURATION_MS = 3200
const ERROR_DURATION_MS = 5000
const TOAST_EXIT_MS = 300

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null)
  const timerRef = useRef<number | null>(null)
  const keyRef = useRef(0)

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const dismissAnimated = useCallback(() => {
    clearTimer()
    setToast((prev) => {
      if (!prev) return null
      return { ...prev, exiting: true }
    })
    timerRef.current = window.setTimeout(() => {
      setToast(null)
      timerRef.current = null
    }, TOAST_EXIT_MS)
  }, [clearTimer])

  const showToast = useCallback(
    (message: string, variant: ToastVariant = 'info') => {
      const trimmed = message.trim()
      if (!trimmed) return
      clearTimer()
      keyRef.current += 1
      setToast({ message: trimmed, variant, key: keyRef.current, exiting: false })
      const duration = variant === 'error' ? ERROR_DURATION_MS : TOAST_DURATION_MS
      timerRef.current = window.setTimeout(dismissAnimated, duration)
    },
    [clearTimer, dismissAnimated],
  )

  const showError = useCallback((message: string) => showToast(message, 'error'), [showToast])
  const showSuccess = useCallback(
    (message: string) => showToast(message, 'success'),
    [showToast],
  )

  useEffect(() => () => clearTimer(), [clearTimer])

  const value = useMemo(
    () => ({ showToast, showError, showSuccess }),
    [showToast, showError, showSuccess],
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast
        ? createPortal(
            <div
              key={toast.key}
              className={[
                'app-toast',
                `app-toast--${toast.variant}`,
                toast.exiting ? 'app-toast--exit' : 'app-toast--enter',
              ].join(' ')}
              role={toast.variant === 'error' ? 'alert' : 'status'}
              aria-live={toast.variant === 'error' ? 'assertive' : 'polite'}
            >
              {toast.message}
            </div>,
            document.body,
          )
        : null}
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToast must be used within ToastProvider')
  }
  return ctx
}
