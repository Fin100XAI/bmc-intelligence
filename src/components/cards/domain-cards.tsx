import { type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertOctagon,
  Building2,
  CalendarClock,
  ChevronRight,
  FileSearch,
  GitBranch,
  MapPin,
  ShieldAlert,
  Sparkles,
  Timer,
  Users,
} from 'lucide-react'
import { DOMAIN_LABEL, type ConfidenceLevel, type Severity } from '@/types/common'
import { INTELLIGENCE_STATUS_LABEL, INTELLIGENCE_TYPE_LABEL, type Alert, type IntelligenceItem } from '@/types/intelligence'
import { ACTION_STATUS_LABEL, DECISION_STATUS_LABEL, type ActionItem, type DecisionCase, type Incident } from '@/types/operations'
import { INCIDENT_STATUS_LABEL, INCIDENT_TYPE_LABEL } from '@/types/operations'
import { PROJECT_STATUS_LABEL, type Project } from '@/types/finance'
import type { EvidenceItem } from '@/types/intelligence'
import type { SecurityEvent } from '@/types/governance'
import type { Ward } from '@/types/organisation'
import type { AIRecommendationBlock } from '@/types/ai'
import { cn } from '@/utils/cn'
import { formatCompact, formatCrore, formatDate, formatDuration, formatRelative } from '@/utils/format'
import { departmentName, officerDisplayName, wardName } from '@/data/reference'
import {
  Badge,
  ClassificationBadge,
  ConfidenceBadge,
  SeverityBadge,
  SeverityRail,
  StateBadge,
} from '@/components/ui/badges'
import { Button, ProgressBar, toneForScore, SCORE_TONE_TEXT } from '@/components/ui/primitives'
import { MiniBar } from '@/components/charts/charts'
import { t } from '@/i18n'

/* ==========================================================================
   Shared shell
   ========================================================================== */

function CardShell({
  severity,
  onClick,
  to,
  active,
  className,
  children,
}: {
  severity?: Severity
  onClick?: () => void
  to?: string
  active?: boolean
  className?: string
  children: ReactNode
}): React.JSX.Element {
  const shell = cn(
    'group flex w-full gap-3 rounded-[10px] border bg-surface p-3.5 text-left shadow-card transition-shadow',
    active ? 'border-govt-300 shadow-raised' : 'border-ink-100',
    (onClick || to) && 'cursor-pointer hover:shadow-raised',
    className,
  )
  const inner = (
    <>
      {severity ? <SeverityRail severity={severity} /> : null}
      <div className="min-w-0 flex-1">{children}</div>
    </>
  )
  if (to) {
    return (
      <Link to={to} className={shell}>
        {inner}
      </Link>
    )
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={shell}>
        {inner}
      </button>
    )
  }
  return <div className={shell}>{inner}</div>
}

function MetaRow({ children, className }: { children: ReactNode; className?: string }): React.JSX.Element {
  return (
    <div className={cn('mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.6875rem] text-ink-400', className)}>
      {children}
    </div>
  )
}

/* ==========================================================================
   Intelligence
   ========================================================================== */

export function IntelligenceCard({
  item,
  onClick,
  active,
  compact,
  className,
}: {
  item: IntelligenceItem
  onClick?: () => void
  active?: boolean
  compact?: boolean
  className?: string
}): React.JSX.Element {
  return (
    <CardShell severity={item.severity} onClick={onClick} active={active} className={className}>
      <div className="flex flex-wrap items-center gap-1.5">
        <SeverityBadge severity={item.severity} />
        <Badge tone="neutral">{INTELLIGENCE_TYPE_LABEL[item.type]}</Badge>
        <Badge tone="muted">{DOMAIN_LABEL[item.domain]}</Badge>
        {item.type === 'cross-domain' ? (
          <Badge tone="intel" icon={<GitBranch className="h-3 w-3" />}>
            {'Cross-domain'}
          </Badge>
        ) : null}
        <div className="flex-1" />
        <Badge tone="muted">{INTELLIGENCE_STATUS_LABEL[item.status]}</Badge>
      </div>

      <h3 className="mt-2 text-[0.8125rem] leading-[1.4] font-semibold text-ink-900">{item.title}</h3>
      {!compact ? (
        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-500">{item.description}</p>
      ) : null}

      <MetaRow>
        <span className="inline-flex items-center gap-1">
          <MapPin className="h-3 w-3" />
          {item.wardIds.map((w) => wardName(w)).join(', ')}
        </span>
        <span className="inline-flex items-center gap-1">
          <Building2 className="h-3 w-3" />
          {departmentName(item.departmentId)}
        </span>
        {typeof item.citizensAffected === 'number' ? (
          <span className="inline-flex items-center gap-1">
            <Users className="h-3 w-3" />
            {formatCompact(item.citizensAffected)}{' '}{t('affected (estimate)')}
          </span>
        ) : null}
        <span className="inline-flex items-center gap-1">
          <FileSearch className="h-3 w-3" />
          {item.evidenceIds.length}{' '}{t('evidence record')}{item.evidenceIds.length === 1 ? '' : 's'}
        </span>
        <span>{formatRelative(item.createdAt)}</span>
      </MetaRow>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <ConfidenceBadge confidence={item.confidence} />
        <ClassificationBadge classification={item.classification} />
        {item.ownerId ? <Badge tone="muted">{t('Owner: {0}', officerDisplayName(item.ownerId))}</Badge> : <Badge tone="warn">{t('Unassigned')}</Badge>}
        {item.decisionCaseId ? <Badge tone="info">{t('Decision case raised')}</Badge> : null}
      </div>
    </CardShell>
  )
}

/* ==========================================================================
   Risk (generic explainable score)
   ========================================================================== */

export function RiskCard({
  title,
  score,
  higherIsWorse = true,
  drivers,
  subtitle,
  severity,
  onClick,
  className,
  footer,
}: {
  title: ReactNode
  score: number
  higherIsWorse?: boolean
  drivers: Array<{ label: string; contribution: number; rawScore: number }>
  subtitle?: ReactNode
  severity?: Severity
  onClick?: () => void
  className?: string
  footer?: ReactNode
}): React.JSX.Element {
  const tone = toneForScore(score, !higherIsWorse)
  const top = [...drivers].sort((a, b) => b.contribution - a.contribution).slice(0, 3)
  return (
    <CardShell severity={severity} onClick={onClick} className={className}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-[0.8125rem] font-semibold text-ink-900">{title}</h3>
          {subtitle ? <p className="mt-0.5 truncate text-[0.6875rem] text-ink-500">{subtitle}</p> : null}
        </div>
        <div className="shrink-0 text-right">
          <span className={cn('numeric text-metric-sm font-semibold', SCORE_TONE_TEXT[tone])}>{Math.round(score)}</span>
          <span className="ml-0.5 text-[0.625rem] text-ink-400">/100</span>
        </div>
      </div>

      <ProgressBar value={score} tone={tone} size="sm" className="mt-2" />

      <ul className="mt-2.5 space-y-1">
        {top.map((d) => (
          <li key={d.label} className="flex items-center justify-between gap-2 text-[0.6875rem]">
            <span className="truncate text-ink-500">{d.label}</span>
            <span className="flex shrink-0 items-center gap-1.5">
              <MiniBar value={d.rawScore} width={40} />
              <span className="numeric font-semibold text-ink-700">+{d.contribution.toFixed(1)}</span>
            </span>
          </li>
        ))}
      </ul>
      {footer ? <div className="mt-2.5 border-t border-ink-100 pt-2">{footer}</div> : null}
    </CardShell>
  )
}

/* ==========================================================================
   Decision
   ========================================================================== */

export function DecisionCard({
  decision,
  onClick,
  active,
  className,
}: {
  decision: DecisionCase
  onClick?: () => void
  active?: boolean
  className?: string
}): React.JSX.Element {
  const overdue = new Date(decision.dueDate).getTime() < Date.now() && decision.status !== 'closed'
  return (
    <CardShell severity={decision.severity} onClick={onClick} active={active} className={className}>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone="info" className="font-mono">
          {decision.reference}
        </Badge>
        <SeverityBadge severity={decision.severity} />
        <Badge tone="muted">{DOMAIN_LABEL[decision.domain]}</Badge>
        <div className="flex-1" />
        <Badge tone={decision.status === 'closed' ? 'positive' : decision.status === 'rejected' ? 'critical' : 'neutral'}>
          {DECISION_STATUS_LABEL[decision.status]}
        </Badge>
      </div>

      <h3 className="mt-2 text-[0.8125rem] leading-[1.4] font-semibold text-ink-900">{decision.title}</h3>
      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-500">{decision.problemStatement}</p>

      <MetaRow>
        <span className="inline-flex items-center gap-1">
          <GitBranch className="h-3 w-3" />
          {decision.alternatives.length} alternatives
        </span>
        <span className="numeric">{formatCrore(decision.financialImpactCrore)} impact</span>
        <span className="inline-flex items-center gap-1">
          <FileSearch className="h-3 w-3" />
          {decision.evidenceIds.length} evidence
        </span>
        <span className={cn('inline-flex items-center gap-1', overdue && 'font-semibold text-crit-600')}>
          <CalendarClock className="h-3 w-3" />
          {t('Due')}{' '}{formatDate(decision.dueDate)}
        </span>
      </MetaRow>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <ClassificationBadge classification={decision.classification} />
        {decision.humanDecision ? (
          <Badge tone="positive">{t('Human decision recorded')}</Badge>
        ) : (
          <Badge tone="warn">{t('Awaiting human decision')}</Badge>
        )}
        {decision.approvals.some((a) => a.status === 'pending') ? (
          <Badge tone="neutral">{t('{0} approval pending', decision.approvals.filter((a) => a.status === 'pending').length)}</Badge>
        ) : null}
      </div>
    </CardShell>
  )
}

/* ==========================================================================
   Alert
   ========================================================================== */

export function AlertCard({
  alert,
  onClick,
  active,
  actions,
  className,
}: {
  alert: Alert
  onClick?: () => void
  active?: boolean
  actions?: ReactNode
  className?: string
}): React.JSX.Element {
  const breached = alert.slaRemainingHours < 0
  return (
    <CardShell severity={alert.severity} onClick={onClick} active={active} className={className}>
      <div className="flex flex-wrap items-center gap-1.5">
        <SeverityBadge severity={alert.severity} />
        <Badge tone="muted">{DOMAIN_LABEL[alert.domain]}</Badge>
        <div className="flex-1" />
        <Badge tone={breached ? 'critical' : alert.slaRemainingHours < alert.slaHours * 0.25 ? 'warn' : 'neutral'} icon={<Timer className="h-3 w-3" />}>
          {breached
            ? `SLA breached by ${formatDuration(Math.abs(alert.slaRemainingHours))}`
            : `${formatDuration(alert.slaRemainingHours)} to SLA`}
        </Badge>
      </div>

      <h3 className="mt-2 text-[0.8125rem] leading-[1.4] font-semibold text-ink-900">{alert.title}</h3>
      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-500">{alert.description}</p>

      <MetaRow>
        <span className="inline-flex items-center gap-1">
          <MapPin className="h-3 w-3" />
          {alert.wardIds.map((w) => wardName(w)).join(', ')}
        </span>
        <span>{departmentName(alert.departmentId)}</span>
        <span>{t('Source: {0}', alert.source)}</span>
        <span>{formatRelative(alert.createdAt)}</span>
      </MetaRow>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Badge tone="muted">{alert.status}</Badge>
        <ConfidenceBadge confidence={alert.confidence} />
        <ClassificationBadge classification={alert.classification} />
        {alert.ownerId ? <Badge tone="muted">{officerDisplayName(alert.ownerId)}</Badge> : null}
      </div>

      {actions ? <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-ink-100 pt-2.5">{actions}</div> : null}
    </CardShell>
  )
}

/* ==========================================================================
   Evidence
   ========================================================================== */

export function EvidenceCard({
  evidence,
  onOpen,
  className,
  compact,
}: {
  evidence: EvidenceItem
  onOpen?: () => void
  className?: string
  compact?: boolean
}): React.JSX.Element {
  // Rendered as a real button when interactive, so keyboard operation and
  // assistive technology semantics come from the platform rather than ARIA
  // patched onto a div.
  const Wrapper = onOpen ? 'button' : 'div'
  return (
    <Wrapper
      {...(onOpen ? { type: 'button' as const, onClick: onOpen } : {})}
      className={cn(
        'w-full rounded-lg border border-ink-100 bg-surface-sunken p-3 text-left',
        onOpen && 'cursor-pointer transition-colors hover:border-govt-200 hover:bg-govt-50/40',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone="neutral" className="font-mono">
              {evidence.id}
            </Badge>
            <Badge tone="muted">{evidence.kind.replace('-', ' ')}</Badge>
            <ClassificationBadge classification={evidence.classification} showIcon={false} />
          </div>
          <p className="mt-1.5 text-[0.8125rem] leading-snug font-medium text-ink-800">{evidence.title}</p>
          {!compact ? <p className="mt-1 text-xs leading-relaxed text-ink-500">{evidence.summary}</p> : null}
        </div>
        {onOpen ? <ChevronRight className="h-3.5 w-3.5 shrink-0 text-ink-300" /> : null}
      </div>

      <MetaRow className="mt-2">
        <span className="truncate">{t('Source: {0}', evidence.sourceSystem)}</span>
        <span className="font-mono">{evidence.sourceRecordRef}</span>
        <span>{t('Observed {0}', formatRelative(evidence.observedAt))}</span>
        <span className="inline-flex items-center gap-1">
          {t('Quality')}
          <MiniBar value={evidence.dataQuality} width={30} />
          <span className="numeric font-semibold text-ink-600">{evidence.dataQuality}</span>
        </span>
      </MetaRow>
    </Wrapper>
  )
}

/* ==========================================================================
   Project
   ========================================================================== */

export function ProjectCard({
  project,
  onClick,
  active,
  className,
}: {
  project: Project
  onClick?: () => void
  active?: boolean
  className?: string
}): React.JSX.Element {
  const variance = project.plannedCompletionPct - project.completionPct
  const riskTone = toneForScore(project.riskScore, false)
  return (
    <CardShell onClick={onClick} active={active} className={className}>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone="neutral" className="font-mono">
          {project.reference}
        </Badge>
        <Badge tone="muted">{PROJECT_STATUS_LABEL[project.status]}</Badge>
        <div className="flex-1" />
        <Badge tone={project.riskScore >= 70 ? 'critical' : project.riskScore >= 55 ? 'risk' : project.riskScore >= 38 ? 'warn' : 'positive'}>
          {t('Risk {0}', project.riskScore)}
        </Badge>
      </div>

      <h3 className="mt-2 text-[0.8125rem] leading-[1.4] font-semibold text-ink-900">{project.name}</h3>

      <div className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[0.6875rem]">
        <div>
          <span className="text-ink-400">{t('Sanctioned')}</span>
          <p className="numeric font-semibold text-ink-800">{formatCrore(project.sanctionedCostCrore)}</p>
        </div>
        <div>
          <span className="text-ink-400">{t('Paid to date')}</span>
          <p className="numeric font-semibold text-ink-800">{formatCrore(project.paidCrore)}</p>
        </div>
      </div>

      <div className="mt-2.5">
        <div className="mb-1 flex items-baseline justify-between text-[0.6875rem]">
          <span className="text-ink-400">{t('Physical progress')}</span>
          <span className="numeric">
            <span className="font-semibold text-ink-800">{project.completionPct}%</span>
            <span className="mx-1 text-ink-300">{t('vs plan')}</span>
            <span className={cn('font-semibold', variance > 12 ? 'text-crit-600' : 'text-ink-600')}>
              {project.plannedCompletionPct}%
            </span>
          </span>
        </div>
        <ProgressBar value={project.completionPct} tone={riskTone} size="sm" />
      </div>

      <MetaRow>
        <span className="inline-flex items-center gap-1">
          <MapPin className="h-3 w-3" />
          {project.wardIds.map((w) => wardName(w)).join(', ')}
        </span>
        <span>{departmentName(project.departmentId)}</span>
        <span>{t('{0} milestones slipped', project.milestones.filter((m) => m.status === 'slipped').length)}</span>
        {project.complaintsLinked > 0 ? <span>{t('{0} linked complaints', project.complaintsLinked)}</span> : null}
      </MetaRow>
    </CardShell>
  )
}

/* ==========================================================================
   Ward
   ========================================================================== */

export function WardCard({
  ward,
  onClick,
  active,
  metrics,
  className,
}: {
  ward: Ward
  onClick?: () => void
  active?: boolean
  metrics?: Array<{ label: string; value: ReactNode }>
  className?: string
}): React.JSX.Element {
  const tone = toneForScore(ward.healthScore)
  return (
    <CardShell onClick={onClick} active={active} className={className}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="rounded bg-ink-900 px-1.5 py-0.5 font-mono text-[0.6875rem] font-semibold text-white">
              {ward.code}
            </span>
            <h3 className="truncate text-[0.8125rem] font-semibold text-ink-900">{ward.name.split(' · ')[0]}</h3>
          </div>
          <p className="mt-0.5 truncate text-[0.6875rem] text-ink-500">
            {t('{0} · {1} residents · {2} km²', ward.region, formatCompact(ward.population), ward.areaSqKm)}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <span className={cn('numeric text-metric-sm font-semibold', SCORE_TONE_TEXT[tone])}>{ward.healthScore}</span>
          <p className="text-[0.625rem] text-ink-400">{t('Health')}</p>
        </div>
      </div>

      <ProgressBar value={ward.healthScore} tone={tone} size="sm" className="mt-2" />

      {metrics && metrics.length > 0 ? (
        <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5 sm:grid-cols-3">
          {metrics.map((m) => (
            <div key={m.label}>
              <span className="text-[0.625rem] text-ink-400">{m.label}</span>
              <p className="numeric text-xs font-semibold text-ink-800">{m.value}</p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <StateBadge state={ward.state} />
        {ward.floodProne ? <Badge tone="warn">{'Flood-prone'}</Badge> : null}
        <Badge tone="muted">{t('Risk {0}', ward.riskScore)}</Badge>
      </div>
    </CardShell>
  )
}

/* ==========================================================================
   Incident
   ========================================================================== */

export function IncidentCard({
  incident,
  onClick,
  active,
  className,
}: {
  incident: Incident
  onClick?: () => void
  active?: boolean
  className?: string
}): React.JSX.Element {
  return (
    <CardShell severity={incident.severity} onClick={onClick} active={active} className={className}>
      <div className="flex flex-wrap items-center gap-1.5">
        <SeverityBadge severity={incident.severity} />
        <Badge tone="neutral">{INCIDENT_TYPE_LABEL[incident.type]}</Badge>
        <div className="flex-1" />
        <Badge
          tone={
            incident.status === 'active'
              ? 'critical'
              : incident.status === 'contained'
                ? 'warn'
                : incident.status === 'resolved' || incident.status === 'reviewed'
                  ? 'positive'
                  : 'neutral'
          }
          dot
        >
          {INCIDENT_STATUS_LABEL[incident.status]}
        </Badge>
      </div>

      <h3 className="mt-2 text-[0.8125rem] leading-[1.4] font-semibold text-ink-900">{incident.title}</h3>
      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-500">{incident.description}</p>

      <MetaRow>
        <span className="inline-flex items-center gap-1">
          <MapPin className="h-3 w-3" />
          {incident.locationName}
        </span>
        <span className="inline-flex items-center gap-1">
          <Users className="h-3 w-3" />
          {formatCompact(incident.affectedPopulation)}{' '}{t('affected (estimate)')}
        </span>
        <span>{incident.responseTeams.length} teams</span>
        <span>{t('Detected {0}', formatRelative(incident.detectedAt))}</span>
      </MetaRow>
    </CardShell>
  )
}

/* ==========================================================================
   Action
   ========================================================================== */

export function ActionCard({
  action,
  onClick,
  active,
  className,
}: {
  action: ActionItem
  onClick?: () => void
  active?: boolean
  className?: string
}): React.JSX.Element {
  const overdue = new Date(action.dueDate).getTime() < Date.now() && !['completed', 'verified', 'closed'].includes(action.status)
  return (
    <CardShell severity={action.priority} onClick={onClick} active={active} className={className}>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone="neutral" className="font-mono">
          {action.reference}
        </Badge>
        <SeverityBadge severity={action.priority} />
        <div className="flex-1" />
        <Badge tone={action.status === 'blocked' ? 'critical' : action.status === 'closed' ? 'positive' : 'neutral'}>
          {ACTION_STATUS_LABEL[action.status]}
        </Badge>
      </div>
      <h3 className="mt-2 text-[0.8125rem] leading-snug font-semibold text-ink-900">{action.title}</h3>
      <MetaRow>
        <span>{officerDisplayName(action.ownerId)}</span>
        <span>{departmentName(action.departmentId)}</span>
        <span className={cn(overdue && 'font-semibold text-crit-600')}>{t('Due {0}', formatDate(action.dueDate))}</span>
        {action.notes.length > 0 ? <span>{t('{0} note(s)', action.notes.length)}</span> : null}
      </MetaRow>
    </CardShell>
  )
}

/* ==========================================================================
   Security event
   ========================================================================== */

export function SecurityCard({
  event,
  onClick,
  active,
  className,
}: {
  event: SecurityEvent
  onClick?: () => void
  active?: boolean
  className?: string
}): React.JSX.Element {
  return (
    <CardShell severity={event.severity} onClick={onClick} active={active} className={className}>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone="neutral" className="font-mono">
          {event.reference}
        </Badge>
        <SeverityBadge severity={event.severity} />
        <div className="flex-1" />
        <Badge tone={event.status === 'open' ? 'critical' : event.status === 'closed' ? 'positive' : 'neutral'}>
          {event.status}
        </Badge>
      </div>
      <h3 className="mt-2 flex items-center gap-1.5 text-[0.8125rem] font-semibold text-ink-900">
        <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-ink-400" />
        {event.type.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase())}
      </h3>
      <p className="mt-1 text-xs leading-relaxed text-ink-500">{event.description}</p>
      <MetaRow>
        <span>{t('Subject: {0}', event.subjectUserName)}</span>
        <span className="font-mono">{event.sessionId}</span>
        <span>{event.device}</span>
        <span>{formatRelative(event.detectedAt)}</span>
      </MetaRow>
      <div className="mt-2">
        <ClassificationBadge classification={event.classification} />
      </div>
    </CardShell>
  )
}

/* ==========================================================================
   AI recommendation - never executes, always names a human owner
   ========================================================================== */

export function AIRecommendationCard({
  recommendation,
  onApprove,
  onModify,
  onReject,
  onOpenEvidence,
  status,
  className,
}: {
  recommendation: AIRecommendationBlock
  onApprove?: () => void
  onModify?: () => void
  onReject?: () => void
  onOpenEvidence?: () => void
  status?: 'pending' | 'accepted' | 'modified' | 'rejected' | 'escalated'
  className?: string
}): React.JSX.Element {
  return (
    <div className={cn('rounded-[10px] border border-intel-200 bg-intel-50/30 p-3.5 shadow-card', className)}>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone="intel" icon={<Sparkles className="h-3 w-3" />}>
          {t('AI recommendation')}
        </Badge>
        <ConfidenceBadge confidence={recommendation.confidence} />
        <div className="flex-1" />
        <Badge tone={status === 'accepted' ? 'positive' : status === 'rejected' ? 'critical' : 'warn'}>
          {status === 'accepted'
            ? 'Accepted by officer'
            : status === 'modified'
              ? 'Modified by officer'
              : status === 'rejected'
                ? 'Rejected by officer'
                : status === 'escalated'
                  ? 'Escalated'
                  : 'Requires human approval'}
        </Badge>
      </div>

      <h4 className="mt-2 text-[0.8125rem] leading-snug font-semibold text-ink-900">{recommendation.title}</h4>

      <dl className="mt-2.5 space-y-2 text-xs">
        <div>
          <dt className="label-institutional">{t('Why')}</dt>
          <dd className="mt-0.5 leading-relaxed text-ink-600">{recommendation.why}</dd>
        </div>
        <div>
          <dt className="label-institutional">{t('Expected impact')}</dt>
          <dd className="mt-0.5 leading-relaxed text-ink-600">{recommendation.expectedImpact}</dd>
        </div>
        {recommendation.dependencies.length > 0 ? (
          <div>
            <dt className="label-institutional">{t('Dependencies')}</dt>
            <dd className="mt-0.5 text-ink-600">{recommendation.dependencies.join(' · ')}</dd>
          </div>
        ) : null}
        {recommendation.risks.length > 0 ? (
          <div>
            <dt className="label-institutional">{t('Risks')}</dt>
            <dd className="mt-0.5 text-ink-600">{recommendation.risks.join(' · ')}</dd>
          </div>
        ) : null}
        <div>
          <dt className="label-institutional">{t('Accountable human owner')}</dt>
          <dd className="mt-0.5 font-medium text-ink-700">
            {recommendation.humanOwnerRole} · {departmentName(recommendation.departmentId)}
          </dd>
        </div>
      </dl>

      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-intel-200/70 pt-2.5">
        {onOpenEvidence ? (
          <Button size="xs" variant="outline" icon={<FileSearch className="h-3 w-3" />} onClick={onOpenEvidence}>
            {t('Open evidence ({0})', recommendation.evidenceRefs.length)}
          </Button>
        ) : null}
        <div className="flex-1" />
        {onReject ? (
          <Button size="xs" variant="ghost" onClick={onReject}>
            {t('Reject')}
          </Button>
        ) : null}
        {onModify ? (
          <Button size="xs" variant="outline" onClick={onModify}>
            {t('Modify')}
          </Button>
        ) : null}
        {onApprove ? (
          <Button size="xs" variant="primary" onClick={onApprove}>
            {t('Approve as officer')}
          </Button>
        ) : null}
      </div>

      <p className="mt-2 flex items-start gap-1 text-[0.625rem] leading-relaxed text-ink-400">
        <AlertOctagon className="mt-px h-2.5 w-2.5 shrink-0" />
        {t('This recommendation is advisory. The platform will not act on it. A named officer must approve before any deployment, expenditure or instruction follows.')}
      </p>
    </div>
  )
}

/** Confidence-aware wrapper used to badge any generic figure. */
export function ConfidenceNote({
  confidence,
  rationale,
  className,
}: {
  confidence: ConfidenceLevel
  rationale: string
  className?: string
}): React.JSX.Element {
  return (
    <div className={cn('flex items-start gap-2 text-[0.6875rem] leading-relaxed text-ink-500', className)}>
      <ConfidenceBadge confidence={confidence} />
      <span>{rationale}</span>
    </div>
  )
}
