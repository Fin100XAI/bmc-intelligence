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
import { bmcBaselineEvidence, bmcSources } from '@/config/bmc/evidence'
import { bmcBudgetLines, bmcProjectEvidence, bmcProjectSources, bmcProjects } from '@/config/bmc/public-money'
import { headlineMoney, type MoneyKind } from '@/domains/public-money/model'

function moneyKindText(kind: MoneyKind): string {
  switch (kind) {
    case 'budgetAllocation':
      return t('Budget allocation')
    case 'projectCost':
      return t('Project cost')
    case 'sanctionedCost':
      return t('Sanctioned cost')
    case 'tenderValue':
      return t('Tender value')
    case 'contractValue':
      return t('Contract value')
    case 'actualExpenditure':
      return t('Actual expenditure')
  }
}

interface SourcedRow {
  id: string
  item: string
  figure: string
  basis: string
  sourceTitle: string
  sourceUrl: string | null
}

/** The REAL, sourced public-money items - each resolved to the document it was read from. */
function sourcedRows(): SourcedRow[] {
  const evidence = new Map([...bmcBaselineEvidence(), ...bmcProjectEvidence()].map((e) => [e.id, e]))
  const sources = new Map([...bmcSources(), ...bmcProjectSources()].map((s) => [s.id, s]))
  const resolve = (evidenceId: string): { title: string; url: string | null } => {
    const src = sources.get(evidence.get(evidenceId)?.sourceId ?? '')
    return { title: src ? `${src.authority} - ${src.title}` : t('Source not resolved'), url: src?.url ?? null }
  }
  const budget = bmcBudgetLines().map((b) => {
    const src = resolve(b.evidenceId)
    return { id: b.id, item: b.label, figure: formatCrore(b.crore), basis: b.period, sourceTitle: src.title, sourceUrl: src.url }
  })
  const projects = bmcProjects().flatMap((p) => {
    const money = headlineMoney(p)
    if (!money) return []
    const src = resolve(money.fact.evidenceId)
    return [{ id: p.id, item: p.name, figure: formatCrore(money.fact.crore), basis: moneyKindText(money.kind), sourceTitle: src.title, sourceUrl: src.url }]
  })
  return [...budget, ...projects]
}

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

  const sourced = sourcedRows()
  const sourcedColumns: Array<Column<SourcedRow>> = [
    { id: 'item', header: t('Item'), cell: (x) => <span className="font-medium text-ink-900">{x.item}</span>, sortValue: (x) => x.item, searchValue: (x) => x.item, width: 'minmax(14rem,2fr)' },
    { id: 'figure', header: t('Figure'), cell: (x) => x.figure, sortValue: (x) => x.figure, align: 'right' },
    { id: 'basis', header: t('What the figure is'), cell: (x) => x.basis, sortValue: (x) => x.basis, hideBelow: 'md' },
    {
      id: 'source',
      header: t('Source'),
      cell: (x) =>
        x.sourceUrl ? (
          <a href={x.sourceUrl} target="_blank" rel="noreferrer noopener" className="text-govt-700 underline underline-offset-2 hover:text-govt-900">
            {x.sourceTitle}
          </a>
        ) : (
          <span className="text-ink-500">{x.sourceTitle}</span>
        ),
      sortValue: (x) => x.sourceTitle,
      width: 'minmax(12rem,1.6fr)',
    },
  ]

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
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <p className="text-[0.6875rem] font-bold tracking-[0.14em] text-govt-200 uppercase">{t('Public Disclosure')}</p>
            <h1 className="mt-1 text-2xl font-semibold">{t('Transparency Portal')}</h1>
            <p className="mt-1 max-w-2xl text-sm text-govt-100">
              {t('Sourced public-money figures, each linked to the document it was read from - followed by modelled demonstration registers of tender awards, Government Resolutions and council resolutions, viewable without sign-in.')}
            </p>
          </div>
          <Link to={ROUTES.login} className="shrink-0 rounded-[3px] border border-white/30 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10">
            {t('Officer sign-in')}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-4 px-4 py-6 sm:px-8">
        <p className="rounded-[3px] border border-warn-200 bg-warn-50 px-3 py-2 text-[0.75rem] leading-relaxed text-ink-700">
          {t('Demonstration environment. Only the "Sourced public-money items" section below carries published figures, each linked to its source. Every other figure on this page - budget utilisation, RTI, contract awards, Government Orders and council resolutions - is modelled demonstration data, not public record, and is not connected to any live departmental system.')}
        </p>

        <GovPanel dense tone="amber" title={t('Sourced public-money items')}>
          <p className="px-3 pt-3 pb-2 text-xs leading-relaxed text-ink-500">{t('Budget lines and project figures read from published documents. Money kinds are kept apart - a sanction is not a contract value or expenditure.')}</p>
          {sourced.length === 0 ? <EmptyState title={t('No sourced items on record')} /> : <DataTable rows={sourced} columns={sourcedColumns} rowKey={(x) => x.id} pageSize={10} />}
        </GovPanel>

        <p className="label-institutional pt-2">{t('Modelled demonstration registers')}</p>
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

                <GovPanel dense tone="amber" title={t('Recent contract awards - modelled')}>
                  <p className="px-3 pt-3 pb-2 text-xs leading-relaxed text-ink-500">{t('The most recently awarded municipal works and supply contracts.')}</p>
                  {data.recentContracts.length === 0 ? <EmptyState title={t('No contract awards on record')} /> : <DataTable rows={data.recentContracts} columns={contractColumns} rowKey={(c) => c.reference} pageSize={10} />}
                </GovPanel>

                <GovPanel dense tone="red" title={t('Government Resolutions - modelled')}>
                  <p className="px-3 pt-3 pb-2 text-xs leading-relaxed text-ink-500">{t('Recent Government Resolutions, circulars and notifications directed to the Corporation (modelled demonstration register).')}</p>
                  {data.recentResolutions.length === 0 ? <EmptyState title={t('No resolutions on record')} /> : <DataTable rows={data.recentResolutions} columns={grColumns} rowKey={(g) => g.reference} pageSize={10} />}
                </GovPanel>

                <GovPanel dense tone="amber" title={t('Passed council resolutions - modelled')}>
                  <p className="px-3 pt-3 pb-2 text-xs leading-relaxed text-ink-500">{t('Matters the Corporation in session has passed or implemented.')}</p>
                  {data.recentCouncilResolutions.length === 0 ? <EmptyState title={t('No resolutions on record')} /> : <DataTable rows={data.recentCouncilResolutions} columns={councilColumns} rowKey={(r) => r.reference} pageSize={10} />}
                </GovPanel>
              </>
            )
          })()
        )}

      </main>
    </div>
  )
}

export default TransparencyPortalPage
