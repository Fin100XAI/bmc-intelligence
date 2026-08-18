import { useState } from 'react'
import { ChevronRight, X } from 'lucide-react'
import { GovMasthead, GovStripCell } from '@/components/gov/GovPanel'
import { Button, IconButton } from '@/components/ui/primitives'
import { SeverityBadge, ConfidenceBadge } from '@/components/ui/badges'
import type { CrossDomainInsight } from '@/domains'
import { t } from '@/i18n'

/**
 * src/components/onboarding/CockpitBriefing.tsx
 *
 * The Commissioner Cockpit's first-90-seconds narrative: three short steps
 * built from `GovMasthead`/`GovStripCell` - the platform's own institutional
 * visual language, not a generic product-tour overlay - narrating figures the
 * page has already computed (`buildCityPosition`, `buildCrossDomainInsights`,
 * the counts behind its `MetricCard`s). Nothing here is fabricated for the
 * briefing; every number is exactly what the Cockpit itself shows a moment
 * later. Dismissible, and re-openable via the "Replay briefing" affordance
 * the page renders alongside it, so it never becomes a one-time dead end for
 * repeat demonstrations.
 */

interface CockpitBriefingProps {
  commissionerName: string
  cityName: string
  healthScore: number
  priorityCount: number
  incidentCount: number
  overdueDecisions: number
  topInsight?: CrossDomainInsight
  onDismiss: () => void
}

function healthReading(score: number): string {
  if (score >= 78) return t('Steady across most domains.')
  if (score >= 60) return t('Holding, with pressure in a few domains.')
  if (score >= 45) return t('Elevated risk - several domains need attention.')
  return t('Multiple domains under significant strain.')
}

export function CockpitBriefing({
  commissionerName,
  cityName,
  healthScore,
  priorityCount,
  incidentCount,
  overdueDecisions,
  topInsight,
  onDismiss,
}: CockpitBriefingProps): React.JSX.Element {
  const steps = topInsight ? 3 : 2
  const [step, setStep] = useState(0)
  const isLast = step === steps - 1

  const authority = t('Today\'s briefing · Step {0} of {1}', step + 1, steps)

  return (
    <div className="relative">
      <IconButton
        label={t('Skip briefing')}
        onClick={onDismiss}
        className="absolute top-2 right-2 z-10 text-white/70 hover:bg-white/10 hover:text-white"
      >
        <X className="h-3.5 w-3.5" />
      </IconButton>

      {step === 0 && (
        <GovMasthead
          authority={authority}
          title={t('Good morning, {0}.', commissionerName)}
          standfirst={t('Here is {0}\'s position before you start the day.', cityName)}
          strip={
            <GovStripCell
              label={t('City health score')}
              value={`${healthScore}/100`}
              tone={healthScore >= 78 ? 'positive' : healthScore >= 60 ? 'default' : healthScore >= 45 ? 'warn' : 'critical'}
              background="green"
            />
          }
        />
      )}

      {step === 1 && (
        <GovMasthead
          authority={authority}
          title={t('{0} items are waiting on a decision.', priorityCount)}
          standfirst={t(
            '{0} active incidents and {1} decisions past their due date - the Priority Queue on the right is where these get worked.',
            incidentCount,
            overdueDecisions,
          )}
          strip={
            <>
              <GovStripCell label={t('Priority queue')} value={priorityCount} tone={priorityCount > 0 ? 'critical' : 'default'} background="red" />
              <GovStripCell label={t('Active incidents')} value={incidentCount} tone={incidentCount > 0 ? 'critical' : 'default'} background="red" />
              <GovStripCell label={t('Overdue decisions')} value={overdueDecisions} tone={overdueDecisions > 0 ? 'warn' : 'default'} background="amber" />
            </>
          }
        />
      )}

      {step === 2 && topInsight && (
        <GovMasthead
          authority={authority}
          title={t('One thing no single department would have seen alone.')}
          standfirst={
            <span className="flex flex-col gap-1.5">
              <span className="flex items-center gap-1.5">
                <SeverityBadge severity={topInsight.severity} />
                <ConfidenceBadge confidence={topInsight.confidence} />
              </span>
              <span className="font-semibold text-white/90">{topInsight.title}</span>
              <span>{topInsight.narrative}</span>
            </span>
          }
        />
      )}

      <div className="mt-2 flex items-center justify-between">
        <p className="text-[0.6875rem] leading-snug text-ink-500">{healthReading(healthScore)}</p>
        <div className="flex items-center gap-2">
          {!isLast && (
            <Button variant="ghost" size="xs" onClick={onDismiss}>
              {t('Skip')}
            </Button>
          )}
          <Button
            variant="primary"
            size="xs"
            iconRight={!isLast ? <ChevronRight className="h-3 w-3" /> : undefined}
            onClick={() => (isLast ? onDismiss() : setStep((s) => s + 1))}
          >
            {isLast ? t('Enter Cockpit') : t('Next')}
          </Button>
        </div>
      </div>
    </div>
  )
}
