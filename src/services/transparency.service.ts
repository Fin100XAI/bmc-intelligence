import { activeCorporation, municipality } from '@/config/municipality.config'
import { BUDGET_LINES, CONTRACTS, contractorName } from '@/data/finance.data'
import { COUNCIL_RESOLUTIONS, committeeName } from '@/data/civic.data'
import { GOVERNMENT_RESOLUTIONS } from '@/data/correspondence.data'
import { RTI_APPLICATIONS } from '@/data/legal.data'
import { departmentName } from '@/data/reference'
import { DOCUMENT_TYPE_LABEL, ISSUING_DEPARTMENT_LABEL, CORRESPONDENCE_STATUS_LABEL } from '@/types/correspondence'
import { RESOLUTION_STATUS_LABEL } from '@/types/civic-services'
import type { TransparencyOverview } from '@/types/transparency'
import { isoDaysFromAnchor, isoFromAnchor } from '@/utils/deterministic'
import { t } from '@/i18n'
import { simulateLatency } from './client'

/**
 * src/services/transparency.service.ts
 *
 * The public Transparency Portal's data path - deliberately NOT part of the
 * officer-facing service layer.
 *
 * Every other service in `src/services/*` takes a `User | null` as its first
 * argument and routes every read through `canAccess`/`filterByScope`,
 * because every other screen in this platform is read by a signed-in,
 * permission-scoped principal. A public transparency portal has no
 * principal to scope against - the visitor is anonymous by design, and an
 * anonymous visitor is not "a user the ABAC engine denied everything to",
 * they are outside that system entirely.
 *
 * The safety property here is therefore that this file is a hand-curated
 * SELECT, not a filter: it names the exact fields it exposes from each
 * underlying dataset and nothing else ever reaches the return value - no
 * ward-level breakdown, no individual case detail, no record classified
 * above what is public by law or settled practice (sanctioned budgets,
 * tender awards, Government Resolutions, RTI turnaround statistics, passed
 * council resolutions). Anyone extending this file should keep that
 * discipline: add a named field for a specific public fact, never a spread
 * of an internal record.
 */

async function overview(): Promise<TransparencyOverview> {
  await simulateLatency('transparency.overview')

  const approvedCrore = Math.round(BUDGET_LINES.reduce((s, l) => s + l.approvedCrore, 0) * 10) / 10
  const revisedCrore = Math.round(BUDGET_LINES.reduce((s, l) => s + l.revisedCrore, 0) * 10) / 10
  const actualCrore = Math.round(BUDGET_LINES.reduce((s, l) => s + l.actualCrore, 0) * 10) / 10

  const recentContracts = [...CONTRACTS]
    .sort((a, b) => (a.awardDate < b.awardDate ? 1 : -1))
    .slice(0, 20)
    .map((c) => ({
      reference: c.reference,
      title: c.title,
      contractorName: contractorName(c.contractorId),
      valueCrore: c.valueCrore,
      awardDate: c.awardDate,
      departmentName: departmentName(c.departmentId),
    }))

  const recentResolutions = [...GOVERNMENT_RESOLUTIONS]
    .sort((a, b) => (a.issuedAt < b.issuedAt ? 1 : -1))
    .slice(0, 20)
    .map((g) => ({
      reference: g.reference,
      subject: g.subject,
      issuingDepartment: ISSUING_DEPARTMENT_LABEL[g.issuingDepartment],
      documentType: DOCUMENT_TYPE_LABEL[g.documentType],
      issuedAt: g.issuedAt,
      status: CORRESPONDENCE_STATUS_LABEL[g.status],
    }))

  const recentCouncilResolutions = [...COUNCIL_RESOLUTIONS]
    .filter((r) => r.status === 'passed' || r.status === 'implemented')
    .sort((a, b) => (a.tabledAt < b.tabledAt ? 1 : -1))
    .slice(0, 20)
    .map((r) => ({
      reference: r.reference,
      subject: r.subject,
      committee: committeeName(r.committeeId),
      status: RESOLUTION_STATUS_LABEL[r.status],
      tabledAt: r.tabledAt,
      financialImplicationCrore: r.financialImplicationCrore,
    }))

  const yearStart = isoDaysFromAnchor(-365)
  const recentRti = RTI_APPLICATIONS.filter((a) => a.receivedAt >= yearStart)
  const withinStatutory = recentRti.filter((a) => !a.breached).length

  return {
    municipalityName: municipality.municipalityName,
    city: t(activeCorporation.city),
    generatedAt: isoFromAnchor(0),
    budget: {
      financialYear: municipality.financialYear,
      approvedCrore,
      revisedCrore,
      actualCrore,
      utilisationPct: revisedCrore > 0 ? Math.round((actualCrore / revisedCrore) * 1000) / 10 : 0,
    },
    recentContracts,
    recentResolutions,
    recentCouncilResolutions,
    rti: {
      received12m: recentRti.length,
      respondedWithinStatutoryPeriodPct: recentRti.length > 0 ? Math.round((withinStatutory / recentRti.length) * 1000) / 10 : 0,
      pendingBacklog: RTI_APPLICATIONS.filter((a) => a.status === 'pending').length,
      secondAppeals12m: recentRti.filter((a) => a.status === 'second-appeal').length,
    },
  }
}

export const transparencyService = {
  overview,
}
