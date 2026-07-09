import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './shared/i18n'
import App from './App.tsx'
import { Provider } from 'react-redux'
import { store } from './app/store'
import { ErrorBoundary } from './shared/components/ErrorBoundary'
import { AppSettingsProvider } from './app/context/AppSettingsContext'
import { NavigationProvider } from './app/context/NavigationContext'
import { FavoritesProvider } from './features/favorites/FavoritesProvider'
import { ToastProvider } from './shared/components/ToastProvider'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <Provider store={store}>
        <AppSettingsProvider>
          <NavigationProvider>
            <FavoritesProvider>
              <ToastProvider>
                <App />
              </ToastProvider>
            </FavoritesProvider>
          </NavigationProvider>
        </AppSettingsProvider>
      </Provider>
    </ErrorBoundary>
  </StrictMode>,
)
