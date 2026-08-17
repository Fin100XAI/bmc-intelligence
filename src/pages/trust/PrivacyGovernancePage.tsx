import { useMemo, useState } from 'react'
import { AlertTriangle, Eye, EyeOff } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageBody, PageHeader, SplitLayout } from '@/components/layout/PageHeader'
import { Badge, ClassificationBadge } from '@/components/ui/badges'
import { Card, DefinitionList, DefinitionRow, Input, Label, MetricGrid, Select } from '@/components/ui/primitives'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { DemonstrationNotice, EmptyState, ErrorState, LoadingState } from '@/components/ui/states'
import { GovPanel } from '@/components/gov/GovPanel'
import { governanceService, securityService, type DatasetFilters } from '@/services'
import { useServiceQuery } from '@/hooks'
import { usePageMasthead } from '@/stores/masthead.store'
import { getRole } from '@/security'
import { departmentName, officerDisplayName } from '@/data/reference'
import { formatCompact, formatDate, formatRelative } from '@/utils/format'
import { CLASSIFICATION_LABEL, DOMAIN_LABEL, type DataClassification, type IntelligenceDomain } from '@/types/common'
import type { Dataset } from '@/types/governance'
import { ROUTES } from '@/config/navigation'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/**
 * src/pages/trust/PrivacyGovernancePage.tsx
 *
 * The dataset register, read live through `governanceService.datasets` -
 * gated twice: the permission engine, and then each dataset's own declared
 * `allowedRoles` and the principal's classification ceiling. A dataset the
 * principal may not read is omitted entirely, never returned redacted -
 * `governanceService.summary` states how many were withheld without
 * disclosing which.
 */

const SENSITIVITY_TONE: Record<Dataset['sensitivity'], 'neutral' | 'info' | 'warn' | 'critical'> = {
  none: 'neutral',
  low: 'info',
  moderate: 'warn',
  high: 'critical',
}

function build$SHARING_LABEL(): Record<Dataset['sharingStatus'], string> {
  return {
  'internal-only': t('Internal only'),
  'inter-departmental': 'Inter-departmental',
  'state-shared': 'State-shared',
  restricted: t('Restricted'),
}
}
let SHARING_LABEL: Record<Dataset['sharingStatus'], string> = build$SHARING_LABEL()
registerLayer(() => {
  SHARING_LABEL = build$SHARING_LABEL()
})

const SHARING_TONE: Record<Dataset['sharingStatus'], 'neutral' | 'info' | 'intel' | 'critical'> = {
  'internal-only': 'neutral',
  'inter-departmental': 'info',
  'state-shared': 'intel',
  restricted: 'critical',
}

export function PrivacyGovernancePage(): React.JSX.Element {
  // The shell's masthead carries the screen's name; the page states the wording.
  usePageMasthead(t('Privacy & Data Governance'))

  const [domainFilter, setDomainFilter] = useState<IntelligenceDomain | ''>('')
  const [classificationFilter, setClassificationFilter] = useState<DataClassification | ''>('')
  const [personalDataFilter, setPersonalDataFilter] = useState<'' | 'yes' | 'no'>('')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const filters: DatasetFilters = useMemo(() => {
    const f: DatasetFilters = {}
    if (domainFilter) f.domain = domainFilter
    if (classificationFilter) f.classification = classificationFilter
    if (personalDataFilter) f.containsPersonalData = personalDataFilter === 'yes'
    if (search.trim()) f.search = search.trim()
    return f
  }, [domainFilter, classificationFilter, personalDataFilter, search])

  const datasetsQuery = useServiceQuery(
    ['trust-privacy-governance', 'datasets', JSON.stringify(filters)],
    (user) => governanceService.datasets(user, filters),
  )
  const summaryQuery = useServiceQuery(['trust-privacy-governance', 'summary'], (user) => governanceService.summary(user))
  const personalDataQuery = useServiceQuery(['trust-privacy-governance', 'personal-data'], (user) => governanceService.personalData(user))
  const policiesQuery = useServiceQuery(['trust-privacy-governance', 'policies'], (user) => securityService.policies(user))

  if (datasetsQuery.isLoading || summaryQuery.isLoading) return <LoadingState variant="metrics" />
  if (datasetsQuery.error) return <ErrorState detail={datasetsQuery.error.message} onRetry={() => datasetsQuery.refetch()} />
  if (summaryQuery.error) return <ErrorState detail={summaryQuery.error.message} onRetry={() => summaryQuery.refetch()} />

  const datasets = datasetsQuery.data ?? []
  const summary = summaryQuery.data
  const personalData = personalDataQuery.data ?? []
  const selected = datasets.find((d) => d.id === selectedId) ?? datasets[0]

  const columns: Array<Column<Dataset>> = [
    {
      id: 'name',
      header: t('Dataset'),
      cell: (d) => (
        <div className="min-w-0">
          <p className="font-medium text-ink-800">{d.name}</p>
          <p className="mt-0.5 line-clamp-1 text-[0.6875rem] text-ink-400">{d.description}</p>
        </div>
      ),
      sortValue: (d) => d.name,
      searchValue: (d) => `${d.name} ${d.description} ${d.purpose} ${d.sourceSystem}`,
    },
    {
      id: 'owner',
      header: t('Owner'),
      cell: (d) => (
        <div className="min-w-0">
          <p className="truncate text-[0.8125rem] text-ink-700">{departmentName(d.ownerDepartmentId)}</p>
          <p className="truncate text-[0.6875rem] text-ink-400">{officerDisplayName(d.ownerOfficerId)}</p>
        </div>
      ),
      sortValue: (d) => departmentName(d.ownerDepartmentId),
      hideBelow: 'lg',
    },
    {
      id: 'domain',
      header: t('Domain'),
      cell: (d) => <Badge tone="muted">{DOMAIN_LABEL[d.domain]}</Badge>,
      sortValue: (d) => DOMAIN_LABEL[d.domain],
      hideBelow: 'lg',
    },
    {
      id: 'classification',
      header: t('Classification'),
      cell: (d) => <ClassificationBadge classification={d.classification} />,
      sortValue: (d) => d.classification,
    },
    {
      id: 'sensitivity',
      header: t('Sensitivity'),
      cell: (d) => <Badge tone={SENSITIVITY_TONE[d.sensitivity]}>{d.sensitivity}</Badge>,
      sortValue: (d) => d.sensitivity,
      hideBelow: 'xl',
    },
    {
      id: 'personalData',
      header: t('Personal data'),
      cell: (d) =>
        d.containsPersonalData ? (
          <Badge tone="warn" dot>
            {t('Contains personal data')}
          </Badge>
        ) : (
          <span className="text-ink-300">{t('None')}</span>
        ),
      sortValue: (d) => (d.containsPersonalData ? 1 : 0),
    },
    {
      id: 'quality',
      header: t('Quality'),
      cell: (d) => <span className="numeric">{d.qualityScore}/100</span>,
      sortValue: (d) => d.qualityScore,
      align: 'right',
      hideBelow: 'lg',
    },
    {
      id: 'records',
      header: t('Records'),
      cell: (d) => <span className="numeric">{formatCompact(d.recordCount)}</span>,
      sortValue: (d) => d.recordCount,
      align: 'right',
      hideBelow: 'lg',
    },
    {
      id: 'refreshed',
      header: t('Last refreshed'),
      cell: (d) => formatRelative(d.lastRefreshedAt),
      sortValue: (d) => d.lastRefreshedAt,
      hideBelow: 'xl',
    },
  ]

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('Trust Centre')}
        breadcrumbs={[{ label: t('Trust Centre'), to: '/trust' }, { label: t('Privacy & Data Governance') }]}
      />

      {summary ? (
        <MetricGrid columns={6}>
          <Card>
            <p className="label-institutional">{t('Datasets in register')}</p>
            <p className="numeric mt-2 text-metric font-semibold text-ink-900">{summary.total}</p>
          </Card>
          <Card tone={summary.withPersonalData > 0 ? 'warn' : 'default'}>
            <p className="label-institutional">{t('Contain personal data')}</p>
            <p className="numeric mt-2 text-metric font-semibold text-ink-900">{summary.withPersonalData}</p>
          </Card>
          <Card>
            <p className="label-institutional">{t('Restricted classification')}</p>
            <p className="numeric mt-2 text-metric font-semibold text-ink-900">{summary.restricted}</p>
          </Card>
          <Card>
            <p className="label-institutional">{t('Average quality')}</p>
            <p className="numeric mt-2 text-metric font-semibold text-ink-900">{summary.averageQuality}/100</p>
          </Card>
          <Card>
            <p className="label-institutional">{t('Shortest retention')}</p>
            <p className="numeric mt-2 text-metric font-semibold text-ink-900">{summary.shortestRetentionMonths}mo</p>
          </Card>
          <Card tone={summary.withheldFromPrincipal > 0 ? 'critical' : 'default'}>
            <p className="label-institutional">{t('Withheld from you')}</p>
            <p className="numeric mt-2 text-metric font-semibold text-ink-900">{summary.withheldFromPrincipal}</p>
          </Card>
        </MetricGrid>
      ) : null}

      {summary && summary.withheldFromPrincipal > 0 ? (
        <Card tone="critical">
          <div className="flex items-start gap-2.5">
            <EyeOff className="mt-0.5 h-4 w-4 shrink-0 text-crit-700" />
            <p className="text-[0.8125rem] leading-relaxed text-ink-800">
              <span className="font-semibold">{t('{0} dataset(s)', summary.withheldFromPrincipal)}</span>{' '}{t('exist in this platform&apos;s governance register that your current role and classification ceiling do not permit you to read. Consistent with least privilege, this page does not disclose which - a dataset you may not read is omitted entirely, not shown redacted. If you believe this is incorrect for your responsibilities, raise a scope review through Access Governance.')}
            </p>
          </div>
        </Card>
      ) : summary ? (
        <Card tone="positive">
          <div className="flex items-start gap-2.5">
            <Eye className="mt-0.5 h-4 w-4 shrink-0 text-ok-700" />
            <p className="text-[0.8125rem] leading-relaxed text-ink-800">
              {t('No dataset in the governance register is currently withheld from your principal - every dataset your role and classification ceiling permit is shown below.')}
            </p>
          </div>
        </Card>
      ) : null}

      {summary && summary.unminimisedPersonalData > 0 ? (
        <Card tone="warn">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn-700" />
            <p className="text-[0.8125rem] leading-relaxed text-ink-800">
              <span className="font-semibold">{t('{0} dataset(s)', summary.unminimisedPersonalData)}</span>{' '}{t('reachable by your principal contain personal data with no minimisation measure currently recorded against them - see &quot;Datasets containing personal data&quot; below for exactly which.')}
            </p>
          </div>
        </Card>
      ) : null}

      <GovPanel title={t('Dataset register')} tone="amber" dense>
        <div className="flex flex-wrap items-center gap-2 px-3 pt-3 pb-3">
          <div className="w-full max-w-56">
            <Label htmlFor="ds-search" className="sr-only">{t('Search datasets')}</Label>
            <Input id="ds-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('Search name, purpose or source')} />
          </div>
          <Select
            value={domainFilter}
            onChange={(e) => setDomainFilter(e.target.value as IntelligenceDomain | '')}
            options={[{ value: '', label: t('All domains') }, ...(Object.keys(DOMAIN_LABEL) as IntelligenceDomain[]).map((d) => ({ value: d, label: DOMAIN_LABEL[d] }))]}
          />
          <Select
            value={classificationFilter}
            onChange={(e) => setClassificationFilter(e.target.value as DataClassification | '')}
            options={[{ value: '', label: t('All classifications') }, ...(Object.keys(CLASSIFICATION_LABEL) as DataClassification[]).map((c) => ({ value: c, label: CLASSIFICATION_LABEL[c] }))]}
          />
          <Select
            value={personalDataFilter}
            onChange={(e) => setPersonalDataFilter(e.target.value as '' | 'yes' | 'no')}
            options={[
              { value: '', label: t('Personal data: any') },
              { value: 'yes', label: t('Contains personal data') },
              { value: 'no', label: t('No personal data') },
            ]}
          />
          <span className="numeric text-xs text-ink-400">{t('{0} dataset(s) matching', datasets.length)}</span>
        </div>

        {datasets.length === 0 ? (
          <EmptyState className="mx-3 mb-3" title={t('No datasets match the current filters')} detail="Widen the filters above, or this may reflect datasets withheld from your principal - see the summary above." />
        ) : (
          <SplitLayout
            className="px-3 pb-3"
            asideWidth="lg"
            main={
              <DataTable
                rows={datasets}
                columns={columns}
                rowKey={(d) => d.id}
                onRowClick={(d) => setSelectedId(d.id)}
                activeRowKey={selected?.id}
                searchable
                searchPlaceholder="Refine within results"
                initialSort={{ columnId: 'personalData', direction: 'desc' }}
              />
            }
            aside={
              selected ? (
                <Card tone="sunken">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <ClassificationBadge classification={selected.classification} />
                    <Badge tone={SENSITIVITY_TONE[selected.sensitivity]}>{selected.sensitivity} sensitivity</Badge>
                    {selected.containsPersonalData ? <Badge tone="warn">{t('Contains personal data')}</Badge> : null}
                  </div>
                  <p className="mt-2 text-[0.8125rem] font-semibold text-ink-900">{selected.name}</p>
                  <p className="mt-1 text-xs leading-relaxed text-ink-600">{selected.description}</p>

                  <DefinitionList className="mt-3">
                    <DefinitionRow label={t('Purpose')}>{selected.purpose}</DefinitionRow>
                    <DefinitionRow label={t('Owner department')}>{departmentName(selected.ownerDepartmentId)}</DefinitionRow>
                    <DefinitionRow label={t('Owner officer')}>{officerDisplayName(selected.ownerOfficerId)}</DefinitionRow>
                    <DefinitionRow label={t('Domain')}>{DOMAIN_LABEL[selected.domain]}</DefinitionRow>
                    <DefinitionRow label={t('Retention')}>{selected.retentionMonths} months</DefinitionRow>
                    <DefinitionRow label={t('Source system')}>{selected.sourceSystem}</DefinitionRow>
                    <DefinitionRow label={t('Sharing status')}>
                      <Badge tone={SHARING_TONE[selected.sharingStatus]}>{SHARING_LABEL[selected.sharingStatus]}</Badge>
                    </DefinitionRow>
                    <DefinitionRow label={t('Quality score')}>{selected.qualityScore}/100</DefinitionRow>
                    <DefinitionRow label={t('Record count')}>{formatCompact(selected.recordCount)}</DefinitionRow>
                    <DefinitionRow label={t('Last refreshed')}>{formatDate(selected.lastRefreshedAt)}</DefinitionRow>
                    <DefinitionRow label={t('Lineage')}>
                      <Link to={`${ROUTES.lineage}?metric=${selected.lineageId}`} className="text-govt-600 hover:underline">
                        {t('Open pipeline →')}
                      </Link>
                    </DefinitionRow>
                  </DefinitionList>

                  <p className="label-institutional mt-3 mb-1.5">{t('Allowed roles ({0})', selected.allowedRoles.length)}</p>
                  <div className="flex flex-wrap gap-1">
                    {selected.allowedRoles.map((r) => (
                      <Badge key={r} tone="muted">
                        {getRole(r)?.name ?? r}
                      </Badge>
                    ))}
                  </div>

                  <p className="label-institutional mt-3 mb-1.5">{t('Minimisation measures applied')}</p>
                  {selected.minimisationApplied.length === 0 ? (
                    <p className="text-[0.6875rem] leading-relaxed text-ink-400">
                      {selected.containsPersonalData
                        ? 'None recorded - this dataset contains personal data with no declared minimisation measure.'
                        : 'None recorded. This dataset does not contain personal data.'}
                    </p>
                  ) : (
                    <ul className="space-y-1">
                      {selected.minimisationApplied.map((m) => (
                        <li key={m} className="flex items-start gap-1.5 text-[0.6875rem] leading-relaxed text-ink-600">
                          <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-ok-500" aria-hidden />
                          {m}
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              ) : (
                <EmptyState title={t('Select a dataset')} compact />
              )
            }
          />
        )}
      </GovPanel>

      {/* Two columns below the register. The personal-data schedule is the
          record an officer works through; the four standing doctrines the
          register is held under — purpose, minimisation, retention, access —
          read down beside it rather than as four more rows to scroll past. */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-4 xl:col-span-8">
      <GovPanel title={t('Datasets containing personal data')} tone="red">
        <p className="mb-3 text-xs leading-relaxed text-ink-500">
          {t('Every dataset carrying personal data reachable by your principal, with exactly what minimisation is applied. A dataset with no recorded measure is flagged, not hidden.')}
        </p>
        {personalDataQuery.isLoading ? (
          <LoadingState variant="inline" />
        ) : personalDataQuery.error ? (
          <ErrorState detail={personalDataQuery.error.message} onRetry={() => personalDataQuery.refetch()} />
        ) : personalData.length === 0 ? (
          <EmptyState compact title={t('No dataset reachable by your principal carries personal data')} />
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-2">
            {personalData.map(({ dataset, minimisation, hasMinimisation }) => (
              <div
                key={dataset.id}
                className={`rounded-md border p-3 ${hasMinimisation ? 'border-ok-100 bg-ok-50/40' : 'border-crit-200 bg-crit-50/50'}`}
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <ClassificationBadge classification={dataset.classification} showIcon={false} />
                  <Badge tone={hasMinimisation ? 'positive' : 'critical'} dot>
                    {hasMinimisation ? 'Minimisation recorded' : 'No minimisation recorded'}
                  </Badge>
                </div>
                <p className="mt-1.5 text-[0.8125rem] font-medium text-ink-800">{dataset.name}</p>
                <p className="mt-1 text-[0.6875rem] text-ink-400">
                  {departmentName(dataset.ownerDepartmentId)} · {dataset.sourceSystem}
                </p>
                {minimisation.length > 0 ? (
                  <ul className="mt-2 space-y-0.5">
                    {minimisation.map((m) => (
                      <li key={m} className="text-[0.6875rem] leading-relaxed text-ink-600">
                        · {m}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-[0.6875rem] leading-relaxed text-crit-700">
                    {t('No minimisation measure declared for this personal-data-bearing dataset.')}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </GovPanel>
        </div>

        <div className="flex min-w-0 flex-col gap-4 xl:col-span-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
        <GovPanel title={t('Purpose limitation')} tone="amber">
          <p className="text-[0.8125rem] leading-relaxed text-ink-700">
            {t('Every dataset in the register above is provisioned against a single declared purpose - the institutional reason the corporation is entitled to hold and process it')}
            {selected ? <>{' '}{t('- for example,')}{' '}{departmentName(selected.ownerDepartmentId)}{t('&apos;s')}{' '}<span className="font-medium">{selected.name}</span>{' '}{t('is held for: &quot;')}{selected.purpose}{t('&quot;')}</> : null}{t('. Intelligence, alerts and decisions derived from a source are used only within that declared purpose; there is no general-purpose data lake in this architecture that records fall into once ingested.')}
          </p>
        </GovPanel>
        <GovPanel title={t('Minimisation')} tone="red">
          <p className="text-[0.8125rem] leading-relaxed text-ink-700">
            {t('Minimisation is applied at the connector boundary, before a record ever reaches the intelligence layer - not as a downstream redaction step. {0} in this register contain personal data; the explicit measure recorded against each - identity fields dropped at ingestion, records aggregated below individual level, or pseudonymisation before analysis - is shown per dataset above, and any gap is flagged rather than assumed.', summary ? `${summary.withPersonalData} dataset(s)` : 'Datasets')}
          </p>
        </GovPanel>
        <GovPanel title={t('Retention')} tone="amber">
          <p className="text-[0.8125rem] leading-relaxed text-ink-700">
            {t('Every dataset carries a declared retention period in months - the shortest currently in the register is {0} months. This demonstration environment does not implement automated deletion at the retention boundary: the in-session store described in Evidence &amp; Audit exists for the lifetime of the browser session, not on a retention schedule. A production deployment must implement enforced deletion, not merely a documented retention figure.', summary?.shortestRetentionMonths ?? '-')}
          </p>
        </GovPanel>
        <GovPanel title={t('Access controls')} tone="green">
          {policiesQuery.isLoading ? (
            <LoadingState variant="inline" />
          ) : policiesQuery.error ? (
            <p className="text-xs text-crit-600">{policiesQuery.error.message}</p>
          ) : (
            <>
              <p className="text-[0.8125rem] leading-relaxed text-ink-700">
                {t('Every dataset read above passes both the role/attribute permission engine and its own declared allowed-role list and classification ceiling. {0} access polic{1} are additionally registered against data-sensitive resources, including:', (policiesQuery.data ?? []).length, (policiesQuery.data ?? []).length === 1 ? 'y' : 'ies')}
              </p>
              <ul className="mt-2 space-y-1.5">
                {(policiesQuery.data ?? [])
                  .filter((p) => p.resourceTypes.includes('revenue') || p.resourceTypes.includes('intelligence') || p.effect === 'deny')
                  .slice(0, 3)
                  .map((p) => (
                    <li key={p.id} className="flex items-start gap-1.5 text-xs leading-relaxed text-ink-600">
                      <Badge tone={p.effect === 'deny' ? 'critical' : 'muted'} size="xs">
                        {p.effect}
                      </Badge>
                      <span>{p.name}</span>
                    </li>
                  ))}
              </ul>
            </>
          )}
        </GovPanel>
      </div>

      <Card tone="warn">
        <p className="text-xs leading-relaxed text-ink-700">
          <span className="font-semibold text-ink-800">{t('Auditability.')}</span>{' '}{t('Opening any evidence record tied to a governed dataset is itself a recorded audit event, attributed to the requesting officer, session and timestamp - see Evidence &amp; Audit for the live trail. No regulatory certification, data protection accreditation or formal privacy attestation is claimed for this environment.')}
        </p>
      </Card>
        </div>
      </div>

      <DemonstrationNotice />
    </PageBody>
  )
}

export default PrivacyGovernancePage
