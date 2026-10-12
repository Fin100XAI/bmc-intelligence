import { useMemo, useState } from 'react'
import { AlertTriangle, FileSignature, Landmark, ScrollText } from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import {
  Badge,
  Card,
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
import { FilterBar } from '@/components/filters/FilterBar'
import { useServiceQuery } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { correspondenceService } from '@/services'
import { useFilterStore } from '@/stores/ui.store'
import type { FilterState } from '@/stores/ui.store'
import { usePageMasthead } from '@/stores/masthead.store'
import { departmentName } from '@/data/reference'
import { DEMO_NOW } from '@/utils/deterministic'
import type { DateRangeKey } from '@/types/common'
import {
  CORRESPONDENCE_STATUS_LABEL,
  CORRESPONDENCE_SUBJECT_LABEL,
  DOCUMENT_TYPE_LABEL,
  ISSUING_DEPARTMENT_LABEL,
  type CorrespondenceStatus,
  type CorrespondenceSubject,
  type GovernmentResolution,
  type IssuingDepartment,
} from '@/types/correspondence'
import { formatDate } from '@/utils/format'
import { t } from '@/i18n'

/**
 * src/pages/council/GovernmentCorrespondencePage.tsx
 *
 * The paper trail that authorises or directs a great deal of what the rest
 * of this platform shows as already-decided fact. Every other screen reports
 * the Corporation's own record; this one reports what the state government
 * has directed it to do, and whether the Corporation has done it.
 */

const ISSUING_DEPARTMENTS: IssuingDepartment[] = [
  'urban-development', 'revenue-forest', 'home', 'environment', 'disaster-management', 'finance', 'general-administration',
]
const SUBJECTS: CorrespondenceSubject[] = [
  'property-tax', 'ward-delimitation', 'coastal-road', 'disaster-management', 'solid-waste', 'environment', 'establishment', 'other',
]
const STATUSES: CorrespondenceStatus[] = ['received', 'under-implementation', 'implemented', 'superseded', 'compliance-overdue']

const STATUS_TONE: Record<CorrespondenceStatus, BadgeTone> = {
  received: 'muted',
  'under-implementation': 'info',
  implemented: 'positive',
  superseded: 'neutral',
  'compliance-overdue': 'critical',
}

const DATE_RANGE_HOURS: Record<DateRangeKey, number> = {
  '24h': 24,
  '7d': 24 * 7,
  '30d': 24 * 30,
  '90d': 24 * 90,
  fy: 24 * 365,
}

function withinDateRange(iso: string, range: DateRangeKey): boolean {
  const ageMs = DEMO_NOW.getTime() - new Date(iso).getTime()
  return ageMs <= DATE_RANGE_HOURS[range] * 3_600_000
}

/**
 * Narrows the register by the global filter set - ward, the linked municipal
 * department(s) a GR concerns, when it was issued, and free text against
 * reference and subject. Applied alongside, not instead of, the register's
 * own issuing-department/subject/status controls below, which speak to the
 * *state* correspondence rather than the municipal side of it.
 */
function matchesGlobalFilters(g: GovernmentResolution, filters: FilterState): boolean {
  if (filters.wardIds.length > 0 && !g.wardIds.some((w) => filters.wardIds.includes(w))) return false
  if (filters.departmentIds.length > 0 && !g.linkedDepartmentIds.some((d) => filters.departmentIds.includes(d))) return false
  if (!withinDateRange(g.issuedAt, filters.dateRange)) return false
  if (filters.search.trim()) {
    const q = filters.search.trim().toLowerCase()
    if (!g.subject.toLowerCase().includes(q) && !g.summary.toLowerCase().includes(q) && !g.reference.toLowerCase().includes(q)) return false
  }
  return true
}

export function GovernmentCorrespondencePage(): React.JSX.Element {
  const [deptFilter, setDeptFilter] = useState<IssuingDepartment | ''>('')
  const [subjectFilter, setSubjectFilter] = useState<CorrespondenceSubject | ''>('')
  const [statusFilter, setStatusFilter] = useState<CorrespondenceStatus | ''>('')
  const filters = useFilterStore((s) => s.filters)

  usePageMasthead(t('Government Correspondence'))

  const positionQuery = useServiceQuery(queryKeys.correspondence('position'), (u) => correspondenceService.position(u))
  const resolutionsQuery = useServiceQuery(queryKeys.correspondence('resolutions'), (u) => correspondenceService.resolutions(u))

  const resolutions = useMemo(() => resolutionsQuery.data ?? [], [resolutionsQuery.data])

  const filtered = useMemo(
    () =>
      resolutions.filter((g) => {
        if (deptFilter && g.issuingDepartment !== deptFilter) return false
        if (subjectFilter && g.subjectCategory !== subjectFilter) return false
        if (statusFilter && g.status !== statusFilter) return false
        return matchesGlobalFilters(g, filters)
      }),
    [resolutions, deptFilter, subjectFilter, statusFilter, filters],
  )

  const loading = positionQuery.isLoading || resolutionsQuery.isLoading
  const anyError = positionQuery.error ?? resolutionsQuery.error

  if (loading) {
    return (
      <PageBody>
        <PageHeader eyebrow={t('Council')} breadcrumbs={[{ label: t('Council') }, { label: t('Government Correspondence') }]} />
        <LoadingState variant="metrics" />
        <LoadingState variant="table" rows={8} />
      </PageBody>
    )
  }
  if (anyError) {
    return (
      <PageBody>
        <PageHeader eyebrow={t('Council')} breadcrumbs={[{ label: t('Council') }, { label: t('Government Correspondence') }]} />
        <ErrorState detail={anyError.message} onRetry={() => { void positionQuery.refetch(); void resolutionsQuery.refetch() }} />
      </PageBody>
    )
  }

  const position = positionQuery.data

  const columns: Array<Column<GovernmentResolution>> = [
    {
      id: 'reference',
      header: t('Reference'),
      cell: (g) => <span className="numeric text-[0.6875rem] text-ink-500">{g.reference}</span>,
      sortValue: (g) => g.reference,
      searchValue: (g) => g.reference,
      hideBelow: 'lg',
    },
    {
      id: 'subject',
      header: t('Subject'),
      cell: (g) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-ink-900">{g.subject}</p>
          <p className="mt-0.5 line-clamp-1 text-[0.6875rem] text-ink-500">{g.summary}</p>
        </div>
      ),
      sortValue: (g) => g.subject,
      searchValue: (g) => `${g.subject} ${g.summary}`,
      width: 'minmax(18rem,2.4fr)',
    },
    {
      id: 'department',
      header: t('Issued by'),
      cell: (g) => <span className="text-ink-700">{ISSUING_DEPARTMENT_LABEL[g.issuingDepartment]}</span>,
      sortValue: (g) => ISSUING_DEPARTMENT_LABEL[g.issuingDepartment],
      hideBelow: 'lg',
    },
    {
      id: 'type',
      header: t('Type'),
      cell: (g) => <Badge tone="neutral" size="sm">{DOCUMENT_TYPE_LABEL[g.documentType]}</Badge>,
      sortValue: (g) => g.documentType,
      hideBelow: 'xl',
    },
    {
      id: 'concerns',
      header: t('Concerns'),
      cell: (g) => <span className="text-ink-700">{g.linkedDepartmentIds.map((id) => departmentName(id)).join(', ')}</span>,
      sortValue: (g) => g.linkedDepartmentIds.join(','),
      hideBelow: 'xl',
    },
    {
      id: 'issued',
      header: t('Issued'),
      cell: (g) => formatDate(g.issuedAt),
      sortValue: (g) => g.issuedAt,
      hideBelow: 'md',
    },
    {
      id: 'deadline',
      header: t('Compliance by'),
      cell: (g) =>
        g.complianceDeadline ? (
          <span className={g.status === 'compliance-overdue' ? 'font-semibold text-crit-600' : 'text-ink-700'}>
            {formatDate(g.complianceDeadline)}
          </span>
        ) : (
          <span className="text-ink-400">{t('Not specified')}</span>
        ),
      sortValue: (g) => g.complianceDeadline ?? '',
      hideBelow: 'lg',
    },
    {
      id: 'status',
      header: t('Status'),
      cell: (g) => <Badge tone={STATUS_TONE[g.status]} size="sm">{CORRESPONDENCE_STATUS_LABEL[g.status]}</Badge>,
      sortValue: (g) => g.status,
    },
  ]

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('Council')}
        breadcrumbs={[{ label: t('Council') }, { label: t('Government Correspondence') }]}
        hideProvenance
        controls={<FilterBar show={['date', 'ward', 'department', 'search']} />}
      />

      <DemonstrationNotice />

      <Card tone="info" className="flex items-start gap-3">
        <Landmark className="mt-0.5 h-4 w-4 shrink-0 text-govt-600" aria-hidden />
        <div className="min-w-0">
          <p className="text-[0.8125rem] font-semibold text-govt-800">{t('What the state directs, distinct from what the house resolves')}</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-600">
            {t('A Government Resolution (शासन निर्णय) is issued by a state department - overwhelmingly, for a municipal corporation, the Urban Development Department - directing policy or action. It is distinct from Council & Committees, which records what the Corporation itself has resolved: a GR is received, not tabled, and its authority does not depend on the house adopting it.')}
          </p>
        </div>
      </Card>

      <MetricGrid columns={4}>
        <MetricCard
          label={t('Received (12m)')}
          value={position?.received12m ?? 0}
          icon={<ScrollText className="h-4 w-4" />}
          background="red"
        />
        <MetricCard
          label={t('Under implementation')}
          value={position?.underImplementation ?? 0}
          icon={<FileSignature className="h-4 w-4" />}
          background="amber"
        />
        <MetricCard
          label={t('Implemented (12m)')}
          value={position?.implemented12m ?? 0}
          icon={<FileSignature className="h-4 w-4" />}
          tone="positive"
          background="green"
        />
        <MetricCard
          label={t('Compliance overdue')}
          value={position?.complianceOverdue ?? 0}
          icon={<AlertTriangle className="h-4 w-4" />}
          tone={position && position.complianceOverdue > 0 ? 'critical' : 'default'}
        />
      </MetricGrid>

      <GovPanel
        title={t('Correspondence register')}
        tone="amber"
        actions={
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <Label htmlFor="dept-filter">{t('Issued by')}</Label>
              <Select
                id="dept-filter"
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value as IssuingDepartment | '')}
                options={[
                  { value: '', label: t('All departments') },
                  ...ISSUING_DEPARTMENTS.map((d) => ({ value: d, label: ISSUING_DEPARTMENT_LABEL[d] })),
                ]}
              />
            </div>
            <div>
              <Label htmlFor="subject-filter">{t('Subject')}</Label>
              <Select
                id="subject-filter"
                value={subjectFilter}
                onChange={(e) => setSubjectFilter(e.target.value as CorrespondenceSubject | '')}
                options={[
                  { value: '', label: t('All subjects') },
                  ...SUBJECTS.map((s) => ({ value: s, label: CORRESPONDENCE_SUBJECT_LABEL[s] })),
                ]}
              />
            </div>
            <div>
              <Label htmlFor="corr-status-filter">{t('Status')}</Label>
              <Select
                id="corr-status-filter"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as CorrespondenceStatus | '')}
                options={[
                  { value: '', label: t('All statuses') },
                  ...STATUSES.map((s) => ({ value: s, label: CORRESPONDENCE_STATUS_LABEL[s] })),
                ]}
              />
            </div>
          </div>
        }
        dense
      >
        <p className="px-3 pt-3 pb-2 text-xs leading-relaxed text-ink-500">
          {t('Every Government Resolution, circular and notification received, most recently issued first.')}
        </p>
        {filtered.length === 0 ? (
          <EmptyState className="mx-3 mb-3" title={t('No correspondence matches the current filters')} detail={t('Clear a filter to widen the register.')} />
        ) : (
          <DataTable rows={filtered} columns={columns} rowKey={(g) => g.id} pageSize={15} />
        )}
      </GovPanel>
    </PageBody>
  )
}

export default GovernmentCorrespondencePage
