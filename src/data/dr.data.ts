import { PLATFORM_SERVICES } from './governance.data'
import type { OperationalState } from '@/types/common'
import { registerLayer } from './runtime'
import { t } from '@/i18n'

/** ---------------------------------------------------------------------
 * Resilience & Disaster Recovery posture (§85)
 *
 * Every item here is explicitly labelled as either TARGET ARCHITECTURE — the
 * production design, not yet operational — or DEMONSTRATION STATUS — what this
 * environment actually provides. The module makes no claim of production DR.
 * A demonstration environment claiming a recovery-time objective it cannot
 * meet would be exactly the kind of false assurance this platform refuses to
 * present.
 *
 * The posture is a property of the platform rather than of any one municipal
 * corporation: the same target architecture, the same objectives and the same
 * honest maturity labels are offered to every deployment, so nothing below is
 * corporation-dependent. Sites are described by their role — a second
 * availability zone, an out-of-region replica — and never by the name of a real
 * data centre in any city, which is not ours to publish.
 *
 * `SIMULATED_SERVICE_COUNT` is the one figure that follows the active
 * corporation, because the service catalogue it counts does. It is a LIVE
 * BINDING, rebuilt on a corporation switch.
 * ------------------------------------------------------------------- */

export type PostureMaturity = 'target-architecture' | 'demonstration-status' | 'operational'

function build$POSTURE_MATURITY_LABEL(): Record<PostureMaturity, string> {
  return {
  'target-architecture': t('Target Architecture'),
  'demonstration-status': t('Demonstration Status'),
  operational: t('Operational'),
}
}
export let POSTURE_MATURITY_LABEL: Record<PostureMaturity, string> = build$POSTURE_MATURITY_LABEL()
registerLayer(() => {
  POSTURE_MATURITY_LABEL = build$POSTURE_MATURITY_LABEL()
})

export interface BackupPosture {
  id: string
  scope: string
  /** Recovery Point Objective — maximum tolerable data loss. */
  rpo: string
  /** Recovery Time Objective — maximum tolerable restoration time. */
  rto: string
  method: string
  maturity: PostureMaturity
  note: string
}

function build$BACKUP_POSTURE(): BackupPosture[] {
  return [
  {
    id: 'bkp-canonical',
    scope: 'Canonical municipal data store',
    rpo: '15 minutes',
    rto: '2 hours',
    method: t('Continuous replication to a second availability zone with point-in-time recovery'),
    maturity: 'target-architecture',
    note: t('Design target for production. This environment holds deterministic seed data with no external store, so no live backup exists to exercise.'),
  },
  {
    id: 'bkp-evidence',
    scope: 'Evidence and audit store',
    rpo: '0 (synchronous)',
    rto: '1 hour',
    method: t('Synchronous write to an append-only, immutable store replicated across zones'),
    maturity: 'target-architecture',
    note: t('The audit and evidence record is the accountability guarantee; its production design targets zero data loss. Not operational in this environment.'),
  },
  {
    id: 'bkp-config',
    scope: 'Platform configuration and policy',
    rpo: '1 hour',
    rto: '30 minutes',
    method: t('Version-controlled configuration with automated redeployment'),
    maturity: 'demonstration-status',
    note: t('Configuration in this environment is version-controlled in the application bundle and redeployable, which is the demonstration equivalent of the production target.'),
  },
  {
    id: 'bkp-object',
    scope: 'Documents and object storage',
    rpo: '4 hours',
    rto: '4 hours',
    method: t('Cross-region object replication with lifecycle retention'),
    maturity: 'target-architecture',
    note: t('Production design target. No object store is provisioned in this environment.'),
  },
]
}
export let BACKUP_POSTURE: BackupPosture[] = build$BACKUP_POSTURE()
registerLayer(() => {
  BACKUP_POSTURE = build$BACKUP_POSTURE()
})

export interface FailoverComponent {
  id: string
  component: string
  strategy: string
  state: OperationalState
  maturity: PostureMaturity
  note: string
}

function build$FAILOVER_POSTURE(): FailoverComponent[] {
  return [
  {
    id: 'fo-app',
    component: 'Application tier',
    strategy: 'Active-active across two availability zones behind a load balancer',
    state: 'operational',
    maturity: 'target-architecture',
    note: t('Design target. The demonstration runs as a single client-side application with no server tier to fail over.'),
  },
  {
    id: 'fo-data',
    component: 'Data tier',
    strategy: 'Primary with synchronous standby and automated promotion',
    state: 'operational',
    maturity: 'target-architecture',
    note: t('Production design. No database is provisioned in this environment.'),
  },
  {
    id: 'fo-ai',
    component: 'AI gateway',
    strategy: 'Stateless, horizontally scaled, degrades to advisory-unavailable rather than failing open',
    state: 'operational',
    maturity: 'demonstration-status',
    note: t('The gateway is stateless by design and, when unavailable, withholds AI features rather than bypassing its policy checks — a property the demonstration does model.'),
  },
  {
    id: 'fo-integration',
    component: 'Integration fabric',
    strategy: 'Per-connector circuit breaking; a failed connector degrades one feed, not the platform',
    state: 'degraded',
    maturity: 'target-architecture',
    note: t('Design target. Connectors in this environment are simulation or adapter-ready and carry no live failover.'),
  },
]
}
export let FAILOVER_POSTURE: FailoverComponent[] = build$FAILOVER_POSTURE()
registerLayer(() => {
  FAILOVER_POSTURE = build$FAILOVER_POSTURE()
})

export interface ResilienceTest {
  id: string
  name: string
  cadence: string
  lastResult: 'passed' | 'passed-with-findings' | 'not-run';
  maturity: PostureMaturity
  note: string
}

function build$RESILIENCE_TESTS(): ResilienceTest[] {
  return [
  {
    id: 'test-restore',
    name: t('Backup restoration drill'),
    cadence: 'Quarterly',
    lastResult: 'not-run',
    maturity: 'target-architecture',
    note: t('Production requirement: a restore is only proven when it is exercised. Not applicable to the seed-data demonstration.'),
  },
  {
    id: 'test-failover',
    name: t('Zone failover exercise'),
    cadence: 'Half-yearly',
    lastResult: 'not-run',
    maturity: 'target-architecture',
    note: t('Production requirement. No multi-zone deployment exists in this environment to exercise.'),
  },
  {
    id: 'test-gateway-degrade',
    name: t('AI gateway degradation test'),
    cadence: 'Per release',
    lastResult: 'passed',
    maturity: 'demonstration-status',
    note: t('The demonstration does verify that AI features withhold rather than bypass policy when the gateway is made unavailable.'),
  },
  {
    id: 'test-continuity-runbook',
    name: t('Continuity runbook review'),
    cadence: 'Half-yearly',
    lastResult: 'passed-with-findings',
    maturity: 'demonstration-status',
    note: t('The runbook is documented as target architecture; the review confirms it is complete but untested against live infrastructure.'),
  },
]
}
export let RESILIENCE_TESTS: ResilienceTest[] = build$RESILIENCE_TESTS()
registerLayer(() => {
  RESILIENCE_TESTS = build$RESILIENCE_TESTS()
})

/** A count of platform services flagged as simulated, for the posture summary. */
export let SIMULATED_SERVICE_COUNT = 0

registerLayer(() => {
  SIMULATED_SERVICE_COUNT = PLATFORM_SERVICES.filter((s) => s.simulated).length
})
