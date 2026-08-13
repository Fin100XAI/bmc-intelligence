import type { DataClassification, IsoDateTime, TenantId } from './common'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/**
 * src/types/correspondence.ts
 *
 * Government Resolutions, circulars and notifications the state issues to
 * the Corporation - the paper trail that authorises or directs a great deal
 * of what the platform's other screens show as already-decided fact.
 *
 * A GR (शासन निर्णय) is a formal order issued by a state department -
 * overwhelmingly, for a municipal corporation, the Urban Development
 * Department - directing policy or action. It is distinct from a circular
 * (परिपत्रक), which clarifies procedure under authority a GR or statute
 * already grants, and from a notification (अधिसूचना), which is
 * gazette-backed and carries direct statutory force. Three real matters of
 * record ground the category set below: the state's 2025 order fixing
 * Brihanmumbai's elections at 227 wards after reverting a prior 236-ward
 * delimitation; the capital-value property tax rules reworked following the
 * Supreme Court's 2023 order; and the environmental and CRZ directives
 * bearing on the Coastal Road project's clearance history.
 */

export type IssuingDepartment =
  | 'urban-development'
  | 'revenue-forest'
  | 'home'
  | 'environment'
  | 'disaster-management'
  | 'finance'
  | 'general-administration'

function build$ISSUING_DEPARTMENT_LABEL(): Record<IssuingDepartment, string> {
  return {
  'urban-development': t('Urban Development Department'),
  'revenue-forest': t('Revenue & Forest Department'),
  home: t('Home Department'),
  environment: t('Environment & Climate Change Department'),
  'disaster-management': t('Disaster Management, Relief & Rehabilitation Department'),
  finance: t('Finance Department'),
  'general-administration': t('General Administration Department'),
}
}
export let ISSUING_DEPARTMENT_LABEL: Record<IssuingDepartment, string> = build$ISSUING_DEPARTMENT_LABEL()
registerLayer(() => {
  ISSUING_DEPARTMENT_LABEL = build$ISSUING_DEPARTMENT_LABEL()
})

export type CorrespondenceDocumentType = 'government-resolution' | 'circular' | 'notification' | 'government-order'

function build$DOCUMENT_TYPE_LABEL(): Record<CorrespondenceDocumentType, string> {
  return {
  'government-resolution': t('Government Resolution'),
  circular: t('Circular'),
  notification: t('Notification'),
  'government-order': t('Government Order'),
}
}
export let DOCUMENT_TYPE_LABEL: Record<CorrespondenceDocumentType, string> = build$DOCUMENT_TYPE_LABEL()
registerLayer(() => {
  DOCUMENT_TYPE_LABEL = build$DOCUMENT_TYPE_LABEL()
})

export type CorrespondenceSubject =
  | 'property-tax'
  | 'ward-delimitation'
  | 'coastal-road'
  | 'disaster-management'
  | 'solid-waste'
  | 'environment'
  | 'establishment'
  | 'other'

function build$CORRESPONDENCE_SUBJECT_LABEL(): Record<CorrespondenceSubject, string> {
  return {
  'property-tax': t('Property Tax'),
  'ward-delimitation': t('Ward Delimitation'),
  'coastal-road': t('Coastal Road / Infrastructure'),
  'disaster-management': t('Disaster Management'),
  'solid-waste': t('Solid Waste Management'),
  environment: t('Environment & Climate'),
  establishment: t('Establishment & Personnel'),
  other: t('Other'),
}
}
export let CORRESPONDENCE_SUBJECT_LABEL: Record<CorrespondenceSubject, string> = build$CORRESPONDENCE_SUBJECT_LABEL()
registerLayer(() => {
  CORRESPONDENCE_SUBJECT_LABEL = build$CORRESPONDENCE_SUBJECT_LABEL()
})

export type CorrespondenceStatus = 'received' | 'under-implementation' | 'implemented' | 'superseded' | 'compliance-overdue'

function build$CORRESPONDENCE_STATUS_LABEL(): Record<CorrespondenceStatus, string> {
  return {
  received: t('Received'),
  'under-implementation': t('Under Implementation'),
  implemented: t('Implemented'),
  superseded: t('Superseded'),
  'compliance-overdue': t('Compliance Overdue'),
}
}
export let CORRESPONDENCE_STATUS_LABEL: Record<CorrespondenceStatus, string> = build$CORRESPONDENCE_STATUS_LABEL()
registerLayer(() => {
  CORRESPONDENCE_STATUS_LABEL = build$CORRESPONDENCE_STATUS_LABEL()
})

/**
 * A Government Resolution, circular, notification or government order
 * bearing on the Corporation.
 *
 * `complianceDeadline` is carried only where the issuing department set one
 * explicitly - a great many GRs direct policy without a compliance date, and
 * treating silence as a deadline would manufacture urgency the document
 * itself does not carry.
 */
export interface GovernmentResolution {
  id: string
  tenantId: TenantId
  reference: string
  issuingDepartment: IssuingDepartment
  documentType: CorrespondenceDocumentType
  subjectCategory: CorrespondenceSubject
  subject: string
  summary: string
  issuedAt: IsoDateTime
  receivedAt: IsoDateTime
  complianceDeadline?: IsoDateTime
  status: CorrespondenceStatus
  linkedDepartmentIds: string[]
  wardIds: string[]
  classification: DataClassification
}

export interface CorrespondencePosition {
  received12m: number
  underImplementation: number
  implemented12m: number
  complianceOverdue: number
}
