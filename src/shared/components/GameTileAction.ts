export type GameTileAction = {
  id: string
  label: string
  title?: string
  variant?: 'primary' | 'outline' | 'danger'
  disabled?: boolean
  onClick: () => void
}
