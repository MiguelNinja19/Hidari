/**
 * HomeTab - wrapper que monta a HomePage.
 * Espelha o padrão de outras tabs (DiscoverTab, FavoritesTab, etc).
 */

import { HomePage } from './HomePage'

type HomeTabProps = {
  onNavigateToGame?: (shop: string, objectId: string, title: string) => void
}

export function HomeTab({ onNavigateToGame }: HomeTabProps) {
  return (
    <div className="home-tab">
      <HomePage onNavigateToGame={onNavigateToGame} />
    </div>
  )
}
