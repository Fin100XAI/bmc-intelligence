import { PIPELINE_JOBS, PLATFORM_SERVICES } from '@/data/governance.data'
import { filterByScope } from '@/security/access'
import type { OperationalState } from '@/types/common'
import type { PipelineJob, PlatformService } from '@/types/governance'
import type { User } from '@/types/organisation'
import { assertAccess, deepClone, simulateLatency } from './client'

/**
 * src/services/platform.service.ts
 *
 * Platform health - the honest self-assessment surface. Every simulated
 * component says so explicitly (`PlatformService.simulated`,
 * `PlatformService.note`); nothing here claims a production SLA.
 */

export interface PlatformSummary {
  overallState: OperationalState
  availabilityAvgPct: number
  failingJobs: number
  simulatedServices: number
}

async function services(user: User | null): Promise<PlatformService[]> {
  await simulateLatency('platform.services')
  assertAccess(user, 'platform', 'view', {}, {
    resourceType: 'Platform Service',
    resourceId: 'all',
    resourceLabel: 'Platform services',
  })
  return deepClone(PLATFORM_SERVICES)
}

async function jobs(user: User | null): Promise<PipelineJob[]> {
  await simulateLatency('platform.jobs')
  const visible = filterByScope(user, PIPELINE_JOBS, (j) => ({ domain: j.domain }), 'platform')
  return deepClone(visible)
}

async function summary(user: User | null): Promise<PlatformSummary> {
  await simulateLatency('platform.summary')
  assertAccess(user, 'platform', 'view', {}, {
    resourceType: 'Platform Summary',
    resourceId: 'summary',
    resourceLabel: 'Platform summary',
  })
  const availabilityAvgPct =
    PLATFORM_SERVICES.reduce((sum, p) => sum + p.availabilityPct, 0) / Math.max(1, PLATFORM_SERVICES.length)
  const failingJobs = PIPELINE_JOBS.filter((j) => j.status === 'failed').length
  const simulatedServices = PLATFORM_SERVICES.filter((p) => p.simulated).length
  const overallState: OperationalState = PLATFORM_SERVICES.some((p) => p.state === 'not-connected')
    ? 'degraded'
    : failingJobs > 0
      ? 'at-risk'
      : 'operational'
  return deepClone({
    overallState,
    availabilityAvgPct: Math.round(availabilityAvgPct * 100) / 100,
    failingJobs,
    simulatedServices,
  })
}

export const platformService = {
  services,
  jobs,
  summary,
}
