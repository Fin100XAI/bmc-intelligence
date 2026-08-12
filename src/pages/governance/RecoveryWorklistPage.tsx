import { useMemo, useState } from 'react'
import { AlertTriangle, ArrowRightLeft, Gavel, Scale } from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import { useServiceAction, useServiceQuery } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { reconciliationService } from '@/services'
import { ROUTES } from '@/config/navigation'
import { WARDS, wardName } from '@/data/reference'
import { isoFromAnchor } from '@/utils/deterministic'
import { formatDate, formatNumber, formatPercent, formatRelative, formatRupees } from '@/utils/format'
import type { User } from '@/types/organisation'
import type {
  AssessmentException,
  ExceptionStatus,
  NoActionReason,
} from '@/types/revenue-reconciliation'
import {
  ASSESSMENT_STATUS_LABEL,
  ASSESSMENT_USAGE_LABEL,
  EXCEPTION_STATUS_LABEL,
  MATCH_SIGNAL_LABEL,
  NO_ACTION_REASON_LABEL,
  REGISTRY_LABEL,
  REGISTRY_SHORT_LABEL,
  RULE_TIER_LABEL,
} from '@/types/revenue-reconciliation'
import {
  Badge,
  Button,
  Card,
  CardHeader,
  DataTable,
  DefinitionList,
  DefinitionRow,
  DemonstrationNotice,
  EmptyState,
  ErrorState,
  Input,
  Label,
  LinkButton,
  LoadingState,
  MetricGrid,
  Modal,
  ProgressBar,
  Select,
  Tabs,
  Textarea,
  type Column,
} from '@/components/ui'
import { ConfidenceBadge, SeverityBadge } from '@/components/ui/badges'
import { MetricCard } from '@/components/cards'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/**
 * src/pages/governance/RecoveryWorklistPage.tsx
 *
 * The officer worklist - where a cross-register disagreement stops being an
 * analytical finding and becomes a piece of work with a name against it.
 *
 * Three things on this screen are deliberate and should not be tidied away.
 *
 * The CAVEAT is rendered before the register, not beneath it. Everything below
 * is a review candidate: an assessor opening this screen has to read what the
 * platform is and is not asserting before they read a single address.
 *
 * The LAWFUL EXPLANATIONS for the rule sit directly above the action panel in
 * the detail view, so an officer sees the reasons this candidate might be
 * entirely proper at the moment they decide what to do about it - not buried
 * in a rule catalogue on another screen.
 *
 * CLOSING WITHOUT ACTION is presented as an equal outcome, in the same visual
 * weight as recording a revised demand. It is the outcome that keeps published
 * rule precision honest, and a queue that makes closure feel like failure
 * produces assessors who quietly stop closing anything.
 */

const FRESHNESS = {
  generatedAt: isoFromAnchor(0),
  sourceObservedAt: isoFromAnchor(-2880),
  refreshIntervalMinutes: 1440,
  origin: 'derived-metric' as const,
  sourceState: 'operational' as const,
  stale: false,
}

/** Bound at module scope so the mutation identity is stable across renders. */
const assignAction = (user: User, id: string, assigneeId: string, note: string) =>
  reconciliationService.assign(user, id, assigneeId, note)
const verifyAction = (user: User, id: string, note: string) => reconciliationService.beginVerification(user, id, note)
const reviseAction = (user: User, id: string, value: number, note: string) =>
  reconciliationService.recordRevision(user, id, value, note)
const recoverAction = (user: User, id: string, value: number, note: string) =>
  reconciliationService.recordRecovery(user, id, value, note)
const closeAction = (user: User, id: string, reason: NoActionReason, note: string) =>
  reconciliationService.closeNoAction(user, id, reason, note)
const disputeAction = (user: User, id: string, note: string) => reconciliationService.raiseDispute(user, id, note)
const confirmMatchAction = (user: User, id: string, note: string) => reconciliationService.confirmMatch(user, id, note)
const dismissMatchAction = (user: User, id: string, note: string) => reconciliationService.dismissMatch(user, id, note)

const STATUS_TONE: Record<ExceptionStatus, 'neutral' | 'info' | 'warn' | 'positive' | 'critical' | 'risk'> = {
  raised: 'neutral',
  assigned: 'info',
  'field-verification': 'warn',
  disputed: 'risk',
  'demand-revised': 'positive',
  recovered: 'positive',
  'closed-no-action': 'neutral',
}

type WorklistTab = 'worklist' | 'match-queue' | 'decided'

type PendingAction =
  | 'assign'
  | 'verify'
  | 'revise'
  | 'recover'
  | 'close'
  | 'dispute'
  | 'confirm-match'
  | 'dismiss-match'

export function RecoveryWorklistPage(): React.JSX.Element {
  const [tab, setTab] = useState<WorklistTab>('worklist')
  const [wardFilter, setWardFilter] = useState('all')
  const [openId, setOpenId] = useState<string | null>(null)

  const filters = useMemo(
    () => ({
      wardId: wardFilter === 'all' ? undefined : wardFilter,
      worklistOnly: tab === 'worklist',
      matchQueueOnly: tab === 'match-queue',
      openOnly: tab !== 'decided',
      status: tab === 'decided' ? (['demand-revised', 'recovered', 'closed-no-action'] as ExceptionStatus[]) : undefined,
      pageSize: 400,
    }),
    [tab, wardFilter],
  )

  const listQuery = useServiceQuery(queryKeys.reconciliation(`list:${JSON.stringify(filters)}`), (user) =>
    reconciliationService.exceptions(user, filters),
  )
  const summaryQuery = useServiceQuery(queryKeys.reconciliation(`summary:${wardFilter}`), (user) =>
    reconciliationService.summary(user, wardFilter === 'all' ? undefined : wardFilter),
  )

  const rows = listQuery.data?.items ?? []
  const summary = summaryQuery.data
  // The table sorts and searches client-side, so it needs the whole section in
  // hand. If a corporation ever carries more candidates than one page holds,
  // say so on the screen rather than quietly showing a prefix: a register that
  // silently truncates reads as a complete register, which is worse than an
  // obviously partial one.
  const truncated = listQuery.data ? listQuery.data.total > rows.length : false

  const columns: Array<Column<AssessmentException>> = [
    {
      id: 'reference',
      header: t('Reference'),
      cell: (r) => <span className="font-mono text-[0.6875rem] text-ink-500">{r.reference}</span>,
      sortValue: (r) => r.reference,
      searchValue: (r) => `${r.reference} ${r.addressLine} ${r.locality} ${r.counterpartReference}`,
      width: '9rem',
    },
    {
      id: 'tier',
      header: t('Tier'),
      cell: (r) => <Badge tone={r.tier === 1 ? 'critical' : r.tier === 2 ? 'warn' : 'neutral'}>T{r.tier}</Badge>,
      sortValue: (r) => r.tier,
      width: '4rem',
    },
    {
      id: 'address',
      header: t('Property'),
      cell: (r) => (
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-ink-800">{r.addressLine}</p>
          <p className="mt-0.5 truncate text-[0.625rem] text-ink-500">
            {wardName(r.wardId)} · {r.parcelAssessmentNumber ?? 'No assessment record matched'}
          </p>
        </div>
      ),
      sortValue: (r) => r.addressLine,
      width: '20rem',
    },
    {
      id: 'counterpart',
      header: t('Disagrees with'),
      cell: (r) => <Badge tone="neutral">{REGISTRY_SHORT_LABEL[r.counterpartSource]}</Badge>,
      sortValue: (r) => r.counterpartSource,
      hideBelow: 'lg',
    },
    {
      id: 'match',
      header: t('Match'),
      cell: (r) => (
        <div className="flex items-center gap-2">
          <span className={`numeric text-xs ${r.match.belowFloor ? 'font-semibold text-warn-700' : 'text-ink-700'}`}>
            {formatPercent(r.match.score, 0)}
          </span>
          {r.match.belowFloor ? <Badge tone="warn">{t('Below floor')}</Badge> : null}
        </div>
      ),
      sortValue: (r) => r.match.score,
      align: 'right',
      width: '9rem',
    },
    {
      id: 'value',
      header: t('Indicative annual value'),
      cell: (r) => <span className="numeric font-medium text-ink-800">{formatRupees(r.indicativeAnnualValue)}</span>,
      sortValue: (r) => r.indicativeAnnualValue,
      exportValue: (r) => r.indicativeAnnualValue,
      align: 'right',
    },
    {
      id: 'severity',
      header: t('Severity'),
      cell: (r) => <SeverityBadge severity={r.severity} />,
      sortValue: (r) => r.severity,
      hideBelow: 'md',
    },
    {
      id: 'status',
      header: t('Status'),
      cell: (r) => <Badge tone={STATUS_TONE[r.status]}>{EXCEPTION_STATUS_LABEL[r.status]}</Badge>,
      sortValue: (r) => r.status,
    },
    {
      id: 'assignee',
      header: t('Assigned to'),
      cell: (r) => (r.assigneeName ? <span className="text-xs text-ink-700">{r.assigneeName}</span> : <span className="text-ink-300">{t('Unassigned')}</span>),
      sortValue: (r) => r.assigneeName ?? '',
      hideBelow: 'lg',
    },
    {
      id: 'raised',
      header: t('Raised'),
      cell: (r) => <span className="text-[0.6875rem] text-ink-500">{formatRelative(r.raisedAt)}</span>,
      sortValue: (r) => r.raisedAt,
      optional: true,
    },
  ]

  const wardOptions = useMemo(
    () => [{ value: 'all', label: t('All wards in scope') }, ...WARDS.map((w) => ({ value: w.id, label: w.name }))],
    [],
  )

  const isLoading = listQuery.isLoading || summaryQuery.isLoading
  const error = listQuery.error ?? summaryQuery.error

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('Governance & Finance')}
        title={t('Assessment Recovery Worklist')}
        description={t('Assessment review candidates raised where two municipal registers disagree about the same property. Each row is a candidate for verification by a named officer, not a finding - and closing one without action, with a recorded reason, is an equal outcome to revising a demand.')}
        breadcrumbs={[{ label: t('Governance & Finance') }, { label: t('Assessment Recovery Worklist') }]}
        freshness={FRESHNESS}
        actions={
          <LinkButton to={ROUTES.reconciliation} variant="outline" icon={<Scale className="h-3.5 w-3.5" />}>
            {t('Rule catalogue & precision')}
          </LinkButton>
        }
        controls={
          <Select
            aria-label={t('Filter by ward')}
            value={wardFilter}
            onChange={(e) => setWardFilter(e.target.value)}
            options={wardOptions}
            className="w-auto"
          />
        }
      />

      <Card tone="warn">
        <CardHeader
          icon={<AlertTriangle className="h-4 w-4" />}
          title={t('What every row on this screen is, and what it is not')}
          description={t('An assessment review candidate is raised where two of the corporation\'s own registers disagree about one property. It is not a finding, not an allegation, and makes no assertion that anybody has under-declared, evaded or misrepresented anything. There are lawful explanations for every rule in the catalogue; they are listed against the rule and offered as closure reasons. No demand is revised by this platform - a named officer verifies the candidate and the statutory assessment process, with notice and hearing, follows unchanged.')}
        />
      </Card>

      {isLoading ? <LoadingState variant="metrics" /> : null}
      {error ? (
        <ErrorState
          detail={error.message}
          onRetry={() => {
            void listQuery.refetch()
            void summaryQuery.refetch()
          }}
        />
      ) : null}

      {!isLoading && !error && summary ? (
        <>
          <Card>
            <CardHeader
              title={t('Recovery position')}
              description={t('Across {0} parcels of the assessment register within your authorised scope.', formatNumber(summary.sampledParcels))}
            />
            <MetricGrid columns={5} className="mt-4">
              <MetricCard
                label={t('Open on the worklist')}
                value={formatNumber(summary.onWorklist)}
                support={t('{0} candidates raised in total', formatNumber(summary.raised))}
              />
              <MetricCard
                label={t('Indicative annual value')}
                value={formatRupees(summary.indicativeValue)}
                support={t('Modelled estimate across every candidate raised')}
                explanation="An estimate used to prioritise the queue. It is not an amount owed by anybody, and no demand is raised from it without verification by a named officer."
              />
              <MetricCard
                label={t('Annual demand revised')}
                value={formatRupees(summary.revisedValue)}
                support={t('{0} candidates verified and upheld', formatNumber(summary.upheld))}
              />
              <MetricCard label={t('Collected against revision')} value={formatRupees(summary.recoveredValue)} />
              <MetricCard
                label={t('Conversion rate')}
                value={summary.conversionPct === null ? 'No data yet' : formatPercent(summary.conversionPct)}
                support={t('of {0} candidates decided either way', formatNumber(summary.terminal))}
                explanation="Candidates that produced a revised demand, as a share of every candidate an officer has decided. Candidates closed for a lawful reason are counted in the denominator - this is a conversion rate, not a measure of whether the rule was right."
              />
            </MetricGrid>
          </Card>

          <Card flush>
            <CardHeader
              bordered
              title={t('Candidates')}
              description={t('Sortable, searchable and exportable. Open a row to see both source records, the published match evidence, and the actions available at this point in the lifecycle.')}
            />
            <div className="px-4 pt-3">
              <Tabs
                ariaLabel="Worklist sections"
                value={tab}
                onChange={(id) => setTab(id as WorklistTab)}
                items={[
                  { id: 'worklist', label: t('Officer worklist'), count: summary.onWorklist },
                  { id: 'match-queue', label: t('Match review queue'), count: summary.inMatchQueue },
                  { id: 'decided', label: t('Decided'), count: summary.terminal },
                ]}
              />
            </div>

            {tab === 'match-queue' ? (
              <p className="border-b border-ink-100 bg-warn-50/50 px-4 py-3 text-xs leading-relaxed text-ink-600">
                {t('These records could not be matched to a parcel with enough confidence for the engine to raise a candidate on its own. Municipal registers share no common property identifier, so where the published signals do not agree strongly enough the decision belongs to an officer who knows the locality - and is recorded against their name rather than absorbed into a score.')}
              </p>
            ) : null}

            <DataTable
              rows={rows}
              columns={columns}
              rowKey={(r) => r.id}
              pageSize={12}
              stickyHeader
              maxHeight="30rem"
              searchPlaceholder="Search by reference, address or locality"
              exportName="assessment-review-candidates"
              exportFilters={{ ward: wardFilter, section: tab }}
              onRowClick={(r) => setOpenId(r.id)}
              activeRowKey={openId ?? undefined}
              toolbar={
                truncated ? (
                  <Badge tone="warn">
                    {t('Showing {0} of {1} - narrow by ward', formatNumber(rows.length), formatNumber(listQuery.data?.total ?? 0))}
                  </Badge>
                ) : undefined
              }
              emptyTitle={t('No candidates in this section')}
              emptyDetail={
                tab === 'match-queue'
                  ? 'Every record in scope matched a parcel above the confidence floor.'
                  : 'No assessment review candidates are open within your authorised scope.'
              }
              initialSort={{ columnId: 'value', direction: 'desc' }}
              ariaLabel="Assessment review candidates"
            />
          </Card>
        </>
      ) : null}

      {!isLoading && !error && summary && summary.raised === 0 ? (
        <EmptyState
          title={t('No assessment review candidates')}
          detail="No cross-register disagreements were raised within your authorised ward scope."
        />
      ) : null}

      <CandidateDetail id={openId} onClose={() => setOpenId(null)} />

      <DemonstrationNotice />
    </PageBody>
  )
}

/* ---------------------------------------------------------------------------
 * Candidate detail
 * ------------------------------------------------------------------------- */

function CandidateDetail({ id, onClose }: { id: string | null; onClose: () => void }): React.JSX.Element | null {
  const [pending, setPending] = useState<PendingAction | null>(null)
  const [note, setNote] = useState('')
  const [assigneeId, setAssigneeId] = useState('')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState<NoActionReason | ''>('')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const detailQuery = useServiceQuery(
    queryKeys.reconciliation(`detail:${id ?? 'none'}`),
    (user) => reconciliationService.detail(user, id as string),
    { enabled: Boolean(id) },
  )
  // Read from the reconciliation service rather than the generic task roster:
  // this list is filtered by who actually holds authority over an assessment
  // record, so the dropdown cannot offer an officer the service would refuse.
  const officersQuery = useServiceQuery(queryKeys.reconciliation('assignable'), (user) =>
    reconciliationService.assignableOfficers(user),
  )

  const invalidate = [queryKeys.reconciliation()]
  const assign = useServiceAction(assignAction, invalidate)
  const verify = useServiceAction(verifyAction, invalidate)
  const revise = useServiceAction(reviseAction, invalidate)
  const recover = useServiceAction(recoverAction, invalidate)
  const close = useServiceAction(closeAction, invalidate)
  const dispute = useServiceAction(disputeAction, invalidate)
  const confirmMatch = useServiceAction(confirmMatchAction, invalidate)
  const dismissMatch = useServiceAction(dismissMatchAction, invalidate)

  if (!id) return null

  const data = detailQuery.data
  const exception = data?.exception

  const reset = (): void => {
    setPending(null)
    setNote('')
    setAmount('')
    setReason('')
    setActionError(null)
  }

  const handleClose = (): void => {
    reset()
    onClose()
  }

  const run = async (): Promise<void> => {
    if (!exception || !pending) return
    setBusy(true)
    setActionError(null)
    try {
      switch (pending) {
        case 'assign':
          if (!assigneeId) throw new Error('Nominate the officer this candidate is assigned to.')
          await assign(exception.id, assigneeId, note)
          break
        case 'verify':
          await verify(exception.id, note)
          break
        case 'revise':
          await revise(exception.id, Number(amount), note)
          break
        case 'recover':
          await recover(exception.id, Number(amount), note)
          break
        case 'close':
          if (!reason) throw new Error('Record the reason this candidate is not carried forward.')
          await close(exception.id, reason, note)
          break
        case 'dispute':
          await dispute(exception.id, note)
          break
        case 'confirm-match':
          await confirmMatch(exception.id, note)
          break
        case 'dismiss-match':
          await dismissMatch(exception.id, note)
          break
      }
      reset()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={handleClose}
      width="lg"
      title={exception ? `${exception.reference} · ${data?.rule.title ?? ''}` : 'Assessment review candidate'}
      description={exception ? `${exception.addressLine} · ${wardName(exception.wardId)}` : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={handleClose}>
            {t('Close')}
          </Button>
        </>
      }
    >
      {detailQuery.isLoading ? <LoadingState variant="block" /> : null}
      {detailQuery.error ? <ErrorState detail={detailQuery.error.message} onRetry={() => void detailQuery.refetch()} /> : null}

      {data && exception ? (
        <div className="space-y-5">
          {/* --- The rule ------------------------------------------------- */}
          <section>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={exception.tier === 1 ? 'critical' : exception.tier === 2 ? 'warn' : 'neutral'}>
                {RULE_TIER_LABEL[exception.tier]}
              </Badge>
              <Badge tone={STATUS_TONE[exception.status]}>{EXCEPTION_STATUS_LABEL[exception.status]}</Badge>
              <SeverityBadge severity={exception.severity} />
              <ConfidenceBadge confidence={exception.confidence} />
            </div>
            <p className="mt-3 text-[0.8125rem] leading-relaxed text-ink-700">{data.rule.definition}</p>
            <p className="mt-2 text-xs leading-relaxed text-ink-500">{data.rule.rationale}</p>
          </section>

          {/* --- The two source records ----------------------------------- */}
          <section>
            <h3 className="text-xs font-semibold tracking-wide text-ink-600 uppercase">{t('The two records that disagree')}</h3>
            <div className="mt-2 grid grid-cols-1 gap-3 lg:grid-cols-2">
              <Card tone="default">
                <CardHeader title={t('Property Assessment Register')} />
                {data.parcel ? (
                  <DefinitionList className="mt-2">
                    <DefinitionRow label={t('Assessment no.')} mono>{data.parcel.assessmentNumber}</DefinitionRow>
                    <DefinitionRow label={t('Survey no.')} mono>{data.parcel.surveyNumber}</DefinitionRow>
                    <DefinitionRow label={t('Address')}>{data.parcel.addressLine}</DefinitionRow>
                    <DefinitionRow label={t('Owner')}>{data.parcel.ownerLabel}</DefinitionRow>
                    <DefinitionRow label={t('Usage')}>{ASSESSMENT_USAGE_LABEL[data.parcel.usage]}</DefinitionRow>
                    <DefinitionRow label={t('Status')}>{ASSESSMENT_STATUS_LABEL[data.parcel.status]}</DefinitionRow>
                    <DefinitionRow label={t('Assessed area')}>{t('{0} m²', formatNumber(data.parcel.assessedAreaSqm))}</DefinitionRow>
                    <DefinitionRow label={t('Rateable value')}>{formatRupees(data.parcel.rateableValue)}</DefinitionRow>
                    <DefinitionRow label={t('Annual demand')}>{formatRupees(data.parcel.annualDemand)}</DefinitionRow>
                    <DefinitionRow label={t('Last assessed')}>{formatDate(data.parcel.lastAssessedAt)}</DefinitionRow>
                    {data.parcel.exemptionGround ? (
                      <DefinitionRow label={t('Exemption ground')}>{data.parcel.exemptionGround}</DefinitionRow>
                    ) : null}
                  </DefinitionList>
                ) : (
                  <p className="mt-3 text-xs leading-relaxed text-ink-500">
                    {t('No parcel on the assessment register matched this record above the confidence floor. That is the disagreement: the corporation is supplying a service to a property its assessment register does not appear to hold.')}
                  </p>
                )}
              </Card>

              <Card tone="default">
                <CardHeader title={REGISTRY_LABEL[data.counterpart.source]} />
                <DefinitionList className="mt-2">
                  <DefinitionRow label={t('Reference')} mono>{data.counterpart.reference}</DefinitionRow>
                  <DefinitionRow label={t('Survey no.')} mono>{data.counterpart.surveyNumber ?? 'Not carried on this register'}</DefinitionRow>
                  <DefinitionRow label={t('Address')}>{data.counterpart.addressLine}</DefinitionRow>
                  <DefinitionRow label={t('Owner')}>{data.counterpart.ownerLabel}</DefinitionRow>
                  <DefinitionRow label={t('Issued')}>{formatDate(data.counterpart.issuedAt)}</DefinitionRow>
                  {data.counterpart.attributes.map((attribute) => (
                    <DefinitionRow key={attribute.label} label={attribute.label}>
                      {attribute.value}
                    </DefinitionRow>
                  ))}
                </DefinitionList>
              </Card>
            </div>
          </section>

          {/* --- Match evidence ------------------------------------------- */}
          <section>
            <h3 className="text-xs font-semibold tracking-wide text-ink-600 uppercase">
              {t('Why the engine believes these are the same property')}
            </h3>
            <div className="mt-2 flex items-center gap-3">
              <ProgressBar
                value={exception.match.score}
                tone={exception.match.belowFloor ? 'risk' : exception.match.score >= 85 ? 'positive' : 'warn'}
                className="max-w-xs"
                label={t('Match score')}
                showValue
              />
              {exception.match.belowFloor ? (
                <Badge tone="warn">{t('Below the confidence floor - officer confirmation required')}</Badge>
              ) : null}
            </div>
            <table className="mt-3 w-full text-left text-[0.6875rem]">
              <thead className="text-ink-500">
                <tr>
                  <th className="py-1 pr-2 font-medium">{t('Signal')}</th>
                  <th className="py-1 pr-2 font-medium">{t('Assessment register')}</th>
                  <th className="py-1 pr-2 font-medium">{t('Counterpart register')}</th>
                  <th className="py-1 pr-2 text-right font-medium">{t('Agreement')}</th>
                  <th className="py-1 text-right font-medium">{t('Weight')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-50">
                {exception.match.evidence.map((e) => (
                  <tr key={e.signal}>
                    <td className="py-1.5 pr-2 text-ink-700">{MATCH_SIGNAL_LABEL[e.signal]}</td>
                    <td className="py-1.5 pr-2 break-words text-ink-500">{e.parcelValue}</td>
                    <td className="py-1.5 pr-2 break-words text-ink-500">{e.counterpartValue}</td>
                    <td className="numeric py-1.5 pr-2 text-right text-ink-700">{formatPercent(e.agreement * 100, 0)}</td>
                    <td className="numeric py-1.5 text-right text-ink-500">{formatPercent(e.weight * 100, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[0.6875rem] leading-relaxed text-ink-500">
              {t('Municipal registers share no common property identifier, so a match is a weighted score over published signals rather than a lookup. A signal the counterpart register does not carry at all is excluded from the calculation rather than scored as a disagreement.')}
            </p>
          </section>

          {/* --- Value --------------------------------------------------- */}
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Figure label={t('Indicative annual value')} value={formatRupees(exception.indicativeAnnualValue)} />
            <Figure label={t('Condition persisted')} value={`${exception.persistedYears} year${exception.persistedYears === 1 ? '' : 's'}`} />
            <Figure
              label={t('Revised demand')}
              value={exception.revisedAnnualValue ? formatRupees(exception.revisedAnnualValue) : 'Not revised'}
            />
            <Figure
              label={t('Collected')}
              value={exception.recoveredValue ? formatRupees(exception.recoveredValue) : 'Nothing recorded'}
            />
          </section>

          {/* --- Lawful explanations, immediately above the action panel -- */}
          <Card tone="warn" className="!p-3">
            <h3 className="text-xs font-semibold text-ink-700">
              {t('Lawful reasons this candidate may require no action at all')}
            </h3>
            <ul className="mt-2 space-y-1.5">
              {data.rule.legitimateExplanations.map((explanation) => (
                <li key={explanation} className="flex gap-2 text-[0.6875rem] leading-relaxed text-ink-600">
                  <span aria-hidden className="mt-1 h-1 w-1 shrink-0 rounded-full bg-ink-400" />
                  <span>{explanation}</span>
                </li>
              ))}
            </ul>
          </Card>

          {/* --- Actions -------------------------------------------------- */}
          <ActionPanel
            exception={exception}
            noActionReasons={data.noActionReasons}
            officers={officersQuery.data ?? []}
            pending={pending}
            setPending={(next) => {
              setPending(next)
              setActionError(null)
            }}
            note={note}
            setNote={setNote}
            assigneeId={assigneeId}
            setAssigneeId={setAssigneeId}
            amount={amount}
            setAmount={setAmount}
            reason={reason}
            setReason={setReason}
            busy={busy}
            error={actionError}
            onConfirm={() => void run()}
            onCancel={reset}
          />

          {/* --- History -------------------------------------------------- */}
          <section>
            <h3 className="text-xs font-semibold tracking-wide text-ink-600 uppercase">{t('Record of the candidate')}</h3>
            <ol className="mt-2 space-y-2.5">
              {exception.history.map((event) => (
                <li key={event.id} className="flex gap-3">
                  <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-govt-400" />
                  <div className="min-w-0">
                    <p className="text-[0.6875rem] font-medium text-ink-700">
                      {EXCEPTION_STATUS_LABEL[event.status]} · {event.actorName}
                    </p>
                    <p className="mt-0.5 text-[0.6875rem] leading-relaxed text-ink-500">{event.note}</p>
                    <p className="mt-0.5 text-[0.625rem] text-ink-400">{formatRelative(event.at)}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <p className="border-t border-ink-100 pt-3 text-[0.625rem] leading-relaxed text-ink-500">{exception.caveat}</p>
        </div>
      ) : null}
    </Modal>
  )
}

function Figure({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="rounded-lg border border-ink-100 bg-surface-sunken px-3 py-2">
      <p className="text-[0.625rem] text-ink-500">{label}</p>
      <p className="numeric mt-0.5 text-[0.8125rem] font-semibold text-ink-800">{value}</p>
    </div>
  )
}

/* ---------------------------------------------------------------------------
 * Action panel
 * ------------------------------------------------------------------------- */

interface ActionPanelProps {
  exception: AssessmentException
  noActionReasons: NoActionReason[]
  officers: Array<{ id: string; name: string; designation: string; isSelf: boolean }>
  pending: PendingAction | null
  setPending: (next: PendingAction | null) => void
  note: string
  setNote: (next: string) => void
  assigneeId: string
  setAssigneeId: (next: string) => void
  amount: string
  setAmount: (next: string) => void
  reason: NoActionReason | ''
  setReason: (next: NoActionReason | '') => void
  busy: boolean
  error: string | null
  onConfirm: () => void
  onCancel: () => void
}

/**
 * The actions available at this point in the lifecycle.
 *
 * Deliberately derived from the candidate's own status rather than from a
 * fixed list, so the interface offers exactly what the service would permit -
 * and where it gets that wrong, the service still refuses and records the
 * refusal, because a transition the interface forgot to hide must not become a
 * transition the platform allows.
 */
function availableActions(exception: AssessmentException): PendingAction[] {
  if (exception.match.belowFloor) {
    return exception.status === 'closed-no-action' || exception.status === 'recovered'
      ? []
      : ['confirm-match', 'dismiss-match']
  }
  switch (exception.status) {
    case 'raised':
      return ['assign', 'close']
    case 'assigned':
      return ['verify', 'revise', 'close', 'dispute']
    case 'field-verification':
      return ['revise', 'close', 'dispute']
    case 'disputed':
      return ['revise', 'close']
    case 'demand-revised':
      return ['recover']
    default:
      return []
  }
}

function build$ACTION_LABEL(): Record<PendingAction, string> {
  return {
  assign: t('Assign to an officer'),
  verify: t('Begin field verification'),
  revise: t('Record a revised demand'),
  recover: t('Record a receipt'),
  close: t('Close without action'),
  dispute: t('Record a dispute'),
  'confirm-match': t('Confirm the property match'),
  'dismiss-match': t('Dismiss - different property'),
}
}
let ACTION_LABEL: Record<PendingAction, string> = build$ACTION_LABEL()
registerLayer(() => {
  ACTION_LABEL = build$ACTION_LABEL()
})

function build$ACTION_HELP(): Record<PendingAction, string> {
  return {
  assign: t('The nominated officer sees this candidate on their own worklist and is accountable for deciding it.'),
  verify: t('Records that both source records have been retrieved and verification of the premises has been requested.'),
  revise:
    t('Records that YOU revised the demand in the assessment register under the statutory process. This platform does not revise demands; it records that an authorised officer did.'),
  recover: t('Records a receipt collected against the revised demand.'),
  close:
    t('Records that the candidate is not carried forward, and why. This is an equal outcome to a revision - the reason you record is the sole input to the published precision of this rule.'),
  dispute: t('Records that the occupier has contested the candidate and it has been referred for hearing.'),
  'confirm-match':
    t('Confirms, on your judgement of the locality, that these two records describe the same property - promoting the candidate onto the officer worklist.'),
  'dismiss-match': t('Records that the two records describe different properties. No candidate is carried forward.'),
}
}
let ACTION_HELP: Record<PendingAction, string> = build$ACTION_HELP()
registerLayer(() => {
  ACTION_HELP = build$ACTION_HELP()
})

function ActionPanel(props: ActionPanelProps): React.JSX.Element {
  const { exception, pending, setPending, busy, error, onConfirm, onCancel } = props
  const actions = availableActions(exception)

  if (actions.length === 0) {
    return (
      <Card tone="default" className="!p-3">
        <p className="text-xs leading-relaxed text-ink-600">
          {t('This candidate has been decided and its record is closed. {0}', exception.noActionReason
            ? `Closed without action: ${NO_ACTION_REASON_LABEL[exception.noActionReason]}.`
            : 'Reopening it would be a fresh candidate rather than an edit of this record.')}
        </p>
      </Card>
    )
  }

  return (
    <Card tone="default" className="!p-3">
      <div className="flex items-center gap-2">
        <Gavel className="h-3.5 w-3.5 text-ink-500" aria-hidden />
        <h3 className="text-xs font-semibold text-ink-700">{t('Available actions')}</h3>
      </div>

      <div className="mt-2.5 flex flex-wrap gap-2">
        {actions.map((action) => (
          <Button
            key={action}
            size="xs"
            variant={
              pending === action
                ? 'primary'
                : action === 'close' || action === 'dismiss-match'
                  ? 'outline'
                  : 'secondary'
            }
            onClick={() => setPending(pending === action ? null : action)}
            icon={action === 'confirm-match' ? <ArrowRightLeft className="h-3 w-3" /> : undefined}
          >
            {ACTION_LABEL[action]}
          </Button>
        ))}
      </div>

      {pending ? (
        <div className="mt-3 space-y-3 border-t border-ink-100 pt-3">
          <p className="text-[0.6875rem] leading-relaxed text-ink-600">{ACTION_HELP[pending]}</p>
          <ActionFields {...props} />

          {error ? (
            <p className="rounded-md bg-crit-50 px-2.5 py-2 text-[0.6875rem] leading-relaxed text-crit-700">{error}</p>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
              {t('Cancel')}
            </Button>
            <Button
              size="sm"
              variant={pending === 'close' || pending === 'dismiss-match' ? 'outline' : 'primary'}
              onClick={onConfirm}
              disabled={busy}
            >
              {busy ? 'Recording…' : `Confirm - ${ACTION_LABEL[pending]}`}
            </Button>
          </div>
        </div>
      ) : null}
    </Card>
  )
}

function ActionFields(props: ActionPanelProps): React.JSX.Element {
  const { exception, pending, note, setNote, assigneeId, setAssigneeId, amount, setAmount, reason, setReason, officers, noActionReasons } = props

  return (
    <div className="space-y-3">
      {pending === 'assign' ? (
        <div>
          <Label htmlFor="recon-assignee" required>
            {t('Officer')}
          </Label>
          <Select
            id="recon-assignee"
            value={assigneeId}
            onChange={(e) => setAssigneeId(e.target.value)}
            options={[
              { value: '', label: t('Select an officer') },
              ...officers.map((o) => ({
                value: o.id,
                label: `${o.name} - ${o.designation}${o.isSelf ? ' (yourself)' : ''}`,
              })),
            ]}
          />
        </div>
      ) : null}

      {pending === 'revise' || pending === 'recover' ? (
        <div>
          <Label
            htmlFor="recon-amount"
            required
            hint={
              pending === 'revise'
                ? `indicative estimate ${formatRupees(exception.indicativeAnnualValue)}`
                : exception.revisedAnnualValue
                  ? `revised demand ${formatRupees(exception.revisedAnnualValue)}`
                  : undefined
            }
          >
            {pending === 'revise' ? 'Revised annual demand (₹)' : 'Amount collected (₹)'}
          </Label>
          <Input
            id="recon-amount"
            type="number"
            min={1}
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={String(
              pending === 'revise' ? exception.indicativeAnnualValue : (exception.revisedAnnualValue ?? 0),
            )}
          />
        </div>
      ) : null}

      {pending === 'close' ? (
        <div>
          <Label htmlFor="recon-reason" required>
            {t('Reason this candidate is not carried forward')}
          </Label>
          <Select
            id="recon-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value as NoActionReason | '')}
            options={[
              { value: '', label: t('Select a reason') },
              ...noActionReasons.map((r) => ({ value: r, label: NO_ACTION_REASON_LABEL[r] })),
            ]}
          />
        </div>
      ) : null}

      <div>
        <Label htmlFor="recon-note" hint={t('written to the audit trail')}>
          {t('Note')}
        </Label>
        <Textarea
          id="recon-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder={t('What you found, and on what basis.')}
        />
      </div>
    </div>
  )
}

export default RecoveryWorklistPage
