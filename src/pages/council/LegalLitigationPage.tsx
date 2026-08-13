import { useMemo, useState } from 'react'
import { Banknote, FileWarning, Gavel, Scale3d, ScrollText, ShieldQuestion } from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import {
  Badge,
  Card,
  CardHeader,
  DataTable,
  DemonstrationNotice,
  EmptyState,
  ErrorState,
  Label,
  LoadingState,
  MetricGrid,
  Select,
  type BadgeTone,
  type Column,
} from '@/components/ui'
import { MetricCard } from '@/components/cards'
import { CHART_COLOURS, DonutChart } from '@/components/charts'
import { useServiceQuery } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { legalService } from '@/services'
import { usePageMasthead } from '@/stores/masthead.store'
import { departmentName } from '@/data/reference'
import { DEMO_NOW } from '@/utils/deterministic'
import {
  ARBITRATION_DISPUTE_TYPE_LABEL,
  ARBITRATION_STAGE_LABEL,
  CASE_STATUS_LABEL,
  CASE_TYPE_LABEL,
  CORPORATION_ROLE_LABEL,
  COURT_FORUM_LABEL,
  RTI_STATUS_LABEL,
  type ArbitrationMatter,
  type CaseStatus,
  type CaseType,
  type LegalCase,
  type RtiStatus,
} from '@/types/legal'
import { formatCrore, formatDate } from '@/utils/format'
import { t } from '@/i18n'

/**
 * src/pages/council/LegalLitigationPage.tsx
 *
 * The Law Department's own docket.
 *
 * Six other pages in the Planning & Development Control and Water & Sanitation
 * sections could each flag a violation, a breach of contract or a disputed
 * demand as data - and every one of them stopped there, because none held
 * what a matter becomes once it leaves the administration's hands: a court
 * case, an RTI application working through its statutory clock, or a
 * contractor's arbitration reference. This is that register. It is
 * deliberately read-only - a case is not filed, an RTI application is not
 * decided and a tribunal is not constituted from a screen like this one.
 */

const CASE_STATUS_TONE: Record<CaseStatus, BadgeTone> = {
  filed: 'muted',
  'pending-hearing': 'info',
  'interim-order': 'warn',
  stayed: 'warn',
  'disposed-favourable': 'positive',
  'disposed-adverse': 'critical',
  remanded: 'neutral',
}

const CASE_STATUS_COLOUR: Record<CaseStatus, string> = {
  filed: CHART_COLOURS.neutral,
  'pending-hearing': CHART_COLOURS.primary,
  'interim-order': CHART_COLOURS.warn,
  stayed: CHART_COLOURS.warn,
  'disposed-favourable': CHART_COLOURS.positive,
  'disposed-adverse': CHART_COLOURS.critical,
  remanded: CHART_COLOURS.intel,
}

const CASE_STATUSES: CaseStatus[] = [
  'filed', 'pending-hearing', 'interim-order', 'stayed', 'disposed-favourable', 'disposed-adverse', 'remanded',
]
const CASE_TYPES: CaseType[] = [
  'writ-petition', 'pil', 'civil-appeal', 'consumer-complaint', 'service-matter', 'land-acquisition-dispute',
]

const RTI_STATUS_TONE: Record<RtiStatus, BadgeTone> = {
  pending: 'info',
  responded: 'positive',
  'first-appeal': 'warn',
  'second-appeal': 'critical',
  closed: 'muted',
}

const ARBITRATION_STAGE_TONE: Record<ArbitrationMatter['stage'], BadgeTone> = {
  'notice-invoked': 'muted',
  'tribunal-constituted': 'info',
  pleadings: 'info',
  hearings: 'warn',
  'award-reserved': 'warn',
  'award-passed': 'positive',
  'award-challenged': 'critical',
}

export function LegalLitigationPage(): React.JSX.Element {
  const [typeFilter, setTypeFilter] = useState<CaseType | ''>('')
  const [statusFilter, setStatusFilter] = useState<CaseStatus | ''>('')

  usePageMasthead(
    t('Legal & Litigation'),
    t('Every court matter, RTI application and contractor arbitration the Corporation is party to - most often as respondent, not as the party in control of the timeline.'),
  )

  const positionQuery = useServiceQuery(queryKeys.legal('position'), (u) => legalService.position(u))
  const casesQuery = useServiceQuery(queryKeys.legal('cases'), (u) => legalService.cases(u))
  const rtiQuery = useServiceQuery(queryKeys.legal('rti'), (u) => legalService.rtiApplications(u))
  const arbitrationQuery = useServiceQuery(queryKeys.legal('arbitration'), (u) => legalService.arbitrationMatters(u))

  const cases = useMemo(() => casesQuery.data ?? [], [casesQuery.data])
  const rti = useMemo(() => rtiQuery.data ?? [], [rtiQuery.data])
  const arbitration = useMemo(() => arbitrationQuery.data ?? [], [arbitrationQuery.data])

  const filtered = useMemo(
    () =>
      cases.filter((c) => {
        if (typeFilter && c.caseType !== typeFilter) return false
        if (statusFilter && c.status !== statusFilter) return false
        return true
      }),
    [cases, typeFilter, statusFilter],
  )

  const loading = positionQuery.isLoading || casesQuery.isLoading || rtiQuery.isLoading || arbitrationQuery.isLoading
  const anyError = positionQuery.error ?? casesQuery.error ?? rtiQuery.error ?? arbitrationQuery.error

  if (loading) {
    return (
      <PageBody>
        <PageHeader eyebrow={t('Council')} breadcrumbs={[{ label: t('Council') }, { label: t('Legal & Litigation') }]} />
        <LoadingState variant="metrics" />
        <LoadingState variant="table" rows={8} />
      </PageBody>
    )
  }
  if (anyError) {
    return (
      <PageBody>
        <PageHeader eyebrow={t('Council')} breadcrumbs={[{ label: t('Council') }, { label: t('Legal & Litigation') }]} />
        <ErrorState
          detail={anyError.message}
          onRetry={() => {
            void positionQuery.refetch()
            void casesQuery.refetch()
            void rtiQuery.refetch()
            void arbitrationQuery.refetch()
          }}
        />
      </PageBody>
    )
  }

  const position = positionQuery.data
  const byStatus = CASE_STATUSES.map((s) => ({ status: s, count: cases.filter((c) => c.status === s).length })).filter(
    (x) => x.count > 0,
  )

  const caseColumns: Array<Column<LegalCase>> = [
    {
      id: 'reference',
      header: t('Reference'),
      cell: (c) => <span className="numeric text-[0.6875rem] text-ink-500">{c.reference}</span>,
      sortValue: (c) => c.reference,
      searchValue: (c) => c.reference,
      hideBelow: 'lg',
    },
    {
      id: 'subject',
      header: t('Matter'),
      cell: (c) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-ink-900">{c.subject}</p>
          <p className="mt-0.5 line-clamp-1 text-[0.6875rem] text-ink-500">{c.summary}</p>
        </div>
      ),
      sortValue: (c) => c.subject,
      searchValue: (c) => `${c.subject} ${c.summary}`,
      width: 'minmax(18rem,2.4fr)',
    },
    {
      id: 'court',
      header: t('Forum'),
      cell: (c) => <span className="text-ink-700">{COURT_FORUM_LABEL[c.court]}</span>,
      sortValue: (c) => COURT_FORUM_LABEL[c.court],
      hideBelow: 'md',
    },
    {
      id: 'type',
      header: t('Type'),
      cell: (c) => <Badge tone="neutral" size="sm">{CASE_TYPE_LABEL[c.caseType]}</Badge>,
      sortValue: (c) => c.caseType,
      hideBelow: 'xl',
    },
    {
      id: 'role',
      header: t('Corporation as'),
      cell: (c) => <span className="text-ink-700">{CORPORATION_ROLE_LABEL[c.corporationRole]}</span>,
      sortValue: (c) => c.corporationRole,
      hideBelow: 'xl',
    },
    {
      id: 'exposure',
      header: t('Exposure'),
      cell: (c) => (c.financialExposureCrore ? formatCrore(c.financialExposureCrore) : <span className="text-ink-400">-</span>),
      sortValue: (c) => c.financialExposureCrore ?? 0,
      align: 'right',
      hideBelow: 'lg',
    },
    {
      id: 'status',
      header: t('Status'),
      cell: (c) => <Badge tone={CASE_STATUS_TONE[c.status]} size="sm">{CASE_STATUS_LABEL[c.status]}</Badge>,
      sortValue: (c) => c.status,
    },
    {
      id: 'nextHearing',
      header: t('Next hearing'),
      cell: (c) => (c.nextHearingAt ? formatDate(c.nextHearingAt) : <span className="text-ink-400">{t('None listed')}</span>),
      sortValue: (c) => c.nextHearingAt ?? '',
      hideBelow: 'md',
    },
  ]

  const arbitrationColumns: Array<Column<ArbitrationMatter>> = [
    {
      id: 'reference',
      header: t('Reference'),
      cell: (a) => <span className="numeric text-[0.6875rem] text-ink-500">{a.reference}</span>,
      sortValue: (a) => a.reference,
      hideBelow: 'lg',
    },
    {
      id: 'contractor',
      header: t('Contractor'),
      cell: (a) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-ink-900">{a.contractorName}</p>
          <p className="mt-0.5 text-[0.6875rem] text-ink-500">{departmentName(a.departmentId)}</p>
        </div>
      ),
      sortValue: (a) => a.contractorName,
      searchValue: (a) => `${a.contractorName} ${a.reference} ${a.contractReference}`,
      width: 'minmax(14rem,2fr)',
    },
    {
      id: 'dispute',
      header: t('Dispute'),
      cell: (a) => <span className="text-ink-700">{ARBITRATION_DISPUTE_TYPE_LABEL[a.disputeType]}</span>,
      sortValue: (a) => a.disputeType,
      hideBelow: 'md',
    },
    {
      id: 'claimed',
      header: t('Claimed'),
      cell: (a) => formatCrore(a.claimedCrore),
      sortValue: (a) => a.claimedCrore,
      align: 'right',
      hideBelow: 'lg',
    },
    {
      id: 'stage',
      header: t('Stage'),
      cell: (a) => <Badge tone={ARBITRATION_STAGE_TONE[a.stage]} size="sm">{ARBITRATION_STAGE_LABEL[a.stage]}</Badge>,
      sortValue: (a) => a.stage,
    },
    {
      id: 'awardDue',
      header: t('Award due by'),
      cell: (a) =>
        a.awardDueBy ? (
          <span className={!a.extensionGranted && new Date(a.awardDueBy) < DEMO_NOW ? 'font-semibold text-crit-600' : 'text-ink-700'}>
            {formatDate(a.awardDueBy)}
          </span>
        ) : (
          <span className="text-ink-400">-</span>
        ),
      sortValue: (a) => a.awardDueBy ?? '',
      hideBelow: 'xl',
    },
  ]

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('Council')}
        breadcrumbs={[{ label: t('Council') }, { label: t('Legal & Litigation') }]}
        hideProvenance
      />

      <DemonstrationNotice />

      <Card tone="info" className="flex items-start gap-3">
        <ShieldQuestion className="mt-0.5 h-4 w-4 shrink-0 text-govt-600" aria-hidden />
        <div className="min-w-0">
          <p className="text-[0.8125rem] font-semibold text-govt-800">
            {t('The docket where the Corporation is usually the respondent, not the party in control of the timeline')}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-ink-600">
            {t('A writ petition is filed by a citizen or a company against the Corporation; a PIL is filed in the public interest; a contractor invokes arbitration under a clause the Corporation signed. This register is read-only for that reason - no case is filed, no RTI application decided and no tribunal constituted from a screen like this one.')}
          </p>
        </div>
      </Card>

      <MetricGrid columns={4}>
        <MetricCard
          label={t('Cases active')}
          value={position?.casesActive ?? 0}
          support={t('{0} filed this financial year', position?.casesFiledYtd ?? 0)}
          icon={<Gavel className="h-4 w-4" />}
        />
        <MetricCard
          label={t('Financial exposure')}
          value={position ? formatCrore(position.financialExposureCrore) : '-'}
          support={t('Across every undisposed matter, if decided adversely')}
          icon={<Banknote className="h-4 w-4" />}
          tone={position && position.financialExposureCrore > 0 ? 'warn' : 'default'}
        />
        <MetricCard
          label={t('RTI applications pending')}
          value={position?.rtiPending ?? 0}
          support={t('{0} past the statutory response deadline', position?.rtiOverdue ?? 0)}
          icon={<ScrollText className="h-4 w-4" />}
          tone={position && position.rtiOverdue > 0 ? 'warn' : 'positive'}
        />
        <MetricCard
          label={t('Arbitration active')}
          value={position?.arbitrationActive ?? 0}
          support={t('{0} past the statutory award timeline unextended', position?.arbitrationOverdue ?? 0)}
          icon={<Scale3d className="h-4 w-4" />}
          tone={position && position.arbitrationOverdue > 0 ? 'critical' : 'default'}
        />
      </MetricGrid>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-3 xl:col-span-8">
          <Card flush>
            <CardHeader
              bordered
              icon={<Gavel className="h-4 w-4" />}
              title={t('Court matters')}
              description={t('Every case the Corporation is party to, most recently filed first.')}
              actions={
                <div className="flex flex-wrap items-end gap-2">
                  <div>
                    <Label htmlFor="type-filter">{t('Case type')}</Label>
                    <Select
                      id="type-filter"
                      value={typeFilter}
                      onChange={(e) => setTypeFilter(e.target.value as CaseType | '')}
                      options={[
                        { value: '', label: t('All types') },
                        ...CASE_TYPES.map((ty) => ({ value: ty, label: CASE_TYPE_LABEL[ty] })),
                      ]}
                    />
                  </div>
                  <div>
                    <Label htmlFor="status-filter">{t('Status')}</Label>
                    <Select
                      id="status-filter"
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value as CaseStatus | '')}
                      options={[
                        { value: '', label: t('All statuses') },
                        ...CASE_STATUSES.map((s) => ({ value: s, label: CASE_STATUS_LABEL[s] })),
                      ]}
                    />
                  </div>
                </div>
              }
            />
            {filtered.length === 0 ? (
              <EmptyState title={t('No matters match the current filters')} detail="Clear a filter to widen the register." />
            ) : (
              <DataTable rows={filtered} columns={caseColumns} rowKey={(c) => c.id} pageSize={12} />
            )}
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-3 xl:col-span-4">
          <Card flush className="flex flex-col">
            <CardHeader
              icon={<Gavel className="h-4 w-4" />}
              title={t('Matters by status')}
              bordered
            />
            <div className="px-4 pt-4" style={{ height: 180 }}>
              <DonutChart
                data={byStatus.map((s) => ({
                  label: CASE_STATUS_LABEL[s.status],
                  value: s.count,
                  colour: CASE_STATUS_COLOUR[s.status],
                }))}
                centreValue={String(cases.length)}
                centreLabel="matters"
              />
            </div>
            <p className="border-t border-ink-100 px-4 py-3 text-[0.6875rem] leading-relaxed text-ink-500">
              {t('{0} of {1} disposed matters were resolved in the Corporation’s favour.', Math.round(((position?.favourableSharePct ?? 0) / 100) * cases.filter((c) => c.status.startsWith('disposed')).length), cases.filter((c) => c.status.startsWith('disposed')).length)}
            </p>
          </Card>

          <Card flush className="flex flex-col">
            <CardHeader icon={<ScrollText className="h-4 w-4" />} title={t('RTI applications')} description={t('Right to Information Act, 2005 - the statutory clock, not the applicant.')} bordered />
            <ul className="divide-y divide-ink-100">
              {rti.slice(0, 6).map((a) => (
                <li key={a.id} className="flex items-center gap-2.5 px-4 py-2.5">
                  <span className="min-w-0 flex-1 truncate text-xs text-ink-700">{a.subjectCategory}</span>
                  <Badge tone={RTI_STATUS_TONE[a.status]} size="sm">{RTI_STATUS_LABEL[a.status]}</Badge>
                </li>
              ))}
            </ul>
            {rti.length === 0 ? <EmptyState title={t('No RTI applications on record')} /> : null}
          </Card>
        </div>
      </div>

      <Card flush>
        <CardHeader
          bordered
          icon={<FileWarning className="h-4 w-4" />}
          title={t('Contractor arbitration')}
          description={t('Referred under the Arbitration and Conciliation Act, 1996. An award falls due twelve months after pleadings close, extendable by six with the parties’ consent.')}
        />
        {arbitration.length === 0 ? (
          <EmptyState title={t('No arbitration matters on record')} />
        ) : (
          <DataTable rows={arbitration} columns={arbitrationColumns} rowKey={(a) => a.id} pageSize={10} />
        )}
      </Card>
    </PageBody>
  )
}

export default LegalLitigationPage
