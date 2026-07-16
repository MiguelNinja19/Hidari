import { invoke } from '@tauri-apps/api/core'

type SendHidariNotificationInput = {
  title: string
  body: string
  /** Reservado para navegação ao clicar. */
  extra?: Record<string, unknown>
}

/** Envia toast nativo silencioso (Windows: AUMID registado). */
export async function sendHidariNotification(
  input: SendHidariNotificationInput,
): Promise<boolean> {
  try {
    await invoke('send_desktop_notification', {
      payload: {
        title: input.title,
        body: input.body,
      },
    })
    return true
  } catch (error) {
    console.error('[hidari] notification failed', error)
    return false
  }
}

export function warmNotificationPermission(): void {
  // AUMID tratado no Rust no startup.
}

export async function ensureNotificationPermission(): Promise<boolean> {
  return true
}
