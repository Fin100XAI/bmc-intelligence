import { Component, type ErrorInfo, type ReactNode } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router-dom'
import { municipality } from '@/config/municipality.config'
import { queryClient } from './queryClient'
import { router } from '@/routes'
import { Button, Card } from '@/components/ui/primitives'
import { t } from '@/i18n'

/**
 * Application root.
 *
 * A failure anywhere in the interface must never present a blank screen to an
 * operator - an unexplained absence of information is worse than none.
 */
class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error('[platform] unhandled interface error', error, info.componentStack)
  }

  override render(): ReactNode {
    if (!this.state.error) return this.props.children

    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas p-6">
        <Card className="max-w-lg">
          <h1 className="text-base font-semibold text-ink-900">{t('The interface encountered an unrecoverable error')}</h1>
          <p className="mt-2 text-[0.8125rem] leading-relaxed text-ink-600">
            {t('No partial or unverified information is shown in place of the failed view. Reload the application to continue. If the condition persists, report it to the platform team with the reference below.')}
          </p>
          <pre className="scrollbar-slim mt-3 max-h-40 overflow-auto rounded-md bg-ink-50 p-2.5 font-mono text-[0.6875rem] text-ink-600">
            {this.state.error.message}
          </pre>
          <div className="mt-4 flex items-center gap-2">
            <Button variant="primary" onClick={() => window.location.reload()}>
              {t('Reload application')}
            </Button>
            <Button variant="ghost" onClick={() => this.setState({ error: null })}>
              {t('Dismiss')}
            </Button>
          </div>
          <p className="mt-4 border-t border-ink-100 pt-3 text-[0.6875rem] text-ink-400">
            {municipality.branding.productName} · {municipality.environmentLabel}
          </p>
        </Card>
      </div>
    )
  }
}

export function App(): React.JSX.Element {
  return (
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </AppErrorBoundary>
  )
}

export default App
