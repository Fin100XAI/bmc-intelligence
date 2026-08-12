import { useLocation } from 'react-router-dom'
import { FileQuestion } from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import { Card, LinkButton } from '@/components/ui/primitives'
import { DemonstrationNotice } from '@/components/ui/states'
import { municipality } from '@/config/municipality.config'
import { ROUTES } from '@/config/navigation'
import { getRole } from '@/security/roles'
import { useCurrentUser } from '@/stores/auth.store'
import { t } from '@/i18n'

/**
 * Institutional 404 / route-not-authorised surface.
 *
 * Reached either when a path does not correspond to any registered route, or
 * (via the route table's catch-all) when it does but the acting principal's
 * landing has already handled authorisation elsewhere. The message is
 * deliberately neutral about which of the two applies - the platform does not
 * confirm or deny the existence of a route to an unauthorised principal.
 */
export function NotFoundPage(): React.JSX.Element {
  const location = useLocation()
  const user = useCurrentUser()
  const role = user ? getRole(user.roleId) : undefined

  return (
    <PageBody width="narrow">
      <PageHeader
        eyebrow={t('Platform')}
        title={t('Route not found')}
        description={t('This location does not exist within the {0}, or is not authorised for the acting role.', municipality.branding.productName)}
        breadcrumbs={[{ label: t('Platform') }, { label: t('Not Found') }]}
        hideProvenance
      />

      <Card className="mx-auto max-w-xl text-center">
        <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-ink-100 text-ink-500">
          <FileQuestion className="h-5 w-5" aria-hidden />
        </span>
        <h2 className="text-base font-semibold text-ink-900">{t('This screen is not available')}</h2>
        <p className="mx-auto mt-1.5 max-w-md text-[0.8125rem] leading-relaxed text-ink-600">
          {t('The path')}{' '}<span className="font-mono text-ink-800">{location.pathname}</span>{' '}{t('does not correspond to a registered instrument in this deployment, or falls outside the modules authorised for')}{' '}
          {role ? role.name : 'the current principal'}{t('. No content has been withheld silently: routing outcomes of this kind are recorded like any other access decision.')}
        </p>
        <p className="mx-auto mt-3 max-w-md text-[0.6875rem] leading-relaxed text-ink-400">
          {t('If your responsibilities require access to a module that does not appear here, raise a scope amendment through Access Governance rather than navigating to it directly.')}
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {role ? (
            <LinkButton to={role.landingRoute} variant="primary">
              {t('Return to your landing page')}
            </LinkButton>
          ) : (
            <LinkButton to={ROUTES.login} variant="primary">
              {t('Return to sign in')}
            </LinkButton>
          )}
          <LinkButton to={ROUTES.executive} variant="outline">
            {t('Go to Executive Overview')}
          </LinkButton>
        </div>
      </Card>

      <DemonstrationNotice />
    </PageBody>
  )
}

export default NotFoundPage
