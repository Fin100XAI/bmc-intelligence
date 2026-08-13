import { TENANT_ID } from '@/config/municipality.config'
import type {
  CorrespondenceDocumentType,
  CorrespondencePosition,
  CorrespondenceStatus,
  CorrespondenceSubject,
  GovernmentResolution,
  IssuingDepartment,
} from '@/types/correspondence'
import { det, isoDaysFromAnchor } from '@/utils/deterministic'
import { WARDS } from './reference'
import { CITY_SCALE, scaledCount } from './scale'
import { registerLayer } from './runtime'
import { t } from '@/i18n'

/**
 * src/data/correspondence.data.ts
 *
 * Government Resolutions and state directives. The first three template
 * subjects below are grounded in real, reported matters - the state's order
 * fixing Brihanmumbai's elections at 227 wards, the capital-value property
 * tax rework following the Supreme Court's 2023 order, and the environmental
 * and CRZ directives bearing on the Coastal Road project - carried here as
 * the KIND of matter this register exists for, not as a reproduction of any
 * actual GR text or reference number, which this demonstration environment
 * does not hold.
 */

export let GOVERNMENT_RESOLUTIONS: GovernmentResolution[] = []
export let CORRESPONDENCE_POSITION: CorrespondencePosition = {
  received12m: 0,
  underImplementation: 0,
  implemented12m: 0,
  complianceOverdue: 0,
}

interface GrSpec {
  subject: string
  summary: string
  subjectCategory: CorrespondenceSubject
  issuingDepartment: IssuingDepartment
  documentType: CorrespondenceDocumentType
  departmentId: string
}

function build$GR_SPECS(): GrSpec[] {
  return [
    {
      subject: t('Fixation of Corporation Wards at 227 for the General Election'),
      summary: t('Directs the ward delimitation to be given effect for the general election to the Corporation, reverting a prior increase in ward count.'),
      subjectCategory: 'ward-delimitation', issuingDepartment: 'urban-development', documentType: 'government-resolution', departmentId: 'dept-secretary',
    },
    {
      subject: t('Rules for Reworked Capital Value Property Tax Assessment'),
      summary: t('Prescribes the revised basis for capital-value property tax assessment and the treatment of amounts collected under the superseded formula.'),
      subjectCategory: 'property-tax', issuingDepartment: 'urban-development', documentType: 'government-resolution', departmentId: 'dept-assessment',
    },
    {
      subject: t('Environmental Conditions for Coastal Protection Works'),
      summary: t('Sets environmental compliance conditions and monitoring obligations for coastal protection and reclamation works undertaken by the Corporation.'),
      subjectCategory: 'coastal-road', issuingDepartment: 'environment', documentType: 'notification', departmentId: 'dept-coastal',
    },
    {
      subject: t('Pre-Monsoon Preparedness Directive'),
      summary: t('Annual directive requiring desilting completion, pump readiness certification and district-level coordination ahead of the monsoon.'),
      subjectCategory: 'disaster-management', issuingDepartment: 'disaster-management', documentType: 'circular', departmentId: 'dept-disaster',
    },
    {
      subject: t('Solid Waste Management Rules Compliance Directive'),
      summary: t('Directs compliance reporting against the Solid Waste Management Rules, including segregation-at-source targets and processing capacity utilisation.'),
      subjectCategory: 'solid-waste', issuingDepartment: 'environment', documentType: 'circular', departmentId: 'dept-solid-waste',
    },
    {
      subject: t('Recruitment Norms for Sanctioned Vacant Posts'),
      summary: t('Revises the approval route required before a sanctioned but vacant post in the municipal establishment may be filled.'),
      subjectCategory: 'establishment', issuingDepartment: 'general-administration', documentType: 'government-resolution', departmentId: 'dept-personnel',
    },
    {
      subject: t('Metro and Coastal Infrastructure Coordination Protocol'),
      summary: t('Sets the coordination protocol between the Corporation and the state infrastructure agencies executing metro and coastal works within its limits.'),
      subjectCategory: 'coastal-road', issuingDepartment: 'urban-development', documentType: 'government-order', departmentId: 'dept-projects',
    },
    {
      subject: t('Revised Municipal Accounting and Reporting Format'),
      summary: t('Prescribes the revised format for municipal budget and expenditure reporting to the state Finance Department.'),
      subjectCategory: 'other', issuingDepartment: 'finance', documentType: 'government-resolution', departmentId: 'dept-finance',
    },
  ]
}
let GR_SPECS: GrSpec[] = build$GR_SPECS()
registerLayer(() => {
  GR_SPECS = build$GR_SPECS()
})

registerLayer(() => {
  const scale = CITY_SCALE

  const count = scaledCount(46, scale.population, 14)
  GOVERNMENT_RESOLUTIONS = Array.from({ length: count }, (_, i) => {
    const r = det(`gr:${i}`)
    const spec = GR_SPECS[i % GR_SPECS.length]!
    const issuedDaysAgo = r.int(10, 900)
    const receivedLag = r.int(1, 9)
    const status = r.weighted([
      ['received', 3], ['under-implementation', 4], ['implemented', 6], ['superseded', 1], ['compliance-overdue', 1],
    ] as const) as CorrespondenceStatus
    const hasDeadline = r.chance(0.42)
    // The archive-style long numeric reference format Maharashtra's own GR
    // portal uses, rather than a fabricated department-style code - GRs are
    // not numbered the way an internal municipal register is.
    const grNumber = `${2020 + r.int(0, 6)}${String(r.int(1, 12)).padStart(2, '0')}${String(r.int(1, 28)).padStart(2, '0')}${String(r.int(1000000000, 1999999999))}`

    return {
      id: `gr-${String(i + 1).padStart(4, '0')}`,
      tenantId: TENANT_ID,
      reference: `${spec.issuingDepartment === 'urban-development' ? 'UDD' : spec.issuingDepartment.toUpperCase().slice(0, 3)}-${grNumber.slice(0, 18)}`,
      issuingDepartment: spec.issuingDepartment,
      documentType: spec.documentType,
      subjectCategory: spec.subjectCategory,
      subject: spec.subject,
      summary: spec.summary,
      issuedAt: isoDaysFromAnchor(-issuedDaysAgo),
      receivedAt: isoDaysFromAnchor(-issuedDaysAgo + receivedLag),
      complianceDeadline: hasDeadline ? isoDaysFromAnchor(-issuedDaysAgo + r.int(30, 240)) : undefined,
      status,
      linkedDepartmentIds: [spec.departmentId],
      wardIds: spec.subjectCategory === 'ward-delimitation' || spec.subjectCategory === 'coastal-road'
        ? r.sample(WARDS, r.int(2, 6)).map((w) => w.id)
        : [],
      classification: 'internal',
    }
  })

  const yearStart = isoDaysFromAnchor(-365)
  const recent = GOVERNMENT_RESOLUTIONS.filter((g) => g.receivedAt >= yearStart)

  CORRESPONDENCE_POSITION = {
    received12m: recent.length,
    underImplementation: GOVERNMENT_RESOLUTIONS.filter((g) => g.status === 'under-implementation').length,
    implemented12m: recent.filter((g) => g.status === 'implemented').length,
    complianceOverdue: GOVERNMENT_RESOLUTIONS.filter((g) => g.status === 'compliance-overdue').length,
  }
})
