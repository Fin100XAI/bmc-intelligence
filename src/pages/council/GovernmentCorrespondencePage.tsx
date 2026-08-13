import { useMemo, useState } from 'react'
import { AlertTriangle, FileSignature, Landmark, ScrollText } from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import {
  Badge,
  Card,
  CardHeader,
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
import { useServiceQuery } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { correspondenceService } from '@/services'
import { usePageMasthead } from '@/stores/masthead.store'
import { departmentName } from '@/data/reference'
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

export function GovernmentCorrespondencePage(): React.JSX.Element {
  const [deptFilter, setDeptFilter] = useState<IssuingDepartment | ''>('')
  const [subjectFilter, setSubjectFilter] = useState<CorrespondenceSubject | ''>('')
  const [statusFilter, setStatusFilter] = useState<CorrespondenceStatus | ''>('')

  usePageMasthead(
    t('Government Correspondence'),
    t('Government Resolutions, circulars and notifications the state has directed to the Corporation, and their implementation status.'),
  )

  const positionQuery = useServiceQuery(queryKeys.correspondence('position'), (u) => correspondenceService.position(u))
  const resolutionsQuery = useServiceQuery(queryKeys.correspondence('resolutions'), (u) => correspondenceService.resolutions(u))

  const resolutions = useMemo(() => resolutionsQuery.data ?? [], [resolutionsQuery.data])

  const filtered = useMemo(
    () =>
      resolutions.filter((g) => {
        if (deptFilter && g.issuingDepartment !== deptFilter) return false
        if (subjectFilter && g.subjectCategory !== subjectFilter) return false
        if (statusFilter && g.status !== statusFilter) return false
        return true
      }),
    [resolutions, deptFilter, subjectFilter, statusFilter],
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
        />
        <MetricCard
          label={t('Under implementation')}
          value={position?.underImplementation ?? 0}
          icon={<FileSignature className="h-4 w-4" />}
        />
        <MetricCard
          label={t('Implemented (12m)')}
          value={position?.implemented12m ?? 0}
          icon={<FileSignature className="h-4 w-4" />}
          tone="positive"
        />
        <MetricCard
          label={t('Compliance overdue')}
          value={position?.complianceOverdue ?? 0}
          icon={<AlertTriangle className="h-4 w-4" />}
          tone={position && position.complianceOverdue > 0 ? 'critical' : 'default'}
        />
      </MetricGrid>

      <Card flush>
        <CardHeader
          bordered
          icon={<FileSignature className="h-4 w-4" />}
          title={t('Correspondence register')}
          description={t('Every Government Resolution, circular and notification received, most recently issued first.')}
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
        />
        {filtered.length === 0 ? (
          <EmptyState title={t('No correspondence matches the current filters')} detail="Clear a filter to widen the register." />
        ) : (
          <DataTable rows={filtered} columns={columns} rowKey={(g) => g.id} pageSize={15} />
        )}
      </Card>
    </PageBody>
  )
}

export default GovernmentCorrespondencePage
