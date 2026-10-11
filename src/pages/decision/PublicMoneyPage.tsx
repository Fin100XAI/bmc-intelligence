import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarClock, Clock3, Landmark, MapPinned, Wallet } from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import { GovPanel } from '@/components/gov/GovPanel'
import { Badge } from '@/components/ui/badges'
import { Select } from '@/components/ui/primitives'
import { GeoMap, type GeoMapPoint } from '@/components/geo/GeoMap'
import { activeCorporation } from '@/config/municipality.config'
import { EvidenceValue, geoLevelLabel, useCases } from '@/components/decision'
import { isStatusStale, milestoneDate, milestoneWindow, statusAgeDays, type MilestoneWindow } from '@/domains/decision/engines'
import type { MoneyKind, PublicProject, Sector } from '@/domains/public-money/model'
import { ROUTES } from '@/config/navigation'
import { usePageMasthead } from '@/stores/masthead.store'
import { formatNumber } from '@/utils/format'
import { t } from '@/i18n'

/**
 * src/pages/decision/PublicMoneyPage.tsx
 *
 * PUBLIC MONEY & INFRASTRUCTURE INVESTMENT (spec §62-65, §80-81).
 *
 * Where public money is flowing in the city, by sector and scheme, where it is
 * on the ground, and which milestones are coming - all from published
 * evidence. Money kinds are never summed together: a project cost, a
 * sanction and a budget allocation each keep their own column, and a sector
 * total is given per kind.
 */

export function sectorLabel(s: Sector): string {
  return {
    water: t('Water supply'),
    sewerage: t('Sewerage'),
    drainage: t('Drainage'),
    flood: t('Flood protection'),
    roads: t('Roads'),
    transport: t('Transport'),
    waste: t('Solid waste'),
    housing: t('Housing'),
    'water-body': t('Water bodies'),
    other: t('Markets and other'),
  }[s]
}

export const SECTOR_HEX: Record<Sector, string> = {
  water: '#1a73e8',
  sewerage: '#8e24aa',
  drainage: '#00897b',
  flood: '#d93025',
  roads: '#f29900',
  transport: '#5f6368',
  waste: '#6d4c41',
  housing: '#188038',
  'water-body': '#039be5',
  other: '#455a64',
}

const MONEY_KINDS: MoneyKind[] = ['budgetAllocation', 'projectCost', 'sanctionedCost', 'tenderValue', 'contractValue', 'actualExpenditure']

function moneyLabel(k: MoneyKind): string {
  return {
    budgetAllocation: t('Allocation'),
    projectCost: t('Project cost'),
    sanctionedCost: t('Sanctioned'),
    tenderValue: t('Tender value'),
    contractValue: t('Contract value'),
    actualExpenditure: t('Expenditure'),
  }[k]
}

function windowLabel(w: MilestoneWindow): string {
  return {
    'next-30': t('Next 30 days'),
    'next-60': t('31-60 days'),
    'next-90': t('61-90 days'),
    later: t('Later'),
    'passed-unconfirmed': t('Date passed - unconfirmed'),
    'no-date': t('No published date'),
  }[w]
}

export function PublicMoneyPage(): React.JSX.Element {
  usePageMasthead(t('Public Money & Investment'), t('Where public money is flowing in {0} - by sector, scheme and place - on published evidence only.', activeCorporation.shortName))
  const { layer, cases } = useCases()
  const [sector, setSector] = useState<Sector | 'all'>('all')
  const [scheme, setScheme] = useState('all')
  const now = layer.now

  const schemes = useMemo(() => [...new Set(layer.projects.map((p) => p.scheme))].sort(), [layer])
  const rows = layer.projects.filter((p) => (sector === 'all' || p.sector === sector) && (scheme === 'all' || p.scheme === scheme))

  /** Totals per sector, kept per money kind - never added across kinds. */
  const bySector = useMemo(() => {
    const map = new Map<Sector, Partial<Record<MoneyKind, number>> & { count: number }>()
    for (const p of layer.projects) {
      const entry = map.get(p.sector) ?? { count: 0 }
      entry.count += 1
      for (const k of MONEY_KINDS) {
        const f = p.money[k]
        if (f) entry[k] = (entry[k] ?? 0) + f.crore
      }
      map.set(p.sector, entry)
    }
    return [...map.entries()].sort((a, b) => (b[1].projectCost ?? 0) + (b[1].sanctionedCost ?? 0) - ((a[1].projectCost ?? 0) + (a[1].sanctionedCost ?? 0)))
  }, [layer])

  const points: GeoMapPoint[] = rows
    .filter((p) => p.location.point)
    .map((p) => {
      const money = MONEY_KINDS.map((k) => p.money[k]).find(Boolean)
      return {
        id: p.id,
        lat: p.location.point!.lat,
        lon: p.location.point!.lon,
        color: SECTOR_HEX[p.sector],
        weight: money?.crore ?? 1,
        label: p.name,
        detail: t('{0} · {1} · located at {2} level', sectorLabel(p.sector), money ? `₹${formatNumber(money.crore, 2)} cr` : t('no published cost'), geoLevelLabel(p.location.level)),
        positionBasis: 'osm-place',
        anchorPlace: p.location.point!.geocodedName,
      }
    })

  const coordinationFor = (id: string): number => cases.filter((c) => c.origin === 'coordination' && c.projectIds.includes(id)).length

  const windows: MilestoneWindow[] = ['next-30', 'next-60', 'next-90', 'passed-unconfirmed']
  const milestoneRows = (w: MilestoneWindow): PublicProject[] => layer.projects.filter((p) => p.phase !== 'completed' && p.phase !== 'proposed' && milestoneWindow(p, now) === w)

  return (
    <PageBody width="full" className="space-y-3 p-3 sm:p-4">
      <PageHeader
        eyebrow={t('Revenue & Finance')}
        breadcrumbs={[{ label: t('Revenue & Finance') }, { label: t('Public Money & Investment') }]}
        controls={
          <>
            <Select
              aria-label={t('Sector')}
              value={sector}
              onChange={(e) => setSector(e.target.value as Sector | 'all')}
              options={[{ value: 'all', label: t('All sectors') }, ...bySector.map(([s]) => ({ value: s, label: sectorLabel(s) }))]}
            />
            <Select aria-label={t('Scheme')} value={scheme} onChange={(e) => setScheme(e.target.value)} options={[{ value: 'all', label: t('All schemes') }, ...schemes.map((s) => ({ value: s, label: s }))]} />
          </>
        }
        hideProvenance
      />


      <GovPanel title={t('FY 2026-27 municipal budget')} subtitle={t('Click any figure for its source. The budget is not added to project costs: they are different accounting facts.')} tone="primary">
        <dl className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {layer.budget.map((b) => (
            <div key={b.id} className="rounded-xl border border-ink-200 bg-surface p-3">
              <dt className="text-[0.6875rem] font-semibold text-ink-500">{b.label}</dt>
              <dd className="mt-1 text-[1.5rem] leading-none font-extrabold text-ink-900">
                <EvidenceValue evidenceId={b.evidenceId} />
              </dd>
              <p className="mt-1 text-[0.625rem] text-ink-400">{b.period}</p>
            </div>
          ))}
        </dl>
      </GovPanel>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <GovPanel
          title={t('Investment map')}
          subtitle={t('Works placed only as precisely as their evidence allows. City-wide works are not drawn as points.')}
          dense
          actions={
            <Badge tone="muted" size="sm" icon={<MapPinned className="h-3 w-3" />}>
              {t('{0} of {1} works located', formatNumber(points.length), formatNumber(rows.length))}
            </Badge>
          }
        >
          <GeoMap
            points={points}
            height={420}
            sizeByWeight
            showBadge={false}
            fitKey={`${sector}:${scheme}`}
            legendTitle={t('Sector')}
            legend={bySector.map(([s, e]) => ({ label: sectorLabel(s), color: SECTOR_HEX[s], count: e.count }))}
            ariaLabel={t('Map of publicly identified works in {0}', activeCorporation.shortName)}
          />
        </GovPanel>

        <GovPanel title={t('Investment by sector')} subtitle={t('Totals are per money kind and are not added across kinds.')}>
          <ul className="space-y-2">
            {bySector.map(([s, e]) => (
              <li key={s} className="rounded-lg border border-ink-200 p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-[0.8125rem] font-bold text-ink-900">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: SECTOR_HEX[s] }} aria-hidden />
                    {sectorLabel(s)}
                  </span>
                  <span className="text-[0.6875rem] text-ink-500">{t('{0} works', formatNumber(e.count))}</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {MONEY_KINDS.filter((k) => e[k]).map((k) => (
                    <Badge key={k} tone="neutral" size="sm">
                      {moneyLabel(k)} ₹{formatNumber(e[k] ?? 0, 2)} cr
                    </Badge>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </GovPanel>
      </div>

      <GovPanel title={t('Milestones and public-evidence freshness')} subtitle={t('A passed date is "unconfirmed", never "overdue": public status reporting lags. Stale means old evidence, not delay.')}>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
          {windows.map((w) => {
            const list = milestoneRows(w)
            return (
              <div key={w} className="rounded-lg border border-ink-200 bg-surface-sunken p-2.5">
                <p className="flex items-center gap-1.5 text-[0.75rem] font-bold text-ink-900">
                  <CalendarClock className="h-4 w-4 text-govt-600" aria-hidden />
                  {windowLabel(w)} <span className="numeric text-ink-500">({formatNumber(list.length)})</span>
                </p>
                <ul className="mt-1.5 space-y-1">
                  {list.length === 0 ? <li className="text-[0.6875rem] text-ink-400">{t('None')}</li> : null}
                  {list.map((p) => (
                    <li key={p.id} className="text-[0.6875rem] leading-snug text-ink-700">
                      <span className="font-semibold">{p.name}</span> · {milestoneDate(p)}
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      </GovPanel>

      <GovPanel
        title={t('Portfolio')}
        subtitle={t('Every publicly identified work, with each money kind in its own column. Click a figure for its source.')}
        dense
        actions={
          <Badge tone="neutral" size="sm" icon={<Landmark className="h-3 w-3" />}>
            {t('{0} works', formatNumber(rows.length))}
          </Badge>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[64rem] text-left text-[0.75rem]">
            <thead className="bg-surface-sunken text-[0.625rem] tracking-wide text-ink-500 uppercase">
              <tr>
                <th className="px-3 py-2">{t('Work')}</th>
                <th className="px-2 py-2">{t('Scheme')}</th>
                {MONEY_KINDS.map((k) => (
                  <th key={k} className="px-2 py-2 text-right">
                    {moneyLabel(k)}
                  </th>
                ))}
                <th className="px-2 py-2">{t('Status (as of)')}</th>
                <th className="px-2 py-2">{t('Location')}</th>
                <th className="px-2 py-2">{t('Signals')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {rows.map((p) => {
                const age = statusAgeDays(p, now)
                const stale = p.phase !== 'completed' && isStatusStale(p, now)
                const coord = coordinationFor(p.id)
                return (
                  <tr key={p.id} className="align-top hover:bg-govt-50/40">
                    <td className="px-3 py-2">
                      <p className="font-semibold text-ink-900">{p.name}</p>
                      <p className="text-[0.625rem] text-ink-500">
                        <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: SECTOR_HEX[p.sector] }} aria-hidden />
                        {sectorLabel(p.sector)} · {p.agency}
                      </p>
                    </td>
                    <td className="px-2 py-2 text-ink-700">{p.scheme}</td>
                    {MONEY_KINDS.map((k) => {
                      const f = p.money[k]
                      return (
                        <td key={k} className="px-2 py-2 text-right">
                          {f ? <EvidenceValue evidenceId={f.evidenceId}>₹{formatNumber(f.crore, 2)}</EvidenceValue> : <span className="text-ink-300">—</span>}
                        </td>
                      )
                    })}
                    <td className="px-2 py-2">
                      {p.status ? (
                        <>
                          <p className="text-ink-800">{p.status.text}</p>
                          <p className="text-[0.625rem] text-ink-500">
                            <Clock3 className="mr-0.5 inline h-3 w-3" aria-hidden />
                            {p.status.asOf} {age !== null ? t('({0} days old)', formatNumber(age)) : ''}
                          </p>
                        </>
                      ) : (
                        <span className="text-ink-400">{t('No dated status')}</span>
                      )}
                      {stale ? (
                        <Badge tone="warn" size="sm" className="mt-1">
                          {t('Stale public status')}
                        </Badge>
                      ) : null}
                    </td>
                    <td className="px-2 py-2">
                      <Badge tone={p.location.level === 'CITY' || p.location.level === 'UNKNOWN' ? 'muted' : 'info'} size="sm">
                        {geoLevelLabel(p.location.level)}
                      </Badge>
                      <p className="mt-0.5 text-[0.625rem] text-ink-500">{p.location.description}</p>
                    </td>
                    <td className="px-2 py-2">
                      {coord > 0 ? (
                        <Link to={ROUTES.infraCoordination} title={cases.find((c) => c.origin === 'coordination' && c.projectIds.includes(p.id))?.title} className="text-[0.6875rem] font-semibold text-govt-700 hover:underline">
                          {t('{0} coordination', formatNumber(coord))}
                        </Link>
                      ) : (
                        <span className="text-ink-300">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </GovPanel>

      <p className="flex items-center gap-1.5 text-[0.6875rem] text-ink-500">
        <Wallet className="h-3.5 w-3.5" aria-hidden />
        {t('Tender, contract and expenditure values are not published for most works; they arrive with authorised {0} data.', activeCorporation.shortName)}{' '}
        <Link to={ROUTES.capabilityRoadmap} className="font-semibold text-govt-700 hover:underline">
          {t('See what {0} data unlocks', activeCorporation.shortName)}
        </Link>
      </p>
    </PageBody>
  )
}

export default PublicMoneyPage
