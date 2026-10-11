import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Database, ExternalLink, Presentation } from 'lucide-react'
import { GovPanel } from '@/components/gov/GovPanel'
import { Badge, type BadgeTone } from '@/components/ui/badges'
import { areaWing, capabilityAreaHref, capabilityAreas, existingSystems, leadDemonstrations, type MapStatus, type SystemAccess } from '@/config/bmc/capability-map'
import { NAV_SECTIONS } from '@/config/navigation'
import { activeCorporation } from '@/config/municipality.config'
import { cn } from '@/utils/cn'
import { t } from '@/i18n'

/**
 * src/components/decision/SystemsCapabilityMap.tsx
 *
 * The corporation's systems map: the capability areas its existing systems
 * already cover, the decision this platform adds above each, and where the
 * platform stands on it - kept apart from any claim about how deeply those
 * systems are deployed. Below it, the existing systems themselves, with what
 * each makes available.
 */

const STATUS_TONE: Record<MapStatus, BadgeTone> = { live: 'positive', partial: 'info', modelled: 'warn', 'not-built': 'muted' }

export function areaStatusLabel(s: MapStatus): string {
  return {
    live: t('Live on public data'),
    partial: t('Partly live'),
    modelled: t('Built - modelled until corporation data'),
    'not-built': t('Not built yet'),
  }[s]
}

const ACCESS_TONE: Record<SystemAccess, BadgeTone> = { open: 'positive', 'dashboard-only': 'info', gated: 'warn', unknown: 'muted' }

export function accessLabel(a: SystemAccess): string {
  return {
    open: t('Open data'),
    'dashboard-only': t('Published as a dashboard'),
    gated: t('Needs authorised access'),
    unknown: t('Access not published'),
  }[a]
}

export function SystemsCapabilityMap(): React.JSX.Element {
  const rows = useMemo(() => capabilityAreas(), [])
  const demos = useMemo(() => leadDemonstrations(), [])
  const systems = useMemo(() => existingSystems(), [])
  const [filter, setFilter] = useState<MapStatus | 'all'>('all')
  const [byWing, setByWing] = useState(true)
  const [query, setQuery] = useState('')
  const counts = useMemo(() => {
    const c: Record<MapStatus, number> = { live: 0, partial: 0, modelled: 0, 'not-built': 0 }
    for (const r of rows) c[r.status] += 1
    return c
  }, [rows])
  const q = query.trim().toLowerCase()
  const shown = rows.filter(
    (r) =>
      (filter === 'all' || r.status === filter) &&
      (!q || [String(r.n), r.area, r.decision, r.layer, r.next, r.system, ...r.today.map((l) => l.label)].some((x) => x.toLowerCase().includes(q))),
  )

  const card = (r: (typeof rows)[number]): React.JSX.Element => (
    <li key={r.n} className="flex flex-col rounded-lg border border-ink-200 bg-surface p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <Link to={capabilityAreaHref(r.n)} className="text-[0.8125rem] font-bold text-ink-900 hover:text-govt-700 hover:underline">
          <span className="numeric mr-1.5 text-ink-400">{r.n}</span>
          {r.area}
        </Link>
        <Badge tone={STATUS_TONE[r.status]} size="sm">{areaStatusLabel(r.status)}</Badge>
      </div>
      <p className="mt-0.5 flex items-center gap-1 text-[0.625rem] text-ink-500">
        <Database className="h-3 w-3 shrink-0" aria-hidden />
        {t('Existing system: {0}', r.system)}
      </p>
      <p className="mt-2 text-[0.75rem] font-semibold text-navy-800">{r.decision}</p>
      <p className="mt-1 text-[0.6875rem] leading-snug text-ink-600">{r.layer}</p>
      <p className="mt-1 text-[0.6875rem] text-ink-600">
        <span className="font-semibold text-ink-700">{t('Measured by')}: </span>
        {r.measure}
      </p>
      {r.today.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {r.today.map((l) => (
            <Link key={l.label} to={l.to} className="inline-flex items-center gap-1 rounded-md border border-ink-200 px-2 py-0.5 text-[0.6875rem] font-semibold text-govt-700 hover:bg-govt-50">
              {l.label} <ArrowRight className="h-3 w-3" aria-hidden />
            </Link>
          ))}
        </div>
      ) : null}
      <p className="mt-2 border-t border-ink-100 pt-2 text-[0.6875rem] leading-snug text-ink-700">
        <span className="font-semibold">{t('Next')}: </span>
        {r.next}
      </p>
      <Link to={capabilityAreaHref(r.n)} className="mt-1 inline-flex items-center gap-1 self-start text-[0.6875rem] font-bold text-govt-700 hover:underline">
        {t('Open the area brief')} <ArrowRight className="h-3 w-3" aria-hidden />
      </Link>
    </li>
  )

  const wings = NAV_SECTIONS.map((sec) => ({ id: sec.id, label: sec.label, areas: shown.filter((r) => areaWing(r) === sec.id) })).filter((w) => w.areas.length > 0)

  return (
    <>
      <GovPanel
        title={t('Decision and outcome intelligence above {0}\'s existing systems', activeCorporation.shortName)}
        subtitle={t('{0} capability areas, the existing system that holds each, the decision this platform adds, and where it stands today.', rows.length)}
        tone="primary"
      >
        <p className="text-[0.75rem] leading-relaxed text-ink-600">
          {t('The existing system says where a function is publicly described as running, not how fully it is deployed. Each proposed layer is to be validated against the corporation\'s current systems; where a system already does a function well, the platform integrates with it and works on the remaining need.')}
        </p>

        <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label={t('Filter by status')}>
          {(['all', 'live', 'partial', 'modelled', 'not-built'] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={filter === s}
              onClick={() => setFilter(s)}
              className={cn('rounded-full border px-2.5 py-1 text-[0.6875rem] font-semibold', filter === s ? 'border-govt-600 bg-govt-600 text-white' : 'border-ink-200 bg-surface text-ink-700 hover:bg-govt-50')}
            >
              {s === 'all' ? t('All {0}', rows.length) : `${areaStatusLabel(s)} · ${counts[s]}`}
            </button>
          ))}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5" role="group" aria-label={t('Arrange the areas')}>
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('Search the areas')} aria-label={t('Search the areas')} className="h-7 w-full max-w-[14rem] rounded-md border border-ink-200 bg-surface px-2 text-[0.6875rem]" />
          {([true, false] as const).map((w) => (
            <button key={String(w)} type="button" aria-pressed={byWing === w} onClick={() => setByWing(w)} className={cn('rounded-md border px-2 py-0.5 text-[0.6875rem] font-semibold', byWing === w ? 'border-navy-700 bg-navy-700 text-white' : 'border-ink-200 bg-surface text-ink-700 hover:bg-govt-50')}>
              {w ? t('By department wing') : t('In area order')}
            </button>
          ))}
        </div>

        {shown.length === 0 ? <p className="mt-3 text-[0.75rem] text-ink-500">{t('No area matches the filter.')}</p> : null}
        {byWing ? (
          <div className="mt-3 space-y-4">
            {wings.map((w) => (
              <section key={w.id} aria-label={w.label}>
                <h3 className="mb-1.5 flex items-center gap-2 text-[0.75rem] font-bold tracking-wide text-navy-800 uppercase">
                  {w.label}
                  <span className="numeric rounded-full bg-ink-100 px-1.5 text-[0.625rem] text-ink-600">{w.areas.length}</span>
                </h3>
                <ol className="grid grid-cols-1 gap-2 lg:grid-cols-2">{w.areas.map(card)}</ol>
              </section>
            ))}
          </div>
        ) : (
          <ol className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-2">{shown.map(card)}</ol>
        )}
      </GovPanel>

      <GovPanel title={t('Existing systems and sources')} subtitle={t('What the corporation and the state already run, who owns each, and what it makes available. Every entry was found on a public page.')}>
        <ul className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
          {systems.map((s) => (
            <li key={s.name} className="flex flex-col gap-1 rounded-lg border border-ink-200 bg-surface p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="text-[0.8125rem] font-bold text-ink-900">{s.name}</p>
                <Badge tone={ACCESS_TONE[s.access]} size="sm">{accessLabel(s.access)}</Badge>
              </div>
              <p className="text-[0.625rem] text-ink-500">{s.owner}</p>
              <p className="text-[0.75rem] leading-snug text-ink-700">{s.purpose}</p>
              {s.url ? (
                <a href={s.url} target="_blank" rel="noreferrer noopener" className="mt-auto inline-flex items-center gap-1 pt-1 text-[0.6875rem] font-semibold text-govt-700 hover:underline">
                  {t('Public page')} <ExternalLink className="h-3 w-3" aria-hidden />
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      </GovPanel>

      {demos.length > 0 ? (
        <GovPanel title={t('Lead with these demonstrations')} subtitle={t('The proof is a better decision and a measured result.')}>
          <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {demos.map((d) => (
              <li key={d.title}>
                <Link to={d.to} className="block h-full rounded-lg border border-ink-200 bg-surface p-3 hover:border-govt-300 hover:bg-govt-50">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="flex items-center gap-1.5 text-[0.8125rem] font-bold text-ink-900">
                      <Presentation className="h-4 w-4 text-govt-600" aria-hidden />
                      {d.title}
                    </p>
                    <Badge tone={d.readiness === 'ready' ? 'positive' : 'warn'} size="sm">{d.readiness === 'ready' ? t('Can be shown today') : t('Needs corporation data')}</Badge>
                  </div>
                  <p className="mt-0.5 text-[0.625rem] text-ink-500">{t('For the {0}', d.audience)}</p>
                  <p className="mt-1.5 text-[0.75rem] text-ink-800">{d.shows}</p>
                  <p className="mt-1 text-[0.6875rem] leading-snug text-ink-600">{d.readinessNote}</p>
                </Link>
              </li>
            ))}
          </ul>
        </GovPanel>
      ) : null}
    </>
  )
}
