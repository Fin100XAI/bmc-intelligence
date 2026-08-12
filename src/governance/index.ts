import type { DataClassification } from '@/types/common'
import type { Dataset } from '@/types/governance'
import type { RoleId } from '@/types/organisation'
import { t } from '@/i18n'

/**
 * Data governance helpers.
 *
 * Purpose limitation, minimisation, retention and auditability expressed as
 * enforceable concepts rather than policy prose.
 */

/** The governance dimensions the Trust Centre reports against. */
export const GOVERNANCE_PILLARS = [
  {
    id: 'purpose-limitation',
    label: 'Purpose limitation',
    statement:
      'Every dataset declares the institutional purpose for which it was obtained. Access is granted against that purpose, not against general curiosity.',
  },
  {
    id: 'minimisation',
    label: 'Minimisation',
    statement:
      'Minimisation is applied at the connector boundary, before ingestion. Fields not required for the declared purpose are never transmitted into the platform.',
  },
  {
    id: 'retention',
    label: 'Retention',
    statement:
      'Each dataset carries a declared retention period. Retention is a governance commitment, not a storage default.',
  },
  {
    id: 'access-control',
    label: 'Access controls',
    statement:
      'Role, ward, department, domain and classification are evaluated together on every read. Least privilege is enforced in the data layer, not the interface.',
  },
  {
    id: 'auditability',
    label: 'Auditability',
    statement:
      'Every consequential read and write is recorded with actor, action, resource, reason, session and outcome. Denied access is recorded as carefully as granted access.',
  },
] as const

/** Whether a role may read a dataset under both role list and classification. */
export function datasetReadable(
  dataset: Dataset,
  roleId: RoleId,
  roleCeiling: DataClassification,
): { readable: boolean; reason: string } {
  const order: Record<DataClassification, number> = {
    public: 0,
    internal: 1,
    confidential: 2,
    restricted: 3,
  }

  if (!dataset.allowedRoles.includes(roleId)) {
    return {
      readable: false,
      reason: t('The dataset owner has not authorised {0} for the declared purpose "{1}".', roleId, dataset.purpose),
    }
  }
  if (order[dataset.classification] > order[roleCeiling]) {
    return {
      readable: false,
      reason: t('Dataset classification is {0}; the role ceiling is {1}.', dataset.classification, roleCeiling),
    }
  }
  return { readable: true, reason: t('Authorised under the declared purpose and within the classification ceiling.') }
}

/** Datasets carrying personal data, with the minimisation applied to each. */
export function personalDataInventory(datasets: Dataset[]): Array<{
  dataset: Dataset
  minimisation: string[]
  hasMinimisation: boolean
}> {
  return datasets
    .filter((d) => d.containsPersonalData)
    .map((dataset) => ({
      dataset,
      minimisation: dataset.minimisationApplied,
      hasMinimisation: dataset.minimisationApplied.length > 0,
    }))
}

/** Aggregate governance position for the Trust Centre summary. */
export function governanceSummary(datasets: Dataset[]): {
  total: number
  withPersonalData: number
  restricted: number
  averageQuality: number
  shortestRetentionMonths: number
  unminimisedPersonalData: number
} {
  const withPersonal = datasets.filter((d) => d.containsPersonalData)
  return {
    total: datasets.length,
    withPersonalData: withPersonal.length,
    restricted: datasets.filter((d) => d.classification === 'restricted').length,
    averageQuality:
      datasets.length > 0 ? Math.round(datasets.reduce((s, d) => s + d.qualityScore, 0) / datasets.length) : 0,
    shortestRetentionMonths: datasets.length > 0 ? Math.min(...datasets.map((d) => d.retentionMonths)) : 0,
    unminimisedPersonalData: withPersonal.filter((d) => d.minimisationApplied.length === 0).length,
  }
}

/**
 * The statement rendered on every governance surface. The platform makes no
 * regulatory claim, and says so explicitly rather than remaining silent.
 */
export const NO_CERTIFICATION_STATEMENT =
  'This platform makes no claim of regulatory certification, accreditation or compliance attestation. Governance controls described here are architectural and operational commitments implemented in the platform; they have not been independently assessed.'
