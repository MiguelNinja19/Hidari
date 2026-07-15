import { Component, type ErrorInfo, type ReactNode } from 'react'
import i18n from '../i18n'

type ErrorBoundaryProps = {
  children: ReactNode
}

type ErrorBoundaryState = {
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('app_render_error', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <section className="app-error" role="alert">
          <h1 className="app-error__title">{i18n.t('common.errorTitle')}</h1>
          <p className="app-error__message">{this.state.error.message}</p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => this.setState({ error: null })}
          >
            {i18n.t('common.retry')}
          </button>
        </section>
      )
    }
    return this.props.children
  }
}
