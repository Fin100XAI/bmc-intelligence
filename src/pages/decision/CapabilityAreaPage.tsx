import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, CircleAlert, Compass, Database, ExternalLink, Lightbulb, ScrollText } from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import { GovPanel } from '@/components/gov/GovPanel'
import { Badge, type BadgeTone } from '@/components/ui/badges'
import { EmptyState } from '@/components/ui/states'
import { EvidenceValue, useDecisionLayer, VerificationBadge } from '@/components/decision'
import { areaStatusLabel } from '@/components/decision/SystemsCapabilityMap'
import { capabilityAreaHref, capabilityAreas, type AreaInsight, type MapStatus } from '@/config/bmc/capability-map'
import { ROUTES } from '@/config/navigation'
import { activeCorporation } from '@/config/municipality.config'
import { evidenceById, sourceById } from '@/services/decision-intelligence'
import { usePageMasthead } from '@/stores/masthead.store'
import { cn } from '@/utils/cn'
import { t } from '@/i18n'

/**
 * src/pages/decision/CapabilityAreaPage.tsx
 *
 * ONE CAPABILITY AREA, in full: the decision it serves, the existing system
 * that holds it, what public records say about it (every figure opens its
 * source), what that means for the officer, the screens that already work on
 * it, and what would take it further. Reached from the systems map at
 * `/decision/systems-map/:area`.
 */

const STATUS_TONE: Record<MapStatus, BadgeTone> = { live: 'positive', partial: 'info', modelled: 'warn', 'not-built': 'muted' }

const INSIGHT_ICON: Record<AreaInsight['kind'], React.JSX.Element> = {
  finding: <Lightbulb className="h-4 w-4 text-govt-600" aria-hidden />,
  decision: <Compass className="h-4 w-4 text-google-green-600" aria-hidden />,
  gap: <CircleAlert className="h-4 w-4 text-warn-600" aria-hidden />,
}

function insightLabel(k: AreaInsight['kind']): string {
  return { finding: t('What the records show'), decision: t('Decision for the officer'), gap: t('What is not known yet') }[k]
}

export function CapabilityAreaPage(): React.JSX.Element {
  const { area } = useParams()
  const rows = useMemo(() => capabilityAreas(), [])
  const n = Number(area)
  const row = rows.find((r) => r.n === n)
  const layer = useDecisionLayer()
  usePageMasthead(row ? t('Area {0}: {1}', n, row.area) : t('Capability Map'), row?.decision)

  if (!row) {
    return (
      <PageBody>
        <EmptyState title={t('No such capability area')} detail={t('The map has areas 1 to {0}.', rows.length)} />
        <Link to={ROUTES.systemsMap} className="text-[0.8125rem] font-semibold text-govt-700 hover:underline">{t('Open the capability map')}</Link>
      </PageBody>
    )
  }

  const evidence = (row.evidenceIds ?? []).map((id) => evidenceById(layer, id)).filter((e): e is NonNullable<typeof e> => Boolean(e))
  const prev = rows.find((r) => r.n === n - 1)
  const next = rows.find((r) => r.n === n + 1)

  return (
    <PageBody width="full" className="space-y-3 p-3 sm:p-4">
      <PageHeader
        eyebrow={t('Capability Map')}
        breadcrumbs={[{ label: t('Platform') }, { label: t('Capability Map'), to: ROUTES.systemsMap }, { label: t('Area {0}', n) }]}
        hideProvenance
      />

      <GovPanel
        title={t('Area {0}: {1}', n, row.area)}
        subtitle={t('Existing system: {0}', row.system)}
        tone="primary"
        actions={<Badge tone={STATUS_TONE[row.status]}>{areaStatusLabel(row.status)}</Badge>}
      >
        <p className="text-[1rem] font-bold text-navy-800">{row.decision}</p>
        <p className="mt-1 text-[0.8125rem] leading-relaxed text-ink-700">{row.layer}</p>
        <p className="mt-2 text-[0.75rem] text-ink-600">
          <span className="font-semibold">{t('Measured by')}: </span>
          {row.measure}
        </p>
        {row.systemUrl ? (
          <a href={row.systemUrl} target="_blank" rel="noreferrer noopener" className="mt-2 inline-flex items-center gap-1 text-[0.75rem] font-semibold text-govt-700 hover:underline">
            <Database className="h-3.5 w-3.5" aria-hidden />
            {t('The existing system\'s public page')}
            <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        ) : null}
      </GovPanel>

      <GovPanel title={t('What public records say')} subtitle={t('Every figure opens its source, the exact text it was read from, and when.')}>
        {evidence.length === 0 ? (
          <p className="text-[0.75rem] text-ink-500">{t('No public figure about {0} was found for this area. It needs the corporation\'s own records.', activeCorporation.shortName)}</p>
        ) : (
          <ul className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
            {evidence.map((e) => {
              const source = sourceById(layer, e.sourceId)
              return (
                <li key={e.id} className="flex flex-col gap-1 rounded-lg border border-ink-200 bg-surface p-3">
                  <p className="text-[0.6875rem] font-semibold tracking-wide text-ink-500 uppercase">{e.label}</p>
                  <EvidenceValue evidenceId={e.id} className="self-start text-[1.25rem] font-extrabold text-ink-900" />
                  <p className="text-[0.6875rem] text-ink-600">{e.period}</p>
                  <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
                    <VerificationBadge state={e.state} />
                    {source ? (
                      <a href={source.url} target="_blank" rel="noreferrer noopener" className="inline-flex min-w-0 items-center gap-1 text-[0.6875rem] font-semibold text-govt-700 hover:underline">
                        <ScrollText className="h-3 w-3 shrink-0" aria-hidden />
                        <span className="truncate">{source.authority}</span>
                      </a>
                    ) : null}
                  </div>
                  {e.note ? <p className="text-[0.625rem] leading-snug text-ink-500">{e.note}</p> : null}
                </li>
              )
            })}
          </ul>
        )}
      </GovPanel>

      {row.insights && row.insights.length > 0 ? (
        <GovPanel title={t('What it means')} subtitle={t('Read from the records above. A basis for an officer\'s decision, not a finding against anyone.')} tone="green">
          <ul className="space-y-2">
            {row.insights.map((i, idx) => (
              <li key={idx} className={cn('flex items-start gap-2 rounded-lg border p-3', i.kind === 'decision' ? 'border-google-green-200 bg-google-green-50' : i.kind === 'gap' ? 'border-warn-200 bg-warn-50' : 'border-ink-200 bg-surface')}>
                <span className="mt-0.5 shrink-0">{INSIGHT_ICON[i.kind]}</span>
                <div className="min-w-0">
                  <p className="text-[0.625rem] font-bold tracking-wide text-ink-500 uppercase">{insightLabel(i.kind)}</p>
                  <p className="text-[0.8125rem] leading-relaxed text-ink-800">{i.text}</p>
                  {i.evidenceIds.length > 0 ? (
                    <p className="mt-1 flex flex-wrap gap-1.5 text-[0.6875rem] text-ink-500">
                      {t('From')}:
                      {i.evidenceIds.map((id) => (
                        <EvidenceValue key={id} evidenceId={id} className="text-[0.6875rem] font-semibold text-govt-700" />
                      ))}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </GovPanel>
      ) : null}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <GovPanel title={t('Working screens')} subtitle={t('Where this area is already worked in the platform.')}>
          {row.today.length === 0 ? (
            <p className="text-[0.75rem] text-ink-500">{t('No screen yet.')}</p>
          ) : (
            <ul className="space-y-1.5">
              {row.today.map((l) => (
                <li key={l.label}>
                  <Link to={l.to} className="flex items-center justify-between gap-2 rounded-lg border border-ink-200 bg-surface px-3 py-2 text-[0.8125rem] font-semibold text-govt-700 hover:bg-govt-50">
                    {l.label} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </GovPanel>
        <GovPanel title={t('To go further')} tone="amber">
          <p className="text-[0.8125rem] leading-relaxed text-ink-800">{row.next}</p>
        </GovPanel>
      </div>

      <nav className="flex flex-wrap items-center justify-between gap-2" aria-label={t('Other areas')}>
        {prev ? (
          <Link to={capabilityAreaHref(prev.n)} className="inline-flex items-center gap-1 text-[0.75rem] font-semibold text-govt-700 hover:underline">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> {t('Area {0}: {1}', prev.n, prev.area)}
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link to={capabilityAreaHref(next.n)} className="inline-flex items-center gap-1 text-[0.75rem] font-semibold text-govt-700 hover:underline">
            {t('Area {0}: {1}', next.n, next.area)} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        ) : null}
      </nav>
    </PageBody>
  )
}

export default CapabilityAreaPage
