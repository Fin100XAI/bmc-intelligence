import { useMemo } from 'react'
import { Accessibility, Clock3, HandCoins, HeartHandshake, Users } from 'lucide-react'
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
import { welfareService } from '@/services'
import { useFilterStore } from '@/stores/ui.store'
import { usePageMasthead } from '@/stores/masthead.store'
import { wardName, wardShortName } from '@/data/reference'
import {
  ACCESSIBILITY_FACILITY_KIND_LABEL,
  WELFARE_SCHEME_KIND_LABEL,
  type AccessibilityAudit,
  type WelfareScheme,
} from '@/types/welfare'
import type { DataFreshness } from '@/types/common'
import { DEMO_NOW } from '@/utils/deterministic'
import { formatCrore, formatDate, formatNumber, formatRelative } from '@/utils/format'
import { t } from '@/i18n'

/**
 * src/pages/city/SocialWelfarePage.tsx
 *
 * Social welfare and accessibility.
 *
 * Function 9 of the Twelfth Schedule obliges the corporation to safeguard the
 * interests of weaker sections of society, including persons with disabilities.
 * This page reports on how well it is discharging that duty, and it is built
 * around one measure in particular.
 *
 * THE MEASURE THAT MATTERS IS THE COVERAGE GAP - eligible residents who are not
 * enrolled. A scheme that reaches eighty per cent of those entitled to it is
 * ordinarily written up as a success, and it is failing the other twenty per
 * cent silently. Those residents are, by definition, the ones least able to
 * complain about it: an elderly widow whose account was never seeded to her
 * Aadhaar number does not file a grievance, she simply does not get paid, and
 * nothing in a monthly return records that she did not. Every scheme figure on
 * this page therefore appears against its eligible population, so that reach
 * can never be presented here as though it were coverage.
 *
 * TIMELINESS IS PART OF THE ENTITLEMENT. A pension paid late is a pension that
 * did not arrive when the rent was due. Delay and arrears sit in the headline
 * metrics rather than in a service-quality annexe for that reason.
 *
 * ACCESSIBILITY IS A STATUTORY DUTY, NOT A COURTESY. Sections 40 to 46 of the
 * Rights of Persons with Disabilities Act, 2016 oblige the corporation to make
 * its buildings and public facilities accessible against notified harmonised
 * guidelines. A ward office a resident cannot enter is a place where an
 * entitlement cannot be claimed, which turns a building defect into a
 * withheld payment.
 *
 * NO RESIDENT APPEARS ON THIS PAGE. The unit of record is the SCHEME and the
 * FACILITY. There is no name, no age, no disability, no bank account and no
 * entitlement determination anywhere behind it, and there must never be one.
 */

/** Coverage below this is treated as a finding rather than as performance. */
const COVERAGE_EXPECTATION_PCT = 85
/** Beyond this, a payment has missed the month it was owed for. */
const DELAY_TOLERANCE_DAYS = 15

function pct(part: number, whole: number): number {
  if (whole <= 0) return 0
  return Math.round((part / whole) * 1000) / 10
}

/** The five recorded harmonised-guideline checks, as a compact row. */
function ComplianceChecks({ audit }: { audit: AccessibilityAudit }): React.JSX.Element {
  const checks: Array<[string, string, boolean]> = [
    ['Ramp', 'Ramp at the principal entrance, within gradient', audit.rampCompliant],
    ['Lift', 'Lift serving every floor where a service is delivered', audit.liftAvailable],
    ['Toilet', 'Accessible toilet available during public hours', audit.accessibleToilet],
    ['Tactile', 'Tactile guiding path from entrance to counter', audit.tactilePaving],
    ['Signage', 'Large-print and Braille signage at decision points', audit.signageCompliant],
  ]
  return (
    <span className="flex flex-wrap gap-1">
      {checks.map(([label, description, met]) => (
        <Badge key={label} tone={met ? 'positive' : 'critical'} size="xs" title={`${description}: ${met ? 'compliant' : 'not compliant'}`} dot>
          {label}
        </Badge>
      ))}
    </span>
  )
}

export function SocialWelfarePage(): React.JSX.Element {
  usePageMasthead(
    t('Social Welfare & Accessibility'),
    t('The corporation\'s duty to weaker sections of society and to persons with disabilities - who is entitled, who is enrolled, who was actually paid, and whether the corporation\'s own buildings can be entered by the residents they serve.'),
  )

  const filters = useFilterStore((s) => s.filters)

  const schemesQuery = useServiceQuery(queryKeys.welfare('schemes'), (u) => welfareService.schemes(u))
  const auditsQuery = useServiceQuery(queryKeys.welfare('accessibility'), (u) => welfareService.accessibilityAudits(u))
  const trendQuery = useServiceQuery(queryKeys.welfare('trend'), (u) => welfareService.trend(u))

  const schemes = useMemo(() => schemesQuery.data ?? [], [schemesQuery.data])
  const audits = useMemo(() => auditsQuery.data ?? [], [auditsQuery.data])
  const trend = useMemo(() => trendQuery.data ?? [], [trendQuery.data])

  // Schemes are corporation-wide instruments and carry no ward, so only the
  // search term narrows them. Applying a ward filter to a pension scheme would
  // silently drop it from the coverage figures, which is the one thing this
  // page must not do.
  const filteredSchemes = useMemo(() => {
    const q = filters.search.trim().toLowerCase()
    if (!q) return schemes
    return schemes.filter(
      (s) => s.name.toLowerCase().includes(q) || WELFARE_SCHEME_KIND_LABEL[s.kind].toLowerCase().includes(q),
    )
  }, [schemes, filters.search])

  const filteredAudits = useMemo(
    () =>
      audits.filter((a) => {
        if (filters.wardIds.length > 0 && !filters.wardIds.includes(a.wardId)) return false
        if (filters.search.trim()) {
          const q = filters.search.trim().toLowerCase()
          if (!a.facilityName.toLowerCase().includes(q) && !wardName(a.wardId).toLowerCase().includes(q)) return false
        }
        return true
      }),
    [audits, filters],
  )

  if (schemesQuery.isLoading || auditsQuery.isLoading || trendQuery.isLoading) {
    return (
      <PageBody>
        <PageHeader
          eyebrow={t('City Intelligence')}
          breadcrumbs={[{ label: t('City Intelligence') }, { label: t('Social Welfare & Accessibility') }]}
        />
        <LoadingState variant="metrics" />
        <LoadingState variant="table" rows={8} />
      </PageBody>
    )
  }

  if (schemesQuery.error || auditsQuery.error || trendQuery.error) {
    return (
      <PageBody>
        <PageHeader
          eyebrow={t('City Intelligence')}
          breadcrumbs={[{ label: t('City Intelligence') }, { label: t('Social Welfare & Accessibility') }]}
        />
        <ErrorState
          detail={(schemesQuery.error ?? auditsQuery.error ?? trendQuery.error)?.message}
          onRetry={() => {
            void schemesQuery.refetch()
            void auditsQuery.refetch()
            void trendQuery.refetch()
          }}
        />
      </PageBody>
    )
  }

  const eligible = filteredSchemes.reduce((s, x) => s + x.eligibleBeneficiaries, 0)
  const enrolled = filteredSchemes.reduce((s, x) => s + x.enrolledBeneficiaries, 0)
  const paid = filteredSchemes.reduce((s, x) => s + x.disbursedThisMonth, 0)
  const coveragePct = pct(enrolled, eligible)
  const coverageGap = Math.max(0, eligible - enrolled)
  const unpaidEnrolled = Math.max(0, enrolled - paid)

  const meanDelay = filteredSchemes.length
    ? Math.round((filteredSchemes.reduce((s, x) => s + x.meanDisbursementDelayDays, 0) / filteredSchemes.length) * 10) /
      10
    : 0
  const arrearsLakh = Math.round(filteredSchemes.reduce((s, x) => s + x.arrearsLakh, 0) * 10) / 10
  const monthlyValueLakh =
    Math.round(
      (filteredSchemes.reduce((s, x) => s + x.disbursedThisMonth * x.monthlyEntitlementRupees, 0) / 100_000) * 10,
    ) / 10

  const meanCompliance = filteredAudits.length
    ? Math.round((filteredAudits.reduce((s, a) => s + a.overallCompliancePct, 0) / filteredAudits.length) * 10) / 10
    : 0
  const fullyCompliant = filteredAudits.filter(
    (a) => a.rampCompliant && a.liftAvailable && a.accessibleToilet && a.tactilePaving && a.signageCompliant,
  ).length
  const noRamp = filteredAudits.filter((a) => !a.rampCompliant).length

  const slowest = [...filteredSchemes].sort((a, b) => b.meanDisbursementDelayDays - a.meanDisbursementDelayDays).slice(0, 10)
  const widestGap = [...filteredSchemes].sort(
    (a, b) =>
      b.eligibleBeneficiaries - b.enrolledBeneficiaries - (a.eligibleBeneficiaries - a.enrolledBeneficiaries),
  )[0]

  const freshness: DataFreshness = {
    generatedAt: DEMO_NOW.toISOString(),
    sourceObservedAt: DEMO_NOW.toISOString(),
    refreshIntervalMinutes: 1440,
    origin: 'demonstration',
    sourceState: 'operational',
    stale: false,
  }

  const schemeColumns: Array<Column<WelfareScheme>> = [
    {
      id: 'name',
      header: t('Scheme'),
      cell: (s) => <span className="font-medium text-ink-900">{s.name}</span>,
      sortValue: (s) => s.name,
      searchValue: (s) => s.name,
      width: 'minmax(16rem,2fr)',
    },
    {
      id: 'kind',
      header: t('Benefit'),
      cell: (s) => (
        <Badge tone="neutral" size="sm">
          {WELFARE_SCHEME_KIND_LABEL[s.kind]}
        </Badge>
      ),
      sortValue: (s) => WELFARE_SCHEME_KIND_LABEL[s.kind],
      hideBelow: 'lg',
    },
    {
      id: 'eligible',
      header: t('Eligible'),
      cell: (s) => <span className="numeric">{formatNumber(s.eligibleBeneficiaries)}</span>,
      sortValue: (s) => s.eligibleBeneficiaries,
      align: 'right',
      hideBelow: 'md',
    },
    {
      id: 'enrolled',
      header: t('Enrolled'),
      cell: (s) => <span className="numeric">{formatNumber(s.enrolledBeneficiaries)}</span>,
      sortValue: (s) => s.enrolledBeneficiaries,
      align: 'right',
    },
    {
      id: 'gap',
      header: t('Coverage gap'),
      cell: (s) => {
        const gap = s.eligibleBeneficiaries - s.enrolledBeneficiaries
        const share = pct(s.enrolledBeneficiaries, s.eligibleBeneficiaries)
        return (
          <span
            className={share < COVERAGE_EXPECTATION_PCT ? 'numeric font-semibold text-crit-600' : 'numeric text-ink-700'}
            title={t('{0} eligible residents are not enrolled - {1}% coverage', formatNumber(gap), share)}
          >
            {formatNumber(gap)}
          </span>
        )
      },
      sortValue: (s) => s.eligibleBeneficiaries - s.enrolledBeneficiaries,
      align: 'right',
    },
    {
      id: 'coverage',
      header: t('Coverage'),
      cell: (s) => {
        const share = pct(s.enrolledBeneficiaries, s.eligibleBeneficiaries)
        return (
          <span className={share < COVERAGE_EXPECTATION_PCT ? 'numeric font-semibold text-warn-700' : 'numeric text-ink-700'}>
            {share}%
          </span>
        )
      },
      sortValue: (s) => pct(s.enrolledBeneficiaries, s.eligibleBeneficiaries),
      align: 'right',
    },
    {
      id: 'paid',
      header: t('Paid this month'),
      cell: (s) => (
        <span className="numeric" title={t('{0} enrolled residents were not paid this month', formatNumber(Math.max(0, s.enrolledBeneficiaries - s.disbursedThisMonth)))}>
          {formatNumber(s.disbursedThisMonth)}
        </span>
      ),
      sortValue: (s) => s.disbursedThisMonth,
      align: 'right',
      hideBelow: 'xl',
    },
    {
      id: 'entitlement',
      header: t('Entitlement'),
      cell: (s) => <span className="numeric">₹{formatNumber(s.monthlyEntitlementRupees)}</span>,
      sortValue: (s) => s.monthlyEntitlementRupees,
      align: 'right',
      hideBelow: 'xl',
    },
    {
      id: 'delay',
      header: t('Mean delay'),
      cell: (s) => (
        <span
          className={
            s.meanDisbursementDelayDays > DELAY_TOLERANCE_DAYS
              ? 'numeric font-semibold text-crit-600'
              : 'numeric text-ink-700'
          }
        >
          {s.meanDisbursementDelayDays} d
        </span>
      ),
      sortValue: (s) => s.meanDisbursementDelayDays,
      align: 'right',
    },
    {
      id: 'arrears',
      header: t('Arrears'),
      cell: (s) => <span className="numeric">{t('₹{0} L', formatNumber(s.arrearsLakh, 1))}</span>,
      sortValue: (s) => s.arrearsLakh,
      align: 'right',
      hideBelow: 'md',
    },
    { id: 'state', header: t('State'), cell: (s) => <StateBadge state={s.state} />, sortValue: (s) => s.state },
  ]

  const auditColumns: Array<Column<AccessibilityAudit>> = [
    {
      id: 'facility',
      header: t('Facility'),
      cell: (a) => <span className="font-medium text-ink-900">{a.facilityName}</span>,
      sortValue: (a) => a.facilityName,
      searchValue: (a) => a.facilityName,
      width: 'minmax(14rem,1.7fr)',
    },
    {
      id: 'ward',
      header: t('Ward'),
      cell: (a) => wardShortName(a.wardId),
      sortValue: (a) => wardName(a.wardId),
      hideBelow: 'sm',
    },
    {
      id: 'kind',
      header: t('Type'),
      cell: (a) => (
        <Badge tone="neutral" size="sm">
          {ACCESSIBILITY_FACILITY_KIND_LABEL[a.facilityKind]}
        </Badge>
      ),
      sortValue: (a) => ACCESSIBILITY_FACILITY_KIND_LABEL[a.facilityKind],
      hideBelow: 'lg',
    },
    {
      id: 'checks',
      header: t('Harmonised guideline checks'),
      cell: (a) => <ComplianceChecks audit={a} />,
      width: 'minmax(15rem,1.6fr)',
      hideBelow: 'lg',
    },
    {
      id: 'compliance',
      header: t('Compliance'),
      cell: (a) => (
        <span
          className={
            a.overallCompliancePct < 50
              ? 'numeric font-semibold text-crit-600'
              : a.overallCompliancePct < 75
                ? 'numeric font-semibold text-warn-700'
                : 'numeric text-ink-700'
          }
        >
          {a.overallCompliancePct}%
        </span>
      ),
      sortValue: (a) => a.overallCompliancePct,
      align: 'right',
    },
    {
      id: 'audited',
      header: t('Last audited'),
      cell: (a) => (
        <span className="text-ink-600" title={formatDate(a.lastAuditedAt)}>
          {formatRelative(a.lastAuditedAt)}
        </span>
      ),
      sortValue: (a) => a.lastAuditedAt,
      hideBelow: 'md',
    },
  ]

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('City Intelligence')}
        breadcrumbs={[{ label: t('City Intelligence') }, { label: t('Social Welfare & Accessibility') }]}
        freshness={freshness}
      />

      <DemonstrationNotice />

      <FilterBar show={['ward', 'search']} searchPlaceholder="Search schemes and facilities" />

      <MetricGrid columns={4}>
        <MetricCard
          label={t('Coverage gap')}
          value={formatNumber(coverageGap)}
          support={t('{0} enrolled of {1} eligible · {2}% coverage', formatNumber(enrolled), formatNumber(eligible), coveragePct)}
          tone={coveragePct < COVERAGE_EXPECTATION_PCT ? 'critical' : 'positive'}
          icon={<Users className="h-4 w-4" />}
          progress={{ value: coveragePct, max: 100 }}
          explanation="Eligible residents who are not enrolled on any scheme they qualify for. This is the number that describes who the corporation is failing; enrolment on its own describes only who it has already found."
        />
        <MetricCard
          label={t('Mean disbursement delay')}
          value={meanDelay}
          unit=" days"
          support={t('{0} enrolled residents not paid this month', formatNumber(unpaidEnrolled))}
          tone={meanDelay > DELAY_TOLERANCE_DAYS ? 'critical' : meanDelay > 8 ? 'warn' : 'positive'}
          icon={<Clock3 className="h-4 w-4" />}
          explanation="Days from the entitlement falling due to the money reaching the beneficiary's account. Beyond a fortnight the payment has missed the month it was owed for."
        />
        <MetricCard
          label={t('Arrears outstanding')}
          value={formatCrore(arrearsLakh / 100)}
          support={t('Against {0} disbursed this month', formatCrore(monthlyValueLakh / 100))}
          tone={arrearsLakh > monthlyValueLakh ? 'critical' : arrearsLakh > monthlyValueLakh * 0.4 ? 'warn' : 'positive'}
          icon={<HandCoins className="h-4 w-4" />}
        />
        <MetricCard
          label={t('Accessibility compliance')}
          value={meanCompliance}
          unit="%"
          support={t('{0} of {1} facilities meet every recorded check', formatNumber(fullyCompliant), formatNumber(filteredAudits.length))}
          tone={meanCompliance < 50 ? 'critical' : meanCompliance < 75 ? 'warn' : 'positive'}
          icon={<Accessibility className="h-4 w-4" />}
          explanation="Mean compliance of audited municipal facilities against the harmonised guidelines notified under the Rights of Persons with Disabilities Act, 2016. This is a statutory duty, not a courtesy."
        />
      </MetricGrid>

      {/* Two columns. The two registers the department answers for — the
          schemes stated against the eligible population, and the accessibility
          audits — carry the width, with the disbursement series beneath them.
          Why the gap is the finding, and where the delay is worst, read down
          the column beside. */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-4 xl:col-span-8">
        <Card flush>
            <CardHeader
              bordered
              icon={<HeartHandshake className="h-4 w-4" />}
            title={t('Welfare schemes')}
            description={t('Central, state and corporation schemes administered by the welfare department, each stated against the residents entitled to it.')}
            actions={
              widestGap ? (
                <Badge tone="warn" size="sm">
                  {t('Widest gap: {0}', widestGap.name.slice(0, 34))}
                </Badge>
              ) : undefined
            }
          />
          {filteredSchemes.length === 0 ? (
            <EmptyState
              title={t('No welfare schemes match the current search')}
              detail="Clear the search term to restore the full register of schemes."
            />
          ) : (
            <DataTable rows={filteredSchemes} columns={schemeColumns} rowKey={(s) => s.id} pageSize={12} />
          )}
        </Card>

        <Card flush>
          <CardHeader
            bordered
            icon={<Accessibility className="h-4 w-4" />}
            title={t('Accessibility audits')}
            description={t('Municipal facilities audited against the harmonised guidelines notified under the Rights of Persons with Disabilities Act, 2016, within your authorised ward scope.')}
            actions={
              noRamp > 0 ? (
                <Badge tone="critical" size="sm">
                  {t('{0} without a compliant ramp', formatNumber(noRamp))}
                </Badge>
              ) : undefined
            }
          />
          {filteredAudits.length === 0 ? (
            <EmptyState
              title={t('No audited facilities match the current filters')}
              detail="Clear a filter to widen the register. A facility with no audit against it is not a facility that is compliant - it is one nobody has looked at."
            />
          ) : (
            <DataTable rows={filteredAudits} columns={auditColumns} rowKey={(a) => a.id} pageSize={12} />
          )}
        </Card>

          <Card className="flex flex-col">
            <p className="label-institutional mb-2">{t('Monthly disbursement and new enrolments')}</p>
            <div style={{ height: 220 }}>
              <CategoryBarChart
                data={trend as unknown as Array<Record<string, string | number>>}
                categoryKey="month"
                showLegend
                series={[
                  { key: 'disbursed', label: t('Disbursed (₹ lakh)'), colour: CHART_COLOURS.primary },
                  { key: 'newEnrolments', label: t('New enrolments'), colour: CHART_COLOURS.intel },
                ]}
              />
            </div>
            <p className="mt-2 text-[0.6875rem] leading-relaxed text-ink-500">
              {t('Money disbursed and residents newly brought onto the rolls are read together deliberately. Disbursement can rise on arrears released to people already enrolled, which moves the financial figure without reaching a single new household - new enrolments are the only line that closes the coverage gap.')}
            </p>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-4 xl:col-span-4">
        <Card tone="info" className="flex items-start gap-3">
          <HeartHandshake className="mt-0.5 h-4 w-4 shrink-0 text-govt-600" aria-hidden />
          <div className="min-w-0">
            <p className="text-[0.8125rem] font-semibold text-govt-800">{t('The coverage gap is the finding, not the enrolment')}</p>
            <p className="mt-1 text-xs leading-relaxed text-ink-600">
              {t('A scheme reaching eighty per cent of the residents entitled to it is reported as a success and is failing the other twenty per cent silently - and those residents are, by definition, the ones least able to complain about it. Every figure below is stated against the eligible population for that reason. Timeliness counts the same way: a pension paid late is a pension that did not arrive when the rent was due.')}
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-ink-600">
              {t('No resident appears anywhere behind this page. The unit of record is the scheme and the facility - there is no name, no age, no disability, no bank account and no entitlement determination held here, and there will not be one.')}
            </p>
          </div>
        </Card>

          <Card flush className="flex flex-col">
            <CardHeader
              bordered
              title={t('Longest disbursement delay')}
              description={t('Where the entitlement is settled but the money has not yet arrived.')}
            />
            <div className="px-4 pb-4" style={{ height: Math.max(210, slowest.length * 26) }}>
              {slowest.length === 0 ? (
                <EmptyState title={t('No schemes match the current search')} detail="Clear the search to restore the register." compact />
              ) : (
                <RankedBarChart
                  data={slowest.map((s) => ({ label: s.name.slice(0, 24), value: s.meanDisbursementDelayDays }))}
                  unit=" d"
                />
              )}
            </div>
          </Card>

        </div>
      </div>
    </PageBody>
  )
}

export default SocialWelfarePage
