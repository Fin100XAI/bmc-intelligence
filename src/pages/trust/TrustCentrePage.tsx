import { useState } from 'react'
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  CircleSlash,
  CircuitBoard,
  Database,
  FileSearch,
  Gauge,
  GitBranch,
  KeyRound,
  Play,
  ScrollText,
  ShieldCheck,
  XCircle,
} from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import { Badge, type BadgeTone } from '@/components/ui/badges'
import { Button, Card, MetricGrid } from '@/components/ui/primitives'
import { Tabs } from '@/components/ui/overlays'
import { DemonstrationNotice, ErrorState, LoadingState } from '@/components/ui/states'
import { MetricCard } from '@/components/cards'
import { GovPanel } from '@/components/gov/GovPanel'
import { useServiceQuery } from '@/hooks'
import {
  adminService,
  aiService,
  auditService,
  connectorService,
  evidenceService,
  financeService,
  governanceService,
  intelligenceService,
  platformService,
  securityService,
  ServiceError,
  type ConnectorHealthSummary,
  type PlatformSummary,
} from '@/services'
import { RESOURCE_LABEL, ROLES_ORDERED } from '@/security'
import {
  CONTROL_CHECK_STATUS_LABEL,
  CONTROL_PILLAR_LABEL,
  runControlChecks,
  type ControlCheckResult,
  type ControlCheckRun,
  type ControlCheckStatus,
  type ControlDenialProbe,
  type EvidenceResolution,
} from '@/governance/control-checks'
import { municipality } from '@/config/municipality.config'
import { ROUTES } from '@/config/navigation'
import { useCurrentUser } from '@/stores/auth.store'
import { usePageMasthead } from '@/stores/masthead.store'
import { formatPercent } from '@/utils/format'
import { cn } from '@/utils/cn'
import type { IntelligenceDomain } from '@/types/common'
import type { LineageGraph, SecurityPosture } from '@/types/governance'
import type { User } from '@/types/organisation'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/**
 * src/pages/trust/TrustCentrePage.tsx
 *
 * The executive summary hub, and the one page in the platform that does not
 * merely describe its controls.
 *
 * The Posture tab carries a genuine live figure on every card, sourced from the
 * same service each destination module reads from. The Verification tab goes
 * further: it runs the controls — the real permission engine, the real AI
 * gateway, the real service layer — against the acting principal, in front of
 * the reviewer, and reports what happened including when that is a failure.
 * A verification pass that can only produce green is not a verification pass,
 * so a check that cannot run reports "not applicable" and says why.
 */

const LINEAGE_DOMAINS: IntelligenceDomain[] = [
  'wards', 'monsoon', 'water', 'waste', 'roads', 'health', 'budget', 'revenue',
  'projects', 'procurement', 'stormwater', 'hospitals', 'assets', 'security',
]

function build$PRINCIPLES(): Array<{ title: string; detail: string }> {
  return [
  { title: t('Trust before automation'), detail: t('No workflow accelerates ahead of the governance that makes it accountable.') },
  { title: t('Evidence before recommendation'), detail: t('Every recommendation cites the record that produced it, traceable end to end.') },
  { title: t('Human authority before AI authority'), detail: t('AI analyses and advises; a named officer decides, every time.') },
  { title: t('Source systems remain authoritative'), detail: t('The platform never writes back to a departmental system of record.') },
  { title: t('Least privilege'), detail: t('Every read and write is scoped to the narrowest role, ward, department and classification that permits it.') },
  { title: t('AI communicates uncertainty'), detail: t('Confidence is stated on every AI output - never implied, never omitted.') },
  { title: t('Simulation is never presented as forecast'), detail: t('Scenario output is always labelled as simulation, with its assumptions visible.') },
  { title: t('Anomaly is not fraud'), detail: t('A statistical departure is a signal for reconciliation, not an accusation.') },
  { title: t('Risk is not guilt'), detail: t('A risk score identifies exposure requiring management attention, never wrongdoing.') },
  { title: t('Correlation is not causation'), detail: t('Cross-domain signals are flagged for human validation, never asserted as cause.') },
  { title: t('Decisions remain auditable'), detail: t('Every approval, rejection and escalation is written permanently to the audit trail.') },
]
}
let PRINCIPLES: Array<{ title: string; detail: string }> = build$PRINCIPLES()
registerLayer(() => {
  PRINCIPLES = build$PRINCIPLES()
})

/**
 * Permissions the verification pass exercises to prove the engine refuses.
 *
 * Each entry is a *real* service call whose enforcement point is the one every
 * screen in the platform depends on. The check picks the first the acting
 * principal does not hold, so the probe adapts to whoever is signed in rather
 * than assuming a narrow role.
 */
function build$DENIAL_PROBES(): ControlDenialProbe[] {
  return [
  { resource: 'administration', action: 'view', label: t('Read the user roster'), run: (u: User) => adminService.users(u) },
  { resource: 'audit', action: 'export', label: t('Export the audit trail'), run: (u: User) => auditService.export(u) },
  { resource: 'budget', action: 'view', label: t('Read the budget position'), run: (u: User) => financeService.budgetTotals(u) },
  { resource: 'security', action: 'view', label: t('Read the security posture'), run: (u: User) => securityService.posture(u) },
  { resource: 'ai-governance', action: 'view', label: t('Read the AI model registry'), run: (u: User) => aiService.models(u) },
  { resource: 'dataset', action: 'view', label: t('Read the dataset register'), run: (u: User) => governanceService.datasets(u) },
]
}
let DENIAL_PROBES: ControlDenialProbe[] = build$DENIAL_PROBES()
registerLayer(() => {
  DENIAL_PROBES = build$DENIAL_PROBES()
})

/**
 * Translates the service layer's refusal vocabulary into the distinction the
 * evidence check needs: a record that is withheld from this principal still
 * exists, and only a `not-found` means the citation points at nothing.
 *
 * This mapping lives here rather than in the check module because knowing that
 * `ServiceError` carries a `code` is knowledge of the transport seam, and the
 * governance layer is deliberately kept clear of it.
 */
async function resolveEvidence(user: User, id: string): Promise<EvidenceResolution> {
  try {
    await evidenceService.get(user, id)
    return 'resolved'
  } catch (error) {
    if (error instanceof ServiceError) {
      if (error.code === 'forbidden') return 'withheld'
      if (error.code === 'not-found') return 'missing'
    }
    // An unexpected failure is treated as missing rather than quietly ignored:
    // a citation the platform cannot produce on demand is not a usable one.
    return 'missing'
  }
}

const STATUS_TONE: Record<ControlCheckStatus, BadgeTone> = {
  passed: 'positive',
  attention: 'warn',
  failed: 'critical',
  'not-applicable': 'muted',
}

function StatusIcon({ status }: { status: ControlCheckStatus }): React.JSX.Element {
  const className = 'h-4 w-4 shrink-0'
  if (status === 'passed') return <CheckCircle2 className={cn(className, 'text-ok-600')} aria-hidden />
  if (status === 'attention') return <AlertTriangle className={cn(className, 'text-warn-600')} aria-hidden />
  if (status === 'failed') return <XCircle className={cn(className, 'text-crit-600')} aria-hidden />
  return <CircleSlash className={cn(className, 'text-ink-300')} aria-hidden />
}

interface TrustSummary {
  security: SecurityPosture
  governedDomains: number
  avgLineageQuality: number
  aiOpenRisks: number
  aiPendingOversight: number
  evidenceReferences: number
  connectorHealth: ConnectorHealthSummary
  auditTotal: number
  platform: PlatformSummary
}

async function loadTrustSummary(user: User): Promise<TrustSummary> {
  const [security, lineageResults, risks, oversightSummary, intel, connectorHealth, auditPage, platform] =
    await Promise.all([
      securityService.posture(user),
      Promise.all(LINEAGE_DOMAINS.map((d) => evidenceService.lineage(user, `lin-${d}`).catch(() => undefined))),
      aiService.riskRegister(user),
      aiService.oversightSummary(user),
      intelligenceService.list(user, { pageSize: 200 }),
      connectorService.health(user),
      auditService.list(user, { pageSize: 1 }),
      platformService.summary(user),
    ])

  const graphs = lineageResults.filter((g): g is LineageGraph => Boolean(g))
  const avgLineageQuality =
    graphs.length > 0
      ? Math.round(
          graphs.reduce((s, g) => s + g.stages.reduce((ss, st) => ss + st.quality, 0) / g.stages.length, 0) /
            graphs.length,
        )
      : 0

  const evidenceRefs = new Set<string>()
  for (const item of intel.items) for (const id of item.evidenceIds) evidenceRefs.add(id)

  return {
    security,
    governedDomains: graphs.length,
    avgLineageQuality,
    aiOpenRisks: risks.filter((r) => r.status === 'open' || r.status === 'monitoring').length,
    aiPendingOversight: oversightSummary.pending,
    evidenceReferences: evidenceRefs.size,
    connectorHealth,
    auditTotal: auditPage.total,
    platform,
  }
}

export function TrustCentrePage(): React.JSX.Element {
  const user = useCurrentUser()
  const [tab, setTab] = useState<'posture' | 'verification' | 'principles'>('posture')
  const [run, setRun] = useState<ControlCheckRun | null>(null)
  const [running, setRunning] = useState(false)
  const [runError, setRunError] = useState<string | null>(null)

  // The shell's masthead carries the screen's name; the page states the wording.
  usePageMasthead(t('Trust Centre'))

  const summaryQuery = useServiceQuery(['trust-centre', 'summary'], (u) => loadTrustSummary(u))

  async function verify(): Promise<void> {
    if (!user || running) return
    setRunning(true)
    setRunError(null)
    try {
      const outcome = await runControlChecks({
        user,
        intelligenceList: (u) => intelligenceService.list(u, { pageSize: 200 }),
        evidenceResolve: resolveEvidence,
        lineageGraphs: (u) => governanceService.lineageGraphs(u),
        auditList: (u) => auditService.list(u, { pageSize: 50 }),
        connectorList: (u) => connectorService.list(u),
        denialProbes: DENIAL_PROBES,
      })
      setRun(outcome)
    } catch (error) {
      setRunError(error instanceof Error ? error.message : String(error))
    } finally {
      setRunning(false)
    }
  }


  if (summaryQuery.isLoading) return <LoadingState variant="metrics" rows={9} />
  if (summaryQuery.error) return <ErrorState detail={summaryQuery.error.message} onRetry={() => summaryQuery.refetch()} />
  const s = summaryQuery.data
  if (!s) return <ErrorState title={t('Trust summary unavailable')} />

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('Trust Centre')}
        breadcrumbs={[{ label: t('Trust Centre') }]}
        actions={
          tab === 'verification' ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="primary"
                size="sm"
                icon={<Play className="h-3.5 w-3.5" />}
                disabled={running}
                onClick={() => void verify()}
              >
                {running ? 'Running controls…' : run ? 'Run again' : 'Run verification'}
              </Button>
            </div>
          ) : null
        }
        controls={
          <Tabs
            items={[
              { id: 'posture', label: t('Posture'), icon: <Gauge className="h-3.5 w-3.5" /> },
              {
                id: 'verification',
                label: t('Control verification'),
                icon: <ShieldCheck className="h-3.5 w-3.5" />,
                count: run ? run.results.length : undefined,
              },
              { id: 'principles', label: t('Principles'), icon: <ScrollText className="h-3.5 w-3.5" /> },
            ]}
            value={tab}
            onChange={(id) => setTab(id as typeof tab)}
            ariaLabel="Trust Centre sections"
          />
        }
      />

      {tab === 'posture' ? (
        <>
          <Card tone="info">
            <p className="text-[0.8125rem] leading-relaxed text-ink-800">
              {t('This platform is built on the premise that a Municipal Commissioner cannot act on intelligence they cannot interrogate. Every figure presented anywhere in this application is scoped by the permission engine, traceable through its evidence and lineage, and recorded to an audit trail the instant it is acted on. Nothing here claims a live {0} connection, a government approval, or any security or privacy certification - this Trust Centre exists to show precisely what is and is not true of this environment, in the platform&apos;s own words, not to assert a level of assurance it has not earned.', municipality.shortName)}
            </p>
          </Card>

          <MetricGrid columns={3}>
            <MetricCard
              icon={<ShieldCheck className="h-3.5 w-3.5" />}
              label={t('Security')}
              value={s.security.authenticationHealth}
              unit="/100"
              support={t('{0} MFA coverage · {1} privileged without MFA', formatPercent(s.security.mfaCoveragePct, 0), s.security.privilegedWithoutMfa)}
              tone={s.security.privilegedWithoutMfa > 0 ? 'critical' : 'default'}
              to={ROUTES.security}
              background="red"
            />
            <MetricCard
              icon={<Database className="h-3.5 w-3.5" />}
              label={t('Privacy & Data Governance')}
              value={s.governedDomains}
              unit="domains"
              support={t('governed data domains with published lineage')}
              to={ROUTES.privacy}
              background="amber"
            />
            <MetricCard
              icon={<Bot className="h-3.5 w-3.5" />}
              label={t('AI Governance')}
              value={s.aiPendingOversight}
              unit="pending"
              support={t('{0} open or monitored AI risk(s)', s.aiOpenRisks)}
              tone={s.aiPendingOversight > 0 ? 'warn' : 'default'}
              to={ROUTES.aiGovernance}
              background="green"
            />
            <MetricCard
              icon={<GitBranch className="h-3.5 w-3.5" />}
              label={t('Data Lineage')}
              value={s.avgLineageQuality}
              unit="/100"
              support={t('average pipeline quality across governed metrics')}
              to={ROUTES.lineage}
            />
            <MetricCard
              icon={<FileSearch className="h-3.5 w-3.5" />}
              label={t('Evidence')}
              value={s.evidenceReferences}
              unit="records"
              support={t('evidence references cited by intelligence in your scope')}
              to={ROUTES.evidenceAudit}
            />
            <MetricCard
              icon={<KeyRound className="h-3.5 w-3.5" />}
              label={t('Access Governance')}
              value={ROLES_ORDERED.length}
              unit="roles"
              support={t('{0} resource types governed by one permission engine', Object.keys(RESOURCE_LABEL).length)}
              to={ROUTES.accessGovernance}
            />
            <MetricCard
              icon={<CircuitBoard className="h-3.5 w-3.5" />}
              label={t('Integrations')}
              value={s.connectorHealth.total}
              unit="connectors"
              support={t('{0} requiring a data-sharing agreement or security review', s.connectorHealth.requiringReview)}
              tone={s.connectorHealth.requiringReview > 0 ? 'warn' : 'default'}
              to={ROUTES.integrations}
            />
            <MetricCard
              icon={<ScrollText className="h-3.5 w-3.5" />}
              label={t('Audit')}
              value={s.auditTotal}
              unit="events"
              support={t('consequential actions recorded to the audit trail')}
              to={ROUTES.evidenceAudit}
            />
            <MetricCard
              icon={<Gauge className="h-3.5 w-3.5" />}
              label={t('Platform Resilience')}
              value={formatPercent(s.platform.availabilityAvgPct, 1)}
              support={t('{0} of the platform services register run as simulations', s.platform.simulatedServices)}
              tone={s.platform.failingJobs > 0 ? 'warn' : 'default'}
              to={ROUTES.platformHealth}
            />
          </MetricGrid>

          <Card tone="sunken">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[0.8125rem] font-semibold text-ink-800">
                  {t('Every figure above is a claim. The verification tab tests them.')}
                </p>
                <p className="mt-0.5 text-[0.6875rem] leading-relaxed text-ink-500">
                  {t('Seven controls run against your own credentials — tenant isolation, classification ceiling, permission refusal, evidence resolution, lineage currency, AI reserved acts and connector honesty.')}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                icon={<ShieldCheck className="h-3.5 w-3.5" />}
                onClick={() => setTab('verification')}
              >
                {t('Open control verification')}
              </Button>
            </div>
          </Card>
        </>
      ) : tab === 'verification' ? (
        <VerificationTab
          run={run}
          running={running}
          error={runError}
          onRun={() => void verify()}
          actingRole={user?.designation}
        />
      ) : (
        <Card>
          <h2 className="text-base font-semibold text-ink-900">{t('Non-negotiable product principles')}</h2>
          <p className="mt-1 text-[0.8125rem] text-ink-500">
            {t('Every screen in this platform is built to these eleven principles without exception. They are not aspirational - they are enforced in code, not merely stated here, and the verification tab exercises the enforcement points behind seven of them.')}
          </p>
          <ol className="mt-4 grid gap-2.5 sm:grid-cols-2">
            {PRINCIPLES.map((p, i) => (
              <li key={p.title} className="flex items-start gap-2.5 rounded-lg border border-ink-100 bg-surface-sunken p-3">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-govt-700 text-[0.625rem] font-semibold text-white">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-[0.8125rem] font-medium text-ink-900">{p.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-ink-600">{p.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </Card>
      )}

      <DemonstrationNotice />
    </PageBody>
  )
}

/* ==========================================================================
   Control verification
   ========================================================================== */

function VerificationTab({
  run,
  running,
  error,
  onRun,
  actingRole,
}: {
  run: ControlCheckRun | null
  running: boolean
  error: string | null
  onRun: () => void
  actingRole?: string
}): React.JSX.Element {
  return (
    <>
      <GovPanel title={t('What this actually does')} tone="amber">
        <p className="mb-2 text-xs leading-relaxed text-ink-500">{t('Not a status page. A verification pass.')}</p>
        <p className="text-[0.8125rem] leading-relaxed text-ink-700">
          {t('Every other page in this Trust Centre')}{' '}<em>describes</em>{' '}{t('a control. This one')}{' '}<em>runs</em>{' '}{t('them. Each check below calls the real permission engine, the real AI gateway and the real service layer, using your own credentials as')}{' '}{actingRole ?? 'the acting principal'}{t(', and reports what happened — including when what happened is a failure. A check that cannot be run on your role reports &quot;not applicable&quot; and says why; it never reports a pass it did not earn.')}
        </p>
        <p className="mt-2 text-[0.8125rem] leading-relaxed text-ink-700">
          {t('This is the platform testing itself, and it should be read as exactly that. It is not an independent assessment, and it produces no certification, accreditation or audit opinion — those require a third party, and this environment has none.')}
        </p>
      </GovPanel>

      {error ? (
        <ErrorState title={t('The verification pass could not complete')} detail={error} onRetry={onRun} />
      ) : null}

      {!run && !running ? (
        <Card>
          <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-govt-50 text-govt-600 ring-1 ring-govt-200/60 ring-inset">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div className="max-w-md">
              <p className="text-sm font-semibold text-ink-900">{t('Nothing has been verified yet')}</p>
              <p className="mt-1 text-[0.8125rem] leading-relaxed text-ink-500">
                {t('No result is shown until the controls have actually been executed. Run the pass to see seven controls exercised against your own credentials.')}
              </p>
            </div>
            <Button variant="primary" icon={<Play className="h-3.5 w-3.5" />} onClick={onRun}>
              {t('Run verification')}
            </Button>
          </div>
        </Card>
      ) : null}

      {running ? <LoadingState variant="block" rows={5} /> : null}

      {run && !running ? (
        /* Two columns. The seven control results are the record of the pass
           and hold the wide column; the tally and the note on what could not
           be exercised read beside them. */
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          <div className="min-w-0 xl:order-1 xl:col-span-8">
            <div className="space-y-3">
              {run.results.map((result) => (
                <ControlCheckCard key={result.id} result={result} />
              ))}
            </div>
          </div>

          <div className="flex min-w-0 flex-col gap-4 xl:order-2 xl:col-span-4">
          <MetricGrid columns={2}>
            <Card tone={run.passed === run.results.length ? 'default' : 'default'}>
              <p className="label-institutional">{t('Passed')}</p>
              <p className="numeric mt-2 text-metric font-semibold text-ok-700">{run.passed}</p>
              <p className="mt-0.5 text-[0.6875rem] text-ink-500">{t('of {0} controls exercised', run.results.length)}</p>
            </Card>
            <Card tone={run.attention > 0 ? 'warn' : 'default'}>
              <p className="label-institutional">{t('Needing attention')}</p>
              <p className="numeric mt-2 text-metric font-semibold text-ink-900">{run.attention}</p>
              <p className="mt-0.5 text-[0.6875rem] text-ink-500">{t('Held, but not cleanly')}</p>
            </Card>
            <Card tone={run.failed > 0 ? 'critical' : 'default'}>
              <p className="label-institutional">{t('Failed')}</p>
              <p className="numeric mt-2 text-metric font-semibold text-ink-900">{run.failed}</p>
              <p className="mt-0.5 text-[0.6875rem] text-ink-500">{t('Control did not hold')}</p>
            </Card>
            <Card tone="sunken">
              <p className="label-institutional">{t('Not applicable')}</p>
              <p className="numeric mt-2 text-metric font-semibold text-ink-900">{run.notApplicable}</p>
              <p className="mt-0.5 text-[0.6875rem] text-ink-500">{t('Could not run on this role · {0} ms total', run.durationMs)}</p>
            </Card>
          </MetricGrid>

          {run.notApplicable > 0 ? (
            <Card tone="sunken">
              <p className="text-[0.8125rem] leading-relaxed text-ink-700">
                <span className="font-semibold text-ink-900">
                  {t('{0} control{1} could not be exercised on this role.', run.notApplicable, run.notApplicable === 1 ? '' : 's')}
                </span>{' '}
                {t('That is not a pass and is not counted as one. Some controls — proving the engine refuses a withheld permission, for instance — can only be demonstrated by a principal who is actually withheld something. Sign in as a narrower role to exercise them.')}
              </p>
            </Card>
          ) : null}
          </div>
        </div>
      ) : null}
    </>
  )
}

function ControlCheckCard({ result }: { result: ControlCheckResult }): React.JSX.Element {
  return (
    <Card
      tone={result.status === 'failed' ? 'critical' : result.status === 'attention' ? 'warn' : 'default'}
    >
      <div className="flex items-start gap-3">
        <StatusIcon status={result.status} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[0.875rem] font-semibold text-ink-900">{result.title}</h3>
            <Badge tone={STATUS_TONE[result.status]} dot>
              {CONTROL_CHECK_STATUS_LABEL[result.status]}
            </Badge>
            <Badge tone="muted">{CONTROL_PILLAR_LABEL[result.pillar]}</Badge>
            <div className="flex-1" />
            <span className="numeric text-[0.625rem] text-ink-400">{result.durationMs} ms</span>
          </div>

          <p className="mt-2 text-[0.8125rem] leading-relaxed text-ink-600">
            <span className="font-medium text-ink-700">{t('Claim:')}</span>
            {result.claim}
          </p>
          <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-ink-800">
            <span className="font-medium text-ink-700">{t('Result:')}</span>
            {result.detail}
          </p>

          <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 border-t border-ink-100 pt-2.5">
            {result.evidence.map((line) => (
              <li key={line} className="flex items-start gap-1.5 text-[0.6875rem] leading-relaxed text-ink-500">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ink-300" aria-hidden />
                {line}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  )
}

export default TrustCentrePage
