import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { useToastState } from './useToastState'

export type ToastVariant = 'success' | 'error' | 'info'

type ToastContextValue = {
  showToast: (message: string, variant?: ToastVariant) => void
  showError: (message: string) => void
  showSuccess: (message: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const { toast, showToast, showError, showSuccess } = useToastState()

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
