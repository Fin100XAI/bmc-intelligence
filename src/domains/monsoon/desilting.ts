import type {
  DesiltingContractorPosition,
  DesiltingProgramme,
  DesiltingUnitPosition,
  DesiltingWorkOrder,
  WorkVerification,
} from '@/types/city-domains'
import type { OperationalState } from '@/types/common'
import { DEMO_NOW } from '@/utils/deterministic'
import { t } from '@/i18n'

/**
 * The seasonal desilting programme, summarised.
 *
 * Pure and total: it derives everything from the orders it is handed and
 * reads no module state. That is what lets the same function serve the
 * city-wide binding in `src/data/monsoon-ops.data.ts` AND the permission-
 * scoped roll-up in `src/services/monsoon.service.ts`. A ward officer sees
 * the programme summed over the wards they hold, computed by exactly the
 * arithmetic that produced the city figure - not a city total they are not
 * entitled to, and not a second implementation that could drift from it.
 *
 * Administrative units are grouped out of the orders rather than iterated
 * from the ward register, so a scoped call summarises the scope it was given
 * and never reports a ward with no visible orders as a ward at zero.
 */

/**
 * Pre-monsoon works are to be finished before the rains arrive. The last day
 * of May is the deadline the corporations of this state work to, and it is
 * what makes the programme readable as either on time or overdue rather than
 * merely incomplete.
 */
export function desiltingCycle(): { cycleLabel: string; deadlineAt: string; daysToDeadline: number } {
  const year = DEMO_NOW.getUTCFullYear()
  const deadline = new Date(Date.UTC(year, 4, 31, 18, 30, 0))
  return {
    cycleLabel: t('Pre-monsoon {0}', String(year)),
    deadlineAt: deadline.toISOString(),
    daysToDeadline: Math.round((deadline.getTime() - DEMO_NOW.getTime()) / 86_400_000),
  }
}

/** Quantum corroborated by something other than the contractor's own record. */
function verifiedQuantum(order: DesiltingWorkOrder): number {
  if (order.tripsRecorded === 0) return 0
  return (order.removedQuantumMt * order.tripsVerified) / order.tripsRecorded
}

export function desiltingState(completionPct: number, verification: WorkVerification): OperationalState {
  if (verification === 'disputed') return 'critical'
  if (completionPct >= 98) return 'operational'
  if (completionPct >= 85) return 'degraded'
  if (completionPct >= 70) return 'at-risk'
  return 'critical'
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function emptyDesiltingProgramme(): DesiltingProgramme {
  const cycle = desiltingCycle()
  return {
    cycleLabel: cycle.cycleLabel,
    deadlineAt: cycle.deadlineAt,
    daysToDeadline: cycle.daysToDeadline,
    ordersTotal: 0,
    sanctionedQuantumMt: 0,
    removedQuantumMt: 0,
    verifiedQuantumMt: 0,
    completionPct: 0,
    verifiedSharePct: 0,
    valueLakh: 0,
    unverifiedValueLakh: 0,
    disputedOrders: 0,
    ordersBelowTarget: 0,
    byUnit: [],
    byContractor: [],
  }
}

export function summariseDesiltingProgramme(orders: DesiltingWorkOrder[]): DesiltingProgramme {
  const cycle = desiltingCycle()
  if (orders.length === 0) return emptyDesiltingProgramme()

  const sanctioned = orders.reduce((s, o) => s + o.sanctionedQuantumMt, 0)
  const removed = orders.reduce((s, o) => s + o.removedQuantumMt, 0)
  const verified = orders.reduce((s, o) => s + verifiedQuantum(o), 0)

  /* -- by administrative unit ------------------------------------------- */
  const unitIds = [...new Set(orders.map((o) => o.wardId))]
  const byUnit: DesiltingUnitPosition[] = unitIds.map((wardId) => {
    const mine = orders.filter((o) => o.wardId === wardId)
    const uSanctioned = mine.reduce((s, o) => s + o.sanctionedQuantumMt, 0)
    const uRemoved = mine.reduce((s, o) => s + o.removedQuantumMt, 0)
    const uVerified = mine.reduce((s, o) => s + verifiedQuantum(o), 0)
    const completionPct = uSanctioned === 0 ? 0 : (uRemoved / uSanctioned) * 100
    return {
      wardId,
      zoneId: mine[0]?.zoneId ?? '',
      orders: mine.length,
      completionPct: round1(completionPct),
      verifiedSharePct: uRemoved === 0 ? 0 : round1((uVerified / uRemoved) * 100),
      sanctionedQuantumMt: uSanctioned,
      removedQuantumMt: uRemoved,
      state: desiltingState(
        completionPct,
        mine.some((o) => o.verification === 'disputed') ? 'disputed' : 'photo-verified',
      ),
    }
  })
  byUnit.sort((a, b) => a.completionPct - b.completionPct)

  /* -- by contractor ----------------------------------------------------- */
  const contractorIds = [...new Set(orders.map((o) => o.contractorId))]
  const byContractor: DesiltingContractorPosition[] = contractorIds.map((contractorId) => {
    const mine = orders.filter((o) => o.contractorId === contractorId)
    const cSanctioned = mine.reduce((s, o) => s + o.sanctionedQuantumMt, 0)
    const cRemoved = mine.reduce((s, o) => s + o.removedQuantumMt, 0)
    const cVerified = mine.reduce((s, o) => s + verifiedQuantum(o), 0)
    return {
      contractorId,
      contractorName: mine[0]?.contractorName ?? '',
      orders: mine.length,
      sanctionedQuantumMt: cSanctioned,
      removedQuantumMt: cRemoved,
      verifiedQuantumMt: Math.round(cVerified),
      completionPct: cSanctioned === 0 ? 0 : round1((cRemoved / cSanctioned) * 100),
      unverifiedSharePct: cRemoved === 0 ? 0 : round1((1 - cVerified / cRemoved) * 100),
      unverifiedValueLakh: round2(mine.reduce((s, o) => s + o.unverifiedValueLakh, 0)),
      disputedOrders: mine.filter((o) => o.verification === 'disputed').length,
    }
  })
  // Heaviest uncorroborated value first: the order an officer would work it in.
  byContractor.sort((a, b) => b.unverifiedValueLakh - a.unverifiedValueLakh)

  return {
    cycleLabel: cycle.cycleLabel,
    deadlineAt: cycle.deadlineAt,
    daysToDeadline: cycle.daysToDeadline,
    ordersTotal: orders.length,
    sanctionedQuantumMt: sanctioned,
    removedQuantumMt: removed,
    verifiedQuantumMt: Math.round(verified),
    completionPct: sanctioned === 0 ? 0 : round1((removed / sanctioned) * 100),
    verifiedSharePct: removed === 0 ? 0 : round1((verified / removed) * 100),
    valueLakh: round2(orders.reduce((s, o) => s + o.valueLakh, 0)),
    unverifiedValueLakh: round2(orders.reduce((s, o) => s + o.unverifiedValueLakh, 0)),
    disputedOrders: orders.filter((o) => o.verification === 'disputed').length,
    ordersBelowTarget: orders.filter((o) => o.completionPct < 100).length,
    byUnit,
    byContractor,
  }
}
