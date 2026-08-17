import { useMemo } from 'react'
import { GraduationCap, School, UserRoundX, Warehouse } from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import {
  Badge,
  Card,
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
import { GovPanel } from '@/components/gov/GovPanel'
import { CategoryBarChart, DonutChart, CHART_COLOURS, RankedBarChart } from '@/components/charts'
import { FilterBar } from '@/components/filters/FilterBar'
import { useServiceQuery } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { educationService } from '@/services'
import { useFilterStore } from '@/stores/ui.store'
import { usePageMasthead } from '@/stores/masthead.store'
import { wardName, wardShortName } from '@/data/reference'
import {
  SCHOOL_LEVEL_LABEL,
  SCHOOL_MEDIUM_LABEL,
  type MunicipalSchool,
  type SchoolMedium,
} from '@/types/civic-services'
import type { DataFreshness } from '@/types/common'
import { DEMO_NOW } from '@/utils/deterministic'
import { formatDate, formatNumber } from '@/utils/format'
import { t } from '@/i18n'

/**
 * src/pages/city/EducationIntelligencePage.tsx
 *
 * Municipal schools.
 *
 * A corporation is among the largest school operators in its own city, and the
 * education establishment is one of the largest single lines in its budget.
 * This page reads that estate the way the department is actually held to
 * account for it: how many children are enrolled, how many sanctioned teaching
 * posts are unfilled, and how many school buildings are below the condition at
 * which they should be occupied.
 *
 * THE UNIT IS THE SCHOOL. No pupil appears on this page or anywhere behind it,
 * and none can - the service has no method that returns one. Attendance and
 * dropout are school-level rates, never a child's record.
 */

const INFRA_THRESHOLD = 55

const MEDIUM_COLOUR: Record<SchoolMedium, string> = {
  marathi: CHART_COLOURS.primary,
  hindi: CHART_COLOURS.positive,
  urdu: CHART_COLOURS.warn,
  english: CHART_COLOURS.intel,
  gujarati: CHART_COLOURS.risk,
  other: CHART_COLOURS.neutral,
}

export function EducationIntelligencePage(): React.JSX.Element {
  const filters = useFilterStore((s) => s.filters)

  usePageMasthead(t('Education Intelligence'))

  const schoolsQuery = useServiceQuery(queryKeys.education('schools'), (u) => educationService.schools(u))
  const wardQuery = useServiceQuery(queryKeys.education('wards'), (u) => educationService.wardSummary(u))

  const schools = useMemo(() => schoolsQuery.data ?? [], [schoolsQuery.data])
  const wardRows = useMemo(() => wardQuery.data ?? [], [wardQuery.data])

  const filtered = useMemo(
    () =>
      schools.filter((s) => {
        if (filters.wardIds.length > 0 && !filters.wardIds.includes(s.wardId)) return false
        if (filters.search.trim()) {
          const q = filters.search.trim().toLowerCase()
          if (!s.name.toLowerCase().includes(q) && !wardName(s.wardId).toLowerCase().includes(q)) return false
        }
        return true
      }),
    [schools, filters],
  )

  if (schoolsQuery.isLoading || wardQuery.isLoading) {
    return (
      <PageBody>
        <PageHeader eyebrow={t('City Intelligence')} breadcrumbs={[{ label: t('City Intelligence') }, { label: t('Education Intelligence') }]} />
        <LoadingState variant="metrics" />
        <LoadingState variant="table" rows={8} />
      </PageBody>
    )
  }
  if (schoolsQuery.error || wardQuery.error) {
    return (
      <PageBody>
        <PageHeader eyebrow={t('City Intelligence')} breadcrumbs={[{ label: t('City Intelligence') }, { label: t('Education Intelligence') }]} />
        <ErrorState
          detail={(schoolsQuery.error ?? wardQuery.error)?.message}
          onRetry={() => { void schoolsQuery.refetch(); void wardQuery.refetch() }}
        />
      </PageBody>
    )
  }

  const enrolment = filtered.reduce((s, x) => s + x.enrolment, 0)
  const sanctioned = filtered.reduce((s, x) => s + x.teachersSanctioned, 0)
  const inPosition = filtered.reduce((s, x) => s + x.teachersInPosition, 0)
  const vacancyPct = sanctioned > 0 ? Math.round(((sanctioned - inPosition) / sanctioned) * 1000) / 10 : 0
  const belowThreshold = filtered.filter((s) => s.infrastructureScore < INFRA_THRESHOLD).length
  const pupilTeacher = inPosition > 0 ? Math.round(enrolment / inPosition) : 0

  const byMedium = (Object.keys(SCHOOL_MEDIUM_LABEL) as SchoolMedium[])
    .map((m) => ({ medium: m, count: filtered.filter((s) => s.medium === m).length }))
    .filter((x) => x.count > 0)

  const byLevel = (Object.keys(SCHOOL_LEVEL_LABEL) as Array<MunicipalSchool['level']>).map((l) => ({
    label: SCHOOL_LEVEL_LABEL[l],
    value: filtered.filter((s) => s.level === l).length,
  }))

  const worstVacancy = [...wardRows].sort((a, b) => b.teacherVacancyPct - a.teacherVacancyPct).slice(0, 10)

  const freshness: DataFreshness = {
    generatedAt: DEMO_NOW.toISOString(),
    sourceObservedAt: DEMO_NOW.toISOString(),
    refreshIntervalMinutes: 1440,
    origin: 'demonstration',
    sourceState: 'operational',
    stale: false,
  }

  const columns: Array<Column<MunicipalSchool>> = [
    {
      id: 'name',
      header: t('School'),
      cell: (r) => <span className="font-medium text-ink-900">{r.name}</span>,
      sortValue: (r) => r.name,
      searchValue: (r) => r.name,
      width: 'minmax(13rem,1.6fr)',
    },
    { id: 'ward', header: t('Ward'), cell: (r) => wardShortName(r.wardId), sortValue: (r) => wardName(r.wardId), hideBelow: 'sm' },
    { id: 'level', header: t('Level'), cell: (r) => <Badge tone="neutral" size="sm">{SCHOOL_LEVEL_LABEL[r.level]}</Badge>, sortValue: (r) => r.level, hideBelow: 'lg' },
    { id: 'medium', header: t('Medium'), cell: (r) => SCHOOL_MEDIUM_LABEL[r.medium], sortValue: (r) => r.medium, hideBelow: 'xl' },
    { id: 'enrolment', header: t('Enrolment'), cell: (r) => <span className="numeric">{formatNumber(r.enrolment)}</span>, sortValue: (r) => r.enrolment, align: 'right' },
    {
      id: 'teachers',
      header: t('Teachers (in post / sanctioned)'),
      cell: (r) => {
        const gap = r.teachersSanctioned - r.teachersInPosition
        return (
          <span className={gap > 0 ? 'numeric font-semibold text-warn-700' : 'numeric text-ink-700'}>
            {r.teachersInPosition} <span className="text-ink-400">/ {r.teachersSanctioned}</span>
          </span>
        )
      },
      sortValue: (r) => r.teachersInPosition - r.teachersSanctioned,
      align: 'right',
      hideBelow: 'md',
    },
    { id: 'attendance', header: t('Attendance'), cell: (r) => <span className="numeric">{r.attendancePct}%</span>, sortValue: (r) => r.attendancePct, align: 'right', hideBelow: 'lg' },
    {
      id: 'infra',
      header: t('Building'),
      cell: (r) => (
        <span className={r.infrastructureScore < INFRA_THRESHOLD ? 'numeric font-semibold text-crit-600' : 'numeric text-ink-700'}>
          {r.infrastructureScore}
        </span>
      ),
      sortValue: (r) => r.infrastructureScore,
      align: 'right',
    },
    { id: 'state', header: t('State'), cell: (r) => <StateBadge state={r.state} />, sortValue: (r) => r.state },
    { id: 'inspected', header: t('Last inspected'), cell: (r) => formatDate(r.lastInspectedAt), sortValue: (r) => r.lastInspectedAt, hideBelow: 'xl' },
  ]

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('City Intelligence')}
        breadcrumbs={[{ label: t('City Intelligence') }, { label: t('Education Intelligence') }]}
        freshness={freshness}
      />

      <DemonstrationNotice />

      <FilterBar show={['ward', 'search']} searchPlaceholder="Search schools" />

      <MetricGrid columns={4}>
        <MetricCard
          label={t('Schools')}
          value={filtered.length}
          support={t('across {0} wards', wardRows.length)}
          icon={<School className="h-4 w-4" />}
          origin="demonstration"
          background="red"
          footer={<span className="text-[0.625rem] leading-snug text-ink-400">{t("BMC's Education Department reports 1,135 municipal schools citywide (bmceducation.in, undated); this register is anchored to that count.")}</span>}
        />
        <MetricCard
          label={t('Enrolment')}
          value={formatNumber(enrolment)}
          support={t('Children on the roll')}
          icon={<GraduationCap className="h-4 w-4" />}
          background="amber"
          footer={<span className="text-[0.625rem] leading-snug text-ink-400">{t("BMC's Education Department reports approximately 2.93 lakh (293,000) students enrolled citywide (bmceducation.in, undated); enrolment above is scaled to that total.")}</span>}
        />
        <MetricCard
          label={t('Teacher vacancy')}
          value={vacancyPct}
          unit="%"
          support={t('{0} of {1} sanctioned posts unfilled', formatNumber(sanctioned - inPosition), formatNumber(sanctioned))}
          tone={vacancyPct > 20 ? 'critical' : vacancyPct > 10 ? 'warn' : 'positive'}
          icon={<UserRoundX className="h-4 w-4" />}
          background="green"
        />
        <MetricCard
          label={t('Buildings below threshold')}
          value={belowThreshold}
          support={t('Condition under {0} of 100', INFRA_THRESHOLD)}
          tone={belowThreshold > 0 ? 'warn' : 'positive'}
          icon={<Warehouse className="h-4 w-4" />}
        />
      </MetricGrid>

      {/* Two columns. The estate register and the vacancy ranking — what the
          department is held to account for — carry the width; the composition
          of the estate and the ratio a classroom actually experiences read
          down the narrower column beside them. */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-4 xl:col-span-8">
          <GovPanel title={t('School register')} tone="amber" dense>
            <p className="px-3 pt-3 pb-2 text-xs leading-relaxed text-ink-500">
              {t('Every municipal school within your authorised ward scope.')}
            </p>
            {filtered.length === 0 ? (
              <EmptyState title={t('No schools match the current filters')} detail="Clear a filter to widen the register." />
            ) : (
              <DataTable rows={filtered} columns={columns} rowKey={(r) => r.id} pageSize={15} />
            )}
          </GovPanel>

          <GovPanel title={t('Wards by teaching vacancy')} tone="red" dense>
            <p className="px-3 pt-3 pb-2 text-xs leading-relaxed text-ink-500">
              {t('Where the gap between sanctioned and filled teaching posts is widest. A vacancy is a class without a teacher, not a line in an establishment register.')}
            </p>
            <div className="px-3 pb-3" style={{ height: Math.max(200, worstVacancy.length * 26) }}>
              <RankedBarChart
                data={worstVacancy.map((w) => ({ label: wardShortName(w.wardId), value: w.teacherVacancyPct }))}
                unit="%"
              />
            </div>
          </GovPanel>
        </div>

        <div className="flex min-w-0 flex-col gap-4 xl:col-span-4">
          <Card tone="info" className="flex items-start gap-3">
            <GraduationCap className="mt-0.5 h-4 w-4 shrink-0 text-govt-600" aria-hidden />
            <div className="min-w-0">
              <p className="text-[0.8125rem] font-semibold text-govt-800">{t('This page holds schools, never pupils')}</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-600">
                {t('Attendance and dropout below are school-level rates. No child&apos;s record, name or individual attendance is held anywhere behind this page, and the education service exposes no method that could return one. A corporation&apos;s duty here is to the school estate and the teaching establishment; the child&apos;s record belongs to the school and stays there.')}
              </p>
            </div>
          </Card>

          <Card className="flex flex-col">
            <p className="label-institutional mb-2">{t('Pupil-teacher ratio')}</p>
            <div className="flex flex-1 flex-col items-center justify-center">
              <p className="numeric text-metric font-semibold text-ink-900">{pupilTeacher}</p>
              <p className="mt-1 text-[0.6875rem] text-ink-500">{t('children per teacher in post')}</p>
              <p className="mt-3 max-w-[15rem] text-center text-[0.6875rem] leading-relaxed text-ink-500">
                {t('Calculated against teachers actually in position, not against sanctioned strength - the ratio a classroom experiences rather than the one the establishment register shows.')}
              </p>
            </div>
          </Card>

          <Card className="flex flex-col">
            <p className="label-institutional mb-2">{t('Medium of instruction')}</p>
            <div style={{ height: 190 }}>
              <DonutChart
                data={byMedium.map((m) => ({ label: SCHOOL_MEDIUM_LABEL[m.medium], value: m.count, colour: MEDIUM_COLOUR[m.medium] }))}
                centreValue={String(filtered.length)}
                centreLabel="schools"
              />
            </div>
          </Card>

          <Card className="flex flex-col">
            <p className="label-institutional mb-2">{t('Schools by level')}</p>
            <div style={{ height: 190 }}>
              <CategoryBarChart
                data={byLevel}
                series={[{ key: 'value', label: t('Schools'), colour: CHART_COLOURS.primary }]}
              />
            </div>
          </Card>
        </div>
      </div>
    </PageBody>
  )
}

export default EducationIntelligencePage
