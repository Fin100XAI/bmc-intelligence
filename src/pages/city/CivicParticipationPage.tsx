import { useMemo, useState } from 'react'
import { MessageSquareText, Users, Vote } from 'lucide-react'
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
import { civicParticipationService } from '@/services'
import { usePageMasthead } from '@/stores/masthead.store'
import { departmentName, wardShortName } from '@/data/reference'
import {
  ENGAGEMENT_STATUS_LABEL,
  ENGAGEMENT_THEME_LABEL,
  ENGAGEMENT_TYPE_LABEL,
  type CivicEngagementRecord,
  type EngagementStatus,
  type EngagementTheme,
} from '@/types/civic-participation'
import { formatDate, formatNumber } from '@/utils/format'
import { t } from '@/i18n'

/**
 * src/pages/city/CivicParticipationPage.tsx
 *
 * Consultations, suggestions and public feedback the Corporation has
 * invited or received - engagement the administration ran, not a record of
 * who took part in it. See the type module for the deliberate absence of
 * any submission's content or authorship.
 */

const THEMES: EngagementTheme[] = ['infrastructure', 'environment', 'planning', 'health', 'safety', 'social-welfare', 'finance', 'other']
const STATUSES: EngagementStatus[] = ['open', 'under-review', 'incorporated', 'noted-not-incorporated', 'closed']

const STATUS_TONE: Record<EngagementStatus, BadgeTone> = {
  open: 'info',
  'under-review': 'warn',
  incorporated: 'positive',
  'noted-not-incorporated': 'neutral',
  closed: 'muted',
}

export function CivicParticipationPage(): React.JSX.Element {
  const [themeFilter, setThemeFilter] = useState<EngagementTheme | ''>('')
  const [statusFilter, setStatusFilter] = useState<EngagementStatus | ''>('')

  usePageMasthead(
    t('Civic Participation'),
    t('Consultations, suggestion schemes and public feedback the Corporation has run - what was asked, how many responded, and what came of it. No submission text or citizen identity is held.'),
  )

  const positionQuery = useServiceQuery(queryKeys.civicParticipation('position'), (u) => civicParticipationService.position(u))
  const engagementsQuery = useServiceQuery(queryKeys.civicParticipation('engagements'), (u) => civicParticipationService.engagements(u))

  const engagements = useMemo(() => engagementsQuery.data ?? [], [engagementsQuery.data])
  const filtered = useMemo(
    () =>
      engagements.filter((e) => {
        if (themeFilter && e.theme !== themeFilter) return false
        if (statusFilter && e.status !== statusFilter) return false
        return true
      }),
    [engagements, themeFilter, statusFilter],
  )

  const loading = positionQuery.isLoading || engagementsQuery.isLoading
  const anyError = positionQuery.error ?? engagementsQuery.error

  if (loading) {
    return (
      <PageBody>
        <PageHeader eyebrow={t('Citizen Services & Social Development')} breadcrumbs={[{ label: t('Citizen Services & Social Development') }, { label: t('Civic Participation') }]} />
        <LoadingState variant="metrics" />
        <LoadingState variant="table" rows={8} />
      </PageBody>
    )
  }
  if (anyError) {
    return (
      <PageBody>
        <PageHeader eyebrow={t('Citizen Services & Social Development')} breadcrumbs={[{ label: t('Citizen Services & Social Development') }, { label: t('Civic Participation') }]} />
        <ErrorState detail={anyError.message} onRetry={() => { void positionQuery.refetch(); void engagementsQuery.refetch() }} />
      </PageBody>
    )
  }

  const position = positionQuery.data

  const columns: Array<Column<CivicEngagementRecord>> = [
    {
      id: 'subject',
      header: t('Engagement'),
      cell: (e) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-ink-900">{e.subject}</p>
          <p className="mt-0.5 line-clamp-1 text-[0.6875rem] text-ink-500">{e.summary}</p>
        </div>
      ),
      sortValue: (e) => e.subject,
      searchValue: (e) => `${e.subject} ${e.reference}`,
      width: 'minmax(18rem,2.4fr)',
    },
    {
      id: 'type',
      header: t('Type'),
      cell: (e) => <Badge tone="neutral" size="sm">{ENGAGEMENT_TYPE_LABEL[e.type]}</Badge>,
      sortValue: (e) => e.type,
      hideBelow: 'lg',
    },
    {
      id: 'department',
      header: t('Department'),
      cell: (e) => departmentName(e.departmentId),
      sortValue: (e) => departmentName(e.departmentId),
      hideBelow: 'xl',
    },
    {
      id: 'wards',
      header: t('Wards'),
      cell: (e) => (e.wardIds.length === 0 ? <span className="text-ink-400">{t('City-wide')}</span> : e.wardIds.map((w) => wardShortName(w)).join(', ')),
      sortValue: (e) => e.wardIds.length,
      hideBelow: 'xl',
    },
    {
      id: 'submissions',
      header: t('Submissions'),
      cell: (e) => <span className="numeric text-ink-700">{formatNumber(e.submissionsReceived)}</span>,
      sortValue: (e) => e.submissionsReceived,
      align: 'right',
    },
    {
      id: 'opened',
      header: t('Opened'),
      cell: (e) => formatDate(e.openedAt),
      sortValue: (e) => e.openedAt,
      hideBelow: 'md',
    },
    {
      id: 'status',
      header: t('Status'),
      cell: (e) => <Badge tone={STATUS_TONE[e.status]} size="sm">{ENGAGEMENT_STATUS_LABEL[e.status]}</Badge>,
      sortValue: (e) => e.status,
    },
  ]

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('Citizen Services & Social Development')}
        breadcrumbs={[{ label: t('Citizen Services & Social Development') }, { label: t('Civic Participation') }]}
        hideProvenance
      />
      <DemonstrationNotice />

      <MetricGrid columns={4}>
        <MetricCard label={t('Consultations active')} value={position?.consultationsActive ?? 0} icon={<Vote className="h-4 w-4" />} />
        <MetricCard label={t('Closed (12m)')} value={position?.consultationsClosed12m ?? 0} icon={<MessageSquareText className="h-4 w-4" />} />
        <MetricCard label={t('Submissions received (12m)')} value={position ? formatNumber(position.totalSubmissions12m) : '-'} icon={<Users className="h-4 w-4" />} />
        <MetricCard
          label={t('Incorporated into a decision')}
          value={position?.incorporatedSharePct ?? 0}
          unit="%"
          support={t('Mean {0} days to respond', position?.meanResponseDays ?? 0)}
          icon={<Vote className="h-4 w-4" />}
        />
      </MetricGrid>

      <Card flush>
        <CardHeader
          bordered
          icon={<MessageSquareText className="h-4 w-4" />}
          title={t('Engagement register')}
          description={t('Every consultation, suggestion scheme and public-comment period the Corporation has run, most recently opened first.')}
          actions={
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <Label htmlFor="theme-filter">{t('Theme')}</Label>
                <Select
                  id="theme-filter"
                  value={themeFilter}
                  onChange={(e) => setThemeFilter(e.target.value as EngagementTheme | '')}
                  options={[{ value: '', label: t('All themes') }, ...THEMES.map((th) => ({ value: th, label: ENGAGEMENT_THEME_LABEL[th] }))]}
                />
              </div>
              <div>
                <Label htmlFor="engagement-status-filter">{t('Status')}</Label>
                <Select
                  id="engagement-status-filter"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as EngagementStatus | '')}
                  options={[{ value: '', label: t('All statuses') }, ...STATUSES.map((s) => ({ value: s, label: ENGAGEMENT_STATUS_LABEL[s] }))]}
                />
              </div>
            </div>
          }
        />
        {filtered.length === 0 ? (
          <EmptyState title={t('No engagements match the current filters')} detail="Clear a filter to widen the register." />
        ) : (
          <DataTable rows={filtered} columns={columns} rowKey={(e) => e.id} pageSize={12} />
        )}
      </Card>
    </PageBody>
  )
}

export default CivicParticipationPage
