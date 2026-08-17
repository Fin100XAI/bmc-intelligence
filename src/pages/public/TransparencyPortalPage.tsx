import { useQuery } from '@tanstack/react-query'
import { ScrollText, ShieldCheck, Wallet } from 'lucide-react'
import { Link } from 'react-router-dom'
import { DataTable, EmptyState, ErrorState, LoadingState, type Column } from '@/components/ui'
import { MetricCard } from '@/components/cards'
import { GovPanel } from '@/components/gov/GovPanel'
import { ROUTES } from '@/config/navigation'
import { transparencyService } from '@/services'
import type { PublicContractAward, PublicCouncilResolution, PublicGovernmentResolution } from '@/types/transparency'
import { formatCrore, formatDate } from '@/utils/format'
import { t } from '@/i18n'

/**
 * src/pages/public/TransparencyPortalPage.tsx
 *
 * The one genuinely public, unauthenticated surface in the platform.
 * Rendered outside `RequireAuth` and outside `AppShell` deliberately - this
 * is not an officer console page that happens to be reachable without
 * signing in, it is a different kind of page, reading through a different,
 * hand-curated service (`transparencyService`) that was never given a
 * principal to scope its answers against. See that service's own header for
 * the discipline this page depends on.
 */

export function TransparencyPortalPage(): React.JSX.Element {
  const query = useQuery({
    queryKey: ['bmc-mii', 'transparency', 'overview'],
    queryFn: () => transparencyService.overview(),
    staleTime: 60_000,
  })

  const contractColumns: Array<Column<PublicContractAward>> = [
    { id: 'reference', header: t('Reference'), cell: (c) => <span className="numeric text-[0.6875rem] text-ink-500">{c.reference}</span>, sortValue: (c) => c.reference, hideBelow: 'lg' },
    { id: 'title', header: t('Work'), cell: (c) => <span className="font-medium text-ink-900">{c.title}</span>, sortValue: (c) => c.title, searchValue: (c) => `${c.title} ${c.contractorName}`, width: 'minmax(14rem,2fr)' },
    { id: 'contractor', header: t('Awarded to'), cell: (c) => c.contractorName, sortValue: (c) => c.contractorName, hideBelow: 'md' },
    { id: 'department', header: t('Department'), cell: (c) => c.departmentName, sortValue: (c) => c.departmentName, hideBelow: 'xl' },
    { id: 'value', header: t('Value'), cell: (c) => formatCrore(c.valueCrore), sortValue: (c) => c.valueCrore, align: 'right' },
    { id: 'awarded', header: t('Awarded'), cell: (c) => formatDate(c.awardDate), sortValue: (c) => c.awardDate },
  ]

  const grColumns: Array<Column<PublicGovernmentResolution>> = [
    { id: 'reference', header: t('Reference'), cell: (g) => <span className="numeric text-[0.6875rem] text-ink-500">{g.reference}</span>, sortValue: (g) => g.reference, hideBelow: 'lg' },
    { id: 'subject', header: t('Subject'), cell: (g) => <span className="font-medium text-ink-900">{g.subject}</span>, sortValue: (g) => g.subject, searchValue: (g) => g.subject, width: 'minmax(14rem,2fr)' },
    { id: 'department', header: t('Issued by'), cell: (g) => g.issuingDepartment, sortValue: (g) => g.issuingDepartment, hideBelow: 'md' },
    { id: 'type', header: t('Type'), cell: (g) => g.documentType, sortValue: (g) => g.documentType, hideBelow: 'lg' },
    { id: 'issued', header: t('Issued'), cell: (g) => formatDate(g.issuedAt), sortValue: (g) => g.issuedAt },
    { id: 'status', header: t('Status'), cell: (g) => g.status, sortValue: (g) => g.status },
  ]

  const councilColumns: Array<Column<PublicCouncilResolution>> = [
    { id: 'reference', header: t('Reference'), cell: (r) => <span className="numeric text-[0.6875rem] text-ink-500">{r.reference}</span>, sortValue: (r) => r.reference, hideBelow: 'lg' },
    { id: 'subject', header: t('Subject'), cell: (r) => <span className="font-medium text-ink-900">{r.subject}</span>, sortValue: (r) => r.subject, searchValue: (r) => r.subject, width: 'minmax(14rem,2fr)' },
    { id: 'committee', header: t('Committee'), cell: (r) => r.committee, sortValue: (r) => r.committee, hideBelow: 'md' },
    { id: 'implication', header: t('Financial implication'), cell: (r) => (r.financialImplicationCrore ? formatCrore(r.financialImplicationCrore) : <span className="text-ink-400">-</span>), sortValue: (r) => r.financialImplicationCrore ?? 0, align: 'right', hideBelow: 'lg' },
    { id: 'tabled', header: t('Tabled'), cell: (r) => formatDate(r.tabledAt), sortValue: (r) => r.tabledAt },
    { id: 'status', header: t('Status'), cell: (r) => r.status, sortValue: (r) => r.status },
  ]

  return (
    <div className="min-h-screen bg-surface-sunken">
      <header className="border-b border-ink-200 bg-govt-900 px-4 py-5 text-white sm:px-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div>
            <p className="text-[0.6875rem] font-bold tracking-[0.14em] text-govt-200 uppercase">{t('Public Disclosure')}</p>
            <h1 className="mt-1 text-2xl font-semibold">{t('Transparency Portal')}</h1>
            <p className="mt-1 max-w-2xl text-sm text-govt-100">
              {t('Sanctioned budgets, tender awards, Government Resolutions and passed council resolutions - published without sign-in, as public record.')}
            </p>
          </div>
          <Link to={ROUTES.login} className="shrink-0 rounded-[3px] border border-white/30 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10">
            {t('Officer sign-in')}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-4 px-4 py-6 sm:px-8">
        {query.isLoading ? (
          <>
            <LoadingState variant="metrics" />
            <LoadingState variant="table" rows={8} />
          </>
        ) : query.error ? (
          <ErrorState detail={query.error.message} onRetry={() => void query.refetch()} />
        ) : (
          (() => {
            const data = query.data!
            return (
              <>
                <p className="text-xs text-ink-500">
                  {t('{0}, {1} · figures as at {2}', data.municipalityName, data.city, formatDate(data.generatedAt))}
                </p>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <MetricCard label={t('Budget approved, {0}', data.budget.financialYear)} value={formatCrore(data.budget.approvedCrore)} icon={<Wallet className="h-4 w-4" />} />
                  <MetricCard label={t('Utilisation to date')} value={data.budget.utilisationPct} unit="%" icon={<Wallet className="h-4 w-4" />} />
                  <MetricCard label={t('RTI responded within statutory period')} value={data.rti.respondedWithinStatutoryPeriodPct} unit="%" icon={<ShieldCheck className="h-4 w-4" />} />
                  <MetricCard label={t('RTI applications, last 12 months')} value={data.rti.received12m} icon={<ScrollText className="h-4 w-4" />} />
                </div>

                <GovPanel dense tone="amber" title={t('Recent contract awards')}>
                  <p className="px-3 pt-3 pb-2 text-xs leading-relaxed text-ink-500">{t('The most recently awarded municipal works and supply contracts.')}</p>
                  {data.recentContracts.length === 0 ? <EmptyState title={t('No contract awards on record')} /> : <DataTable rows={data.recentContracts} columns={contractColumns} rowKey={(c) => c.reference} pageSize={10} />}
                </GovPanel>

                <GovPanel dense tone="red" title={t('Government Resolutions')}>
                  <p className="px-3 pt-3 pb-2 text-xs leading-relaxed text-ink-500">{t('Recent Government Resolutions, circulars and notifications directed to the Corporation.')}</p>
                  {data.recentResolutions.length === 0 ? <EmptyState title={t('No resolutions on record')} /> : <DataTable rows={data.recentResolutions} columns={grColumns} rowKey={(g) => g.reference} pageSize={10} />}
                </GovPanel>

                <GovPanel dense tone="amber" title={t('Passed council resolutions')}>
                  <p className="px-3 pt-3 pb-2 text-xs leading-relaxed text-ink-500">{t('Matters the Corporation in session has passed or implemented.')}</p>
                  {data.recentCouncilResolutions.length === 0 ? <EmptyState title={t('No resolutions on record')} /> : <DataTable rows={data.recentCouncilResolutions} columns={councilColumns} rowKey={(r) => r.reference} pageSize={10} />}
                </GovPanel>
              </>
            )
          })()
        )}

        <p className="border-t border-ink-200 pt-4 text-[0.6875rem] leading-relaxed text-ink-500">
          {t('Demonstration environment. Figures shown are modelled demonstration data and are not connected to any live departmental system.')}
        </p>
      </main>
    </div>
  )
}

export default TransparencyPortalPage
