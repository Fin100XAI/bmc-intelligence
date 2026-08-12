import { type ReactNode } from 'react'
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CircleDot,
  FlaskConical,
  Info,
  Lock,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react'
import {
  CLASSIFICATION_LABEL,
  CONFIDENCE_LABEL,
  DATA_ORIGIN_LABEL,
  OPERATIONAL_STATE_LABEL,
  SEVERITY_LABEL,
  type ConfidenceLevel,
  type DataClassification,
  type DataFreshness,
  type DataOrigin,
  type OperationalState,
  type Severity,
  type Trend,
} from '@/types/common'
import type { ObservationProvenance, ObservationSource } from '@/types/city-domains'
import { municipality } from '@/config/municipality.config'
import { registerLayer } from '@/data/runtime'
import { formatDelta, formatRelative } from '@/utils/format'
import { cn } from '@/utils/cn'
import { t } from '@/i18n'

/* ==========================================================================
   Base badge
   ========================================================================== */

export type BadgeTone =
  | 'neutral'
  | 'info'
  | 'positive'
  | 'warn'
  | 'risk'
  | 'critical'
  | 'intel'
  | 'muted'

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'bg-ink-50 text-ink-700 ring-ink-200',
  muted: 'bg-transparent text-ink-500 ring-ink-200',
  info: 'bg-govt-50 text-govt-700 ring-govt-200',
  intel: 'bg-intel-50 text-intel-700 ring-intel-200',
  positive: 'bg-ok-50 text-ok-700 ring-ok-200',
  warn: 'bg-warn-50 text-warn-700 ring-warn-200',
  risk: 'bg-risk-50 text-risk-700 ring-risk-200',
  critical: 'bg-crit-50 text-crit-700 ring-crit-200',
}

export interface BadgeProps {
  tone?: BadgeTone
  children: ReactNode
  icon?: ReactNode
  size?: 'xs' | 'sm'
  className?: string
  title?: string
  /** Renders a leading status dot instead of an icon. */
  dot?: boolean
  uppercase?: boolean
}

export function Badge({
  tone = 'neutral',
  children,
  icon,
  size = 'xs',
  className,
  title,
  dot,
  uppercase,
}: BadgeProps): React.JSX.Element {
  return (
    <span
      title={title}
      className={cn(
        // `badge-chip` is a styling contract, not a utility: surfaces that
        // invert - a solid-colour metric card - restyle chips through it.
        'badge-chip inline-flex max-w-full items-center gap-1 rounded-md font-semibold ring-1 ring-inset',
        size === 'xs' ? 'h-[1.375rem] px-1.5 text-[0.6875rem]' : 'h-[1.625rem] px-2 text-xs',
        uppercase && 'tracking-wide uppercase',
        BADGE_TONES[tone],
        className,
      )}
    >
      {dot ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-80" /> : icon}
      <span className="truncate">{children}</span>
    </span>
  )
}

/* ==========================================================================
   Severity
   ========================================================================== */

export const SEVERITY_TONE: Record<Severity, BadgeTone> = {
  critical: 'critical',
  high: 'risk',
  medium: 'warn',
  low: 'info',
  info: 'neutral',
}

export function SeverityBadge({
  severity,
  size = 'xs',
  className,
  withDot = true,
}: {
  severity: Severity
  size?: 'xs' | 'sm'
  className?: string
  withDot?: boolean
}): React.JSX.Element {
  return (
    <Badge tone={SEVERITY_TONE[severity]} size={size} className={className} dot={withDot}>
      {SEVERITY_LABEL[severity]}
    </Badge>
  )
}

/** Slim severity rail used at the leading edge of list rows. */
export function SeverityRail({ severity, className }: { severity: Severity; className?: string }): React.JSX.Element {
  const colour: Record<Severity, string> = {
    critical: 'bg-gradient-to-b from-crit-500 to-crit-600 shadow-[0_0_8px_-1px_rgb(239_68_68/0.6)]',
    high: 'bg-gradient-to-b from-risk-500 to-risk-600',
    medium: 'bg-gradient-to-b from-warn-500 to-warn-600',
    low: 'bg-gradient-to-b from-govt-400 to-govt-500',
    info: 'bg-ink-300',
  }
  return <span aria-hidden className={cn('w-1 shrink-0 rounded-full', colour[severity], className)} />
}

/* ==========================================================================
   Operational state
   ========================================================================== */

export const STATE_TONE: Record<OperationalState, BadgeTone> = {
  operational: 'positive',
  degraded: 'warn',
  'at-risk': 'risk',
  critical: 'critical',
  simulation: 'intel',
  'adapter-ready': 'info',
  'not-connected': 'muted',
  'review-required': 'warn',
  planned: 'neutral',
}

export function StateBadge({
  state,
  size = 'xs',
  className,
}: {
  state: OperationalState
  size?: 'xs' | 'sm'
  className?: string
}): React.JSX.Element {
  return (
    <Badge tone={STATE_TONE[state]} size={size} className={className} dot>
      {OPERATIONAL_STATE_LABEL[state]}
    </Badge>
  )
}

/* ==========================================================================
   Confidence - uncertainty is always communicated
   ========================================================================== */

export function ConfidenceBadge({
  confidence,
  size = 'xs',
  className,
  rationale,
}: {
  confidence: ConfidenceLevel
  size?: 'xs' | 'sm'
  className?: string
  rationale?: string
}): React.JSX.Element {
  const tone: Record<ConfidenceLevel, BadgeTone> = { high: 'positive', medium: 'warn', low: 'risk' }
  const bars = confidence === 'high' ? 3 : confidence === 'medium' ? 2 : 1
  return (
    <Badge
      tone={tone[confidence]}
      size={size}
      className={className}
      title={rationale ?? CONFIDENCE_LABEL[confidence]}
      icon={
        <span aria-hidden className="flex h-2.5 items-end gap-px">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={cn('w-[2px] rounded-sm bg-current', i < bars ? 'opacity-90' : 'opacity-25')}
              style={{ height: `${(i + 1) * 3 + 1}px` }}
            />
          ))}
        </span>
      }
    >
      {CONFIDENCE_LABEL[confidence]}
    </Badge>
  )
}

/* ==========================================================================
   Classification - least privilege made visible
   ========================================================================== */

export function ClassificationBadge({
  classification,
  size = 'xs',
  className,
  showIcon = true,
}: {
  classification: DataClassification
  size?: 'xs' | 'sm'
  className?: string
  showIcon?: boolean
}): React.JSX.Element {
  const tone: Record<DataClassification, BadgeTone> = {
    public: 'neutral',
    internal: 'info',
    confidential: 'warn',
    restricted: 'critical',
  }
  const icon: Record<DataClassification, ReactNode> = {
    public: <Info className="h-3 w-3" />,
    internal: <ShieldCheck className="h-3 w-3" />,
    confidential: <ShieldAlert className="h-3 w-3" />,
    restricted: <Lock className="h-3 w-3" />,
  }
  return (
    <Badge
      tone={tone[classification]}
      size={size}
      className={className}
      icon={showIcon ? icon[classification] : undefined}
      title={t('Data classification: {0}', CLASSIFICATION_LABEL[classification])}
      uppercase
    >
      {CLASSIFICATION_LABEL[classification]}
    </Badge>
  )
}

/* ==========================================================================
   Provenance - the data honesty surface
   ========================================================================== */

export function ProvenanceBadge({
  origin = 'demonstration',
  size = 'xs',
  className,
}: {
  origin?: DataOrigin
  size?: 'xs' | 'sm'
  className?: string
}): React.JSX.Element | null {
  // Ordinary demonstration figures carry no badge. Repeating the same label on
  // every card was noise, and the environment is already disclosed at sign-in,
  // in the top bar and on the Platform Readiness page. Simulation and model
  // output still badge, because those distinctions change how a figure may be
  // read and removing them would be misleading.
  if (origin === 'demonstration') return null

  const tone: Record<DataOrigin, BadgeTone> = {
    demonstration: 'intel',
    'simulated-scenario': 'warn',
    'derived-metric': 'info',
    'model-output': 'intel',
  }
  const detail: Record<DataOrigin, string> = {
    demonstration: municipality.dataProvenanceStatement,
    'simulated-scenario':
      'This figure is produced by a scenario simulation using deterministic local logic. It is a simulation, not a forecast.',
    'derived-metric':
      'This figure is derived from source records by a published computation. Open the lineage view to inspect every stage.',
    'model-output':
      'This figure is produced by a model. Model identity, version and confidence are recorded against the request.',
  }
  return (
    <Badge
      tone={tone[origin]}
      size={size}
      className={className}
      icon={<FlaskConical className="h-3 w-3" />}
      title={detail[origin]}
    >
      {DATA_ORIGIN_LABEL[origin]}
    </Badge>
  )
}

/**
 * How the corporation came to know about an observed record.
 *
 * Shown wherever a defect or hotspot register is read, because the answer
 * changes what the row is worth: an inspection is a named officer's
 * statement, a citizen report is an unchecked assertion, and a camera
 * detection is a model's output on a frame. A register that shows only the
 * defect flattens all three into one claim.
 *
 * Machine detections carry their confidence in the tooltip and a marker when
 * no officer has yet confirmed them on the ground - an unconfirmed detection
 * is a lead, not a finding.
 */
function build$OBSERVATION_SOURCE_LABEL(): Record<ObservationSource, string> {
  return {
  'field-inspection': t('Field inspection'),
  'citizen-report': t('Citizen report'),
  'camera-detection': t('Camera detection'),
  sensor: t('Sensor'),
  'contractor-return': t('Contractor return'),
}
}
let OBSERVATION_SOURCE_LABEL: Record<ObservationSource, string> = build$OBSERVATION_SOURCE_LABEL()
registerLayer(() => {
  OBSERVATION_SOURCE_LABEL = build$OBSERVATION_SOURCE_LABEL()
})

const OBSERVATION_SOURCE_TONE: Record<ObservationSource, BadgeTone> = {
  'field-inspection': 'positive',
  'citizen-report': 'info',
  'camera-detection': 'intel',
  sensor: 'intel',
  'contractor-return': 'neutral',
}

export function ObservationSourceBadge({
  provenance,
  size = 'xs',
  className,
}: {
  provenance: ObservationProvenance
  size?: 'xs' | 'sm'
  className?: string
}): React.JSX.Element {
  const { detectedBy, detectionConfidence, fieldConfirmed } = provenance
  const machine = detectionConfidence !== undefined

  const title = machine
    ? fieldConfirmed
      ? t('Detected automatically at {0}% confidence and since confirmed on the ground by a named officer.', detectionConfidence)
      : t('Detected automatically at {0}% confidence. Not yet confirmed on the ground - this is a lead, not a finding.', detectionConfidence)
    : fieldConfirmed
      ? t('Confirmed on the ground by a named officer.')
      : t('Reported but not yet confirmed on the ground.')

  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      <Badge tone={OBSERVATION_SOURCE_TONE[detectedBy]} size={size} title={title}>
        {OBSERVATION_SOURCE_LABEL[detectedBy]}
      </Badge>
      {machine && !fieldConfirmed ? (
        <span className="numeric text-[0.625rem] font-semibold text-warn-700" title={title}>
          {t('{0}% unconfirmed', detectionConfidence)}
        </span>
      ) : null}
    </span>
  )
}

/** Explicit "Simulated Scenario" marker for scenario outputs. */
export function SimulationBadge({ className }: { className?: string }): React.JSX.Element {
  return (
    <Badge
      tone="warn"
      className={className}
      icon={<FlaskConical className="h-3 w-3" />}
      title={t('Simulation output produced by deterministic local scenario logic. This is a simulation and must not be read as a forecast.')}
    >
      {t('Simulated Scenario')}
    </Badge>
  )
}

/**
 * Freshness line - states when a figure was generated, how old the underlying
 * observation is, and whether it is stale.
 */
export function FreshnessLine({
  freshness,
  className,
  compact,
}: {
  freshness: DataFreshness
  className?: string
  compact?: boolean
}): React.JSX.Element {
  return (
    <div className={cn('flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[0.6875rem] text-ink-400', className)}>
      <span className="inline-flex items-center gap-1">
        <CircleDot className="h-3 w-3" aria-hidden />
        {t('Generated')}{' '}{formatRelative(freshness.generatedAt)}
      </span>
      {!compact ? (
        <span className="inline-flex items-center gap-1">
          {t('Source observed {0}', formatRelative(freshness.sourceObservedAt))}
        </span>
      ) : null}
      <ProvenanceBadge origin={freshness.origin} />
      {freshness.stale ? (
        <Badge
          tone="warn"
          icon={<AlertTriangle className="h-3 w-3" />}
          title={t('The newest source observation is older than the {0}-minute refresh cadence for this feed.', freshness.refreshIntervalMinutes)}
        >
          {t('Stale')}
        </Badge>
      ) : null}
    </div>
  )
}

/* ==========================================================================
   Trend
   ========================================================================== */

export function TrendBadge({
  trend,
  unit = '%',
  size = 'xs',
  className,
  showLabel = true,
}: {
  trend: Trend
  unit?: string
  size?: 'xs' | 'sm'
  className?: string
  showLabel?: boolean
}): React.JSX.Element {
  const isGood =
    trend.polarity === 'neutral'
      ? null
      : (trend.direction === 'up' && trend.polarity === 'positive') ||
        (trend.direction === 'down' && trend.polarity === 'negative')

  const tone: BadgeTone = trend.direction === 'flat' ? 'neutral' : isGood === null ? 'neutral' : isGood ? 'positive' : 'critical'
  const Icon = trend.direction === 'up' ? ArrowUpRight : trend.direction === 'down' ? ArrowDownRight : ArrowRight

  return (
    <Badge
      tone={tone}
      size={size}
      className={className}
      icon={<Icon className="h-3 w-3" />}
      title={`${formatDelta(trend.changePct, unit)} ${trend.comparisonLabel}`}
    >
      {formatDelta(trend.changePct, unit)}
      {showLabel ? <span className="ml-0.5 font-normal opacity-70">{trend.comparisonLabel}</span> : null}
    </Badge>
  )
}

/** Simple signed delta pill where a full Trend object is unavailable. */
export function DeltaBadge({
  value,
  unit = '%',
  higherIsBetter = true,
  size = 'xs',
  className,
  comparisonLabel,
}: {
  value: number
  unit?: string
  higherIsBetter?: boolean
  size?: 'xs' | 'sm'
  className?: string
  comparisonLabel?: string
}): React.JSX.Element {
  const flat = Math.abs(value) < 0.05
  const good = higherIsBetter ? value > 0 : value < 0
  const tone: BadgeTone = flat ? 'neutral' : good ? 'positive' : 'critical'
  const Icon = flat ? ArrowRight : value > 0 ? ArrowUpRight : ArrowDownRight
  return (
    <Badge tone={tone} size={size} className={className} icon={<Icon className="h-3 w-3" />} title={comparisonLabel}>
      {formatDelta(value, unit)}
    </Badge>
  )
}

/* ==========================================================================
   Environment
   ========================================================================== */

export function EnvironmentBadge({ className }: { className?: string }): React.JSX.Element {
  return (
    <Badge
      tone="warn"
      className={cn('font-semibold', className)}
      icon={<FlaskConical className="h-3 w-3" />}
      title={municipality.dataProvenanceStatement}
      uppercase
    >
      {municipality.environmentLabel}
    </Badge>
  )
}
