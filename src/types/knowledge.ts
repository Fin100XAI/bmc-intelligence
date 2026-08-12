import type { IntelligenceDomain, IsoDateTime, Severity, TenantId } from './common'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/** ---------------------------------------------------------------------
 * Institutional Memory (§41)
 *
 * The corporation's durable record of what it has decided, faced and learned.
 * Every entry is a synthetic historical record in this environment. The point
 * of the module is continuity: a new officer facing a situation should be able
 * to ask what the corporation did last time and read the answer, rather than
 * rediscovering it.
 * ------------------------------------------------------------------- */

export type MemoryKind =
  | 'decision'
  | 'incident'
  | 'lesson'
  | 'project-outcome'
  | 'sop'
  | 'meeting'
  | 'audit-observation'
  | 'intervention'

function build$MEMORY_KIND_LABEL(): Record<MemoryKind, string> {
  return {
  decision: t('Decision'),
  incident: t('Incident'),
  lesson: t('Lesson Learned'),
  'project-outcome': t('Project Outcome'),
  sop: t('Standard Operating Procedure'),
  meeting: t('Meeting Outcome'),
  'audit-observation': t('Audit Observation'),
  intervention: t('Past Intervention'),
}
}
export let MEMORY_KIND_LABEL: Record<MemoryKind, string> = build$MEMORY_KIND_LABEL()
registerLayer(() => {
  MEMORY_KIND_LABEL = build$MEMORY_KIND_LABEL()
})

export interface MemoryRecord {
  id: string
  tenantId: TenantId
  kind: MemoryKind
  title: string
  /** The situation this record captures. */
  summary: string
  /** What was done, and to what effect. */
  outcome: string
  /** The durable lesson a future officer should carry forward. */
  lesson: string
  domain: IntelligenceDomain
  wardIds: string[]
  departmentId: string
  occurredAt: IsoDateTime
  /** Significance of the record, for ranking. */
  significance: Severity
  tags: string[]
  /** Related records — the graph of institutional memory. */
  relatedIds: string[]
}
