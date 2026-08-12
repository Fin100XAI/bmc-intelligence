import {
  BACKUP_POSTURE,
  FAILOVER_POSTURE,
  RESILIENCE_TESTS,
  SIMULATED_SERVICE_COUNT,
  type BackupPosture,
  type FailoverComponent,
  type ResilienceTest,
} from '@/data/dr.data'
import { assertAccess, deepClone, simulateLatency } from './client'
import type { User } from '@/types/organisation'

/**
 * src/services/dr.service.ts
 *
 * Resilience and Disaster Recovery posture.
 *
 * Gated on platform view, like the rest of the Trust Centre operational
 * surfaces. Everything returned is labelled by maturity — target architecture
 * versus demonstration status — so the reader can never mistake a design intent
 * for an operational capability.
 */

export interface DRPosture {
  backups: BackupPosture[]
  failover: FailoverComponent[]
  tests: ResilienceTest[]
  simulatedServiceCount: number
}

async function posture(user: User | null): Promise<DRPosture> {
  await simulateLatency('dr.posture')
  assertAccess(user, 'platform', 'view', { domain: 'platform' }, {
    resourceType: 'DR Posture',
    resourceId: 'all',
    resourceLabel: 'Resilience and DR posture',
  })

  return deepClone({
    backups: BACKUP_POSTURE,
    failover: FAILOVER_POSTURE,
    tests: RESILIENCE_TESTS,
    simulatedServiceCount: SIMULATED_SERVICE_COUNT,
  })
}

export const drService = {
  posture,
}
