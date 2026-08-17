import { useMemo, useState } from 'react'
import { Banknote, CalendarClock, ClipboardList, Users2, Vote } from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import {
  Badge,
  Card,
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
import { GovPanel } from '@/components/gov/GovPanel'
import { useServiceQuery } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { wardGovernanceService } from '@/services'
import { usePageMasthead } from '@/stores/masthead.store'
import { wardName, wardShortName } from '@/data/reference'
import type { OperationalState } from '@/types/common'
import {
  CASEWORK_CATEGORY_LABEL,
  CASEWORK_STATUS_LABEL,
  type CaseworkStatus,
  type CorporatorCasework,
  type WardCommitteeDetail,
} from '@/types/ward-governance'
import { formatCrore, formatDate, formatRelative } from '@/utils/format'
import { t } from '@/i18n'

/**
 * src/pages/council/WardCommitteesPage.tsx
 *
 * The statutory ward committees under the 74th Constitutional Amendment Act,
 * and an elected corporator's own casework - distinct from the Standing
 * Committee and General Body record on the Council & Committees page, and
 * distinct from the executive Ward Intelligence pages, which report on how a
 * ward IS rather than on how it is REPRESENTED.
 */

const STATE_TONE: Record<OperationalState, BadgeTone> = {
  operational: 'positive',
  degraded: 'info',
  'at-risk': 'warn',
  critical: 'critical',
  simulation: 'muted',
  'adapter-ready': 'muted',
  'not-connected': 'muted',
  'review-required': 'warn',
  planned: 'muted',
}

const CASEWORK_STATUS_TONE: Record<CaseworkStatus, BadgeTone> = {
  raised: 'muted',
  'referred-to-department': 'info',
  'in-progress': 'info',
  resolved: 'positive',
  'closed-no-action': 'neutral',
}

const CASEWORK_STATUSES: CaseworkStatus[] = [
  'raised', 'referred-to-department', 'in-progress', 'resolved', 'closed-no-action',
]

export function WardCommitteesPage(): React.JSX.Element {
  const [wardFilter, setWardFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<CaseworkStatus | ''>('')

  usePageMasthead(t('Ward Committees'))

  const positionQuery = useServiceQuery(queryKeys.wardGovernance('position'), (u) => wardGovernanceService.position(u))
  const committeesQuery = useServiceQuery(queryKeys.wardGovernance('committees'), (u) => wardGovernanceService.committees(u))
  const caseworkQuery = useServiceQuery(queryKeys.wardGovernance('casework'), (u) => wardGovernanceService.casework(u))

  const committees = useMemo(() => committeesQuery.data ?? [], [committeesQuery.data])
  const casework = useMemo(() => caseworkQuery.data ?? [], [caseworkQuery.data])

  const filteredCasework = useMemo(
    () =>
      casework.filter((c) => {
        if (wardFilter && c.wardId !== wardFilter) return false
        if (statusFilter && c.status !== statusFilter) return false
        return true
      }),
    [casework, wardFilter, statusFilter],
  )

  const loading = positionQuery.isLoading || committeesQuery.isLoading || caseworkQuery.isLoading
  const anyError = positionQuery.error ?? committeesQuery.error ?? caseworkQuery.error

  if (loading) {
    return (
      <PageBody>
        <PageHeader eyebrow={t('Council')} breadcrumbs={[{ label: t('Council') }, { label: t('Ward Committees') }]} />
        <LoadingState variant="metrics" />
        <LoadingState variant="table" rows={8} />
      </PageBody>
    )
  }
  if (anyError) {
    return (
      <PageBody>
        <PageHeader eyebrow={t('Council')} breadcrumbs={[{ label: t('Council') }, { label: t('Ward Committees') }]} />
        <ErrorState
          detail={anyError.message}
          onRetry={() => {
            void positionQuery.refetch()
            void committeesQuery.refetch()
            void caseworkQuery.refetch()
          }}
        />
      </PageBody>
    )
  }

  const position = positionQuery.data

  const committeeColumns: Array<Column<WardCommitteeDetail>> = [
    {
      id: 'ward',
      header: t('Ward'),
      cell: (c) => <span className="font-medium text-ink-900">{wardName(c.wardId)}</span>,
      sortValue: (c) => wardName(c.wardId),
      searchValue: (c) => wardName(c.wardId),
      width: 'minmax(12rem,1.6fr)',
    },
    {
      id: 'seats',
      header: t('Corporator seats'),
      cell: (c) => <span className="numeric text-ink-700">{c.corporatorSeats}</span>,
      sortValue: (c) => c.corporatorSeats,
      align: 'right',
      hideBelow: 'md',
    },
    {
      id: 'sittings',
      header: t('Sittings (12m)'),
      cell: (c) => <span className="numeric text-ink-700">{c.sittings12m}</span>,
      sortValue: (c) => c.sittings12m,
      align: 'right',
      hideBelow: 'lg',
    },
    {
      id: 'attendance',
      header: t('Mean attendance'),
      cell: (c) => (
        <span className={c.meanAttendancePct < 60 ? 'font-semibold text-warn-700' : 'text-ink-700'}>{c.meanAttendancePct}%</span>
      ),
      sortValue: (c) => c.meanAttendancePct,
      align: 'right',
    },
    {
      id: 'works',
      header: t('Local works sanctioned'),
      cell: (c) => (
        <span className="numeric text-ink-700">
          {c.localWorksSanctioned12m} <span className="text-ink-400">· {formatCrore(c.localWorksValueCrore12m)}</span>
        </span>
      ),
      sortValue: (c) => c.localWorksValueCrore12m,
      align: 'right',
      hideBelow: 'xl',
    },
    {
      id: 'grievances',
      header: t('Grievances reviewed'),
      cell: (c) => (
        <span className="numeric text-ink-700">
          {c.grievancesResolved12m}/{c.grievancesReviewed12m}
        </span>
      ),
      sortValue: (c) => (c.grievancesReviewed12m > 0 ? c.grievancesResolved12m / c.grievancesReviewed12m : 0),
      align: 'right',
      hideBelow: 'xl',
    },
    {
      id: 'nextSitting',
      header: t('Next sitting'),
      cell: (c) => formatDate(c.nextSittingAt),
      sortValue: (c) => c.nextSittingAt,
      hideBelow: 'lg',
    },
    {
      id: 'state',
      header: t('State'),
      cell: (c) => <Badge tone={STATE_TONE[c.state]} size="sm">{c.state}</Badge>,
      sortValue: (c) => c.state,
    },
  ]

  const caseworkColumns: Array<Column<CorporatorCasework>> = [
    {
      id: 'reference',
      header: t('Reference'),
      cell: (c) => <span className="numeric text-[0.6875rem] text-ink-500">{c.reference}</span>,
      sortValue: (c) => c.reference,
      hideBelow: 'lg',
    },
    {
      id: 'subject',
      header: t('Matter'),
      cell: (c) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-ink-900">{c.subject}</p>
          <p className="mt-0.5 text-[0.6875rem] text-ink-500">{wardShortName(c.wardId)} · {CASEWORK_CATEGORY_LABEL[c.category]}</p>
        </div>
      ),
      sortValue: (c) => c.subject,
      searchValue: (c) => `${c.subject} ${c.reference}`,
      width: 'minmax(16rem,2.2fr)',
    },
    {
      id: 'committee',
      header: t('Route'),
      cell: (c) => (
        <Badge tone={c.raisedAtCommittee ? 'info' : 'neutral'} size="sm">
          {c.raisedAtCommittee ? t('Tabled at committee') : t('Handled directly')}
        </Badge>
      ),
      sortValue: (c) => (c.raisedAtCommittee ? 1 : 0),
      hideBelow: 'md',
    },
    {
      id: 'raised',
      header: t('Raised'),
      cell: (c) => formatRelative(c.raisedAt),
      sortValue: (c) => c.raisedAt,
      hideBelow: 'md',
    },
    {
      id: 'daysOpen',
      header: t('Days'),
      cell: (c) => <span className="numeric text-ink-700">{c.daysOpen}</span>,
      sortValue: (c) => c.daysOpen,
      align: 'right',
      hideBelow: 'lg',
    },
    {
      id: 'status',
      header: t('Status'),
      cell: (c) => <Badge tone={CASEWORK_STATUS_TONE[c.status]} size="sm">{CASEWORK_STATUS_LABEL[c.status]}</Badge>,
      sortValue: (c) => c.status,
    },
  ]

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('Council')}
        breadcrumbs={[{ label: t('Council') }, { label: t('Ward Committees') }]}
        hideProvenance
      />

      <DemonstrationNotice />

      <Card tone="info" className="flex items-start gap-3">
        <Vote className="mt-0.5 h-4 w-4 shrink-0 text-govt-600" aria-hidden />
        <div className="min-w-0">
          <p className="text-[0.8125rem] font-semibold text-govt-800">
            {position?.governanceStatus === 'elected-council'
              ? t('An elected house, restored')
              : t('Under Administrator rule')}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-ink-600">
            {position?.governanceStatus === 'elected-council'
              ? t('The Corporation’s elected council term expired in March 2022, and the state-appointed Municipal Commissioner administered the Corporation as Administrator for close to four years - its longest such spell. Elections for all corporator seats were held on 15 January 2026, with results declared the following day, restoring an elected house since {0}. Every committee sitting, attendance figure and casework record below remains modelled demonstration data.', formatDate(position.governanceSince))
              : t('The Corporation is currently administered by the state-appointed Municipal Commissioner as Administrator, pending the next general election to the house.')}
          </p>
        </div>
      </Card>

      <MetricGrid columns={4}>
        <MetricCard
          label={t('Corporator seats')}
          value={position?.totalCorporatorSeats ?? 0}
          support={t('Across {0} ward committees', position?.committeesConstituted ?? 0)}
          icon={<Users2 className="h-4 w-4" />}
          background="red"
          footer={<span className="text-[0.625rem] leading-snug text-ink-400">{t("Modelled here as one committee per administrative ward, for per-ward comparability. BMC's own statutory structure groups its 24 administrative wards into just 17 Ward Committees, each covering more than one ward.")}</span>}
        />
        <MetricCard
          label={t('Mean committee attendance')}
          value={position?.meanAttendancePct ?? 0}
          unit="%"
          support={t('{0} sittings held in the last twelve months', position?.sittings12m ?? 0)}
          icon={<CalendarClock className="h-4 w-4" />}
          tone={position && position.meanAttendancePct < 60 ? 'warn' : 'default'}
          background="amber"
        />
        <MetricCard
          label={t('Local works sanctioned')}
          value={position?.localWorksSanctioned12m ?? 0}
          support={position ? formatCrore(position.localWorksValueCrore12m) : '-'}
          icon={<Banknote className="h-4 w-4" />}
          background="green"
        />
        <MetricCard
          label={t('Casework open')}
          value={position?.caseworkOpen ?? 0}
          support={t('Mean {0} days to resolve where closed', position?.meanResolutionDays ?? 0)}
          icon={<ClipboardList className="h-4 w-4" />}
          tone={position && position.caseworkOpen > 0 ? 'warn' : 'positive'}
        />
      </MetricGrid>

      <GovPanel title={t('Ward committee register')} tone="amber" dense>
        <p className="px-3 pt-3 pb-2 text-xs leading-relaxed text-ink-500">
          {t('One statutory committee per ward - composition, sittings, local works sanctioned within the ₹5 lakh threshold, and grievances reviewed.')}
        </p>
        {committees.length === 0 ? (
          <EmptyState title={t('No ward committees on record')} />
        ) : (
          <DataTable rows={committees} columns={committeeColumns} rowKey={(c) => c.wardId} pageSize={12} />
        )}
      </GovPanel>

      <GovPanel
        title={t('Corporator casework')}
        tone="red"
        dense
        actions={
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <Label htmlFor="ward-filter">{t('Ward')}</Label>
              <Select
                id="ward-filter"
                value={wardFilter}
                onChange={(e) => setWardFilter(e.target.value)}
                options={[
                  { value: '', label: t('All wards') },
                  ...committees.map((c) => ({ value: c.wardId, label: wardName(c.wardId) })),
                ]}
              />
            </div>
            <div>
              <Label htmlFor="casework-status-filter">{t('Status')}</Label>
              <Select
                id="casework-status-filter"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as CaseworkStatus | '')}
                options={[
                  { value: '', label: t('All statuses') },
                  ...CASEWORK_STATUSES.map((s) => ({ value: s, label: CASEWORK_STATUS_LABEL[s] })),
                ]}
              />
            </div>
          </div>
        }
      >
        <p className="px-3 pt-3 pb-2 text-xs leading-relaxed text-ink-500">
          {t('Constituent matters an elected corporator has taken up directly - no constituent is named, only what moved and where.')}
        </p>
        {filteredCasework.length === 0 ? (
          <EmptyState title={t('No casework matches the current filters')} detail="Clear a filter to widen the register." />
        ) : (
          <DataTable rows={filteredCasework} columns={caseworkColumns} rowKey={(c) => c.id} pageSize={15} />
        )}
      </GovPanel>
    </PageBody>
  )
}

export default WardCommitteesPage
