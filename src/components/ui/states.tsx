import { type ReactNode } from 'react'
import { AlertTriangle, Ban, Clock, Inbox, RefreshCw, ShieldX } from 'lucide-react'
import { formatRelative } from '@/utils/format'
import { cn } from '@/utils/cn'
import { Button, Card } from './primitives'
import { t } from '@/i18n'

/* ==========================================================================
   Skeletons
   ========================================================================== */

export function Skeleton({
  className,
  style,
}: {
  className?: string
  style?: React.CSSProperties
}): React.JSX.Element {
  return <div className={cn('animate-pulse-soft rounded-md bg-ink-100', className)} style={style} aria-hidden />
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }): React.JSX.Element {
  return (
    <div className={cn('space-y-2', className)} aria-hidden>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cn('h-3', i === lines - 1 ? 'w-3/5' : 'w-full')} />
      ))}
    </div>
  )
}

/* ==========================================================================
   Loading
   ========================================================================== */

export function LoadingState({
  label = 'Retrieving intelligence',
  variant = 'block',
  rows = 4,
  className,
}: {
  label?: string
  variant?: 'block' | 'metrics' | 'table' | 'inline' | 'chart'
  rows?: number
  className?: string
}): React.JSX.Element {
  if (variant === 'inline') {
    return (
      <div className={cn('flex items-center gap-2 py-3 text-[0.8125rem] text-ink-400', className)} role="status">
        <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden />
        {label}…
      </div>
    )
  }

  if (variant === 'metrics') {
    return (
      <div className={cn('grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4', className)} role="status" aria-label={label}>
        {Array.from({ length: rows }, (_, i) => (
          <Card key={i}>
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-3 h-7 w-20" />
            <Skeleton className="mt-3 h-2.5 w-32" />
          </Card>
        ))}
      </div>
    )
  }

  if (variant === 'table') {
    return (
      <div className={cn('space-y-2', className)} role="status" aria-label={label}>
        <Skeleton className="h-8 w-full" />
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} className="h-11 w-full" />
        ))}
      </div>
    )
  }

  if (variant === 'chart') {
    return (
      <div className={cn('flex h-full min-h-[180px] items-end gap-1.5', className)} role="status" aria-label={label}>
        {Array.from({ length: 14 }, (_, i) => (
          <Skeleton key={i} className="flex-1" style={{ height: `${34 + ((i * 37) % 60)}%` }} />
        ))}
      </div>
    )
  }

  return (
    <div className={cn('space-y-3', className)} role="status" aria-label={label}>
      <Skeleton className="h-4 w-40" />
      <SkeletonText lines={rows} />
    </div>
  )
}

/* ==========================================================================
   Error
   ========================================================================== */

export function ErrorState({
  title = 'Intelligence could not be retrieved',
  detail,
  onRetry,
  className,
  compact,
}: {
  title?: string
  detail?: string
  onRetry?: () => void
  className?: string
  compact?: boolean
}): React.JSX.Element {
  return (
    <Card tone="critical" className={cn('flex items-start gap-3', compact && 'p-3', className)} role="alert">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-crit-600" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-[0.8125rem] font-semibold text-crit-700">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-ink-600">
          {detail ??
            'The service did not return a result. No partial or unverified figures are shown in place of the missing data.'}
        </p>
        {onRetry ? (
          <Button size="xs" variant="outline" className="mt-2.5" onClick={onRetry} icon={<RefreshCw className="h-3 w-3" />}>
            {t('Retry')}
          </Button>
        ) : null}
      </div>
    </Card>
  )
}

/* ==========================================================================
   Empty
   ========================================================================== */

export function EmptyState({
  title = 'Nothing to display',
  detail,
  icon,
  action,
  className,
  compact,
}: {
  title?: string
  detail?: string
  icon?: ReactNode
  action?: ReactNode
  className?: string
  compact?: boolean
}): React.JSX.Element {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-lg border border-dashed border-ink-200 bg-surface-sunken text-center',
        compact ? 'px-4 py-6' : 'px-6 py-12',
        className,
      )}
    >
      <span className="mb-2.5 flex h-9 w-9 items-center justify-center rounded-full bg-ink-100 text-ink-400">
        {icon ?? <Inbox className="h-4 w-4" aria-hidden />}
      </span>
      <p className="text-[0.8125rem] font-medium text-ink-700">{title}</p>
      {detail ? <p className="mt-1 max-w-md text-xs leading-relaxed text-ink-500">{detail}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  )
}

/* ==========================================================================
   Stale / partial data
   ========================================================================== */

export function StaleDataWarning({
  observedAt,
  refreshIntervalMinutes,
  className,
  sourceLabel,
}: {
  observedAt: string
  refreshIntervalMinutes: number
  className?: string
  sourceLabel?: string
}): React.JSX.Element {
  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-md border border-warn-200 bg-warn-50/70 px-3 py-2 text-xs text-warn-700',
        className,
      )}
      role="status"
    >
      <Clock className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
      <p className="leading-relaxed">
        <span className="font-semibold">{t('Stale data.')}</span>{' '}{t('The most recent observation')}
        {sourceLabel ? ` from ${sourceLabel}` : ''}{' '}{t('was recorded')}{' '}{formatRelative(observedAt)}{t(', which exceeds the')}{' '}
        {refreshIntervalMinutes}{t('-minute refresh cadence for this feed. This position should not be treated as current.')}
      </p>
    </div>
  )
}

export function PartialDataWarning({
  available,
  expected,
  detail,
  className,
}: {
  available: number
  expected: number
  detail?: string
  className?: string
}): React.JSX.Element {
  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-md border border-govt-200 bg-govt-50/70 px-3 py-2 text-xs text-govt-800',
        className,
      )}
      role="status"
    >
      <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
      <p className="leading-relaxed">
        <span className="font-semibold">{t('Partial data.')}</span> {available} of {expected}{' '}{t('expected sources reported for this period.')}{' '}{detail ?? 'Figures are computed from the sources that reported and should be read with that limitation.'}
      </p>
    </div>
  )
}

/* ==========================================================================
   Access denial - never a blank screen
   ========================================================================== */

export function AccessDeniedState({
  reason,
  resource,
  action,
  className,
}: {
  reason: string
  resource?: string
  action?: string
  className?: string
}): React.JSX.Element {
  return (
    <Card className={cn('mx-auto max-w-xl text-center', className)} role="alert">
      <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-crit-50 text-crit-600">
        <ShieldX className="h-5 w-5" aria-hidden />
      </span>
      <h2 className="text-base font-semibold text-ink-900">{t('Access not authorised')}</h2>
      <p className="mx-auto mt-1.5 max-w-md text-[0.8125rem] leading-relaxed text-ink-600">{reason}</p>
      {resource || action ? (
        <p className="mt-3 font-mono text-[0.6875rem] text-ink-400">
          {resource ? `resource: ${resource}` : ''}
          {resource && action ? ' · ' : ''}
          {action ? `action: ${action}` : ''}
        </p>
      ) : null}
      <p className="mt-4 border-t border-ink-100 pt-3 text-xs leading-relaxed text-ink-500">
        {t('This decision was made by the platform permission engine, not by hiding an interface element. The attempt has been recorded in the audit trail. If this access is required for your responsibilities, raise a scope amendment through Access Governance.')}
      </p>
    </Card>
  )
}

/** Inline redaction marker for a single value the principal may not read. */
export function RedactedValue({ reason, className }: { reason?: string; className?: string }): React.JSX.Element {
  return (
    <span
      className={cn('inline-flex items-center gap-1 rounded bg-ink-100 px-1.5 py-0.5 text-[0.6875rem] text-ink-400', className)}
      title={reason ?? 'Withheld: the classification of this value exceeds your authorised ceiling.'}
    >
      <Ban className="h-3 w-3" aria-hidden />
      {t('Withheld')}
    </span>
  )
}

/* ==========================================================================
   Demonstration data notice - used once per page, at the foot
   ========================================================================== */

export function DemonstrationNotice({ className }: { className?: string }): React.JSX.Element | null {
  // Intentionally renders nothing.
  //
  // This notice previously repeated the same provenance sentence at the foot of
  // every screen. The environment is disclosed where it is actually read - at
  // sign-in, in the top bar, and in full on the Platform Readiness page - so
  // repeating it sixty times added noise without adding information.
  //
  // The component is retained rather than deleted so that every page keeps a
  // declared provenance slot: restoring a footer statement is a one-line change
  // here, not an edit across sixty files.
  void className
  return null
}

