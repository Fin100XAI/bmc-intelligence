import { useMemo } from 'react'
import { BadgeCheck, GraduationCap, HandCoins, Scale, Store, Users } from 'lucide-react'
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
import { CategoryBarChart, CHART_COLOURS, RankedBarChart } from '@/components/charts'
import { FilterBar } from '@/components/filters/FilterBar'
import { useServiceQuery } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { livelihoodsService } from '@/services'
import { useFilterStore } from '@/stores/ui.store'
import { wardName, wardShortName } from '@/data/reference'
import { LIVELIHOOD_CENTRE_KIND_LABEL, type LivelihoodCentre, type VendorZone } from '@/types/livelihoods'
import type { DataFreshness } from '@/types/common'
import { DEMO_NOW } from '@/utils/deterministic'
import { formatNumber, formatRelative } from '@/utils/format'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/**
 * src/pages/city/LivelihoodsPage.tsx
 *
 * Urban livelihoods and poverty alleviation - function 11 of the Twelfth
 * Schedule.
 *
 * Two statutory frames govern what this page reports. DAY-NULM (the Deendayal
 * Antyodaya Yojana - National Urban Livelihoods Mission) funds skill training
 * and placement, self-help group formation and bank linkage, and shelters for
 * the urban homeless. The Street Vendors (Protection of Livelihood and
 * Regulation of Street Vending) Act, 2014 governs the vending register and the
 * certificate of vending.
 *
 * THE CERTIFICATE GAP IS THE CORPORATION'S FAILING, NOT THE VENDOR'S. Under
 * the 2014 Act a certificate of vending is a legal ENTITLEMENT once the
 * statutory survey has been done - issuing it is a duty the corporation owes,
 * not a favour it grants. So the distance between vendors on the register and
 * certificates in their hands measures statutory non-compliance by this
 * corporation. It measures nothing at all about the people who vend.
 *
 * THE PLACEMENT RATE MATTERS MORE THAN THE TRAINED COUNT. A large batch figure
 * with weak placement is expenditure without outcome, and reporting the batch
 * without the outcome would be flattery. The chart therefore carries both
 * lines together and never the trained count alone.
 *
 * NO PERSON IS HELD BEHIND THIS PAGE. The unit of record is the premises, the
 * federation and the vending zone. There is no beneficiary register, no income
 * assessment, no eligibility determination and no name anywhere behind it.
 */

const TITLE = 'Urban Livelihoods & Poverty Alleviation'
function build$BREADCRUMBS() {
  return [{ label: t('City Intelligence') }, { label: t('Urban Livelihoods') }]
}
let BREADCRUMBS: ReturnType<typeof build$BREADCRUMBS> = build$BREADCRUMBS()
registerLayer(() => {
  BREADCRUMBS = build$BREADCRUMBS()
})

const KIND_TONE: Record<LivelihoodCentre['kind'], 'neutral' | 'info' | 'intel' | 'positive'> = {
  'skill-training-centre': 'info',
  'shelter-for-urban-homeless': 'intel',
  'vendor-zone': 'neutral',
  'sh-group-federation': 'positive',
  'livelihood-centre': 'neutral',
}

export function LivelihoodsPage(): React.JSX.Element {
  const filters = useFilterStore((s) => s.filters)

  const centresQuery = useServiceQuery(queryKeys.livelihoods('centres'), (u) => livelihoodsService.centres(u))
  const zonesQuery = useServiceQuery(queryKeys.livelihoods('vendor-zones'), (u) => livelihoodsService.vendorZones(u))
  const trendQuery = useServiceQuery(queryKeys.livelihoods('trend'), (u) => livelihoodsService.trend(u))

  const centres = useMemo(() => centresQuery.data ?? [], [centresQuery.data])
  const zones = useMemo(() => zonesQuery.data ?? [], [zonesQuery.data])
  const trend = useMemo(() => trendQuery.data ?? [], [trendQuery.data])

  const filteredCentres = useMemo(
    () =>
      centres.filter((c) => {
        if (filters.wardIds.length > 0 && !filters.wardIds.includes(c.wardId)) return false
        if (filters.search.trim()) {
          const q = filters.search.trim().toLowerCase()
          if (!c.name.toLowerCase().includes(q) && !wardName(c.wardId).toLowerCase().includes(q)) return false
        }
        return true
      }),
    [centres, filters],
  )

  const filteredZones = useMemo(
    () =>
      zones.filter((z) => {
        if (filters.wardIds.length > 0 && !filters.wardIds.includes(z.wardId)) return false
        if (filters.search.trim()) {
          const q = filters.search.trim().toLowerCase()
          if (!z.name.toLowerCase().includes(q) && !wardName(z.wardId).toLowerCase().includes(q)) return false
        }
        return true
      }),
    [zones, filters],
  )

  const isLoading = centresQuery.isLoading || zonesQuery.isLoading || trendQuery.isLoading
  const error = centresQuery.error ?? zonesQuery.error ?? trendQuery.error

  if (isLoading) {
    return (
      <PageBody>
        <PageHeader eyebrow={t('City Intelligence')} title={TITLE} breadcrumbs={BREADCRUMBS} />
        <LoadingState variant="metrics" />
        <LoadingState variant="table" rows={8} />
      </PageBody>
    )
  }
  if (error) {
    return (
      <PageBody>
        <PageHeader eyebrow={t('City Intelligence')} title={TITLE} breadcrumbs={BREADCRUMBS} />
        <ErrorState
          detail={error.message}
          onRetry={() => {
            void centresQuery.refetch()
            void zonesQuery.refetch()
            void trendQuery.refetch()
          }}
        />
      </PageBody>
    )
  }

  /* ------------------------------------------------------------- Position */

  const beneficiaries = filteredCentres.reduce((s, c) => s + c.currentBeneficiaries, 0)
  const capacity = filteredCentres.reduce((s, c) => s + c.capacity, 0)

  const groups = filteredCentres.reduce((s, c) => s + c.selfHelpGroups, 0)
  const groupsBankLinked = filteredCentres.reduce((s, c) => s + Math.round((c.selfHelpGroups * c.shgBankLinkedPct) / 100), 0)
  const bankLinkage = groups > 0 ? Math.round((groupsBankLinked / groups) * 1000) / 10 : 0

  const trained = filteredCentres.reduce((s, c) => s + c.trainedLast12m, 0)
  const placed = filteredCentres.reduce((s, c) => s + Math.round((c.trainedLast12m * c.placedInWorkPct) / 100), 0)
  const placementRate = trained > 0 ? Math.round((placed / trained) * 1000) / 10 : 0

  const sanctionedVendingPlaces = filteredZones.reduce((s, z) => s + z.sanctionedVendingCapacity, 0)
  const registeredVendors = filteredZones.reduce((s, z) => s + z.registeredVendors, 0)
  const certificatesIssued = filteredZones.reduce((s, z) => s + z.certificatesOfVendingIssued, 0)
  const withoutCertificate = Math.max(0, registeredVendors - certificatesIssued)
  const certificateCoverage = registeredVendors > 0 ? Math.round((certificatesIssued / registeredVendors) * 1000) / 10 : 0
  const zonesAwaitingSurvey = filteredZones.filter((z) => !z.surveyCompleted).length
  const zonesWithoutCommittee = filteredZones.filter((z) => !z.townVendingCommitteeConstituted).length

  // Where the statutory shortfall falls hardest. The bar is the number of
  // people holding a livelihood the Act protects without the certificate the
  // Act entitles them to.
  const gapByWard = new Map<string, number>()
  for (const z of filteredZones) {
    const gap = Math.max(0, z.registeredVendors - z.certificatesOfVendingIssued)
    gapByWard.set(z.wardId, (gapByWard.get(z.wardId) ?? 0) + gap)
  }
  const worstWards = [...gapByWard.entries()]
    .map(([wardId, gap]) => ({ label: wardShortName(wardId), value: gap }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10)

  const freshness: DataFreshness = {
    generatedAt: DEMO_NOW.toISOString(),
    sourceObservedAt: DEMO_NOW.toISOString(),
    refreshIntervalMinutes: 1440,
    origin: 'demonstration',
    sourceState: 'operational',
    stale: false,
  }

  /* --------------------------------------------------------------- Tables */

  const centreColumns: Array<Column<LivelihoodCentre>> = [
    {
      id: 'name',
      header: t('Premises'),
      cell: (r) => <span className="font-medium text-ink-900">{r.name}</span>,
      sortValue: (r) => r.name,
      searchValue: (r) => r.name,
      width: 'minmax(15rem,1.8fr)',
    },
    { id: 'ward', header: t('Ward'), cell: (r) => wardShortName(r.wardId), sortValue: (r) => wardName(r.wardId), hideBelow: 'sm' },
    {
      id: 'kind',
      header: t('Type'),
      cell: (r) => (
        <Badge tone={KIND_TONE[r.kind]} size="sm">
          {LIVELIHOOD_CENTRE_KIND_LABEL[r.kind]}
        </Badge>
      ),
      sortValue: (r) => LIVELIHOOD_CENTRE_KIND_LABEL[r.kind],
      hideBelow: 'lg',
    },
    {
      id: 'served',
      header: t('Currently served'),
      cell: (r) => (
        <span className={r.currentBeneficiaries > r.capacity ? 'numeric font-semibold text-warn-700' : 'numeric text-ink-700'}>
          {formatNumber(r.currentBeneficiaries)}
        </span>
      ),
      sortValue: (r) => r.currentBeneficiaries,
      align: 'right',
    },
    {
      id: 'capacity',
      header: t('Sanctioned places'),
      cell: (r) => <span className="numeric">{formatNumber(r.capacity)}</span>,
      sortValue: (r) => r.capacity,
      align: 'right',
      hideBelow: 'md',
    },
    {
      id: 'shg',
      header: t('SHGs'),
      cell: (r) => <span className="numeric">{formatNumber(r.selfHelpGroups)}</span>,
      sortValue: (r) => r.selfHelpGroups,
      align: 'right',
      hideBelow: 'xl',
    },
    {
      id: 'linked',
      header: t('Bank linked'),
      cell: (r) =>
        r.selfHelpGroups === 0 ? (
          <span className="text-ink-400">-</span>
        ) : (
          <span className={r.shgBankLinkedPct < 70 ? 'numeric font-semibold text-warn-700' : 'numeric text-ink-700'}>
            {r.shgBankLinkedPct}%
          </span>
        ),
      sortValue: (r) => r.shgBankLinkedPct,
      align: 'right',
      hideBelow: 'lg',
    },
    {
      id: 'trained',
      header: t('Trained (12m)'),
      cell: (r) => <span className="numeric">{formatNumber(r.trainedLast12m)}</span>,
      sortValue: (r) => r.trainedLast12m,
      align: 'right',
      hideBelow: 'md',
    },
    {
      id: 'placed',
      header: t('In work after training'),
      cell: (r) =>
        r.trainedLast12m === 0 ? (
          <span className="text-ink-400">-</span>
        ) : (
          <span className={r.placedInWorkPct < 40 ? 'numeric font-semibold text-crit-600' : 'numeric text-ink-700'}>
            {r.placedInWorkPct}%
          </span>
        ),
      sortValue: (r) => r.placedInWorkPct,
      align: 'right',
    },
    { id: 'state', header: t('State'), cell: (r) => <StateBadge state={r.state} />, sortValue: (r) => r.state },
    {
      id: 'inspected',
      header: t('Last inspected'),
      cell: (r) => <span className="text-ink-600">{formatRelative(r.lastInspectedAt)}</span>,
      sortValue: (r) => r.lastInspectedAt,
      hideBelow: 'xl',
    },
  ]

  const zoneColumns: Array<Column<VendorZone>> = [
    {
      id: 'name',
      header: t('Vending zone'),
      cell: (r) => <span className="font-medium text-ink-900">{r.name}</span>,
      sortValue: (r) => r.name,
      searchValue: (r) => r.name,
      width: 'minmax(14rem,1.7fr)',
    },
    { id: 'ward', header: t('Ward'), cell: (r) => wardShortName(r.wardId), sortValue: (r) => wardName(r.wardId), hideBelow: 'sm' },
    {
      id: 'sanctioned',
      header: t('Sanctioned places'),
      cell: (r) => <span className="numeric">{formatNumber(r.sanctionedVendingCapacity)}</span>,
      sortValue: (r) => r.sanctionedVendingCapacity,
      align: 'right',
      hideBelow: 'md',
    },
    {
      id: 'registered',
      header: t('Vendors registered'),
      cell: (r) => (
        <span className={r.registeredVendors > r.sanctionedVendingCapacity ? 'numeric font-semibold text-warn-700' : 'numeric text-ink-700'}>
          {formatNumber(r.registeredVendors)}
        </span>
      ),
      sortValue: (r) => r.registeredVendors,
      align: 'right',
    },
    {
      id: 'certificates',
      header: t('Certificates issued'),
      cell: (r) => <span className="numeric">{formatNumber(r.certificatesOfVendingIssued)}</span>,
      sortValue: (r) => r.certificatesOfVendingIssued,
      align: 'right',
    },
    {
      id: 'gap',
      header: t('Awaiting their certificate'),
      cell: (r) => {
        const gap = Math.max(0, r.registeredVendors - r.certificatesOfVendingIssued)
        const share = r.registeredVendors > 0 ? Math.round((gap / r.registeredVendors) * 100) : 0
        return (
          <span className={share >= 40 ? 'numeric font-semibold text-crit-600' : 'numeric text-ink-700'}>
            {formatNumber(gap)} <span className="text-ink-400">({share}%)</span>
          </span>
        )
      },
      sortValue: (r) => r.registeredVendors - r.certificatesOfVendingIssued,
      align: 'right',
    },
    {
      id: 'survey',
      header: t('Statutory survey'),
      cell: (r) =>
        r.surveyCompleted ? (
          <Badge tone="positive" size="sm">{t('Completed')}</Badge>
        ) : (
          <Badge tone="critical" size="sm">{t('Not completed')}</Badge>
        ),
      sortValue: (r) => (r.surveyCompleted ? 1 : 0),
      hideBelow: 'lg',
    },
    {
      id: 'tvc',
      header: t('Town Vending Committee'),
      cell: (r) =>
        r.townVendingCommitteeConstituted ? (
          <Badge tone="positive" size="sm">{t('Constituted')}</Badge>
        ) : (
          <Badge tone="critical" size="sm">{t('Not constituted')}</Badge>
        ),
      sortValue: (r) => (r.townVendingCommitteeConstituted ? 1 : 0),
      hideBelow: 'xl',
    },
  ]

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('City Intelligence')}
        title={TITLE}
        description={t('The corporation\'s obligation under function 11 of the Twelfth Schedule - skill training and placement under DAY-NULM, self-help group formation and bank linkage, shelters for the urban homeless, and the vending register held under the Street Vendors Act, 2014.')}
        breadcrumbs={BREADCRUMBS}
        freshness={freshness}
      />

      <DemonstrationNotice />

      <Card tone="info" className="flex items-start gap-3">
        <Scale className="mt-0.5 h-4 w-4 shrink-0 text-govt-600" aria-hidden />
        <div className="min-w-0">
          <p className="text-[0.8125rem] font-semibold text-govt-800">
            {t('A certificate of vending is an entitlement, not a favour')}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-ink-600">
            {t('Under the Street Vendors (Protection of Livelihood and Regulation of Street Vending) Act, 2014, once the statutory survey has been carried out a vendor on the register is entitled to a certificate of vending, and issuing it is a duty this corporation owes. The shortfall reported below is therefore a measure of the corporation&apos;s own statutory compliance - it records what the administration has not yet done, and it says nothing whatever about the people who earn their living by vending. Where the survey has not been carried out or the Town Vending Committee has not been constituted, the duty has not even begun to be discharged.')}
          </p>
        </div>
      </Card>

      <FilterBar show={['ward', 'search']} searchPlaceholder="Search premises and vending zones" />

      <MetricGrid columns={4}>
        <MetricCard
          label={t('Residents reached')}
          value={formatNumber(beneficiaries)}
          support={t('{0} sanctioned places across {1} premises', formatNumber(capacity), formatNumber(filteredCentres.length))}
          icon={<Users className="h-4 w-4" />}
          origin="demonstration"
        />
        <MetricCard
          label={t('Self-help groups bank linked')}
          value={bankLinkage}
          unit="%"
          support={t('{0} of {1} groups holding a live credit linkage', formatNumber(groupsBankLinked), formatNumber(groups))}
          tone={bankLinkage < 70 ? 'warn' : 'positive'}
          icon={<HandCoins className="h-4 w-4" />}
        />
        <MetricCard
          label={t('In work after training')}
          value={placementRate}
          unit="%"
          support={t('{0} in work of {1} trained in twelve months', formatNumber(placed), formatNumber(trained))}
          tone={placementRate < 40 ? 'critical' : placementRate < 55 ? 'warn' : 'positive'}
          icon={<GraduationCap className="h-4 w-4" />}
        />
        <MetricCard
          label={t('Certificates of vending issued')}
          value={formatNumber(certificatesIssued)}
          support={t('Against {0} sanctioned vending places · {1} registered vendors still awaiting theirs', formatNumber(sanctionedVendingPlaces), formatNumber(withoutCertificate))}
          tone={certificateCoverage < 60 ? 'critical' : certificateCoverage < 80 ? 'warn' : 'positive'}
          icon={<BadgeCheck className="h-4 w-4" />}
        />
      </MetricGrid>

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <Card className="flex flex-col">
          <p className="label-institutional mb-2">{t('Trained and placed, by month')}</p>
          <div style={{ height: 220 }}>
            <CategoryBarChart
              data={trend as unknown as Array<Record<string, string | number>>}
              categoryKey="month"
              showLegend
              series={[
                { key: 'trained', label: t('Trained'), colour: CHART_COLOURS.primary },
                { key: 'placed', label: t('In work after three months'), colour: CHART_COLOURS.positive },
                { key: 'certificatesIssued', label: t('Certificates of vending issued'), colour: CHART_COLOURS.intel },
              ]}
            />
          </div>
          <p className="mt-2 text-[0.6875rem] leading-relaxed text-ink-500">
            {t('The two training lines are shown together because the upper one on its own is not an outcome. Training that does not end in work is expenditure the corporation has made and a year the trainee has given, with nothing at the end of it for either - so the distance between the bars is the measure that carries weight, not the height of the first.')}
          </p>
        </Card>

        <Card flush className="flex flex-col">
          <CardHeader
            bordered
            title={t('Where the certificate shortfall falls')}
            description={t('Registered vendors without the certificate of vending the Act entitles them to, by ward.')}
          />
          <div className="px-4 pb-4" style={{ height: Math.max(210, worstWards.length * 26) }}>
            {worstWards.length === 0 ? (
              <EmptyState
                compact
                title={t('No vending zones in scope')}
                detail="Clear a filter to widen the vending register."
              />
            ) : (
              <RankedBarChart data={worstWards} unit=" vendors" />
            )}
          </div>
        </Card>
      </div>

      <Card flush>
        <CardHeader
          bordered
          icon={<Store className="h-4 w-4" />}
          title={t('Vending zones')}
          description={t('Held under the Street Vendors Act, 2014. {0} zones await the statutory survey and {1} have no Town Vending Committee constituted - both are preconditions the corporation has to meet before a certificate can lawfully issue.', formatNumber(zonesAwaitingSurvey), formatNumber(zonesWithoutCommittee))}
        />
        {filteredZones.length === 0 ? (
          <EmptyState
            title={t('No vending zones match the current filters')}
            detail="Clear a filter to widen the vending register."
          />
        ) : (
          <DataTable rows={filteredZones} columns={zoneColumns} rowKey={(r) => r.id} pageSize={12} />
        )}
      </Card>

      <Card flush>
        <CardHeader
          bordered
          icon={<GraduationCap className="h-4 w-4" />}
          title={t('Livelihoods estate')}
          description={t('Skill training centres, shelters for the urban homeless, vending plazas, self-help group federations and livelihood centres within your authorised ward scope. Condition is read off placement and bank linkage rather than off the fabric of the building.')}
        />
        {filteredCentres.length === 0 ? (
          <EmptyState
            title={t('No premises match the current filters')}
            detail="Clear a filter to widen the estate."
          />
        ) : (
          <DataTable rows={filteredCentres} columns={centreColumns} rowKey={(r) => r.id} pageSize={12} />
        )}
      </Card>
    </PageBody>
  )
}

export default LivelihoodsPage
