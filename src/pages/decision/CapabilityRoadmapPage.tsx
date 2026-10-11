import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, BadgeCheck, CheckCircle2, Compass, Database, ExternalLink, Globe, History, Layers, Lock, Server, Target } from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import { GovPanel } from '@/components/gov/GovPanel'
import { Badge } from '@/components/ui/badges'
import { SystemsCapabilityMap } from '@/components/decision/SystemsCapabilityMap'
import { useDecisionLayer } from '@/components/decision'
import { capabilityAreaHref, capabilityAreas, existingSystems, type MapStatus } from '@/config/bmc/capability-map'
import { bmcDataLevels, bmcProvesNow, bmcPublicFeeds, bmcRoadmapUpdates, bmcWebsiteMap, websiteCheckedOn, type SiteFeed } from '@/config/bmc/roadmap'
import { activeCorporation } from '@/config/municipality.config'
import type { BadgeTone } from '@/components/ui/badges'
import { formatDate, formatNumber } from '@/utils/format'
import { usePageMasthead } from '@/stores/masthead.store'
import { cn } from '@/utils/cn'
import { t } from '@/i18n'

/**
 * src/pages/decision/CapabilityRoadmapPage.tsx
 *
 * CAPABILITY ROADMAP (spec §57-59, §97-99): what public evidence lets the
 * platform prove for the corporation today, what authorised corporation data
 * unlocks later, the data levels between them, and the existing systems the
 * layer sits above rather than replacing. Every list is read from
 * `config/bmc/roadmap.ts` and `config/bmc/capability-map.ts`.
 */

const SITE_FEED_TONE: Record<SiteFeed, BadgeTone> = { open: 'positive', links: 'neutral', empty: 'warn', gated: 'warn', encrypted: 'critical', personal: 'muted' }

function siteFeedLabel(f: SiteFeed): string {
  return { open: t('Readable'), links: t('Links only'), empty: t('No documents'), gated: t('Needs login'), encrypted: t('Encrypted'), personal: t('Personal data') }[f]
}

const STATUS_CELL: Record<MapStatus, string> = {
  live: 'border-ok-300 bg-ok-100 text-ok-700 hover:bg-ok-200',
  partial: 'border-govt-200 bg-govt-50 text-govt-800 hover:bg-govt-100',
  modelled: 'border-warn-300 bg-warn-50 text-warn-700 hover:bg-warn-100',
  'not-built': 'border-ink-200 bg-surface text-ink-500 hover:bg-ink-50',
}

function statusLabel(st: MapStatus): string {
  return { live: t('Live'), partial: t('Partly live'), modelled: t('Modelled'), 'not-built': t('Not built') }[st]
}

function Stat({ icon, value, label, note, tone }: { icon: React.ReactNode; value: string; label: string; note: string; tone: string }): React.JSX.Element {
  return (
    <div className={cn('rounded-xl border p-3', tone)}>
      <p className="flex items-center gap-1.5 text-[0.625rem] font-bold tracking-[0.08em] text-ink-600 uppercase">
        {icon}
        {label}
      </p>
      <p className="numeric mt-1 text-[1.75rem] leading-none font-extrabold text-ink-900">{value}</p>
      <p className="mt-1 text-[0.6875rem] leading-snug text-ink-600">{note}</p>
    </div>
  )
}

export function CapabilityRoadmapPage(): React.JSX.Element {
  const layer = useDecisionLayer()
  const rows = useMemo(() => capabilityAreas(), [])
  const count = (st: MapStatus): number => rows.filter((r) => r.status === st).length
  const verified = layer.evidence.filter((e) => e.state === 'OFFICIAL_DOCUMENT_VERIFIED').length
  const site = bmcWebsiteMap()
  const feeds = bmcPublicFeeds()
  const systems = existingSystems()
  const readable = site.filter((r) => r.feed === 'open').length
  const unlock = rows.filter((r) => r.status !== 'live')
  // The decisions the area briefs already draw from public evidence.
  const decisions = rows.flatMap((r) => (r.insights ?? []).filter((i) => i.kind === 'decision').map((i) => ({ ...i, area: r.n, areaName: r.area })))
  const name = activeCorporation.shortName
  usePageMasthead(t('Capability Roadmap'), t('What public evidence proves for {0} now, and what authorised corporation data unlocks next.', name))

  const LEVELS = bmcDataLevels()
  const NOW = bmcProvesNow()

  return (
    <PageBody width="full" className="space-y-3 p-3 sm:p-4">
      <PageHeader eyebrow={t('Platform')} breadcrumbs={[{ label: t('Platform') }, { label: t('Capability Roadmap') }]} hideProvenance />

      <GovPanel title={t('Where {0} stands today', name)} subtitle={t('Counted from the platform itself, not typed in: the capability map, the evidence registry and the area briefs.')} tone="primary">
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
          <Stat icon={<Target className="h-3.5 w-3.5" aria-hidden />} value={t('{0} of {1}', count('live'), rows.length)} label={t('Capability areas live')} note={t('{0} partly live, {1} modelled until corporation data', count('partial'), count('modelled'))} tone="border-ok-200 bg-ok-50" />
          <Stat icon={<Compass className="h-3.5 w-3.5" aria-hidden />} value={formatNumber(decisions.length)} label={t('Evidence-backed decisions')} note={t('Drawn from the area briefs, each citing its records')} tone="border-warn-200 bg-warn-50" />
          <Stat icon={<Server className="h-3.5 w-3.5" aria-hidden />} value={formatNumber(systems.length)} label={t('Existing systems mapped')} note={t('The platform reads them; it does not replace them')} tone="border-govt-200 bg-govt-50" />
          <Stat icon={<BadgeCheck className="h-3.5 w-3.5" aria-hidden />} value={formatNumber(verified)} label={t('Official figures verified')} note={t('Each with its source, quote and date read, from {0} public feeds', feeds.length)} tone="border-ink-200 bg-surface" />
          <Stat icon={<Globe className="h-3.5 w-3.5" aria-hidden />} value={t('{0} of {1}', readable, site.length)} label={t('Website sections readable')} note={t('{0}; the rest need login, are empty or link elsewhere', activeCorporation.website ?? '')} tone="border-ink-200 bg-surface" />
        </div>
        <div className="mt-3">
          <p className="mb-1.5 text-[0.6875rem] font-semibold text-ink-600">{t('The {0} capability areas. Open any one for its brief.', rows.length)}</p>
          <ol className="grid grid-cols-5 gap-1.5 sm:grid-cols-10">
            {rows.map((r) => (
              <li key={r.n}>
                <Link to={capabilityAreaHref(r.n)} title={`${r.n}. ${r.area} - ${statusLabel(r.status)}`} aria-label={`${r.n}. ${r.area} - ${statusLabel(r.status)}`} className={cn('flex h-10 flex-col items-center justify-center rounded-md border text-center', STATUS_CELL[r.status])}>
                  <span className="numeric text-[0.875rem] leading-none font-extrabold">{r.n}</span>
                  <span className="mt-0.5 text-[0.5625rem] leading-none font-semibold">{statusLabel(r.status)}</span>
                </Link>
              </li>
            ))}
          </ol>
        </div>
      </GovPanel>

      {decisions.length > 0 ? (
        <GovPanel
          title={t('Decisions the evidence already supports')}
          subtitle={t('Read from the area briefs. Each cites the public records it rests on; none is a finding against anyone.')}
          tone="amber"
        >
          <ol className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
            {decisions.slice(0, 6).map((d, i) => (
              <li key={`${d.area}-${i}`}>
                <Link to={capabilityAreaHref(d.area)} className="flex h-full flex-col rounded-xl border border-ink-200 bg-surface p-3 hover:border-warn-300 hover:bg-warn-50">
                  <span className="flex items-center justify-between gap-2">
                    <span className="numeric text-[0.6875rem] font-bold text-ink-500">{t('No. {0}', i + 1)}</span>
                    <Badge tone="warn" size="sm">
                      {t('Area {0}', d.area)}
                    </Badge>
                  </span>
                  <span className="mt-1 text-[0.75rem] font-semibold text-ink-500">{d.areaName}</span>
                  <span className="mt-1 line-clamp-5 text-[0.8125rem] leading-snug text-ink-800">{d.text}</span>
                </Link>
              </li>
            ))}
          </ol>
        </GovPanel>
      ) : null}

      <GovPanel title={t('From public evidence to institutional intelligence')} subtitle={t('The deployment path. Each level adds data without rebuilding the platform.')} tone="primary">
        <ol className="grid grid-cols-1 gap-2 md:grid-cols-3 xl:grid-cols-6">
          {LEVELS.map((l) => (
            <li key={l.n} className={cn('rounded-xl border p-3', l.state === 'live' ? 'border-ok-300 bg-ok-50' : l.state === 'pilot' ? 'border-govt-200 bg-govt-50' : 'border-ink-200 bg-surface')}>
              <p className="numeric text-[1.5rem] leading-none font-extrabold text-ink-900">{t('L{0}', String(l.n))}</p>
              <p className="mt-1 text-[0.8125rem] font-bold text-ink-900">{l.name}</p>
              <p className="mt-1 text-[0.6875rem] leading-snug text-ink-600">{l.runsOn}</p>
              <Badge tone={l.state === 'live' ? 'positive' : l.state === 'pilot' ? 'info' : 'muted'} size="sm" className="mt-2">
                {l.state === 'live' ? t('Live for {0}', name) : l.state === 'pilot' ? t('Pilot ingestion') : t('Designed')}
              </Badge>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-[0.75rem] font-semibold text-ink-700">
          {t('Public evidence → open intelligence → {0} validation → controlled data → deeper intelligence → decision → action → measurable outcome', name)}
        </p>
      </GovPanel>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <GovPanel title={t('What open data proves now')} subtitle={t('Operational today on public evidence, before any {0} data is shared.', name)} tone="green">
          <ul className="space-y-1.5">
            {NOW.map((x) => (
              <li key={x.label}>
                <Link to={x.to} className="flex items-center justify-between gap-2 rounded-lg border border-ink-200 bg-surface px-3 py-2 text-[0.8125rem] text-ink-800 hover:border-ok-300 hover:bg-ok-50">
                  <span className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-ok-600" aria-hidden />
                    {x.label}
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 text-ink-400" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </GovPanel>

        <GovPanel title={t('What {0} data unlocks, area by area', name)} subtitle={t('The {0} areas not yet fully live, and the data that would take each one further. Screens show a labelled scenario until it arrives.', unlock.length)} tone="amber">
          <ul className="space-y-1.5">
            {unlock.map((r) => (
              <li key={r.n}>
                <Link to={capabilityAreaHref(r.n)} className="block rounded-lg border border-ink-200 bg-surface px-3 py-2 hover:border-warn-300 hover:bg-warn-50">
                  <span className="flex flex-wrap items-center gap-2">
                    <Lock className="h-3.5 w-3.5 shrink-0 text-warn-600" aria-hidden />
                    <span className="text-[0.8125rem] font-bold text-ink-900">
                      {r.n}. {r.area}
                    </span>
                    <Badge tone={r.status === 'partial' ? 'info' : 'warn'} size="sm">
                      {statusLabel(r.status)}
                    </Badge>
                  </span>
                  <span className="mt-0.5 block pl-5 text-[0.6875rem] leading-snug text-ink-600">{r.next}</span>
                </Link>
              </li>
            ))}
          </ul>
        </GovPanel>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <GovPanel title={t('The public feeds behind the live areas')} subtitle={t('Read by hand on the dates shown in the evidence registry. Automated pulling waits for the owning department\'s permission.')} dense>
          <div className="overflow-x-auto px-3 pb-3">
            <table className="w-full text-[0.75rem]">
              <thead>
                <tr className="border-b border-ink-200 text-left text-ink-500">
                  <th className="py-1.5 pr-3 font-semibold">{t('Feed')}</th>
                  <th className="py-1.5 pr-3 font-semibold">{t('What it gives')}</th>
                  <th className="py-1.5 pr-3 font-semibold">{t('Form')}</th>
                  <th className="py-1.5 font-semibold">{t('Source')}</th>
                </tr>
              </thead>
              <tbody>
                {feeds.map((f) => (
                  <tr key={f.name} className="border-b border-ink-50 align-top">
                    <td className="py-1.5 pr-3">
                      <p className="flex items-center gap-1.5 font-semibold text-ink-900">
                        <Database className="h-3.5 w-3.5 shrink-0 text-govt-600" aria-hidden />
                        {f.name}
                      </p>
                      <p className="pl-5 text-[0.6875rem] text-ink-500">
                        {f.owner} · {f.refresh}
                      </p>
                    </td>
                    <td className="py-1.5 pr-3 text-ink-700">{f.gives}</td>
                    <td className="py-1.5 pr-3">
                      <Badge tone={f.form === 'json' || f.form === 'csv' ? 'positive' : 'neutral'} size="sm">
                        {f.form.toUpperCase()}
                      </Badge>
                    </td>
                    <td className="py-1.5">
                      {f.url ? (
                        <a href={f.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-[0.6875rem] font-semibold text-govt-700 hover:underline">
                          {t('Open')} <ExternalLink className="h-3 w-3" aria-hidden />
                        </a>
                      ) : (
                        <span className="text-ink-400">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GovPanel>

        <GovPanel title={t('What is new')} subtitle={t('Added to the platform, newest first.')}>
          <ol className="space-y-2">
            {bmcRoadmapUpdates().map((u) => (
              <li key={u.title}>
                <Link to={u.to} className="block rounded-lg border border-ink-200 bg-surface px-3 py-2 hover:border-govt-300 hover:bg-govt-50">
                  <p className="flex items-center gap-1.5 text-[0.625rem] font-semibold tracking-wide text-ink-500 uppercase">
                    <History className="h-3 w-3" aria-hidden />
                    {formatDate(u.date)}
                  </p>
                  <p className="text-[0.8125rem] font-bold text-ink-900">{u.title}</p>
                  <p className="text-[0.6875rem] leading-snug text-ink-600">{u.detail}</p>
                </Link>
              </li>
            ))}
          </ol>
        </GovPanel>
      </div>

      <GovPanel
        title={t('The corporation\'s website, mapped')}
        subtitle={t('{0} section by section: what it publishes, whether its data can be read, where the platform covers it, and the intelligence it adds or still needs.', activeCorporation.website ?? '')}
        dense
      >
        <div className="overflow-x-auto px-3 pb-3">
          <table className="w-full text-[0.75rem]">
            <thead>
              <tr className="border-b border-ink-200 text-left text-ink-500">
                <th className="py-1.5 pr-3 font-semibold">{t('Website section')}</th>
                <th className="py-1.5 pr-3 font-semibold">{t('What it publishes')}</th>
                <th className="py-1.5 pr-3 font-semibold">{t('Data')}</th>
                <th className="py-1.5 pr-3 font-semibold">{t('In the platform')}</th>
                <th className="py-1.5 font-semibold">{t('Intelligence')}</th>
              </tr>
            </thead>
            <tbody>
              {site.map((r) => (
                <tr key={r.section} className="border-b border-ink-50 align-top">
                  <td className="py-1.5 pr-3 font-semibold text-ink-900">{r.section}</td>
                  <td className="py-1.5 pr-3 text-ink-700">{r.publishes}</td>
                  <td className="py-1.5 pr-3">
                    <Badge tone={SITE_FEED_TONE[r.feed]} size="sm">
                      {siteFeedLabel(r.feed)}
                    </Badge>
                  </td>
                  <td className="py-1.5 pr-3">
                    {r.covered.length === 0 ? (
                      <span className="text-ink-400">-</span>
                    ) : (
                      <span className="flex flex-wrap gap-1">
                        {r.covered.map((c) => (
                          <Link key={c.label} to={c.to} className="rounded border border-ink-200 px-1.5 text-[0.6875rem] font-semibold whitespace-nowrap text-govt-700 hover:bg-govt-50">
                            {c.label}
                          </Link>
                        ))}
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 text-ink-700">{r.intelligence}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[0.6875rem] text-ink-500">
            {t('Sections checked on {0} with a few requests each. Automated reading waits for the corporation\'s permission.', formatDate(websiteCheckedOn()))}
          </p>
        </div>
      </GovPanel>

      <GovPanel title={t('Above and across, not instead of')} subtitle={t('The systems {0} already runs. The platform reads them; it does not rebuild them or compete with them.', name)}>
        <ul className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
          {systems.map((x) => (
            <li key={x.name} className="flex items-start gap-2 rounded-lg border border-ink-200 bg-surface-sunken p-2.5 text-[0.75rem] text-ink-700">
              <Server className="mt-0.5 h-4 w-4 shrink-0 text-navy-700" aria-hidden />
              <span>
                <span className="font-semibold text-ink-900">{x.name}</span> - {x.purpose}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 flex items-center gap-1.5 text-[0.75rem] text-ink-600">
          <Layers className="h-4 w-4 text-govt-600" aria-hidden />
          {t('Its own value is what no single system gives: cross-system, cross-department, spatial, financial, evidence-backed decisions with measured outcomes.')}
        </p>
      </GovPanel>

      <SystemsCapabilityMap />
    </PageBody>
  )
}

export default CapabilityRoadmapPage
