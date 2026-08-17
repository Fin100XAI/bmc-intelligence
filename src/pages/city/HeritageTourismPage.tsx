import { useMemo, useState } from 'react'
import { Banknote, Landmark, Ticket, TriangleAlert } from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import {
  Badge,
  DataTable,
  DemonstrationNotice,
  EmptyState,
  ErrorState,
  Label,
  LoadingState,
  MetricGrid,
  Select,
  type BadgeTone,
  type Column,
} from '@/components/ui'
import { MetricCard } from '@/components/cards'
import { GovPanel } from '@/components/gov/GovPanel'
import { useServiceQuery } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { heritageService } from '@/services'
import { usePageMasthead } from '@/stores/masthead.store'
import { activeCorporation } from '@/config/municipality.config'
import { wardName } from '@/data/reference'
import {
  CONSERVATION_STATUS_LABEL,
  HERITAGE_CATEGORY_LABEL,
  HERITAGE_GRADE_LABEL,
  MANAGING_AUTHORITY_LABEL,
  type ConservationStatus,
  type HeritageGrade,
  type HeritageSite,
} from '@/types/heritage'
import { formatCompact, formatDate, formatNumber } from '@/utils/format'
import { t } from '@/i18n'

/**
 * src/pages/city/HeritageTourismPage.tsx
 *
 * Listed heritage structures and precincts, museums, the zoo and the
 * tourism-facing public realm - conservation responsibility the Corporation
 * carries regardless of who manages a given site.
 */

const GRADES: HeritageGrade[] = ['grade-i', 'grade-iia', 'grade-iib', 'grade-iii', 'ungraded']
const STATUSES: ConservationStatus[] = ['well-maintained', 'requires-repair', 'under-restoration', 'at-risk', 'encroached']

const STATUS_TONE: Record<ConservationStatus, BadgeTone> = {
  'well-maintained': 'positive',
  'requires-repair': 'warn',
  'under-restoration': 'info',
  'at-risk': 'critical',
  encroached: 'critical',
}

export function HeritageTourismPage(): React.JSX.Element {
  const [gradeFilter, setGradeFilter] = useState<HeritageGrade | ''>('')
  const [statusFilter, setStatusFilter] = useState<ConservationStatus | ''>('')

  usePageMasthead(t('Heritage & Tourism'))

  const positionQuery = useServiceQuery(queryKeys.heritage('position'), (u) => heritageService.position(u))
  const sitesQuery = useServiceQuery(queryKeys.heritage('sites'), (u) => heritageService.sites(u))

  const sites = useMemo(() => sitesQuery.data ?? [], [sitesQuery.data])
  const filtered = useMemo(
    () =>
      sites.filter((s) => {
        if (gradeFilter && s.heritageGrade !== gradeFilter) return false
        if (statusFilter && s.conservationStatus !== statusFilter) return false
        return true
      }),
    [sites, gradeFilter, statusFilter],
  )

  const loading = positionQuery.isLoading || sitesQuery.isLoading
  const anyError = positionQuery.error ?? sitesQuery.error

  if (loading) {
    return (
      <PageBody>
        <PageHeader eyebrow={t('Environment & Public Realm')} breadcrumbs={[{ label: t('Environment & Public Realm') }, { label: t('Heritage & Tourism') }]} />
        <LoadingState variant="metrics" />
        <LoadingState variant="table" rows={8} />
      </PageBody>
    )
  }
  if (anyError) {
    return (
      <PageBody>
        <PageHeader eyebrow={t('Environment & Public Realm')} breadcrumbs={[{ label: t('Environment & Public Realm') }, { label: t('Heritage & Tourism') }]} />
        <ErrorState detail={anyError.message} onRetry={() => { void positionQuery.refetch(); void sitesQuery.refetch() }} />
      </PageBody>
    )
  }

  const position = positionQuery.data

  const columns: Array<Column<HeritageSite>> = [
    {
      id: 'name',
      header: t('Site'),
      cell: (s) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-ink-900">{s.name}</p>
          <p className="mt-0.5 text-[0.6875rem] text-ink-500">{wardName(s.wardId)} · {HERITAGE_CATEGORY_LABEL[s.category]}</p>
        </div>
      ),
      sortValue: (s) => s.name,
      searchValue: (s) => s.name,
      width: 'minmax(16rem,2.2fr)',
    },
    {
      id: 'grade',
      header: t('Heritage grade'),
      cell: (s) => <Badge tone="neutral" size="sm">{HERITAGE_GRADE_LABEL[s.heritageGrade]}</Badge>,
      sortValue: (s) => s.heritageGrade,
    },
    {
      id: 'authority',
      header: t('Managed by'),
      cell: (s) => <span className="text-ink-700">{MANAGING_AUTHORITY_LABEL[s.managingAuthority]}</span>,
      sortValue: (s) => s.managingAuthority,
      hideBelow: 'lg',
    },
    {
      id: 'footfall',
      header: t('Annual footfall'),
      cell: (s) => (s.annualFootfall ? formatCompact(s.annualFootfall) : <span className="text-ink-400">-</span>),
      sortValue: (s) => s.annualFootfall ?? 0,
      align: 'right',
      hideBelow: 'xl',
    },
    {
      id: 'inspected',
      header: t('Last inspected'),
      cell: (s) => formatDate(s.lastInspectedAt),
      sortValue: (s) => s.lastInspectedAt,
      hideBelow: 'lg',
    },
    {
      id: 'status',
      header: t('Conservation status'),
      cell: (s) => <Badge tone={STATUS_TONE[s.conservationStatus]} size="sm">{CONSERVATION_STATUS_LABEL[s.conservationStatus]}</Badge>,
      sortValue: (s) => s.conservationStatus,
    },
  ]

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('Environment & Public Realm')}
        breadcrumbs={[{ label: t('Environment & Public Realm') }, { label: t('Heritage & Tourism') }]}
        hideProvenance
      />
      <DemonstrationNotice />

      <MetricGrid columns={5}>
        <MetricCard
          label={t('Sites on register')}
          value={position?.sitesOnRegister ?? 0}
          support={t('Notable landmarks profiled individually below')}
          icon={<Landmark className="h-4 w-4" />}
          background="red"
          footer={
            activeCorporation.id === 'bmc' && activeCorporation.heritageStructuresCount ? (
              <span className="text-[0.625rem] leading-snug text-ink-400">
                {t('For context: a compilation of BMC\'s own ward-by-ward heritage lists counts {0} graded structures plus {1} precincts citywide (Grade I: 51, IIA: 282, IIB: 289, III: 606). No single official MCGM document giving this aggregate total was found.', formatNumber(activeCorporation.heritageStructuresCount), activeCorporation.heritagePrecinctsCount ?? '-')}
              </span>
            ) : undefined
          }
        />
        <MetricCard label={t('Grade I structures')} value={position?.gradeICount ?? 0} icon={<Landmark className="h-4 w-4" />} background="amber" />
        <MetricCard
          label={t('At risk or encroached')}
          value={position?.atRiskOrEncroached ?? 0}
          icon={<TriangleAlert className="h-4 w-4" />}
          tone={position && position.atRiskOrEncroached > 0 ? 'critical' : 'default'}
          background="green"
        />
        <MetricCard label={t('Annual footfall')} value={position ? formatCompact(position.annualFootfallTotal) : '-'} icon={<Ticket className="h-4 w-4" />} />
        <MetricCard label={t('Revenue collected')} value={position ? `₹${formatCompact(position.revenueCollectedLakhTotal * 100000)}` : '-'} icon={<Banknote className="h-4 w-4" />} />
        <MetricCard
          label={t('Graded heritage structures (citywide)')}
          value={position?.heritageStructuresCitywide != null ? formatNumber(position.heritageStructuresCitywide) : '-'}
          support={t('BMC-wide inventory, not the register above')}
          icon={<Landmark className="h-4 w-4" />}
          footer={
            <span className="text-[0.625rem] leading-snug text-ink-400">
              {t('Third-party compilation of BMC\'s own ward-by-ward heritage lists (updated 2012-2019): 1,271 graded properties (Grade I: 51, IIA: 282, IIB: 289, III: 606) - artdecomumbai.com. No single official MCGM document giving this aggregate was found.')}
            </span>
          }
        />
        <MetricCard
          label={t('Heritage precincts (citywide)')}
          value={position?.heritagePrecinctsCitywide != null ? formatNumber(position.heritagePrecinctsCitywide) : '-'}
          icon={<Landmark className="h-4 w-4" />}
          footer={
            <span className="text-[0.625rem] leading-snug text-ink-400">
              {t('44 heritage precincts, per the same ward-by-ward compilation - artdecomumbai.com.')}
            </span>
          }
        />
      </MetricGrid>

      <GovPanel
        title={t('Heritage & tourism register')}
        tone="amber"
        dense
        actions={
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <Label htmlFor="grade-filter">{t('Grade')}</Label>
              <Select
                id="grade-filter"
                value={gradeFilter}
                onChange={(e) => setGradeFilter(e.target.value as HeritageGrade | '')}
                options={[{ value: '', label: t('All grades') }, ...GRADES.map((g) => ({ value: g, label: HERITAGE_GRADE_LABEL[g] }))]}
              />
            </div>
            <div>
              <Label htmlFor="heritage-status-filter">{t('Status')}</Label>
              <Select
                id="heritage-status-filter"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as ConservationStatus | '')}
                options={[{ value: '', label: t('All statuses') }, ...STATUSES.map((s) => ({ value: s, label: CONSERVATION_STATUS_LABEL[s] }))]}
              />
            </div>
          </div>
        }
      >
        <p className="px-3 pt-3 pb-2 text-xs leading-relaxed text-ink-500">
          {t('Every listed structure, precinct, museum and tourism site the Corporation is responsible for or manages.')}
        </p>
        {filtered.length === 0 ? (
          <EmptyState title={t('No sites match the current filters')} detail="Clear a filter to widen the register." />
        ) : (
          <DataTable rows={filtered} columns={columns} rowKey={(s) => s.id} pageSize={12} />
        )}
      </GovPanel>
    </PageBody>
  )
}

export default HeritageTourismPage
