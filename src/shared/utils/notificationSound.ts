/**
 * Opções de áudio para `@tauri-apps/plugin-notification`.
 *
 * No Windows, se `sound` for omitido o WinRT gera `<audio silent="true" />`
 * — a notificação aparece sem som. Nomes válidos: Default, IM, Mail, Reminder, SMS.
 */
export function notificationSoundOptions(notifySound: boolean): {
  sound?: string
  silent?: boolean
} {
  if (!notifySound) return { silent: true }

  const ua = typeof navigator !== 'undefined' ? navigator.userAgent.toLowerCase() : ''
  if (ua.includes('mac')) return { sound: 'Ping' }
  if (ua.includes('linux')) return { sound: 'message-new-instant' }
  // Windows (e fallback): som padrão do sistema de toast.
  return { sound: 'Default' }
}
