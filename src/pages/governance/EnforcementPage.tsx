import { useMemo, useState } from 'react'
import { Gavel, Hammer, ScrollText, Siren } from 'lucide-react'
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
import { GovPanel } from '@/components/gov/GovPanel'
import { MetricCard } from '@/components/cards'
import { useServiceQuery } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { enforcementService } from '@/services'
import { usePageMasthead } from '@/stores/masthead.store'
import { activeCorporation } from '@/config/municipality.config'
import { wardName } from '@/data/reference'
import {
  ENCROACHMENT_CATEGORY_LABEL,
  ENFORCEMENT_STATUS_LABEL,
  LEGAL_BASIS_LABEL,
  NOTICE_TYPE_LABEL,
  type EncroachmentCategory,
  type EnforcementCase,
  type EnforcementStatus,
} from '@/types/enforcement'
import { formatDate, formatRelative } from '@/utils/format'
import { t } from '@/i18n'

/**
 * src/pages/governance/EnforcementPage.tsx
 *
 * Removal of Encroachments and unauthorised-development action, in one
 * register. Buildings, Coastal, Gardens, Markets, Livelihoods and Roads
 * Intelligence can each flag the SYMPTOM of an encroachment - a felled
 * mangrove, a squatted footpath, an unlicensed stall - but none of them
 * could resolve it, because the notice, the statute it was issued under and
 * what became of it belonged nowhere. This is where it belongs.
 */

const CATEGORIES: EncroachmentCategory[] = [
  'hawking-vending', 'slum-extension', 'unauthorised-construction', 'nullah-drain', 'road-footpath',
]
const STATUSES: EnforcementStatus[] = [
  'notice-issued', 'show-cause-period', 'action-scheduled', 'demolished', 'restored', 'regularised', 'disputed-in-court', 'withdrawn',
]

const STATUS_TONE: Record<EnforcementStatus, BadgeTone> = {
  'notice-issued': 'muted',
  'show-cause-period': 'info',
  'action-scheduled': 'warn',
  demolished: 'critical',
  restored: 'positive',
  regularised: 'positive',
  'disputed-in-court': 'warn',
  withdrawn: 'neutral',
}

export function EnforcementPage(): React.JSX.Element {
  const [categoryFilter, setCategoryFilter] = useState<EncroachmentCategory | ''>('')
  const [statusFilter, setStatusFilter] = useState<EnforcementStatus | ''>('')

  usePageMasthead(t('Encroachment & Enforcement'))

  const positionQuery = useServiceQuery(queryKeys.enforcement('position'), (u) => enforcementService.position(u))
  const casesQuery = useServiceQuery(queryKeys.enforcement('cases'), (u) => enforcementService.cases(u))
  const drivesQuery = useServiceQuery(queryKeys.enforcement('drives'), (u) => enforcementService.drives(u))

  const cases = useMemo(() => casesQuery.data ?? [], [casesQuery.data])
  const drives = useMemo(() => drivesQuery.data ?? [], [drivesQuery.data])

  const filtered = useMemo(
    () =>
      cases.filter((c) => {
        if (categoryFilter && c.category !== categoryFilter) return false
        if (statusFilter && c.status !== statusFilter) return false
        return true
      }),
    [cases, categoryFilter, statusFilter],
  )

  const loading = positionQuery.isLoading || casesQuery.isLoading || drivesQuery.isLoading
  const anyError = positionQuery.error ?? casesQuery.error ?? drivesQuery.error

  if (loading) {
    return (
      <PageBody>
        <PageHeader eyebrow={t('Planning & Development')} breadcrumbs={[{ label: t('Planning & Development') }, { label: t('Encroachment & Enforcement') }]} />
        <LoadingState variant="metrics" />
        <LoadingState variant="table" rows={8} />
      </PageBody>
    )
  }
  if (anyError) {
    return (
      <PageBody>
        <PageHeader eyebrow={t('Planning & Development')} breadcrumbs={[{ label: t('Planning & Development') }, { label: t('Encroachment & Enforcement') }]} />
        <ErrorState
          detail={anyError.message}
          onRetry={() => {
            void positionQuery.refetch()
            void casesQuery.refetch()
            void drivesQuery.refetch()
          }}
        />
      </PageBody>
    )
  }

  const position = positionQuery.data

  const columns: Array<Column<EnforcementCase>> = [
    {
      id: 'reference',
      header: t('Reference'),
      cell: (c) => <span className="numeric text-[0.6875rem] text-ink-500">{c.reference}</span>,
      sortValue: (c) => c.reference,
      searchValue: (c) => c.reference,
      hideBelow: 'lg',
    },
    {
      id: 'location',
      header: t('Location'),
      cell: (c) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-ink-900">{c.locationDescription}</p>
          <p className="mt-0.5 text-[0.6875rem] text-ink-500">{wardName(c.wardId)} · {c.extentDescription}</p>
        </div>
      ),
      sortValue: (c) => c.locationDescription,
      searchValue: (c) => `${c.locationDescription} ${c.reference}`,
      width: 'minmax(16rem,2.2fr)',
    },
    {
      id: 'category',
      header: t('Category'),
      cell: (c) => <Badge tone="neutral" size="sm">{ENCROACHMENT_CATEGORY_LABEL[c.category]}</Badge>,
      sortValue: (c) => c.category,
      hideBelow: 'md',
    },
    {
      id: 'basis',
      header: t('Legal basis'),
      cell: (c) => <span className="text-[0.75rem] text-ink-600">{LEGAL_BASIS_LABEL[c.legalBasis]}</span>,
      sortValue: (c) => c.legalBasis,
      hideBelow: 'xl',
    },
    {
      id: 'notice',
      header: t('Notice'),
      cell: (c) => <span className="text-ink-700">{NOTICE_TYPE_LABEL[c.noticeType]}</span>,
      sortValue: (c) => c.noticeType,
      hideBelow: 'lg',
    },
    {
      id: 'issued',
      header: t('Issued'),
      cell: (c) => formatRelative(c.noticeIssuedAt),
      sortValue: (c) => c.noticeIssuedAt,
      hideBelow: 'md',
    },
    {
      id: 'status',
      header: t('Status'),
      cell: (c) => (
        <div className="flex items-center gap-1.5">
          <Badge tone={STATUS_TONE[c.status]} size="sm">{ENFORCEMENT_STATUS_LABEL[c.status]}</Badge>
          {c.disputedInCourt ? <Gavel className="h-3.5 w-3.5 text-warn-600" aria-label={t('Under court challenge')} /> : null}
        </div>
      ),
      sortValue: (c) => c.status,
    },
  ]

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('Planning & Development')}
        breadcrumbs={[{ label: t('Planning & Development') }, { label: t('Encroachment & Enforcement') }]}
        hideProvenance
      />

      <DemonstrationNotice />

      <MetricGrid columns={5}>
        <MetricCard
          label={t('Notices issued (12m)')}
          value={position?.noticesIssued12m ?? 0}
          icon={<ScrollText className="h-4 w-4" />}
          background="red"
        />
        <MetricCard
          label={t('Actions completed (12m)')}
          value={position?.actionsCompleted12m ?? 0}
          icon={<Hammer className="h-4 w-4" />}
          background="amber"
        />
        <MetricCard
          label={t('Structures removed (12m)')}
          value={position?.structuresRemoved12m ?? 0}
          icon={<Hammer className="h-4 w-4" />}
          background="green"
          footer={
            activeCorporation.id === 'bmc' && activeCorporation.pedestriansFirstFootpathsClearedKm ? (
              <span className="text-[0.625rem] leading-snug text-ink-400">
                {t('For context: BMC\'s "Pedestrians First" campaign (2025-26, ongoing) cleared {0} km of encroached footpaths across 443 total enforcement actions - the best-available city-level encroachment-removal reference found; no single official annual aggregate is published citywide, only ward-level and campaign-level figures like this one.', activeCorporation.pedestriansFirstFootpathsClearedKm)}
              </span>
            ) : undefined
          }
        />
        <MetricCard
          label={t('Disputed in court')}
          value={position?.disputedInCourt ?? 0}
          icon={<Gavel className="h-4 w-4" />}
          tone={position && position.disputedInCourt > 0 ? 'warn' : 'default'}
        />
        <MetricCard
          label={t('Enforcement drives (12m)')}
          value={position?.drivesConducted12m ?? 0}
          icon={<Siren className="h-4 w-4" />}
        />
      </MetricGrid>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-3 xl:col-span-8">
          <GovPanel
            title={t('Enforcement register')}
            tone="amber"
            dense
            actions={
              <div className="flex flex-wrap items-end gap-2">
                <div>
                  <Label htmlFor="category-filter">{t('Category')}</Label>
                  <Select
                    id="category-filter"
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value as EncroachmentCategory | '')}
                    options={[
                      { value: '', label: t('All categories') },
                      ...CATEGORIES.map((c) => ({ value: c, label: ENCROACHMENT_CATEGORY_LABEL[c] })),
                    ]}
                  />
                </div>
                <div>
                  <Label htmlFor="enf-status-filter">{t('Status')}</Label>
                  <Select
                    id="enf-status-filter"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as EnforcementStatus | '')}
                    options={[
                      { value: '', label: t('All statuses') },
                      ...STATUSES.map((s) => ({ value: s, label: ENFORCEMENT_STATUS_LABEL[s] })),
                    ]}
                  />
                </div>
              </div>
            }
          >
            <p className="px-3 pt-3 pb-2 text-xs leading-relaxed text-ink-500">
              {t('Every notice issued under the MMC Act or the MRTP Act, and what became of it.')}
            </p>
            {filtered.length === 0 ? (
              <EmptyState title={t('No matters match the current filters')} detail="Clear a filter to widen the register." />
            ) : (
              <DataTable rows={filtered} columns={columns} rowKey={(c) => c.id} pageSize={14} />
            )}
          </GovPanel>
        </div>

        <div className="flex min-w-0 flex-col gap-3 xl:col-span-4">
          <GovPanel title={t('Recent enforcement drives')} tone="red" dense className="flex flex-col">
            <p className="px-3 pt-3 pb-2 text-xs leading-relaxed text-ink-500">
              {t('Time-bound, multi-ward operations - the unit a Removal of Encroachments squad actually works in.')}
            </p>
            <ul className="divide-y divide-ink-100">
              {drives.slice(0, 8).map((d) => (
                <li key={d.id} className="px-4 py-3">
                  <p className="truncate text-[0.8125rem] font-medium text-ink-900">{d.name}</p>
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <span className="text-[0.6875rem] text-ink-500">{formatDate(d.startedAt)}</span>
                    <span className="numeric text-[0.6875rem] text-ink-600">
                      {d.structuresRemoved}/{d.structuresTargeted} {t('removed')} · {d.personnelDeployed} {t('personnel')}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
            {drives.length === 0 ? <EmptyState title={t('No drives on record')} /> : null}
          </GovPanel>
        </div>
      </div>
    </PageBody>
  )
}

export default EnforcementPage
