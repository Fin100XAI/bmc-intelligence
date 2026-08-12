import { TENANT_ID, activeCorporation } from '@/config/municipality.config'
import { det, isoDaysFromAnchor } from '@/utils/deterministic'
import { localityFor } from './naming'
import { WARDS } from './reference'
import { registerLayer } from './runtime'
import type { IntelligenceDomain, Severity } from '@/types/common'
import type { MemoryKind, MemoryRecord } from '@/types/knowledge'
import { t } from '@/i18n'

/** ---------------------------------------------------------------------
 * Institutional Memory dataset (§41)
 *
 * Synthetic historical records — decisions, incidents, lessons, project
 * outcomes, SOPs, meeting outcomes, audit observations and interventions the
 * corporation has accumulated. Deterministic: the same records every load, so
 * the "what did we do last time" answer is stable.
 *
 * Related records are wired within the same domain so the institutional memory
 * reads as a connected record rather than a flat list.
 *
 * Where a record names a place, the name comes from the ACTIVE corporation's
 * own published localities through `./naming.ts` — never a real place borrowed
 * from another city. Where a record turns on a drainage condition, that
 * condition is the one the corporation's own geography actually produces: a
 * blocking tide on a coast, a river above outfall level on a river, a
 * saturated catchment inland. The lesson is the same in every case.
 *
 * Every export below is a LIVE BINDING, rebuilt on a corporation switch.
 * ------------------------------------------------------------------- */

interface MemorySeed {
  id: string
  kind: MemoryKind
  title: string
  summary: string
  outcome: string
  lesson: string
  domain: IntelligenceDomain
  departmentId: string
  significance: Severity
  daysAgo: number
  tags: string[]
  wardCount: number
}

/**
 * Why a drain stops discharging when it rains hardest.
 *
 * The seed records were written for a coastal corporation, where that
 * condition is a high tide holding the outfalls shut. Inland the mechanism is
 * different — a river above outfall level, a lake at full supply level, or a
 * catchment already saturated — but the institutional lesson is identical:
 * design for heavy rain arriving while the outfall is blocked, not for heavy
 * rain on its own. Only a corporation that actually has a tide is told about
 * tides.
 */
interface DrainageFraming {
  /** The aggravating window, as a definite noun phrase. */
  window: string
  /** The same condition, as an adverbial clause. */
  during: string
  /** Why discharge stops, as a present-tense clause. */
  blockedClause: string
  /** The condition pumping capacity has to be sized against. */
  designCase: string
  /** How often the catchment floods, as a frequency clause. */
  recurrence: string
  /** The tag recorded against records about this condition. */
  tag: string
}

function drainageFraming(): DrainageFraming {
  switch (activeCorporation.form.type) {
    case 'coastal':
    case 'creek-side':
      return {
        window: 'the high-tide window',
        during: 'during a high tide',
        blockedClause: 'drains cannot discharge to sea',
        designCase: 'the tide-blocked condition',
        recurrence: 'on every high tide',
        tag: 'tide',
      }
    case 'riverine':
      return {
        window: 'the high river-stage window',
        during: 'while the river is in spate',
        blockedClause: 'the drains cannot discharge against a river running above outfall level',
        designCase: 'the river-blocked condition',
        recurrence: 'every time the river runs high',
        tag: 'river-stage',
      }
    case 'lakeside':
      return {
        window: 'the full-supply-level window',
        during: 'while the lake is at full supply level',
        blockedClause: 'the drains cannot discharge against a lake standing above outfall level',
        designCase: 'the lake-blocked condition',
        recurrence: 'every time the lake reaches full supply level',
        tag: 'lake-level',
      }
    default:
      return {
        window: 'the saturated-catchment window',
        during: 'on ground that is already saturated',
        blockedClause: 'the drains cannot discharge into an already surcharged outfall',
        designCase: 'the surcharged-outfall condition',
        recurrence: 'every time the ground is already saturated',
        tag: 'saturated-catchment',
      }
  }
}

function memorySeeds(): MemorySeed[] {
  const drainage = drainageFraming()
  const lowPoint = localityFor('memory:chronic-low-point')
  const complaintCluster = localityFor('memory:complaint-cluster')

  return [
    {
      id: 'mem-monsoon-chronic-low-point',
      kind: 'intervention',
      title: t('{0} chronic flooding — underground tank intervention', lowPoint),
      summary:
        t('A locality that flooded in every heavy-rain event for years despite repeated desilting, sitting in a natural depression where run-off collected faster than the drains could clear it.'),
      outcome:
        t('Underground holding tanks were commissioned to buffer peak run-off and pump it out once {0} had passed. Recorded waterlogging duration in subsequent heavy-rain events fell substantially.', drainage.window),
      lesson:
        'Where a location floods because it is a low point, clearing the drains does not solve it — the water has nowhere to go. Buffering storage addresses the cause; desilting alone treats a symptom.',
      domain: 'monsoon',
      departmentId: 'dept-stormwater',
      significance: 'high',
      daysAgo: 640,
      tags: ['flooding', 'chronic-location', 'holding-tank', 'drainage'],
      wardCount: 1,
    },
    {
      id: 'mem-decision-water-tanker-audit',
      kind: 'decision',
      title: t('Tanker dependency reduction in deficit zones'),
      summary:
        t('Several zones were meeting demand through expensive tanker supply rather than network supply, at recurring cost and with no path to resolution.'),
      outcome:
        t('A decision case prioritised network augmentation in the highest-dependency zones over uniform distribution. Tanker spend in the targeted zones reduced over the following two quarters.'),
      lesson:
        'Persistent tanker dependency is a capital-investment signal, not an operating-cost line to be renewed indefinitely. Route the recurring spend into the network where the dependency is structural.',
      domain: 'water',
      departmentId: 'dept-hydraulic',
      significance: 'high',
      daysAgo: 410,
      tags: ['water', 'tanker', 'capital-investment', 'decision-case'],
      wardCount: 3,
    },
    {
      id: 'mem-incident-bridge-audit',
      kind: 'incident',
      title: t('Foot overbridge structural failure'),
      summary:
        t('A foot overbridge failed during peak hours. A subsequent review found the structure had been flagged in an inspection but the observation had not been closed.'),
      outcome:
        t('An emergency audit of every comparable structure was ordered. Inspection observations were made mandatory-close items with escalation on breach of the rectification window.'),
      lesson:
        'An open inspection observation is a live risk, not a backlog item. The failure was not a lack of inspection — it was an inspection whose finding was never closed.',
      domain: 'assets',
      departmentId: 'dept-projects',
      significance: 'critical',
      daysAgo: 900,
      tags: ['structural', 'inspection', 'audit', 'safety'],
      wardCount: 2,
    },
    {
      id: 'mem-lesson-complaint-clustering',
      kind: 'lesson',
      title: t('Recurring complaints signalled an underlying asset, not service failure'),
      summary:
        t('A ward showed a persistent cluster of drainage complaints treated as a service backlog and closed repeatedly, only to reopen.'),
      outcome:
        t('Root-cause analysis associated the cluster with a single collapsed drain reach at {0}. One capital repair closed the majority of the recurring complaints.', complaintCluster),
      lesson:
        'A recurring complaint cluster in one locality is usually one broken asset, not many independent service failures. Fix the asset once rather than closing the complaints many times.',
      domain: 'citizen-services',
      departmentId: 'dept-commissioner',
      significance: 'medium',
      daysAgo: 300,
      tags: ['complaints', 'root-cause', 'drainage', 'recurring'],
      wardCount: 1,
    },
    {
      id: 'mem-project-outcome-road-concrete',
      kind: 'project-outcome',
      title: t('Concretisation programme reduced monsoon road failure'),
      summary:
        t('A programme to concretise arterial roads previously resurfaced with asphalt every year, at recurring cost and recurring monsoon failure.'),
      outcome:
        t('Concretised stretches recorded materially fewer defects through the following two monsoons. Annual resurfacing spend on those stretches ceased.'),
      lesson:
        'On stretches that fail every monsoon, the cheaper unit cost of asphalt is a false economy — the recurring replacement cost exceeds the durable option within a few seasons.',
      domain: 'roads',
      departmentId: 'dept-roads',
      significance: 'high',
      daysAgo: 520,
      tags: ['roads', 'concretisation', 'monsoon', 'lifecycle-cost'],
      wardCount: 4,
    },
    {
      id: 'mem-sop-heavy-rain-response',
      kind: 'sop',
      title: t('Heavy-rainfall response standard operating procedure'),
      summary:
        t('The standing procedure activated when rainfall crosses the heavy threshold within {0} — the two conditions that produce the worst waterlogging together.', drainage.window),
      outcome:
        t('Defines pump pre-activation, ward-officer standby, hospital-access route monitoring and the escalation chain into the Situation Room. Reviewed after each monsoon.'),
      lesson:
        `The dangerous condition is not heavy rain alone but heavy rain ${drainage.during}, when ${drainage.blockedClause}. The SOP triggers on the combination, not on rainfall alone.`,
      domain: 'disaster',
      departmentId: 'dept-disaster',
      significance: 'high',
      daysAgo: 200,
      tags: ['sop', 'monsoon', drainage.tag, 'response'],
      wardCount: 0,
    },
    {
      id: 'mem-meeting-budget-reprioritisation',
      kind: 'meeting',
      title: t('Mid-year capital reprioritisation review'),
      summary:
        t('A mid-year review of capital works where several sanctioned projects had not started and were unlikely to spend within the year.'),
      outcome:
        t('Unstarted low-readiness works were deferred and the released provision redirected to works with delivery capacity. The decisions and their rationale were minuted against named owners.'),
      lesson:
        'Sanctioned but unstarted capital is idle provision. A mid-year review that reallocates it to works that can actually spend improves utilisation without new money.',
      domain: 'budget',
      departmentId: 'dept-finance',
      significance: 'medium',
      daysAgo: 150,
      tags: ['budget', 'capital', 'reprioritisation', 'utilisation'],
      wardCount: 0,
    },
    {
      id: 'mem-audit-payment-progress',
      kind: 'audit-observation',
      title: t('Payment-ahead-of-progress reconciliation finding'),
      summary:
        t('A routine audit found a set of works where released payment ran materially ahead of recorded physical progress.'),
      outcome:
        t('Each case was reconciled on its own facts. Most were timing differences between the measurement and payment systems; a minority required a progress re-measurement. No wrongdoing was found.'),
      lesson:
        'Payment ahead of progress is a reconciliation trigger, not a finding. Progress and payment are maintained in different systems and legitimately diverge — the audit value is in reconciling, not accusing.',
      domain: 'projects',
      departmentId: 'dept-finance',
      significance: 'medium',
      daysAgo: 250,
      tags: ['audit', 'payment', 'progress', 'reconciliation'],
      wardCount: 3,
    },
    {
      id: 'mem-intervention-dengue-cluster',
      kind: 'intervention',
      title: t('Vector-risk intervention on standing water and waste coincidence'),
      summary:
        t('Wards showing a rise in vector-borne health indicators were found to have waste accumulation coinciding with standing-water locations — the recognised breeding combination.'),
      outcome:
        t('A joint solid-waste and health intervention cleared the coincident sites ahead of the season. The targeted wards recorded a smaller indicator rise than comparable untreated wards.'),
      lesson:
        'Vector risk sits at the intersection of two departments — waste and standing water. A single-department response misses it; the intervention has to be joint to address the actual breeding condition.',
      domain: 'health',
      departmentId: 'dept-health',
      significance: 'high',
      daysAgo: 380,
      tags: ['public-health', 'vector', 'waste', 'cross-domain'],
      wardCount: 5,
    },
    {
      id: 'mem-decision-contractor-continuity',
      kind: 'decision',
      title: t('Category concentration continuity decision'),
      summary:
        t('A single supplier held most of the contracted value in one works category, creating a delivery-continuity exposure if that supplier underperformed.'),
      outcome:
        t('Rather than an accusation, the decision widened the empanelment for that category to reduce single-supplier dependency on future tenders. Existing contracts ran to completion.'),
      lesson:
        'Category concentration is a continuity risk to the corporation, not a comment on the supplier. The remedy is widening the future supplier base, not action against the incumbent.',
      domain: 'procurement',
      departmentId: 'dept-procurement',
      significance: 'medium',
      daysAgo: 470,
      tags: ['procurement', 'concentration', 'continuity', 'decision-case'],
      wardCount: 0,
    },
    {
      id: 'mem-lesson-situation-room-fatigue',
      kind: 'lesson',
      title: t('Alert fatigue degraded Situation Room response'),
      summary:
        t('During a prolonged event, a high volume of low-severity alerts obscured the critical ones and slowed response to the alerts that mattered.'),
      outcome:
        t('Alert thresholds were retuned and a severity-first ordering was made the Situation Room default. Time-to-acknowledge on critical alerts improved in the next exercise.'),
      lesson:
        'More alerts is not more safety. Below a signal-to-noise floor, additional low-severity alerts actively degrade response by hiding the critical ones. Tune for severity, not volume.',
      domain: 'disaster',
      departmentId: 'dept-disaster',
      significance: 'high',
      daysAgo: 340,
      tags: ['situation-room', 'alerts', 'response', 'signal-to-noise'],
      wardCount: 0,
    },
    {
      id: 'mem-project-outcome-pumping-station',
      kind: 'project-outcome',
      title: t('Pumping station upgrade at a chronic waterlogging outfall'),
      summary:
        t('A pumping station serving a chronic waterlogging catchment was upgraded after years of the catchment flooding whenever heavy rain arrived {0}.', drainage.during),
      outcome:
        t('Post-upgrade, the catchment cleared within the design window in subsequent events where heavy rain coincided with {0}. It moved off the chronic-location register.', drainage.window),
      lesson:
        `A catchment that floods ${drainage.recurrence} needs pumping capacity sized to ${drainage.designCase}, not the average condition. Design for the worst coincidence, because that is when it floods.`,
      domain: 'stormwater',
      departmentId: 'dept-stormwater',
      significance: 'high',
      daysAgo: 720,
      tags: ['pumping', drainage.tag, 'chronic-location', 'monsoon'],
      wardCount: 2,
    },
  ]
}

/** Relate records within a domain, plus a few deliberate cross-domain links. */
const EXPLICIT_RELATIONS: Record<string, string[]> = {
  'mem-monsoon-chronic-low-point': ['mem-project-outcome-pumping-station', 'mem-sop-heavy-rain-response'],
  'mem-project-outcome-pumping-station': ['mem-monsoon-chronic-low-point', 'mem-sop-heavy-rain-response'],
  'mem-sop-heavy-rain-response': ['mem-monsoon-chronic-low-point', 'mem-lesson-situation-room-fatigue'],
  'mem-lesson-complaint-clustering': ['mem-audit-payment-progress'],
  'mem-audit-payment-progress': ['mem-decision-contractor-continuity'],
  'mem-intervention-dengue-cluster': ['mem-project-outcome-road-concrete'],
}

export let MEMORY_RECORDS: MemoryRecord[] = []
export let MEMORY_BY_ID: Map<string, MemoryRecord> = new Map()

registerLayer(() => {
  MEMORY_RECORDS = memorySeeds().map((seed) => {
    const r = det(`memory:${seed.id}`)
    const wardIds =
      seed.wardCount > 0 ? r.sample(WARDS, Math.min(seed.wardCount, WARDS.length)).map((w) => w.id) : []

    return {
      id: seed.id,
      tenantId: TENANT_ID,
      kind: seed.kind,
      title: seed.title,
      summary: seed.summary,
      outcome: seed.outcome,
      lesson: seed.lesson,
      domain: seed.domain,
      wardIds,
      departmentId: seed.departmentId,
      occurredAt: isoDaysFromAnchor(-seed.daysAgo),
      significance: seed.significance,
      tags: seed.tags,
      relatedIds: EXPLICIT_RELATIONS[seed.id] ?? [],
    }
  })

  MEMORY_BY_ID = new Map(MEMORY_RECORDS.map((m) => [m.id, m]))
})
