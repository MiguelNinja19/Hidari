export type UpdaterState = {
  checking: boolean
  updateAvailable: boolean
  version: string | null
  error: string | null
  installing: boolean
  dismissed: boolean
  installUpdate: () => Promise<void>
  dismiss: () => void
}

export const initialUpdaterState = {
  checking: false,
  updateAvailable: false,
  version: null as string | null,
  error: null as string | null,
  installing: false,
  dismissed: false,
}
