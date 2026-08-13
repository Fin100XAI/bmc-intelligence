import { useMemo } from 'react'
import { ClipboardList, Gavel, ScrollText, TrendingUp } from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import {
  Badge,
  Card,
  CardHeader,
  DataTable,
  DemonstrationNotice,
  EmptyState,
  ErrorState,
  LoadingState,
  MetricGrid,
  StateBadge,
  type Column,
} from '@/components/ui'
import { MetricCard } from '@/components/cards'
import { CategoryBarChart, CHART_COLOURS, DonutChart, RankedBarChart } from '@/components/charts'
import { FilterBar } from '@/components/filters/FilterBar'
import { useServiceQuery } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { licenceService } from '@/services'
import { useFilterStore } from '@/stores/ui.store'
import { usePageMasthead } from '@/stores/masthead.store'
import { wardName, wardShortName } from '@/data/reference'
import { LICENCE_CATEGORY_LABEL, type LicenceCategory, type LicenceRegister } from '@/types/civic-services'
import type { DataFreshness } from '@/types/common'
import { DEMO_NOW } from '@/utils/deterministic'
import { formatNumber } from '@/utils/format'
import { t } from '@/i18n'

/**
 * src/pages/governance/LicensingIntelligencePage.tsx
 *
 * Licences and trade.
 *
 * The licensing regime is where a corporation's regulatory duty and its own
 * revenue meet, and the platform already carried the money side of it: licence
 * fees have always been a revenue head on the Revenue Intelligence page. What
 * was missing was the regime that produces them - how many licences are
 * current, how long a decision takes, and what happens to premises trading
 * without one. A fee line with no administration behind it describes income
 * without describing the duty that earns it.
 *
 * NO LICENSEE APPEARS HERE. The unit of record is the ward and the category:
 * counts, decision times, demand and collection. Naming a trader would make
 * this an enforcement register, which is a different instrument answering to a
 * different legal basis, and is not what a management platform should hold.
 */

const CATEGORY_COLOUR: Record<LicenceCategory, string> = {
  'shop-establishment': CHART_COLOURS.primary,
  'eating-house': CHART_COLOURS.intel,
  lodging: CHART_COLOURS.positive,
  'trade-storage': CHART_COLOURS.warn,
  factory: CHART_COLOURS.risk,
  'advertisement-hoarding': CHART_COLOURS.critical,
  hawker: CHART_COLOURS.neutral,
}

const CHARTER_THRESHOLD = 80

export function LicensingIntelligencePage(): React.JSX.Element {
  // The shell's masthead carries the screen's name; the page states the wording.
  usePageMasthead(
    t('Licences & Trade'),
    t('The licensing regime behind the licence-fee revenue head - what is current, what has lapsed, how long a decision takes against the citizens\' charter, and what enforcement follows.'),
  )

  const filters = useFilterStore((s) => s.filters)

  const registersQuery = useServiceQuery(queryKeys.licensing('registers'), (u) => licenceService.registers(u))
  const registers = useMemo(() => registersQuery.data ?? [], [registersQuery.data])

  const filtered = useMemo(
    () =>
      registers.filter((l) => {
        if (filters.wardIds.length > 0 && !filters.wardIds.includes(l.wardId)) return false
        if (filters.search.trim()) {
          const q = filters.search.trim().toLowerCase()
          const label = LICENCE_CATEGORY_LABEL[l.category].toLowerCase()
          if (!label.includes(q) && !wardName(l.wardId).toLowerCase().includes(q)) return false
        }
        return true
      }),
    [registers, filters],
  )

  if (registersQuery.isLoading) {
    return (
      <PageBody>
        <PageHeader eyebrow={t('Governance & Finance')} breadcrumbs={[{ label: t('Governance & Finance') }, { label: t('Licences & Trade') }]} />
        <LoadingState variant="metrics" />
        <LoadingState variant="table" rows={8} />
      </PageBody>
    )
  }
  if (registersQuery.error) {
    return (
      <PageBody>
        <PageHeader eyebrow={t('Governance & Finance')} breadcrumbs={[{ label: t('Governance & Finance') }, { label: t('Licences & Trade') }]} />
        <ErrorState detail={registersQuery.error.message} onRetry={() => registersQuery.refetch()} />
      </PageBody>
    )
  }

  const active = filtered.reduce((s, l) => s + l.active, 0)
  const expired = filtered.reduce((s, l) => s + l.expired, 0)
  const pending = filtered.reduce((s, l) => s + l.pending, 0)
  const demanded = Math.round(filtered.reduce((s, l) => s + l.feeDemandedLakh, 0) * 10) / 10
  const collected = Math.round(filtered.reduce((s, l) => s + l.feeCollectedLakh, 0) * 10) / 10
  const collectionPct = demanded > 0 ? Math.round((collected / demanded) * 1000) / 10 : 0
  const unlicensed = filtered.reduce((s, l) => s + l.unlicensedDetected, 0)
  const notices = filtered.reduce((s, l) => s + l.noticesIssued, 0)
  const prosecutions = filtered.reduce((s, l) => s + l.prosecutionsFiled, 0)

  const charterCompliance = filtered.length
    ? Math.round((filtered.reduce((s, l) => s + l.charterCompliancePct, 0) / filtered.length) * 10) / 10
    : 0
  const meanDecision = filtered.length
    ? Math.round((filtered.reduce((s, l) => s + l.meanDecisionDays, 0) / filtered.length) * 10) / 10
    : 0

  const byCategory = (Object.keys(LICENCE_CATEGORY_LABEL) as LicenceCategory[])
    .map((c) => ({
      category: c,
      active: filtered.filter((l) => l.category === c).reduce((s, l) => s + l.active, 0),
      expired: filtered.filter((l) => l.category === c).reduce((s, l) => s + l.expired, 0),
    }))
    .filter((x) => x.active > 0)

  // Ward-level renewal lapse: expired as a share of the whole ward register.
  const wardIds = [...new Set(filtered.map((l) => l.wardId))]
  const lapseByWard = wardIds
    .map((wardId) => {
      const rows = filtered.filter((l) => l.wardId === wardId)
      const a = rows.reduce((s, l) => s + l.active, 0)
      const e = rows.reduce((s, l) => s + l.expired, 0)
      return { wardId, lapsePct: a + e > 0 ? Math.round((e / (a + e)) * 1000) / 10 : 0 }
    })
    .sort((a, b) => b.lapsePct - a.lapsePct)
    .slice(0, 10)

  const freshness: DataFreshness = {
    generatedAt: DEMO_NOW.toISOString(),
    sourceObservedAt: DEMO_NOW.toISOString(),
    refreshIntervalMinutes: 1440,
    origin: 'demonstration',
    sourceState: 'operational',
    stale: false,
  }

  const columns: Array<Column<LicenceRegister>> = [
    { id: 'ward', header: t('Ward'), cell: (r) => <span className="font-medium text-ink-900">{wardShortName(r.wardId)}</span>, sortValue: (r) => wardName(r.wardId), searchValue: (r) => wardName(r.wardId) },
    {
      id: 'category',
      header: t('Category'),
      cell: (r) => <Badge tone="neutral" size="sm">{LICENCE_CATEGORY_LABEL[r.category]}</Badge>,
      sortValue: (r) => r.category,
      searchValue: (r) => LICENCE_CATEGORY_LABEL[r.category],
      width: 'minmax(11rem,1.3fr)',
    },
    { id: 'active', header: t('Active'), cell: (r) => <span className="numeric">{formatNumber(r.active)}</span>, sortValue: (r) => r.active, align: 'right' },
    {
      id: 'expired',
      header: t('Lapsed'),
      cell: (r) => <span className={r.expired > r.active * 0.15 ? 'numeric font-semibold text-warn-700' : 'numeric text-ink-700'}>{formatNumber(r.expired)}</span>,
      sortValue: (r) => r.expired,
      align: 'right',
    },
    { id: 'pending', header: t('Pending decision'), cell: (r) => <span className="numeric">{formatNumber(r.pending)}</span>, sortValue: (r) => r.pending, align: 'right', hideBelow: 'md' },
    {
      id: 'decision',
      header: t('Mean decision'),
      cell: (r) => <span className={r.meanDecisionDays > 30 ? 'numeric font-semibold text-crit-600' : 'numeric text-ink-700'}>{r.meanDecisionDays} d</span>,
      sortValue: (r) => r.meanDecisionDays,
      align: 'right',
      hideBelow: 'lg',
    },
    {
      id: 'charter',
      header: t('Charter compliance'),
      cell: (r) => (
        <span className={r.charterCompliancePct < CHARTER_THRESHOLD ? 'numeric font-semibold text-warn-700' : 'numeric text-ink-700'}>
          {r.charterCompliancePct}%
        </span>
      ),
      sortValue: (r) => r.charterCompliancePct,
      align: 'right',
      hideBelow: 'md',
    },
    {
      id: 'fees',
      header: t('Fee (collected / demanded)'),
      cell: (r) => (
        <span className="numeric text-ink-700">
          ₹{r.feeCollectedLakh} L <span className="text-ink-400">/ ₹{r.feeDemandedLakh} L</span>
        </span>
      ),
      sortValue: (r) => r.feeCollectedLakh / Math.max(0.1, r.feeDemandedLakh),
      align: 'right',
      hideBelow: 'xl',
    },
    { id: 'unlicensed', header: t('Unlicensed found'), cell: (r) => <span className="numeric">{formatNumber(r.unlicensedDetected)}</span>, sortValue: (r) => r.unlicensedDetected, align: 'right', hideBelow: 'xl' },
    { id: 'state', header: t('State'), cell: (r) => <StateBadge state={r.state} />, sortValue: (r) => r.state },
  ]

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('Governance & Finance')}
        breadcrumbs={[{ label: t('Governance & Finance') }, { label: t('Licences & Trade') }]}
        freshness={freshness}
      />

      <DemonstrationNotice />

      <Card tone="info" className="flex items-start gap-3">
        <ScrollText className="mt-0.5 h-4 w-4 shrink-0 text-govt-600" aria-hidden />
        <div className="min-w-0">
          <p className="text-[0.8125rem] font-semibold text-govt-800">{t('This page holds the regime, not the licensees')}</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-600">
            {t('Every figure is a ward-and-category aggregate. No trader, premises or licence number appears anywhere behind this page. Naming a licensee would make this an enforcement register answering to a different legal basis; what a management platform should report is how well the regime is administered.')}
          </p>
        </div>
      </Card>

      <FilterBar show={['ward', 'search']} searchPlaceholder="Search by ward or licence category" />

      <MetricGrid columns={4}>
        <MetricCard
          label={t('Licences current')}
          value={formatNumber(active)}
          support={t('{0} lapsed · {1} pending decision', formatNumber(expired), formatNumber(pending))}
          icon={<ClipboardList className="h-4 w-4" />}
          origin="demonstration"
        />
        <MetricCard
          label={t('Fee collection')}
          value={collectionPct}
          unit="%"
          support={t('₹{0} L of ₹{1} L demanded', formatNumber(collected), formatNumber(demanded))}
          progress={{ value: collected, max: Math.max(0.1, demanded) }}
          tone={collectionPct < 75 ? 'warn' : 'positive'}
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <MetricCard
          label={t('Charter compliance')}
          value={charterCompliance}
          unit="%"
          support={t('Mean decision in {0} working days', meanDecision)}
          tone={charterCompliance < CHARTER_THRESHOLD ? 'warn' : 'positive'}
        />
        <MetricCard
          label={t('Unlicensed premises found')}
          value={formatNumber(unlicensed)}
          support={t('{0} notices · {1} prosecutions', formatNumber(notices), formatNumber(prosecutions))}
          tone={unlicensed > notices ? 'warn' : 'default'}
          icon={<Gavel className="h-4 w-4" />}
        />
      </MetricGrid>

      {/* Two columns. The register itself holds the wide column; the three
          distributions drawn from it — by category, current against lapsed,
          and by ward — read down beside it. */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="min-w-0 xl:col-span-8">
          <Card flush>
            <CardHeader
              bordered
              icon={<ScrollText className="h-4 w-4" />}
              title={t('Licence register by ward and category')}
              description={t('Within your authorised ward scope.')}
            />
            {filtered.length === 0 ? (
              <EmptyState title={t('No licence registers match the current filters')} detail="Clear a filter to widen the register." />
            ) : (
              <DataTable rows={filtered} columns={columns} rowKey={(r) => r.id} pageSize={15} />
            )}
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-4 xl:col-span-4">
        <Card className="flex flex-col">
          <p className="label-institutional mb-2">{t('Current licences by category')}</p>
          <div style={{ height: 210 }}>
            <DonutChart
              data={byCategory.map((c) => ({
                label: LICENCE_CATEGORY_LABEL[c.category],
                value: c.active,
                colour: CATEGORY_COLOUR[c.category],
              }))}
              centreValue={formatNumber(active)}
              centreLabel="current"
            />
          </div>
        </Card>

        <Card flush className="flex flex-col">
          <CardHeader
            bordered
            title={t('Current against lapsed, by category')}
            description={t('A large lapsed count is a renewal-administration problem before it is an enforcement one.')}
          />
          <div className="px-4 pb-4" style={{ height: 210 }}>
            <CategoryBarChart
              data={byCategory.map((c) => ({ label: LICENCE_CATEGORY_LABEL[c.category], active: c.active, expired: c.expired }))}
              showLegend
              series={[
                { key: 'active', label: t('Current'), colour: CHART_COLOURS.primary },
                { key: 'expired', label: t('Lapsed'), colour: CHART_COLOURS.warn },
              ]}
            />
          </div>
        </Card>

      <Card flush>
        <CardHeader
          bordered
          icon={<ClipboardList className="h-4 w-4" />}
          title={t('Wards by renewal lapse rate')}
          description={t('Lapsed licences as a share of the ward\'s whole register. The revenue this represents is already assessed - it is uncollected, not unassessed.')}
        />
        <div className="px-4 pb-4" style={{ height: Math.max(210, lapseByWard.length * 26) }}>
          <RankedBarChart data={lapseByWard.map((w) => ({ label: wardShortName(w.wardId), value: w.lapsePct }))} unit="%" />
        </div>
      </Card>
        </div>
      </div>
    </PageBody>
  )
}

export default LicensingIntelligencePage
