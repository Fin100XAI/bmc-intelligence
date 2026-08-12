import { useEffect, useMemo, useState } from 'react'
import { FileSpreadsheet, ListChecks, Target } from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import { useServiceAction, useServiceQuery } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { reconciliationService } from '@/services'
import { ROUTES } from '@/config/navigation'
import { isoFromAnchor } from '@/utils/deterministic'
import { formatDateTime, formatNumber, formatPercent, formatRupees } from '@/utils/format'
import type { User } from '@/types/organisation'
import type { PilotMetrics, StatutoryReturn, StatutoryReturnLine } from '@/types/revenue-reconciliation'
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
  LinkButton,
  LoadingState,
  MetricGrid,
  ProgressBar,
  Select,
  type Column,
} from '@/components/ui'
import { MetricCard } from '@/components/cards'
import { t } from '@/i18n'

/**
 * src/pages/governance/RecoveryPilotPage.tsx
 *
 * Two screens' worth of purpose in one place, because they are the same
 * argument at two time horizons.
 *
 * THE PILOT SCORECARD exists because the right first ask of a municipal
 * corporation is deliberately small: one ward, one revenue stream, ninety days,
 * four measurable outputs. A pilot that size sits inside a Commissioner's own
 * administrative approval limit, needs no committee, and produces the only
 * number that funds anything larger.
 *
 * THE STATUTORY RETURN exists because a dashboard is opened when somebody
 * remembers it and a system that produces a filing the corporation is obliged
 * to make is opened because it has to be. Central Finance Commission grants to
 * urban local bodies have carried entry conditions tied to property tax, so
 * this return has to be produced whether or not the platform exists. Producing
 * it here is what turns the platform from something a Commissioner commissioned
 * into something the corporation runs on - and load-bearing systems survive the
 * transfer of the officer who commissioned them.
 *
 * The return is generated on an explicit action rather than on page load. It
 * is an export, it is audited as one, and a filing should never be produced as
 * a side effect of somebody opening a screen.
 */

const FRESHNESS = {
  generatedAt: isoFromAnchor(0),
  sourceObservedAt: isoFromAnchor(-2880),
  refreshIntervalMinutes: 1440,
  origin: 'derived-metric' as const,
  sourceState: 'operational' as const,
  stale: false,
}

const generateReturn = (user: User) => reconciliationService.statutoryReturn(user)

export function RecoveryPilotPage(): React.JSX.Element {
  const [wardId, setWardId] = useState<string>('')
  const [statutory, setStatutory] = useState<StatutoryReturn | null>(null)
  const [returnError, setReturnError] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)

  const wardsQuery = useServiceQuery(queryKeys.reconciliation('pilot-wards'), (user) =>
    reconciliationService.pilotWards(user),
  )
  const candidates = useMemo(() => wardsQuery.data ?? [], [wardsQuery.data])

  // Default to the ward carrying the largest exposure - the one a pilot would
  // actually be scoped on, rather than whichever happens to sort first.
  useEffect(() => {
    if (!wardId && candidates.length > 0) setWardId(candidates[0]!.wardId)
  }, [candidates, wardId])

  const pilotQuery = useServiceQuery(
    queryKeys.reconciliation(`pilot:${wardId}`),
    (user) => reconciliationService.pilot(user, wardId),
    { enabled: Boolean(wardId) },
  )

  const generate = useServiceAction(generateReturn, [queryKeys.reconciliation()])

  const runGenerate = async (): Promise<void> => {
    setGenerating(true)
    setReturnError(null)
    try {
      setStatutory(await generate())
    } catch (err) {
      setReturnError(err instanceof Error ? err.message : String(err))
    } finally {
      setGenerating(false)
    }
  }

  const pilot = pilotQuery.data
  const wardColumns: Array<Column<PilotMetrics>> = [
    {
      id: 'ward',
      header: t('Ward'),
      cell: (r) => <span className="text-xs font-medium text-ink-800">{r.wardLabel}</span>,
      sortValue: (r) => r.wardLabel,
      searchValue: (r) => r.wardLabel,
      width: '14rem',
    },
    {
      id: 'raised',
      header: t('Candidates'),
      cell: (r) => <span className="numeric">{formatNumber(r.raised)}</span>,
      sortValue: (r) => r.raised,
      align: 'right',
    },
    {
      id: 'indicative',
      header: t('Indicative annual value'),
      cell: (r) => <span className="numeric font-medium text-ink-800">{formatRupees(r.indicativeValue)}</span>,
      sortValue: (r) => r.indicativeValue,
      exportValue: (r) => r.indicativeValue,
      align: 'right',
    },
    {
      id: 'verified',
      header: t('Verified'),
      cell: (r) => <span className="numeric">{formatNumber(r.verified)}</span>,
      sortValue: (r) => r.verified,
      align: 'right',
      hideBelow: 'md',
    },
    {
      id: 'revised',
      header: t('Demands revised'),
      cell: (r) => <span className="numeric text-ok-700">{formatNumber(r.demandsRevised)}</span>,
      sortValue: (r) => r.demandsRevised,
      align: 'right',
    },
    {
      id: 'completion',
      header: t('Worked through'),
      cell: (r) => (
        <div className="flex items-center gap-2">
          <ProgressBar value={r.completionPct} className="w-16" size="xs" />
          <span className="numeric text-xs text-ink-700">{formatPercent(r.completionPct, 0)}</span>
        </div>
      ),
      sortValue: (r) => r.completionPct,
      width: '11rem',
      hideBelow: 'lg',
    },
  ]

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('Governance & Finance')}
        title={t('Recovery Pilot & Statutory Return')}
        description={t('Scope a single-ward recovery pilot on four measurable outputs, and generate the property tax return a corporation has to file against Finance Commission grant conditions. A pilot at this size sits inside the Commissioner\'s own administrative approval limit and produces the number that funds anything larger.')}
        breadcrumbs={[{ label: t('Governance & Finance') }, { label: t('Recovery Pilot & Statutory Return') }]}
        freshness={FRESHNESS}
        actions={
          <>
            <LinkButton to={ROUTES.recoveryWorklist} variant="outline" icon={<ListChecks className="h-3.5 w-3.5" />}>
              {t('Open the worklist')}
            </LinkButton>
            <LinkButton to={ROUTES.reconciliation} variant="outline" icon={<Target className="h-3.5 w-3.5" />}>
              {t('Rule catalogue')}
            </LinkButton>
          </>
        }
        controls={
          candidates.length > 0 ? (
            <Select
              aria-label={t('Pilot ward')}
              value={wardId}
              onChange={(e) => setWardId(e.target.value)}
              options={candidates.map((c) => ({
                value: c.wardId,
                label: t('{0} - {1} candidates', c.wardLabel, formatNumber(c.raised)),
              }))}
              className="w-auto"
            />
          ) : undefined
        }
      />

      {wardsQuery.isLoading ? <LoadingState variant="metrics" /> : null}
      {wardsQuery.error ? (
        <ErrorState detail={wardsQuery.error.message} onRetry={() => void wardsQuery.refetch()} />
      ) : null}

      {!wardsQuery.isLoading && !wardsQuery.error && candidates.length === 0 ? (
        <EmptyState
          title={t('No ward carries a review candidate')}
          detail="No cross-register disagreements were raised within your authorised ward scope, so there is nothing to scope a pilot on."
        />
      ) : null}

      {pilot ? (
        <Card tone="default">
          <CardHeader
            icon={<Target className="h-4 w-4" />}
            title={t('Pilot scorecard - {0}', pilot.wardLabel)}
            description={t('One ward, one revenue stream, ninety days. These four measures are the whole of the scorecard: a pilot that reports twelve numbers reports none of them.')}
          />
          <MetricGrid columns={4} className="mt-4">
            <MetricCard
              label={t('Candidates raised')}
              value={formatNumber(pilot.raised)}
              support={t('{0} indicative annual value', formatRupees(pilot.indicativeValue))}
            />
            <MetricCard
              label={t('Verified by an officer')}
              value={formatNumber(pilot.verified)}
              support={t('{0} of the queue worked through', formatPercent(pilot.completionPct, 0))}
              progress={{ value: pilot.completionPct }}
            />
            <MetricCard
              label={t('Demands revised')}
              value={formatNumber(pilot.demandsRevised)}
              support={t('{0} annual demand added', formatRupees(pilot.revisedValue))}
            />
            <MetricCard
              label={t('Collected')}
              value={formatRupees(pilot.recoveredValue)}
              support={
                pilot.precisionPct === null
                  ? 'No candidate decided yet'
                  : `${formatPercent(pilot.precisionPct, 0)} of decided candidates converted`
              }
            />
          </MetricGrid>
          <p className="mt-4 text-[0.6875rem] leading-relaxed text-ink-500">
            {t('Indicative annual value is a modelled estimate used to prioritise the queue. It is not an amount owed by anybody. Only the revised and collected figures represent demand actually raised by a named officer through the statutory assessment process.')}
          </p>
        </Card>
      ) : null}

      {candidates.length > 0 ? (
        <Card flush>
          <CardHeader
            bordered
            title={t('Where a pilot would find the most')}
            description={t('Every ward carrying a review candidate, ranked by indicative annual value. Row click scopes the scorecard above.')}
          />
          <DataTable
            rows={candidates}
            columns={wardColumns}
            rowKey={(r) => r.wardId}
            pageSize={10}
            onRowClick={(r) => setWardId(r.wardId)}
            activeRowKey={wardId}
            exportName="recovery-pilot-ward-ranking"
            searchPlaceholder="Search wards"
            initialSort={{ columnId: 'indicative', direction: 'desc' }}
            ariaLabel="Pilot ward ranking"
          />
        </Card>
      ) : null}

      {/* --- Statutory return ------------------------------------------- */}
      <Card flush>
        <CardHeader
          bordered
          icon={<FileSpreadsheet className="h-4 w-4" />}
          title={t('Property tax reform and collection return')}
          description={t('Central Finance Commission grants to urban local bodies have carried entry conditions tied to property tax - published accounts, notified floor rates and demonstrated growth in collection. Generating the return is an audited export, not a page view, so it is produced on an explicit action.')}
          actions={
            <Button size="sm" variant="primary" onClick={() => void runGenerate()} disabled={generating}>
              {generating ? 'Generating…' : 'Generate the return'}
            </Button>
          }
        />

        {returnError ? (
          <div className="p-4">
            <ErrorState detail={returnError} />
          </div>
        ) : null}

        {!statutory && !returnError ? (
          <p className="p-4 text-xs leading-relaxed text-ink-500">
            {t('The return has not been generated in this session. Generating it records an export against your name in the audit trail, which is what allows the corporation to answer who produced a filing and when.')}
          </p>
        ) : null}

        {statutory ? (
          <div className="p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="info">{statutory.financialYear}</Badge>
              <span className="text-[0.6875rem] text-ink-500">
                {t('Generated {0}', formatDateTime(statutory.generatedAt))}
              </span>
            </div>

            <DefinitionList className="mt-3">
              {statutory.lines.map((line) => (
                <DefinitionRow key={line.id} label={line.label}>
                  <div>
                    <span className="numeric font-semibold text-ink-800">{formatReturnValue(line)}</span>
                    <p className="mt-0.5 text-[0.625rem] leading-relaxed text-ink-500">{line.derivation}</p>
                  </div>
                </DefinitionRow>
              ))}
            </DefinitionList>

            <div className="mt-4 rounded-lg border border-warn-200 bg-warn-50/50 p-3">
              <p className="text-[0.6875rem] font-semibold text-ink-700">{t('Basis of this return')}</p>
              <p className="mt-1 text-[0.625rem] leading-relaxed text-ink-600">{statutory.basisNote}</p>
            </div>
          </div>
        ) : null}
      </Card>

      <DemonstrationNotice />
    </PageBody>
  )
}

function formatReturnValue(line: StatutoryReturnLine): string {
  if (line.unit === 'rupees') return formatRupees(line.value)
  if (line.unit === 'percent') return formatPercent(line.value)
  return formatNumber(line.value)
}

export default RecoveryPilotPage
