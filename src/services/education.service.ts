import { EDUCATION_WARD_SUMMARY, MUNICIPAL_SCHOOLS } from '@/data/civic.data'
import { filterByScope } from '@/security/access'
import type { EducationWardSummary, MunicipalSchool } from '@/types/civic-services'
import type { User } from '@/types/organisation'
import { deepClone, scopeToTenant, simulateLatency } from './client'

/**
 * src/services/education.service.ts
 *
 * Municipal schools, gated on `resource: 'ward'` + `domain: 'education'` -
 * the same pattern every ward-distributed service in this platform uses, so a
 * ward-scoped principal sees their own schools and nobody else's.
 *
 * Nothing in this service reaches a pupil. The unit of record is the SCHOOL:
 * its establishment, its building and its aggregate attainment. There is no
 * pupil register, no name and no individual attendance record anywhere in the
 * model, and there is no service method that could return one.
 */

async function schools(user: User | null, wardId?: string): Promise<MunicipalSchool[]> {
  await simulateLatency(`education.schools:${wardId ?? 'all'}`)
  const base = wardId ? MUNICIPAL_SCHOOLS.filter((s) => s.wardId === wardId) : MUNICIPAL_SCHOOLS
  const scoped = scopeToTenant(user, base)
  const visible = filterByScope(user, scoped, (s) => ({ wardId: s.wardId, domain: 'education' }), 'ward')
  return deepClone(visible)
}

async function wardSummary(user: User | null): Promise<EducationWardSummary[]> {
  await simulateLatency('education.wardSummary')
  const visible = filterByScope(user, EDUCATION_WARD_SUMMARY, (s) => ({ wardId: s.wardId, domain: 'education' }), 'ward')
  return deepClone(visible)
}

export const educationService = {
  schools,
  wardSummary,
}
