import { useMemo } from 'react'
import { ExternalLink, FileSearch, Lock, ShieldCheck } from 'lucide-react'
import type { EvidenceRecord, VerificationState } from '@/domains/evidence/model'
import { isSourceStale, sourceAgeDays } from '@/domains/evidence/model'
import type { GeoLevel } from '@/domains/public-money/model'
import type { AlertTier, PriorityFactor, PriorityResult } from '@/domains/decision/engines'
import { buildCases, evidenceById, loadDecisionLayer, sourceById, type DecisionLayer } from '@/services/decision-intelligence'
import type { IntelligenceCase } from '@/domains/decision/case'
import { useActiveCorporation } from '@/stores/corporation.store'
import { useCaseStore } from '@/stores/case.store'
import { useDrawerStore } from '@/stores/ui.store'
import { Badge, type BadgeTone } from '@/components/ui/badges'
import { Drawer } from '@/components/ui/overlays'
import { cn } from '@/utils/cn'
import { formatNumber } from '@/utils/format'
import { t } from '@/i18n'
import { activeCorporation } from '@/config/municipality.config'

/* ------------------------------------------------------------------------ */
/* Data hooks                                                               */
/* ------------------------------------------------------------------------ */

/** The decision layer for the active corporation, rebuilt when it changes. */
export function useDecisionLayer(): DecisionLayer {
  // Subscribing to the corporation re-renders on a switch; the layer itself is
  // a shared module-level cache, rebuilt by the runtime on that switch.
  useActiveCorporation()
  return loadDecisionLayer()
}

/** Every Intelligence Case, ranked with the viewer's current priority weights. */
export function useCases(): { layer: DecisionLayer; cases: IntelligenceCase[] } {
  const layer = useDecisionLayer()
  const weights = useCaseStore((s) => s.weights)
  const cases = useMemo(() => buildCases(layer, weights), [layer, weights])
  return { layer, cases }
}

/* ------------------------------------------------------------------------ */
/* Labels                                                                   */
/* ------------------------------------------------------------------------ */

export function verificationLabel(state: VerificationState): string {
  return {
    OFFICIAL_DOCUMENT_VERIFIED: t('Official document verified'),
    PUBLIC_SOURCE_CORROBORATED: t('Public source corroborated'),
    ENGAGEMENT_SOURCE: t('Engagement source'),
    UNVERIFIED: t('Unverified'),
  }[state]
}

const VERIFICATION_TONE: Record<VerificationState, BadgeTone> = {
  OFFICIAL_DOCUMENT_VERIFIED: 'positive',
  PUBLIC_SOURCE_CORROBORATED: 'info',
  ENGAGEMENT_SOURCE: 'warn',
  UNVERIFIED: 'critical',
}

export function VerificationBadge({ state }: { state: VerificationState }): React.JSX.Element {
  return (
    <Badge tone={VERIFICATION_TONE[state]} size="sm" icon={<ShieldCheck className="h-3 w-3" />}>
      {verificationLabel(state)}
    </Badge>
  )
}

export function tierLabel(tier: AlertTier): string {
  return { INFORMATION: t('Information'), WATCH: t('Watch'), REVIEW: t('Review'), PRIORITY: t('Priority'), CRITICAL: t('Critical') }[tier]
}

/** Transparent tier definitions, shown wherever a tier is (spec §124). */
export function tierDefinition(tier: AlertTier): string {
  return {
    INFORMATION: t('Recorded only - no action expected, or a duplicate of an open case.'),
    WATCH: t('Monitored; no action yet.'),
    REVIEW: t('Needs a named reviewer to look at it.'),
    PRIORITY: t('In the Commissioner\'s attention list.'),
    CRITICAL: t('High priority and either critical infrastructure or a deadline inside 7 days.'),
  }[tier]
}

const TIER_TONE: Record<AlertTier, BadgeTone> = { INFORMATION: 'muted', WATCH: 'neutral', REVIEW: 'info', PRIORITY: 'warn', CRITICAL: 'critical' }

export function TierBadge({ tier }: { tier: AlertTier }): React.JSX.Element {
  return (
    <Badge tone={TIER_TONE[tier]} size="sm" title={tierDefinition(tier)}>
      {tierLabel(tier)}
    </Badge>
  )
}

export function geoLevelLabel(level: GeoLevel): string {
  return {
    EXACT_ASSET: t('Exact asset'),
    CORRIDOR: t('Road / corridor'),
    LOCALITY: t('Locality'),
    WARD: t('Division'),
    CITY: t('City-wide'),
    UNKNOWN: t('Location unknown'),
  }[level]
}

export function factorLabel(f: PriorityFactor): string {
  return {
    financial: t('Financial significance'),
    deadline: t('Deadline proximity'),
    critical: t('Critical infrastructure'),
    dependency: t('Cross-department dependency'),
    service: t('Service exposure'),
    evidence: t('Evidence strength'),
  }[f]
}

const FACTOR_COLOUR: Record<PriorityFactor, string> = {
  financial: 'bg-google-blue-600',
  deadline: 'bg-google-red-600',
  critical: 'bg-google-yellow-500',
  dependency: 'bg-google-green-700',
  service: 'bg-intel-500',
  evidence: 'bg-navy-700',
}

/** "Why this is high priority" - every factor's contribution, in points. */
export function FactorBreakdown({ priority, compact }: { priority: PriorityResult; compact?: boolean }): React.JSX.Element {
  const entries = (Object.entries(priority.contributions) as Array<[PriorityFactor, number]>).sort((a, b) => b[1] - a[1])
  return (
    <div className="space-y-1.5">
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-ink-100" aria-hidden>
        {entries.map(([f, v]) => (
          <span key={f} className={FACTOR_COLOUR[f]} style={{ width: `${v}%` }} />
        ))}
      </div>
      {compact ? null : (
        <ul className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
          {entries.map(([f, v]) => (
            <li key={f} className="flex items-center justify-between gap-2 text-[0.6875rem]">
              <span className="flex items-center gap-1.5 text-ink-600">
                <span className={cn('h-2 w-2 rounded-full', FACTOR_COLOUR[f])} aria-hidden />
                {factorLabel(f)}
              </span>
              <span className="numeric font-semibold text-ink-800">{t('{0} pts', formatNumber(v, 1))}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Confidence, impact, urgency and priority, side by side and never merged (spec §115). */
export function PriorityDimensions({ priority }: { priority: PriorityResult }): React.JSX.Element {
  const band = (v: 'high' | 'medium' | 'low'): string => ({ high: t('High'), medium: t('Medium'), low: t('Low') })[v]
  const cell = (label: string, value: string): React.JSX.Element => (
    <div className="rounded-lg border border-ink-200 bg-surface-sunken px-2.5 py-1.5">
      <p className="text-[0.625rem] font-semibold tracking-wide text-ink-500 uppercase">{label}</p>
      <p className="text-[0.8125rem] font-bold text-ink-900">{value}</p>
    </div>
  )
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {cell(t('Priority'), formatNumber(priority.score))}
      {cell(t('Impact'), band(priority.impact))}
      {cell(t('Urgency'), band(priority.urgency))}
      {cell(t('Confidence'), band(priority.confidence))}
    </div>
  )
}

/* ------------------------------------------------------------------------ */
/* Source-to-screen traceability (spec §91)                                 */
/* ------------------------------------------------------------------------ */

/**
 * A material number that opens its evidence: calculation, source record,
 * original document, extraction date, transformation and confidence.
 */
export function EvidenceValue({
  evidenceId,
  children,
  className,
}: {
  evidenceId: string
  children?: React.ReactNode
  className?: string
}): React.JSX.Element {
  const open = useDrawerStore((s) => s.push)
  const layer = useDecisionLayer()
  const evidence = evidenceById(layer, evidenceId)
  return (
    <button
      type="button"
      onClick={() => open({ kind: 'source-evidence', id: evidenceId })}
      title={t('Show the evidence behind this figure')}
      className={cn(
        'numeric inline-flex items-baseline gap-1 rounded underline decoration-dotted decoration-1 underline-offset-[3px] hover:bg-govt-50 hover:decoration-solid',
        className,
      )}
    >
      {children ?? evidence?.value ?? '—'}
    </button>
  )
}

export function SourceEvidenceDrawer({ evidenceId }: { evidenceId: string }): React.JSX.Element {
  const close = useDrawerStore((s) => s.close)
  const layer = useDecisionLayer()
  const evidence = evidenceById(layer, evidenceId)
  const source = evidence ? sourceById(layer, evidence.sourceId) : undefined
  const conflicts: EvidenceRecord[] = (evidence?.conflictsWith ?? []).map((id) => evidenceById(layer, id)).filter((e): e is EvidenceRecord => Boolean(e))

  if (!evidence) {
    return (
      <Drawer open onClose={close} title={t('Evidence record')} width="lg">
        <p className="p-4 text-sm text-ink-600">{t('This evidence record is not available for the active corporation.')}</p>
      </Drawer>
    )
  }

  const age = source ? sourceAgeDays(source, layer.now) : null
  const step = (n: number, label: string, body: React.ReactNode): React.JSX.Element => (
    <li className="relative border-l-2 border-govt-200 pb-4 pl-4 last:pb-0">
      <span className="numeric absolute top-0 -left-[0.6875rem] flex h-5 w-5 items-center justify-center rounded-full bg-govt-600 text-[0.625rem] font-bold text-white">
        {n}
      </span>
      <p className="text-[0.625rem] font-bold tracking-wide text-ink-500 uppercase">{label}</p>
      <div className="mt-0.5 text-[0.8125rem] text-ink-800">{body}</div>
    </li>
  )

  return (
    <Drawer
      open
      onClose={close}
      width="lg"
      eyebrow={t('Source-to-screen evidence')}
      title={evidence.label}
      meta={<VerificationBadge state={evidence.state} />}
    >
      <div className="space-y-4 p-4">
        <div className="rounded-xl bg-gradient-to-br from-navy-950 to-navy-800 p-4 text-white">
          <p className="numeric text-3xl font-extrabold">{evidence.value}</p>
          <p className="mt-1 text-[0.75rem] text-white/80">{evidence.label}</p>
          <p className="mt-0.5 text-[0.6875rem] text-white/60">{t('Period: {0}', evidence.period)}</p>
        </div>

        <ol className="ml-2.5">
          {step(1, t('Calculation / transformation'), evidence.transformation)}
          {step(
            2,
            t('Source record'),
            source ? (
              <div>
                <p className="font-semibold">{source.title}</p>
                <p className="text-[0.75rem] text-ink-500">{source.authority}</p>
              </div>
            ) : (
              evidence.sourceId
            ),
          )}
          {step(
            3,
            t('Original text'),
            <blockquote className="rounded-md border-l-4 border-gold-400 bg-gold-50 px-3 py-2 font-mono text-[0.75rem] text-ink-800">{evidence.quote}</blockquote>,
          )}
          {step(
            4,
            t('Original document'),
            source && /^https?:/.test(source.url) ? (
              <a href={source.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 font-semibold text-govt-700 hover:underline">
                {t('Open the source')} <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </a>
            ) : (
              t('Not a public document: {0}', source?.accessMethod ?? '—')
            ),
          )}
          {step(
            5,
            t('Extraction date'),
            source?.publishedOn
              ? t('Read on {0}. Source dated {1}.', evidence.extractedOn, source.publishedOn)
              : t('Read on {0}. The source states no publication date.', evidence.extractedOn),
          )}
          {step(
            6,
            t('Confidence and verification'),
            <div className="flex flex-wrap items-center gap-1.5">
              <VerificationBadge state={evidence.state} />
              <Badge tone="neutral" size="sm">
                {t('Confidence: {0}', { high: t('High'), medium: t('Medium'), low: t('Low') }[evidence.confidence])}
              </Badge>
              {source && isSourceStale(source, layer.now) ? (
                <Badge tone="warn" size="sm">
                  {t('Source older than its refresh interval ({0} days)', formatNumber(age ?? 0))}
                </Badge>
              ) : null}
            </div>,
          )}
        </ol>

        {evidence.note ? <p className="rounded-lg border border-ink-200 bg-surface-sunken p-3 text-[0.75rem] text-ink-700">{evidence.note}</p> : null}

        {conflicts.length > 0 ? (
          <div className="rounded-lg border border-warn-200 bg-warn-50 p-3">
            <p className="text-[0.75rem] font-bold text-warn-700">{t('Sources disagree')}</p>
            <ul className="mt-1 space-y-1 text-[0.75rem] text-ink-700">
              {conflicts.map((c) => (
                <li key={c.id}>
                  <span className="numeric font-semibold">{c.value}</span> — {sourceById(layer, c.sourceId)?.title ?? c.sourceId} ({c.period})
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Drawer>
  )
}

/* ------------------------------------------------------------------------ */
/* Future-mode notice (spec §98)                                            */
/* ------------------------------------------------------------------------ */

export function FutureModeNotice({ unlocks }: { unlocks: string }): React.JSX.Element {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-warn-200 bg-warn-50 p-3.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-warn-500 text-white" aria-hidden>
        <Lock className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[0.8125rem] font-bold text-ink-900">{t('Requires authorised {0} data', activeCorporation.shortName)}</p>
        <p className="mt-0.5 text-[0.75rem] leading-relaxed text-ink-700">
          {t('{0} No {1} records are connected. Figures on this screen are a labelled scenario preview of how the module reads once authorised data arrives - they are not {1} data.', unlocks, activeCorporation.shortName)}
        </p>
      </div>
    </div>
  )
}

export function EvidenceCount({ ids }: { ids: string[] }): React.JSX.Element {
  return (
    <span className="inline-flex items-center gap-1 text-[0.6875rem] text-ink-500">
      <FileSearch className="h-3.5 w-3.5" aria-hidden />
      {t('{0} evidence records', formatNumber(ids.length))}
    </span>
  )
}
