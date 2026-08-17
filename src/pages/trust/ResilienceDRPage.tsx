import { useMemo, useState } from 'react'
import {
  Loader2,
  Play,
  RotateCcw,
  ShieldAlert,
} from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import { Badge, StateBadge } from '@/components/ui/badges'
import { Button, Card, MetricGrid, Select } from '@/components/ui/primitives'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { ConfirmDialog } from '@/components/ui/overlays'
import { DemonstrationNotice, EmptyState, ErrorState, LoadingState } from '@/components/ui/states'
import { GovPanel } from '@/components/gov/GovPanel'
import { useServiceQuery } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { drService } from '@/services'
import { usePageMasthead } from '@/stores/masthead.store'
import {
  POSTURE_MATURITY_LABEL,
  type BackupPosture,
  type FailoverComponent,
  type PostureMaturity,
  type ResilienceTest,
} from '@/data/dr.data'
import { formatDateTime, formatRelative } from '@/utils/format'
import { det, isoFromAnchor } from '@/utils/deterministic'
import { t } from '@/i18n'

/**
 * src/pages/trust/ResilienceDRPage.tsx
 *
 * Resilience & Disaster Recovery.
 *
 * The platform's continuity posture, with one rule holding the whole page
 * together: nothing here claims production DR. Every backup, failover component
 * and test is labelled as target architecture — the production design — or
 * demonstration status — what this environment actually provides. A recovery
 * objective the environment cannot meet is shown as an objective, never as a
 * capability.
 *
 * The drill control follows the same rule and is the reason it is worth having.
 * A drill against a `target-architecture` item is *refused*, not simulated
 * green: there is no replica, no second zone and no external store to exercise,
 * and a button that reported a successful restore of a database that does not
 * exist would be the single most dishonest control in the platform. Only items
 * marked `demonstration-status` — the ones that describe something this
 * environment actually does — can be exercised, and a drill against those can
 * still return findings.
 */

const FRESHNESS = {
  generatedAt: isoFromAnchor(0),
  sourceObservedAt: isoFromAnchor(-60),
  refreshIntervalMinutes: 1440,
  origin: 'demonstration' as const,
  sourceState: 'operational' as const,
  stale: false,
}

const MATURITY_TONE: Record<PostureMaturity, 'muted' | 'warn' | 'positive'> = {
  'target-architecture': 'muted',
  'demonstration-status': 'warn',
  operational: 'positive',
}

function MaturityBadge({ maturity }: { maturity: PostureMaturity }): React.JSX.Element {
  return <Badge tone={MATURITY_TONE[maturity]}>{POSTURE_MATURITY_LABEL[maturity]}</Badge>
}

/** A drill an operator ran this session against an exercisable test. */
interface DrillRun {
  testId: string
  at: string
  outcome: 'passed' | 'passed-with-findings'
  durationSeconds: number
  finding?: string
}

/**
 * A drill can only be run against something this environment actually does.
 * Everything else is a design target with nothing behind it to exercise.
 */
function exercisable(test: ResilienceTest): boolean {
  return test.maturity === 'demonstration-status' || test.maturity === 'operational'
}

const DRILL_FINDINGS = [
  'Recovery completed, but the in-session store was rebuilt from seed rather than restored from a backup — there is no backup in this environment to restore from.',
  'Recovery completed within the demonstration target. The objective it was measured against is a design target, not an operational commitment.',
  'Recovery completed with one manual step that a production runbook would need to automate before the objective could be relied upon.',
]

export function ResilienceDRPage(): React.JSX.Element {
  // The shell's masthead carries the screen's name; the page states the wording.
  usePageMasthead(t('Resilience & Disaster Recovery'))

  const query = useServiceQuery(queryKeys.dr(), (u) => drService.posture(u))

  const [maturityFilter, setMaturityFilter] = useState<PostureMaturity | ''>('')
  const [drills, setDrills] = useState<Record<string, DrillRun>>({})
  const [runningId, setRunningId] = useState<string | null>(null)
  const [drillTarget, setDrillTarget] = useState<ResilienceTest | null>(null)

  const posture = query.data

  const filteredBackups = useMemo(
    () => (posture?.backups ?? []).filter((b) => !maturityFilter || b.maturity === maturityFilter),
    [posture, maturityFilter],
  )
  const filteredFailover = useMemo(
    () => (posture?.failover ?? []).filter((f) => !maturityFilter || f.maturity === maturityFilter),
    [posture, maturityFilter],
  )

  /** Tests with this session's drills layered over the seed result. */
  const effectiveTests = useMemo(
    () =>
      (posture?.tests ?? [])
        .filter((resilienceTest) => !maturityFilter || resilienceTest.maturity === maturityFilter)
        .map((resilienceTest) => {
          const drill = drills[resilienceTest.id]
          return drill ? { ...resilienceTest, lastResult: drill.outcome } : resilienceTest
        }),
    [posture, maturityFilter, drills],
  )

  function runDrill(test: ResilienceTest): void {
    if (!exercisable(test) || runningId) return
    setRunningId(test.id)
    const r = det(`dr-drill:${test.id}:${Object.keys(drills).length}`)
    const outcome = r.chance(0.55) ? 'passed' : 'passed-with-findings'
    const run: DrillRun = {
      testId: test.id,
      at: isoFromAnchor(0),
      outcome,
      durationSeconds: r.int(20, 260),
      finding: outcome === 'passed-with-findings' ? r.pick(DRILL_FINDINGS) : undefined,
    }
    window.setTimeout(() => {
      setDrills((prev) => ({ ...prev, [test.id]: run }))
      setRunningId(null)
    }, 1200)
  }


  if (query.isLoading) return <LoadingState variant="block" rows={6} />
  if (query.error) return <ErrorState detail={query.error.message} onRetry={() => query.refetch()} />
  if (!posture) return <LoadingState variant="block" rows={6} />

  const drillCount = Object.keys(drills).length
  const exercisableCount = posture.tests.filter(exercisable).length
  const targetOnly = posture.tests.length - exercisableCount

  const backupColumns: Array<Column<BackupPosture>> = [
    { id: 'scope', header: t('Scope'), cell: (b) => <span className="font-medium text-ink-800">{b.scope}</span>, sortValue: (b) => b.scope, width: 'minmax(12rem,1.4fr)' },
    { id: 'rpo', header: 'RPO', cell: (b) => <span className="numeric">{b.rpo}</span>, sortValue: (b) => b.rpo },
    { id: 'rto', header: 'RTO', cell: (b) => <span className="numeric">{b.rto}</span>, sortValue: (b) => b.rto },
    { id: 'method', header: t('Method'), cell: (b) => <span className="text-ink-600">{b.method}</span>, hideBelow: 'lg', width: 'minmax(14rem,1.6fr)' },
    { id: 'maturity', header: t('Maturity'), cell: (b) => <MaturityBadge maturity={b.maturity} />, sortValue: (b) => b.maturity },
    {
      id: 'operational',
      header: t('Operational here'),
      cell: (b) => (
        <Badge tone={b.maturity === 'target-architecture' ? 'critical' : 'positive'} dot>
          {b.maturity === 'target-architecture' ? 'No' : 'Yes'}
        </Badge>
      ),
      sortValue: (b) => (b.maturity === 'target-architecture' ? 0 : 1),
    },
  ]

  const failoverColumns: Array<Column<FailoverComponent>> = [
    { id: 'component', header: t('Component'), cell: (f) => <span className="font-medium text-ink-800">{f.component}</span>, sortValue: (f) => f.component, width: 'minmax(10rem,1fr)' },
    { id: 'strategy', header: t('Strategy'), cell: (f) => <span className="text-ink-600">{f.strategy}</span>, width: 'minmax(16rem,2fr)' },
    { id: 'state', header: t('Designed state'), cell: (f) => <StateBadge state={f.state} />, sortValue: (f) => f.state, hideBelow: 'md' },
    { id: 'maturity', header: t('Maturity'), cell: (f) => <MaturityBadge maturity={f.maturity} />, sortValue: (f) => f.maturity },
  ]

  const testColumns: Array<Column<ResilienceTest>> = [
    {
      id: 'name',
      header: t('Test'),
      cell: (resilienceTest) => (
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="font-medium text-ink-800">{resilienceTest.name}</p>
            {drills[resilienceTest.id] ? <Badge tone="intel" size="xs">{t('Drilled')}</Badge> : null}
          </div>
          <p className="text-[0.6875rem] text-ink-400">{resilienceTest.cadence}</p>
        </div>
      ),
      sortValue: (resilienceTest) => resilienceTest.name,
      width: 'minmax(12rem,1.4fr)',
    },
    {
      id: 'result',
      header: t('Last result'),
      cell: (resilienceTest) => (
        <Badge tone={resilienceTest.lastResult === 'passed' ? 'positive' : resilienceTest.lastResult === 'passed-with-findings' ? 'warn' : 'muted'}>
          {resilienceTest.lastResult === 'not-run' ? 'Not run' : resilienceTest.lastResult === 'passed-with-findings' ? 'Passed with findings' : 'Passed'}
        </Badge>
      ),
      sortValue: (resilienceTest) => resilienceTest.lastResult,
    },
    {
      id: 'drilled',
      header: t('Drilled this session'),
      cell: (resilienceTest) => {
        const drill = drills[resilienceTest.id]
        return drill ? (
          <div className="min-w-0">
            <p className="text-[0.75rem] text-ink-700">{formatRelative(drill.at)}</p>
            <p className="text-[0.625rem] text-ink-400">{drill.durationSeconds}s</p>
          </div>
        ) : (
          <span className="text-[0.6875rem] text-ink-300">—</span>
        )
      },
      sortValue: (resilienceTest) => (drills[resilienceTest.id] ? 1 : 0),
      hideBelow: 'lg',
    },
    { id: 'maturity', header: t('Maturity'), cell: (resilienceTest) => <MaturityBadge maturity={resilienceTest.maturity} />, sortValue: (resilienceTest) => resilienceTest.maturity },
  ]

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('Trust Centre')}
        breadcrumbs={[{ label: t('Trust Centre') }, { label: t('Resilience & DR') }]}
        freshness={FRESHNESS}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {drillCount > 0 ? (
              <Button variant="ghost" size="sm" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={() => setDrills({})}>
                {t('Discard {0} drill{1}', drillCount, drillCount === 1 ? '' : 's')}
              </Button>
            ) : null}
          </div>
        }
        controls={
          <Select
            aria-label={t('Filter by maturity')}
            className="w-full max-w-xs"
            value={maturityFilter}
            onChange={(e) => setMaturityFilter(e.target.value as PostureMaturity | '')}
            options={[
              { value: '', label: t('All maturities') },
              ...(Object.keys(POSTURE_MATURITY_LABEL) as PostureMaturity[]).map((m) => ({
                value: m,
                label: POSTURE_MATURITY_LABEL[m],
              })),
            ]}
          />
        }
      />

      {/* The load-bearing disclaimer ---------------------------------- */}
      <Card tone="warn">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-warn-600" aria-hidden />
          <div className="min-w-0">
            <p className="text-[0.8125rem] font-semibold text-warn-700">{t('No production disaster recovery is claimed')}</p>
            <p className="mt-1 text-xs leading-relaxed text-warn-700/90">
              {t('This is a demonstration environment running deterministic seed data with no external database, object store or multi-zone deployment. The recovery objectives below are the production design targets. They are not operational here and must not be relied upon as such. {0} platform services are flagged as simulated. A production deployment is required to make any of this real, and its recovery objectives are only proven once tested.', posture.simulatedServiceCount)}
            </p>
          </div>
        </div>
      </Card>

      <MetricGrid columns={4}>
        <Card>
          <p className="label-institutional">{t('Recovery objectives declared')}</p>
          <p className="numeric mt-2 text-metric font-semibold text-ink-900">{posture.backups.length}</p>
          <p className="mt-0.5 text-[0.6875rem] text-ink-500">{t('Across every declared data scope')}</p>
        </Card>
        <Card tone="critical">
          <p className="label-institutional">{t('Objectives operational here')}</p>
          <p className="numeric mt-2 text-metric font-semibold text-ink-900">
            {posture.backups.filter((b) => b.maturity !== 'target-architecture').length}
            <span className="text-base text-ink-400">/{posture.backups.length}</span>
          </p>
          <p className="mt-0.5 text-[0.6875rem] text-ink-500">{t('The rest are design targets only')}</p>
        </Card>
        <Card>
          <p className="label-institutional">{t('Tests that can be drilled')}</p>
          <p className="numeric mt-2 text-metric font-semibold text-ink-900">{exercisableCount}</p>
          <p className="mt-0.5 text-[0.6875rem] text-ink-500">
            {t('{0} describe architecture with nothing to exercise', targetOnly)}
          </p>
        </Card>
        <Card tone={drillCount > 0 ? 'info' : 'default'}>
          <p className="label-institutional">{t('Drills run this session')}</p>
          <p className="numeric mt-2 text-metric font-semibold text-ink-900">{drillCount}</p>
          <p className="mt-0.5 text-[0.6875rem] text-ink-500">{t('Session only · not an institutional record')}</p>
        </Card>
      </MetricGrid>

      {/* Two columns. What the platform is designed to recover — objectives
          first, then the tiers that carry them — reads down the wide column;
          whether any of it has actually been exercised stands beside it. */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-4 xl:col-span-7">
      <GovPanel title={t('Backup posture')} tone="amber" dense>
        <p className="px-3 pt-3 pb-2 text-xs leading-relaxed text-ink-500">
          {t('Recovery point and recovery time objectives by data scope. The last column states plainly whether the objective is operational in this environment or a design target.')}
        </p>
        <div className="p-3 pt-0">
          {filteredBackups.length === 0 ? (
            <EmptyState compact title={t('No backup scope matches this maturity filter')} />
          ) : (
            <DataTable rows={filteredBackups} columns={backupColumns} rowKey={(b) => b.id} pageSize={10} />
          )}
        </div>
      </GovPanel>

      <GovPanel title={t('Failover posture')} tone="red" dense>
        <p className="px-3 pt-3 pb-2 text-xs leading-relaxed text-ink-500">
          {t('How each tier is designed to survive the loss of a zone or component.')}
        </p>
        <div className="p-3 pt-0">
          {filteredFailover.length === 0 ? (
            <EmptyState compact title={t('No failover component matches this maturity filter')} />
          ) : (
            <DataTable rows={filteredFailover} columns={failoverColumns} rowKey={(f) => f.id} pageSize={10} />
          )}
        </div>
      </GovPanel>
        </div>

        <div className="flex min-w-0 flex-col gap-4 xl:col-span-5">
      <GovPanel title={t('Resilience testing')} tone="amber" dense>
        <p className="px-3 pt-3 pb-2 text-xs leading-relaxed text-ink-500">
          {t('A recovery capability is only real once it is exercised. A drill can only be run against something this environment actually does — target-architecture items are refused rather than simulated green.')}
        </p>
        <div className="p-3 pt-0">
          {effectiveTests.length === 0 ? (
            <EmptyState compact title={t('No test matches this maturity filter')} />
          ) : (
            <DataTable
              rows={effectiveTests}
              columns={testColumns}
              rowKey={(resilienceTest) => resilienceTest.id}
              pageSize={10}
              rowActions={(resilienceTest) => {
                const canRun = exercisable(resilienceTest)
                return (
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={!canRun || runningId !== null}
                    icon={runningId === resilienceTest.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                    title={
                      canRun
                        ? 'Run this drill against the demonstration environment. The result can come back with findings.'
                        : 'This test describes target architecture. There is no replica, second zone or external store in this environment to exercise, so the drill is refused rather than reported as passing.'
                    }
                    onClick={() => setDrillTarget(resilienceTest)}
                  >
                    {t('Run drill')}
                  </Button>
                )
              }}
            />
          )}
        </div>
        {drillCount > 0 ? (
          <div className="space-y-2 border-t border-ink-100 px-3 py-3">
            <p className="label-institutional">{t('Drills run this session')}</p>
            {Object.values(drills).map((drill) => {
              const test = posture.tests.find((resilienceTest) => resilienceTest.id === drill.testId)
              return (
                <div key={drill.testId} className="rounded-md border border-ink-100 bg-surface-sunken px-3 py-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[0.8125rem] font-medium text-ink-800">{test?.name ?? drill.testId}</span>
                    <Badge tone={drill.outcome === 'passed' ? 'positive' : 'warn'} dot>
                      {drill.outcome === 'passed' ? 'Passed' : 'Passed with findings'}
                    </Badge>
                    <div className="flex-1" />
                    <span className="text-[0.625rem] text-ink-400">{formatDateTime(drill.at)}</span>
                  </div>
                  {drill.finding ? (
                    <p className="mt-1 text-[0.6875rem] leading-relaxed text-ink-600">{drill.finding}</p>
                  ) : null}
                </div>
              )
            })}
            <p className="pt-1 text-[0.625rem] leading-relaxed text-ink-500">
              {t('These drills are held for this browser session only. They are not written to the audit trail and are not an institutional record of a tested recovery — a real drill is scheduled, witnessed and signed off, and none of those things happened here.')}
            </p>
          </div>
        ) : null}
      </GovPanel>
        </div>
      </div>

      <ConfirmDialog
        open={drillTarget !== null}
        onClose={() => setDrillTarget(null)}
        onConfirm={() => {
          if (drillTarget) runDrill(drillTarget)
          setDrillTarget(null)
        }}
        title={t('Run "{0}"?', drillTarget?.name ?? '')}
        description={t('The drill exercises what this demonstration environment actually does — no external store, replica or second zone is involved. It can return findings, and a pass here is not evidence of a tested production recovery.')}
        confirmLabel={t('Run drill')}
        intent="primary"
      />

      <DemonstrationNotice />
    </PageBody>
  )
}

export default ResilienceDRPage
