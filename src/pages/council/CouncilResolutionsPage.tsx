import { useMemo, useState } from 'react'
import { CalendarDays, Gavel, Landmark, Users, Vote } from 'lucide-react'
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
import { CHART_COLOURS, DonutChart } from '@/components/charts'
import { GovPanel } from '@/components/gov/GovPanel'
import { useServiceQuery } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { councilService } from '@/services'
import { usePageMasthead } from '@/stores/masthead.store'
import { wardShortName } from '@/data/reference'
import { DOMAIN_LABEL, type IntelligenceDomain } from '@/types/common'
import {
  COMMITTEE_KIND_LABEL,
  RESOLUTION_STATUS_LABEL,
  type CouncilResolution,
  type ResolutionStatus,
} from '@/types/civic-services'
import { formatCrore, formatDate, formatRelative } from '@/utils/format'
import { t } from '@/i18n'

/**
 * src/pages/council/CouncilResolutionsPage.tsx
 *
 * The Corporation in session.
 *
 * Every other screen in this platform reports on the EXECUTIVE wing - the
 * Commissioner, the departments, the officers who administer. But a municipal
 * corporation is a two-wing institution, and until this page the platform had
 * no record of the second one at all. The Standing Committee sanctions
 * expenditure within its financial limit; the General Body approves the budget
 * estimates and everything reserved to the whole house.
 *
 * That absence had a concrete consequence. A decision case in the Decision
 * Centre ended with an officer, when in practice a great many matters cannot
 * take effect until the Corporation has resolved on them. A platform that
 * showed only the administrative half was describing an institution that does
 * not exist, and quietly overstating what an officer alone can commit.
 *
 * The most consequential column here is "awaiting implementation": a matter the
 * house has passed and the administration has not yet acted on. It is the one
 * accountability gap that belongs to neither wing on its own.
 */

const STATUS_TONE: Record<ResolutionStatus, BadgeTone> = {
  tabled: 'muted',
  'under-discussion': 'info',
  deferred: 'warn',
  passed: 'positive',
  rejected: 'critical',
  implemented: 'positive',
}

const STATUS_COLOUR: Record<ResolutionStatus, string> = {
  tabled: CHART_COLOURS.neutral,
  'under-discussion': CHART_COLOURS.primary,
  deferred: CHART_COLOURS.warn,
  passed: CHART_COLOURS.intel,
  rejected: CHART_COLOURS.critical,
  implemented: CHART_COLOURS.positive,
}

const STATUSES: ResolutionStatus[] = ['tabled', 'under-discussion', 'deferred', 'passed', 'rejected', 'implemented']

export function CouncilResolutionsPage(): React.JSX.Element {
  const [committeeFilter, setCommitteeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<ResolutionStatus | ''>('')

  // The shell renders the masthead; this page states what it should say.
  usePageMasthead(t('Council & Committees'))

  const positionQuery = useServiceQuery(queryKeys.council('position'), (u) => councilService.position(u))
  const committeesQuery = useServiceQuery(queryKeys.council('committees'), (u) => councilService.committees(u))
  const resolutionsQuery = useServiceQuery(queryKeys.council('resolutions'), (u) => councilService.resolutions(u))

  const committees = useMemo(() => committeesQuery.data ?? [], [committeesQuery.data])
  const resolutions = useMemo(() => resolutionsQuery.data ?? [], [resolutionsQuery.data])

  const committeeName = useMemo(
    () => (id: string) => committees.find((c) => c.id === id)?.name ?? id,
    [committees],
  )

  const filtered = useMemo(
    () =>
      resolutions.filter((r) => {
        if (committeeFilter && r.committeeId !== committeeFilter) return false
        if (statusFilter && r.status !== statusFilter) return false
        return true
      }),
    [resolutions, committeeFilter, statusFilter],
  )

  if (positionQuery.isLoading || committeesQuery.isLoading || resolutionsQuery.isLoading) {
    return (
      <PageBody>
        <PageHeader eyebrow={t('Council')} breadcrumbs={[{ label: t('Council') }, { label: t('Council & Committees') }]} />
        <LoadingState variant="metrics" />
        <LoadingState variant="table" rows={8} />
      </PageBody>
    )
  }
  if (positionQuery.error || committeesQuery.error || resolutionsQuery.error) {
    return (
      <PageBody>
        <PageHeader eyebrow={t('Council')} breadcrumbs={[{ label: t('Council') }, { label: t('Council & Committees') }]} />
        <ErrorState
          detail={(positionQuery.error ?? committeesQuery.error ?? resolutionsQuery.error)?.message}
          onRetry={() => {
            void positionQuery.refetch()
            void committeesQuery.refetch()
            void resolutionsQuery.refetch()
          }}
        />
      </PageBody>
    )
  }

  const position = positionQuery.data
  const awaiting = resolutions.filter((r) => r.status === 'passed')
  const financialAwaiting = awaiting.reduce((s, r) => s + (r.financialImplicationCrore ?? 0), 0)

  const byStatus = STATUSES.map((s) => ({ status: s, count: resolutions.filter((r) => r.status === s).length })).filter(
    (x) => x.count > 0,
  )

  const columns: Array<Column<CouncilResolution>> = [
    {
      id: 'reference',
      header: t('Reference'),
      cell: (r) => <span className="numeric text-[0.6875rem] text-ink-500">{r.reference}</span>,
      sortValue: (r) => r.reference,
      searchValue: (r) => r.reference,
      hideBelow: 'lg',
    },
    {
      id: 'subject',
      header: t('Subject'),
      cell: (r) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-ink-900">{r.subject}</p>
          <p className="mt-0.5 line-clamp-1 text-[0.6875rem] text-ink-500">{r.summary}</p>
        </div>
      ),
      sortValue: (r) => r.subject,
      searchValue: (r) => `${r.subject} ${r.summary}`,
      width: 'minmax(18rem,2.4fr)',
    },
    {
      id: 'committee',
      header: t('Before'),
      cell: (r) => <span className="text-ink-700">{committeeName(r.committeeId)}</span>,
      sortValue: (r) => committeeName(r.committeeId),
      hideBelow: 'md',
    },
    {
      id: 'domain',
      header: t('Domain'),
      cell: (r) => <Badge tone="neutral" size="sm">{DOMAIN_LABEL[r.domain as IntelligenceDomain] ?? r.domain}</Badge>,
      sortValue: (r) => r.domain,
      hideBelow: 'xl',
    },
    {
      id: 'wards',
      header: t('Wards'),
      cell: (r) => (r.wardIds.length === 0 ? <span className="text-ink-400">{'City-wide'}</span> : r.wardIds.map((w) => wardShortName(w)).join(', ')),
      sortValue: (r) => r.wardIds.length,
      hideBelow: 'xl',
    },
    {
      id: 'financial',
      header: t('Financial implication'),
      cell: (r) => (r.financialImplicationCrore ? formatCrore(r.financialImplicationCrore) : <span className="text-ink-400">-</span>),
      sortValue: (r) => r.financialImplicationCrore ?? 0,
      align: 'right',
      hideBelow: 'lg',
    },
    {
      id: 'votes',
      header: t('Division'),
      cell: (r) =>
        r.votesFor === undefined ? (
          <span className="text-ink-400">{t('Not put')}</span>
        ) : (
          <span className="numeric text-ink-700">
            {r.votesFor} <span className="text-ink-400">for</span> · {r.votesAgainst} <span className="text-ink-400">against</span>
          </span>
        ),
      sortValue: (r) => r.votesFor ?? -1,
      align: 'right',
      hideBelow: 'xl',
    },
    {
      id: 'status',
      header: t('Status'),
      cell: (r) => <Badge tone={STATUS_TONE[r.status]} size="sm">{RESOLUTION_STATUS_LABEL[r.status]}</Badge>,
      sortValue: (r) => r.status,
    },
    { id: 'tabled', header: t('Tabled'), cell: (r) => formatRelative(r.tabledAt), sortValue: (r) => r.tabledAt, hideBelow: 'md' },
  ]

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('Council')}
        breadcrumbs={[{ label: t('Council') }, { label: t('Council & Committees') }]}
        hideProvenance
      />

      <DemonstrationNotice />

      {/* ── Two columns ──────────────────────────────────────────────
          The house itself reads down the wide column — why this record
          exists, then each committee's composition and sanction limit.
          Beside it, the corporation's standing figures and where every
          matter tabled currently stands. */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
        {/* Column 1 — the house and its committees ----------------- */}
        <div className="flex min-w-0 flex-col gap-3 xl:col-span-8">
          <Card tone="info" className="flex items-start gap-3">
            <Landmark className="mt-0.5 h-4 w-4 shrink-0 text-govt-600" aria-hidden />
            <div className="min-w-0">
              <p className="text-[0.8125rem] font-semibold text-govt-800">{t('The half of the corporation the rest of this platform does not show')}</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-600">
                {t('Every other screen here reports on the executive wing. A decision case in the Decision Centre ends with an officer - but a great many municipal matters cannot take effect until the Corporation has resolved on them, and expenditure above a committee&apos;s sanction limit rises to the house above it. Without this record the platform would overstate what an officer alone can commit.')}
              </p>
            </div>
          </Card>

          <GovPanel title={t('Committees')} tone="amber" dense>
            <p className="px-3 pt-3 pb-2 text-xs leading-relaxed text-ink-500">
              {t('Each committee\'s composition, its financial sanction limit, and when it next sits.')}
            </p>

            {committees.length === 0 ? (
              <EmptyState title={t('No committees on record')} detail="The committee register is empty for this corporation." />
            ) : (
              <ul className="divide-y divide-ink-100">
                {committees.map((c) => (
                  <li key={c.id} className="px-4 py-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-[0.8125rem] leading-5 font-semibold text-ink-900">{c.name}</p>
                        <p className="mt-0.5 truncate text-[0.6875rem] text-ink-500">{c.chairDesignation}</p>
                      </div>
                      <Badge tone="neutral" size="sm">
                        {COMMITTEE_KIND_LABEL[c.kind]}
                      </Badge>
                    </div>

                    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-3">
                      <div className="min-w-0">
                        <dt className="label-institutional">{t('Seats')}</dt>
                        <dd className="numeric mt-0.5 text-xs font-medium text-ink-800">{c.seats}</dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="label-institutional">{t('Sanction limit')}</dt>
                        <dd className="numeric mt-0.5 text-xs font-medium text-ink-800">
                          {c.sanctionLimitCrore ? formatCrore(c.sanctionLimitCrore) : <span className="text-ink-400">{t('No limit')}</span>}
                        </dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="label-institutional">{t('Sittings (12m)')}</dt>
                        <dd className="numeric mt-0.5 text-xs font-medium text-ink-800">{c.sittings12m}</dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="label-institutional">{t('Mean attendance')}</dt>
                        <dd
                          className={
                            c.meanAttendancePct < 66
                              ? 'numeric mt-0.5 text-xs font-semibold text-warn-700'
                              : 'numeric mt-0.5 text-xs font-medium text-ink-800'
                          }
                        >
                          {c.meanAttendancePct}%
                        </dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="label-institutional">{t('Next sitting')}</dt>
                        <dd className="mt-0.5 text-xs font-medium text-ink-800">{formatDate(c.nextSittingAt)}</dd>
                      </div>
                    </dl>
                    {c.kind === 'standing' ? (
                      <p className="mt-2.5 text-[0.625rem] leading-snug text-ink-400">
                        {t("26 corporators sit on BMC's own Standing Committee, elected annually by the general body; the seat count above is anchored to that figure.")}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </GovPanel>
        </div>

        {/* Column 2 — the corporation's standing figures ------------ */}
        <div className="flex min-w-0 flex-col gap-3 xl:col-span-4">
          <MetricGrid columns={2} className="xl:grid-cols-1">
            <MetricCard
              label={t('Corporator seats')}
              value={position?.corporatorSeats ?? 0}
              support={t('Across {0} committees', position?.committees ?? 0)}
              icon={<Users className="h-4 w-4" />}
              origin="demonstration"
            />
            <MetricCard
              label={t('Resolutions tabled')}
              value={position?.resolutionsTabled12m ?? 0}
              support={t('{0} carried in the last twelve months', position?.resolutionsPassed12m ?? 0)}
              icon={<Vote className="h-4 w-4" />}
            />
            <MetricCard
              label={t('Awaiting implementation')}
              value={awaiting.length}
              support={financialAwaiting > 0 ? `${formatCrore(financialAwaiting)} resolved but not yet acted on` : 'Nothing outstanding'}
              tone={awaiting.length > 0 ? 'warn' : 'positive'}
              icon={<Gavel className="h-4 w-4" />}
            />
            <MetricCard
              label={t('Tabled to decision')}
              value={position?.meanDaysTabledToDecision ?? 0}
              unit=" days"
              support={t('Mean time a matter waits before the house')}
              trend={position?.attendanceTrend}
              icon={<CalendarDays className="h-4 w-4" />}
            />
          </MetricGrid>

          <GovPanel title={t('Matters by status')} tone="red" dense>
            <p className="px-3 pt-3 pb-2 text-xs leading-relaxed text-ink-500">
              {t('Where every matter tabled before the house currently stands.')}
            </p>

            <div className="px-4 pt-4" style={{ height: 200 }}>
              <DonutChart
                data={byStatus.map((s) => ({
                  label: RESOLUTION_STATUS_LABEL[s.status],
                  value: s.count,
                  colour: STATUS_COLOUR[s.status],
                }))}
                centreValue={String(resolutions.length)}
                centreLabel="matters"
              />
            </div>

            <ul className="mt-4 divide-y divide-ink-100 border-t border-ink-100">
              {byStatus.map((s) => {
                const share = resolutions.length > 0 ? Math.round((s.count / resolutions.length) * 100) : 0
                return (
                  <li key={s.status} className="flex items-center gap-2.5 px-4 py-2">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: STATUS_COLOUR[s.status] }}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate text-xs text-ink-700">
                      {RESOLUTION_STATUS_LABEL[s.status]}
                    </span>
                    <span className="numeric text-xs font-semibold text-ink-900">{s.count}</span>
                    <span className="numeric w-9 shrink-0 text-right text-[0.6875rem] text-ink-400">{share}%</span>
                  </li>
                )
              })}
            </ul>

            <p className="border-t border-ink-100 px-4 py-3 text-[0.6875rem] leading-relaxed text-ink-500">
              {t('&quot;Passed&quot; and &quot;Implemented&quot; are deliberately separate. A matter the house has carried and the administration has not yet acted on is the accountability gap that belongs to neither wing alone.')}
            </p>
          </GovPanel>
        </div>
      </div>

      <GovPanel
        title={t('Resolution register')}
        tone="amber"
        dense
        actions={
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <Label htmlFor="committee-filter">{t('Committee')}</Label>
              <Select
                id="committee-filter"
                value={committeeFilter}
                onChange={(e) => setCommitteeFilter(e.target.value)}
                options={[{ value: '', label: t('All committees') }, ...committees.map((c) => ({ value: c.id, label: c.name }))]}
              />
            </div>
            <div>
              <Label htmlFor="status-filter">{t('Status')}</Label>
              <Select
                id="status-filter"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as ResolutionStatus | '')}
                options={[
                  { value: '', label: t('All statuses') },
                  ...STATUSES.map((s) => ({ value: s, label: RESOLUTION_STATUS_LABEL[s] })),
                ]}
              />
            </div>
          </div>
        }
      >
        <p className="px-3 pt-3 pb-2 text-xs leading-relaxed text-ink-500">
          {t('Matters tabled before the Corporation and its committees, most recent first.')}
        </p>
        {filtered.length === 0 ? (
          <EmptyState title={t('No matters match the current filters')} detail="Clear a filter to widen the register." />
        ) : (
          <DataTable rows={filtered} columns={columns} rowKey={(r) => r.id} pageSize={15} />
        )}
      </GovPanel>
    </PageBody>
  )
}

export default CouncilResolutionsPage
