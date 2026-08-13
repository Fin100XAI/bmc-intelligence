import { useMemo, useState } from 'react'
import { ClipboardList, Gavel, Hammer, HandCoins, Landmark, MapPin, Scale, Timer } from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import {
  Badge,
  Card,
  CardHeader,
  DataTable,
  DemonstrationNotice,
  EmptyState,
  ErrorState,
  LoadingState,
  MetricGrid,
  SegmentedControl,
  Select,
  StateBadge,
  type BadgeTone,
  type Column,
} from '@/components/ui'
import { MetricCard } from '@/components/cards'
import { RankedBarChart } from '@/components/charts'
import { useServiceQuery } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { wardCommitmentsService } from '@/services/ward-commitments.service'
import {
  COMMITMENT_KIND_LABEL,
  COMMITMENT_STANDING_LABEL,
  RESOLUTION_ACTION_WINDOW_DAYS,
  type CommitmentKind,
  type CommitmentStanding,
  type WardCommitment,
} from '@/domains/wards/commitments'
import { wardShortName } from '@/data/reference'
import { usePageMasthead } from '@/stores/masthead.store'
import type { DataFreshness } from '@/types/common'
import { DEMO_NOW } from '@/utils/deterministic'
import { formatCrore, formatDate, formatRelative } from '@/utils/format'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/**
 * src/pages/city/WardCommitmentsPage.tsx
 *
 * What was promised to this ward, and what came of it.
 *
 * The Council register already names the sharpest accountability figure the
 * platform holds: a matter the house has passed and the administration has not
 * acted on belongs to neither wing on its own. It states that figure city-wide,
 * and city-wide is not the unit anyone is asked about. A corporator rises in
 * the General Body and asks one question - "what did you promise MY ward, and
 * what happened to it?" - and answering it has, until now, meant reading the
 * resolution register, the capital works register, the decision register and
 * the ward's budget position side by side and holding the join in one's head.
 *
 * This page performs that join. Four registers already carry a commitment to a
 * named ward; each is reported by a different department and none of them
 * answers the corporator's question alone. Normalised into one record with one
 * derived standing, they do.
 *
 * The boundary is stated on the surface, not in a footnote: a commitment
 * appears here only where its source record NAMES a ward. Matters carried for
 * the whole corporation are excluded by construction, and the count of what
 * that excludes is shown rather than left to be discovered.
 */

const STANDING_TONE: Record<CommitmentStanding, BadgeTone> = {
  delivered: 'positive',
  'in-progress': 'info',
  overdue: 'risk',
  unactioned: 'critical',
}

const KIND_ICON: Record<CommitmentKind, React.JSX.Element> = {
  resolution: <Gavel className="h-3 w-3" />,
  project: <Hammer className="h-3 w-3" />,
  decision: <Scale className="h-3 w-3" />,
  'budget-line': <HandCoins className="h-3 w-3" />,
}

const STANDINGS: CommitmentStanding[] = ['unactioned', 'overdue', 'in-progress', 'delivered']

const CITY_SCOPE = 'city'

type RankMetric = 'unactioned' | 'outstanding'

function build$BREADCRUMBS() {
  return [{ label: t('Wards & Localities') }, { label: t('Ward Commitments Ledger') }]
}
let BREADCRUMBS: ReturnType<typeof build$BREADCRUMBS> = build$BREADCRUMBS()
registerLayer(() => {
  BREADCRUMBS = build$BREADCRUMBS()
})

export function WardCommitmentsPage(): React.JSX.Element {
  usePageMasthead(
    t('Ward Commitments Ledger'),
    t('Everything the corporation has committed to a named ward - resolutions the house has carried, capital works sanctioned, decision cases taken and the ward\'s own capital allocation - held as one record with one standing, so the question a corporator actually asks can be answered from a single screen.'),
  )

  const [scope, setScope] = useState<string>(CITY_SCOPE)
  const [kindFilter, setKindFilter] = useState<CommitmentKind | ''>('')
  const [standingFilter, setStandingFilter] = useState<CommitmentStanding | ''>('')
  const [rankMetric, setRankMetric] = useState<RankMetric>('unactioned')

  const ledgerQuery = useServiceQuery(queryKeys.wardCommitments(scope), (u) =>
    wardCommitmentsService.ledger(u, scope === CITY_SCOPE ? null : scope),
  )

  const ledger = ledgerQuery.data
  const commitments = useMemo(() => ledger?.commitments ?? [], [ledger])

  const filtered = useMemo(
    () =>
      commitments.filter((c) => {
        if (kindFilter && c.kind !== kindFilter) return false
        if (standingFilter && c.standing !== standingFilter) return false
        return true
      }),
    [commitments, kindFilter, standingFilter],
  )

  const freshness: DataFreshness = {
    generatedAt: DEMO_NOW.toISOString(),
    sourceObservedAt: DEMO_NOW.toISOString(),
    refreshIntervalMinutes: 1440,
    origin: 'derived-metric',
    sourceState: 'operational',
    stale: false,
  }

  if (ledgerQuery.isLoading) {
    return (
      <PageBody>
        <PageHeader eyebrow={t('Wards & Localities')} breadcrumbs={BREADCRUMBS} />
        <LoadingState variant="metrics" />
        <LoadingState variant="table" rows={8} />
      </PageBody>
    )
  }

  if (ledgerQuery.error || !ledger) {
    return (
      <PageBody>
        <PageHeader eyebrow={t('Wards & Localities')} breadcrumbs={BREADCRUMBS} />
        <ErrorState
          detail={ledgerQuery.error?.message ?? 'The commitment ledger could not be assembled for this principal.'}
          onRetry={() => {
            void ledgerQuery.refetch()
          }}
        />
      </PageBody>
    )
  }

  const { summary, wardSummaries, excluded, wards } = ledger
  const open = summary.made - summary.delivered
  const cityWide = scope === CITY_SCOPE

  const ranked = wardSummaries
    .filter((w) => (rankMetric === 'unactioned' ? w.unactioned > 0 : w.valueOutstandingCrore > 0))
    .sort((a, b) =>
      rankMetric === 'unactioned'
        ? b.unactioned - a.unactioned
        : b.valueOutstandingCrore - a.valueOutstandingCrore,
    )
    .slice(0, 12)

  const columns: Array<Column<WardCommitment>> = [
    {
      id: 'reference',
      header: t('Reference'),
      cell: (c) => <span className="numeric text-[0.6875rem] text-ink-500">{c.reference}</span>,
      sortValue: (c) => c.reference,
      searchValue: (c) => c.reference,
      hideBelow: 'md',
    },
    {
      id: 'kind',
      header: t('Register'),
      cell: (c) => (
        <Badge tone="neutral" size="sm" icon={KIND_ICON[c.kind]}>
          {COMMITMENT_KIND_LABEL[c.kind]}
        </Badge>
      ),
      sortValue: (c) => COMMITMENT_KIND_LABEL[c.kind],
      exportValue: (c) => COMMITMENT_KIND_LABEL[c.kind],
    },
    {
      id: 'subject',
      header: t('Commitment'),
      cell: (c) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-ink-900">{c.subject}</p>
          <p className="mt-0.5 line-clamp-1 text-[0.6875rem] text-ink-500">
            <span className="font-semibold text-ink-600">{c.status}</span> · {c.basis}
          </p>
        </div>
      ),
      sortValue: (c) => c.subject,
      searchValue: (c) => `${c.subject} ${c.status} ${c.basis}`,
      exportValue: (c) => c.subject,
      width: 'minmax(19rem,2.5fr)',
    },
    ...(cityWide
      ? [
          {
            id: 'ward',
            header: t('Ward'),
            cell: (c: WardCommitment) => (
              <span className="text-ink-700">
                {wardShortName(c.wardId)}
                {c.wardCount > 1 ? <span className="text-ink-400"> +{c.wardCount - 1}</span> : null}
              </span>
            ),
            sortValue: (c: WardCommitment) => wardShortName(c.wardId),
            hideBelow: 'lg' as const,
          },
        ]
      : []),
    {
      id: 'committed',
      header: t('Committed'),
      cell: (c) => <span className="text-ink-700">{formatDate(c.committedAt)}</span>,
      sortValue: (c) => c.committedAt,
      hideBelow: 'md',
    },
    {
      id: 'value',
      header: t('Value'),
      cell: (c) =>
        typeof c.valueCrore === 'number' ? formatCrore(c.valueCrore) : <span className="text-ink-400">{t('Not costed')}</span>,
      sortValue: (c) => c.valueCrore ?? -1,
      exportValue: (c) => c.valueCrore ?? null,
      align: 'right',
    },
    {
      id: 'standing',
      header: t('Standing'),
      cell: (c) => (
        <Badge tone={STANDING_TONE[c.standing]} size="sm">
          {COMMITMENT_STANDING_LABEL[c.standing]}
        </Badge>
      ),
      sortValue: (c) => COMMITMENT_STANDING_LABEL[c.standing],
      exportValue: (c) => COMMITMENT_STANDING_LABEL[c.standing],
    },
    {
      id: 'age',
      header: t('Age'),
      cell: (c) => (
        <span className={c.standing === 'unactioned' ? 'font-semibold text-crit-600' : 'text-ink-600'}>
          {formatRelative(c.committedAt)}
        </span>
      ),
      sortValue: (c) => c.ageDays,
      exportValue: (c) => c.ageDays,
      align: 'right',
    },
  ]

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('Wards & Localities')}
        breadcrumbs={BREADCRUMBS}
        freshness={freshness}
        controls={
          <div className="flex flex-wrap items-center gap-2">
            <MapPin className="h-3.5 w-3.5 text-ink-400" aria-hidden />
            <Select
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              options={[
                {
                  value: CITY_SCOPE,
                  label:
                    ledger.scope.wardsCovered > 0
                      ? `City-wide (${ledger.scope.wardsCovered} wards)`
                      : 'No authorised wards',
                },
                ...wards.map((w) => ({ value: w.id, label: w.label })),
              ]}
              className="w-auto min-w-[16rem]"
              aria-label={t('Select ward')}
            />
            <StateBadge state={summary.state} />
            <span className="text-[0.6875rem] text-ink-400">
              {cityWide
                ? 'Each matter counted once across the wards it names.'
                : `Commitments naming ${summary.wardLabel}.`}
            </span>
          </div>
        }
      />

      <DemonstrationNotice />

      <Card tone="info" className="flex items-start gap-3">
        <Landmark className="mt-0.5 h-4 w-4 shrink-0 text-govt-600" aria-hidden />
        <div className="min-w-0">
          <p className="text-[0.8125rem] font-semibold text-govt-800">
            {t('The accountability gap that belongs to neither wing, read at the unit it is asked about')}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-ink-600">
            {t('The Council register establishes that a matter the house has passed and the administration has not acted on is nobody&apos;s alone - the corporation resolved, and the corporation did not deliver. That gap is visible city-wide but not ward by ward, which is the unit a corporator asks about in the General Body. This page joins the deliberative record to the delivery record so the answer is one reading rather than four. A commitment appears here only where the source record names a ward: {0} commitments carried for the whole corporation - {1} resolutions, {2} works and {3} decision cases - are excluded by construction rather than overlooked, and belong to the city-wide registers they came from.', excluded.total, excluded.resolutions, excluded.projects, excluded.decisions)}
          </p>
        </div>
      </Card>

      {summary.made === 0 ? (
        <Card>
          <EmptyState
            title={t('No ward-named commitments on record')}
            detail="No resolution, capital work, decision case or capital allocation within your authorised ward scope names a ward. Commitments made for the whole corporation are held in the registers they originate from."
          />
        </Card>
      ) : (
        <>
          <MetricGrid columns={4}>
            <MetricCard
              label={t('Open commitments')}
              value={open}
              support={t('{0} of {1} delivered · {2} under way', summary.delivered, summary.made, summary.inProgress)}
              icon={<ClipboardList className="h-4 w-4" />}
              origin="derived-metric"
            />
            <MetricCard
              label={t('Unactioned')}
              value={summary.unactioned}
              support={
                summary.overdue > 0
                  ? `A further ${summary.overdue} started and running late`
                  : 'No further commitment is running late'
              }
              tone={summary.unactioned > 0 ? 'critical' : 'positive'}
              icon={<Gavel className="h-4 w-4" />}
              explanation={`Carried or sanctioned, the time in which something should have begun has passed, and nothing has begun at all. Held apart from "overdue", where work did start and is simply late. For a resolution the administrative window is ${RESOLUTION_ACTION_WINDOW_DAYS} days from the date the house decided.`}
            />
            <MetricCard
              label={t('Committed, not delivered')}
              value={formatCrore(summary.valueOutstandingCrore)}
              support={t('{0} delivered of {1} committed', formatCrore(summary.valueDeliveredCrore), formatCrore(summary.valueCommittedCrore))}
              tone={summary.valueOutstandingCrore > summary.valueDeliveredCrore ? 'warn' : 'positive'}
              icon={<HandCoins className="h-4 w-4" />}
            />
            <MetricCard
              label={t('Oldest unactioned')}
              value={summary.oldestUnactionedDays}
              unit=" days"
              support={
                summary.oldestUnactionedRef
                  ? `${summary.oldestUnactionedRef} · mean ${summary.meanUnactionedAgeDays} days across all unactioned`
                  : 'No commitment is currently unactioned'
              }
              tone={summary.oldestUnactionedDays > 180 ? 'critical' : summary.oldestUnactionedDays > 90 ? 'warn' : 'positive'}
              icon={<Timer className="h-4 w-4" />}
              explanation="The accountability figure. Not how many commitments are outstanding, but how long the longest-standing one has sat with nothing done - which is the figure a corporator will quote back across the table."
            />
          </MetricGrid>

          <p className="text-[0.6875rem] leading-relaxed text-ink-500">
            {t('The money figures cover resolutions, capital works and decision cases. The ward capital allocation line is deliberately left out of them: it is an aggregate over the very works listed individually beside it, and adding it would count the same rupee twice. It stays in the ledger below because a ward holding a sanctioned allocation against which nothing has been drawn is precisely the position a corporator is entitled to see.')}
          </p>

          {/* Two columns. The ledger itself — every commitment naming this
              scope, longest-standing failure first — carries the width. The
              ward ranking and what became of each commitment read beside it,
              which is the order a corporator asks the question in. */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
            <div className="flex min-w-0 flex-col gap-4 xl:col-span-8">
            <Card flush>
                <CardHeader
                  bordered
                  icon={<Gavel className="h-4 w-4" />}
                  title={t('Commitment ledger')}
                description={t('Every commitment naming this scope, longest-standing failure first. Each row states the register it came from and the basis on which its standing was derived.')}
                actions={
                  <div className="flex flex-wrap items-center gap-2">
                    <Select
                      value={kindFilter}
                      onChange={(e) => setKindFilter(e.target.value as CommitmentKind | '')}
                      options={[
                        { value: '', label: t('All registers') },
                        ...(Object.keys(COMMITMENT_KIND_LABEL) as CommitmentKind[]).map((k) => ({
                          value: k,
                          label: COMMITMENT_KIND_LABEL[k],
                        })),
                      ]}
                      className="w-auto"
                      aria-label={t('Filter by register')}
                    />
                    <Select
                      value={standingFilter}
                      onChange={(e) => setStandingFilter(e.target.value as CommitmentStanding | '')}
                      options={[
                        { value: '', label: t('All standings') },
                        ...STANDINGS.map((s) => ({ value: s, label: COMMITMENT_STANDING_LABEL[s] })),
                      ]}
                      className="w-auto"
                      aria-label={t('Filter by standing')}
                    />
                  </div>
                }
              />
              {filtered.length === 0 ? (
                <EmptyState
                  title={t('No commitments match the current filters')}
                  detail="Clear a filter to widen the ledger."
                />
              ) : (
                <DataTable
                  rows={filtered}
                  columns={columns}
                  rowKey={(c) => c.id}
                  pageSize={15}
                  searchable
                  searchPlaceholder="Search reference, subject or basis"
                  exportName={`Ward commitments - ${summary.wardLabel}`}
                  exportFilters={{
                    Ward: summary.wardLabel,
                    Register: kindFilter ? COMMITMENT_KIND_LABEL[kindFilter] : 'All registers',
                    Standing: standingFilter ? COMMITMENT_STANDING_LABEL[standingFilter] : 'All standings',
                  }}
                  ariaLabel="Ward commitments ledger"
                />
              )}
            </Card>
            </div>

            <div className="flex min-w-0 flex-col gap-4 xl:col-span-4">
              <Card flush className="flex min-w-0 flex-col">
                <CardHeader
                  bordered
                  icon={<ClipboardList className="h-4 w-4" />}
                  title={rankMetric === 'unactioned' ? 'Wards by unactioned commitments' : 'Wards by value undelivered'}
                  description={t('Ranked across every ward within your authorised scope, whichever ward is selected above.')}
                  actions={
                    <SegmentedControl<RankMetric>
                      value={rankMetric}
                      onChange={setRankMetric}
                      ariaLabel="Rank wards by"
                      options={[
                        { value: 'unactioned', label: t('Unactioned') },
                        { value: 'outstanding', label: t('Value undelivered') },
                      ]}
                    />
                  }
                />
                {ranked.length === 0 ? (
                  <EmptyState
                    title={rankMetric === 'unactioned' ? 'No ward carries an unactioned commitment' : 'Nothing committed stands undelivered'}
                    detail="Every commitment naming a ward within your authorised scope has either been delivered or is running within its expected period."
                  />
                ) : (
                  <div className="px-4 py-4" style={{ height: Math.max(220, ranked.length * 27) }}>
                    <RankedBarChart
                      data={ranked.map((w) => ({
                        label: wardShortName(w.wardId),
                        value: rankMetric === 'unactioned' ? w.unactioned : w.valueOutstandingCrore,
                      }))}
                      unit={rankMetric === 'unactioned' ? '' : ' Cr'}
                    />
                  </div>
                )}
              </Card>

              <Card flush className="flex min-w-0 flex-col">
                <CardHeader
                  bordered
                  icon={<Scale className="h-4 w-4" />}
                  title={t('What became of them')}
                  description={t('Every commitment on this reading, by standing. {0}.', summary.wardLabel)}
                />
                <ul className="divide-y divide-ink-100">
                  {STANDINGS.map((standing) => {
                    const count =
                      standing === 'delivered'
                        ? summary.delivered
                        : standing === 'in-progress'
                          ? summary.inProgress
                          : standing === 'overdue'
                            ? summary.overdue
                            : summary.unactioned
                    const share = summary.made > 0 ? Math.round((count / summary.made) * 100) : 0
                    return (
                      <li key={standing} className="flex items-center gap-2.5 px-4 py-2.5">
                        <Badge tone={STANDING_TONE[standing]} size="sm">
                          {COMMITMENT_STANDING_LABEL[standing]}
                        </Badge>
                        <span className="min-w-0 flex-1 truncate text-[0.6875rem] text-ink-500">
                          {standing === 'unactioned'
                            ? 'Nothing has started at all'
                            : standing === 'overdue'
                              ? 'Started and past its expected date'
                              : standing === 'in-progress'
                                ? 'Under way and within its period'
                                : 'Recorded as done'}
                        </span>
                        <span className="numeric text-xs font-semibold text-ink-900">{count}</span>
                        <span className="numeric w-9 shrink-0 text-right text-[0.6875rem] text-ink-400">{share}%</span>
                      </li>
                    )
                  })}
                </ul>
                <p className="border-t border-ink-100 px-4 py-3 text-[0.6875rem] leading-relaxed text-ink-500">
                  {t('A resolution carries no commencement signal of its own, so it can only stand as delivered, within its administrative window, or unactioned. Capital works and decision cases carry a start and a due date, and are the only registers here that can be shown as overdue.')}
                </p>
              </Card>

            </div>
          </div>
        </>
      )}
    </PageBody>
  )
}

export default WardCommitmentsPage
