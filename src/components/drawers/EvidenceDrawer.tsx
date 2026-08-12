import { useMemo } from 'react'
import { ArrowDown, Database, FileSearch, ShieldCheck } from 'lucide-react'
import type { EvidenceItem, ProvenanceChain } from '@/types/intelligence'
import { LINEAGE_STAGE_LABEL } from '@/types/governance'
import { EVIDENCE_BY_ID } from '@/data/evidence.data'
import { LINEAGE_BY_ID } from '@/data/governance.data'
import { AUDIT_EVENTS } from '@/data/governance.data'
import { departmentName, wardName } from '@/data/reference'
import { canAccess } from '@/security/access'
import { useCurrentUser } from '@/stores/auth.store'
import { useDrawerStore } from '@/stores/ui.store'
import { formatDateTime, formatRelative } from '@/utils/format'
import { cn } from '@/utils/cn'
import { Badge, ClassificationBadge, ConfidenceBadge } from '@/components/ui/badges'
import { Button, Card, DefinitionList, DefinitionRow, ProgressBar } from '@/components/ui/primitives'
import { AccessDeniedState, EmptyState } from '@/components/ui/states'
import { Drawer } from '@/components/ui/overlays'
import { t } from '@/i18n'

/**
 * Evidence & provenance drawer.
 *
 * Renders the full chain - source → transformation → metric → rule/model →
 * intelligence → recommendation → human decision → action → outcome - so that
 * no figure anywhere in the platform is unaccountable.
 */
export function EvidenceDrawer({ evidenceId }: { evidenceId: string }): React.JSX.Element {
  const user = useCurrentUser()
  const close = useDrawerStore((s) => s.close)
  const evidence = EVIDENCE_BY_ID.get(evidenceId)

  const decision = evidence
    ? canAccess(user, 'evidence', 'view', {
        wardIds: evidence.wardIds,
        departmentId: evidence.departmentId,
        classification: evidence.classification,
      })
    : null

  const chain = useMemo<ProvenanceChain | null>(() => {
    if (!evidence) return null
    return {
      source: `${evidence.sourceSystem} - record ${evidence.sourceRecordRef}, observed ${formatDateTime(evidence.observedAt)}`,
      transformation: evidence.transformation,
      metric: LINEAGE_BY_ID.get(evidence.lineageId)?.metricLabel ?? 'Derived municipal indicator',
      ruleOrModel: evidence.modelId
        ? `Model ${evidence.modelId} participated in producing this record.`
        : 'Deterministic rule evaluation against the published departmental threshold. No model participated.',
      intelligence:
        'Where the evaluated indicator crosses its threshold, an intelligence item is raised with severity and confidence assigned from the driver set and input completeness.',
      recommendation:
        t('Recommendations are produced with a stated rationale, expected impact, dependencies and risks, and always name an accountable human role.'),
      humanDecision:
        'A named officer decides. The platform records the selected alternative, the rationale and the decision timestamp permanently.',
      action:
        'Approved decisions become assigned actions with an owner, a department, a due date and a verifiable completion state.',
      outcome:
        t('Outcome is measured against the indicators identified at approval and reported without adjustment, including where the intervention was not effective.'),
    }
  }, [evidence])

  const relatedAudit = useMemo(
    () => AUDIT_EVENTS.filter((a) => a.resourceId.includes(evidenceId) || a.resourceType === 'Evidence').slice(0, 6),
    [evidenceId],
  )

  if (!evidence) {
    return (
      <Drawer open onClose={close} title={t('Evidence record')} width="lg">
        <EmptyState
          title={t('Evidence record not found')}
          detail="The requested evidence identifier does not exist in the evidence store. No substitute record is shown."
        />
      </Drawer>
    )
  }

  if (decision && !decision.allowed) {
    return (
      <Drawer open onClose={close} title={t('Evidence record')} width="lg">
        <AccessDeniedState reason={decision.reason} resource="evidence" action="view" />
      </Drawer>
    )
  }

  return (
    <Drawer
      open
      onClose={close}
      width="lg"
      eyebrow={t('Evidence & provenance')}
      title={evidence.title}
      description={evidence.summary}
      meta={
        <>
          <Badge tone="neutral" className="font-mono">
            {evidence.id}
          </Badge>
          <Badge tone="info">{evidence.kind.replace(/-/g, ' ')}</Badge>
          <ClassificationBadge classification={evidence.classification} />
          {evidence.confidence ? <ConfidenceBadge confidence={evidence.confidence} /> : null}
        </>
      }
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            {t('Close')}
          </Button>
          <Button variant="outline" icon={<Database className="h-3.5 w-3.5" />}>
            {t('Open data lineage')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Source record ------------------------------------------------ */}
        <Card tone="sunken">
          <h4 className="label-institutional mb-2">{t('Source record')}</h4>
          <DefinitionList>
            <DefinitionRow label={t('Source system')}>{evidence.sourceSystem}</DefinitionRow>
            <DefinitionRow label={t('Record reference')} mono>
              {evidence.sourceRecordRef}
            </DefinitionRow>
            <DefinitionRow label={t('Observed at')}>{formatDateTime(evidence.observedAt)}</DefinitionRow>
            <DefinitionRow label={t('Ingested at')}>
              {formatDateTime(evidence.ingestedAt)}{' '}
              <span className="text-ink-400">({formatRelative(evidence.ingestedAt)})</span>
            </DefinitionRow>
            <DefinitionRow label={t('Geography')}>{evidence.wardIds.map((w) => wardName(w)).join(', ')}</DefinitionRow>
            <DefinitionRow label={t('Accountable department')}>{departmentName(evidence.departmentId)}</DefinitionRow>
          </DefinitionList>
        </Card>

        {/* Data quality -------------------------------------------------- */}
        <Card>
          <div className="flex items-baseline justify-between gap-3">
            <h4 className="label-institutional">{t('Data quality assessment')}</h4>
            <span className="numeric text-sm font-semibold text-ink-800">{evidence.dataQuality}/100</span>
          </div>
          <ProgressBar value={evidence.dataQuality} className="mt-2" size="sm" />
          <p className="mt-2 text-xs leading-relaxed text-ink-500">
            {t('Quality is assessed at ingestion against completeness, referential integrity with master data, and plausibility ranges. Records failing validation are quarantined with a reason code rather than silently discarded.')}
          </p>
        </Card>

        {/* Structured attributes ---------------------------------------- */}
        <Card>
          <h4 className="label-institutional mb-2">{t('Record attributes')}</h4>
          <DefinitionList>
            {evidence.attributes.map((attr) => (
              <DefinitionRow key={attr.key} label={attr.key} mono>
                {attr.value}
              </DefinitionRow>
            ))}
          </DefinitionList>
        </Card>

        {/* Transformation ------------------------------------------------ */}
        <Card>
          <h4 className="label-institutional mb-1.5">{t('Transformation applied')}</h4>
          <p className="text-[0.8125rem] leading-relaxed text-ink-600">{evidence.transformation}</p>
          {evidence.modelId ? (
            <div className="mt-2.5 flex items-start gap-2 rounded-md border border-intel-200 bg-intel-50/50 px-2.5 py-2">
              <ShieldCheck className="mt-px h-3.5 w-3.5 shrink-0 text-intel-600" />
              <p className="text-xs leading-relaxed text-intel-800">
                {t('A model participated in producing this record. Model identifier')}{' '}
                <span className="font-mono font-semibold">{evidence.modelId}</span>{t('. Model involvement, version and confidence are recorded against every request in the AI Intelligence Centre.')}
              </p>
            </div>
          ) : null}
        </Card>

        {/* Provenance chain ---------------------------------------------- */}
        {chain ? (
          <Card>
            <h4 className="label-institutional mb-3">{t('Provenance chain')}</h4>
            <ol className="space-y-0">
              {(
                [
                  ['Source', chain.source],
                  ['Transformation', chain.transformation],
                  ['Metric', chain.metric],
                  ['Rule / model', chain.ruleOrModel],
                  ['Intelligence', chain.intelligence],
                  ['Recommendation', chain.recommendation],
                  ['Human decision', chain.humanDecision],
                  ['Action', chain.action],
                  ['Outcome', chain.outcome],
                ] as const
              ).map(([label, value], i, arr) => (
                <li key={label} className="relative pb-4 pl-6 last:pb-0">
                  {i < arr.length - 1 ? (
                    <span className="absolute top-4 bottom-0 left-[7px] w-px bg-ink-100" aria-hidden />
                  ) : null}
                  <span
                    className={cn(
                      'absolute top-1 left-0 flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 bg-surface',
                      i <= 3 ? 'border-govt-500' : i <= 5 ? 'border-intel-500' : 'border-ok-500',
                    )}
                    aria-hidden
                  />
                  <p className="label-institutional">{label}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-ink-600">{value}</p>
                  {i < arr.length - 1 ? (
                    <ArrowDown className="absolute -bottom-0.5 left-0.5 h-2.5 w-2.5 text-ink-200" aria-hidden />
                  ) : null}
                </li>
              ))}
            </ol>
          </Card>
        ) : null}

        {/* Lineage stages ------------------------------------------------ */}
        {(() => {
          const lineage = LINEAGE_BY_ID.get(evidence.lineageId)
          if (!lineage) return null
          return (
            <Card>
              <h4 className="label-institutional mb-2">{t('Pipeline stages - {0}', lineage.metricLabel)}</h4>
              <ul className="space-y-1.5">
                {lineage.stages.map((stage) => (
                  <li key={stage.id} className="flex items-start gap-2.5 rounded-md bg-surface-sunken px-2.5 py-2">
                    <Badge tone="muted" className="mt-px shrink-0">
                      {LINEAGE_STAGE_LABEL[stage.kind]}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-ink-800">{stage.name}</p>
                      <p className="mt-0.5 text-[0.6875rem] leading-relaxed text-ink-500">{stage.detail}</p>
                    </div>
                    <span className="numeric shrink-0 text-[0.6875rem] font-semibold text-ink-600">{stage.quality}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[0.6875rem] text-ink-400">
                {t('Lineage last validated {0}.', formatRelative(lineage.lastValidatedAt))}
              </p>
            </Card>
          )
        })()}

        {/* Audit ---------------------------------------------------------- */}
        <Card>
          <h4 className="label-institutional mb-2">{t('Related audit events')}</h4>
          {relatedAudit.length === 0 ? (
            <p className="text-xs text-ink-400">{t('No audit events recorded against this record in the current window.')}</p>
          ) : (
            <ul className="space-y-1.5">
              {relatedAudit.map((event) => (
                <li key={event.id} className="flex items-start gap-2 text-[0.6875rem]">
                  <FileSearch className="mt-0.5 h-3 w-3 shrink-0 text-ink-300" />
                  <span className="min-w-0 flex-1 text-ink-600">
                    <span className="font-medium text-ink-800">{event.actorName}</span> · {event.action} ·{' '}
                    <span className="font-mono">{event.resourceId}</span>
                  </span>
                  <span className="shrink-0 text-ink-400">{formatRelative(event.at)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 border-t border-ink-100 pt-2 text-[0.6875rem] leading-relaxed text-ink-400">
            {t('Opening this evidence record has itself been recorded in the audit trail against your name and session.')}
          </p>
        </Card>
      </div>
    </Drawer>
  )
}

export function evidenceTitle(id: string): string {
  return EVIDENCE_BY_ID.get(id)?.title ?? id
}

export type { EvidenceItem }
