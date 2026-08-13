import { useState } from 'react'
import { AlertTriangle, Link2, ShieldAlert } from 'lucide-react'
import { PageBody, PageHeader, SplitLayout } from '@/components/layout/PageHeader'
import { Badge, ClassificationBadge, StateBadge } from '@/components/ui/badges'
import { Card, CardHeader, DefinitionList, DefinitionRow, MetricGrid } from '@/components/ui/primitives'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { DemonstrationNotice, EmptyState, ErrorState, LoadingState } from '@/components/ui/states'
import { useServiceQuery } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { municipality } from '@/config/municipality.config'
import { adminService } from '@/services'
import { usePageMasthead } from '@/stores/masthead.store'
import { departmentName, officerDisplayName } from '@/data/reference'
import { formatRelative } from '@/utils/format'
import { CONNECTOR_TYPE_LABEL, type Connector } from '@/types/governance'
import { DOMAIN_LABEL } from '@/types/common'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/**
 * src/pages/admin/ConnectorsPage.tsx
 *
 * The connector configuration register - administration's view of the same
 * integration registry Trust Centre → Integration Health presents as an
 * operational health surface. This page is framed around provisioning:
 * ownership, authentication mode and what remains before a connector could
 * ever be pointed at a live departmental system.
 */

function build$AUTH_LABEL(): Record<Connector['authenticationMode'], string> {
  return {
  mtls: t('Mutual TLS'),
  oauth2: t('OAuth 2.0'),
  'api-key-vault': t('API key (vaulted)'),
  'sftp-key': t('SFTP key exchange'),
  'not-configured': t('Not configured'),
}
}
let AUTH_LABEL: Record<Connector['authenticationMode'], string> = build$AUTH_LABEL()
registerLayer(() => {
  AUTH_LABEL = build$AUTH_LABEL()
})

function provisioningPrerequisite(connector: Connector): string {
  switch (connector.health) {
    case 'review-required':
      return 'Privacy and security review required before any provisioning step may begin.'
    case 'not-connected':
      return 'No adapter provisioned. Requires a departmental data-sharing agreement and an integration design review before development.'
    case 'adapter-ready':
      return 'Adapter contract implemented and tested against the published schema. Awaiting a departmental data-sharing agreement and endpoint provisioning.'
    case 'simulation':
      return 'Operates as a demonstration data simulation. Moving to a live feed requires the same data-sharing agreement and security review as any not-yet-connected adapter.'
    default:
      return 'No prerequisite recorded.'
  }
}

export function ConnectorsPage(): React.JSX.Element {
  const connectorsQuery = useServiceQuery(queryKeys.admin('connectors'), (user) => adminService.connectors(user))
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // The shell renders the masthead; this page states what it should say.
  usePageMasthead(
    t('Connectors'),
    t('The adapter configuration register for every connector this deployment\'s Urban Intelligence Core is capable of provisioning. No connector in this environment is authenticated against, or exchanging data with, a live {0} departmental system.', municipality.shortName),
  )

  if (connectorsQuery.isLoading) return <LoadingState variant="table" />
  if (connectorsQuery.error) {
    return <ErrorState detail={connectorsQuery.error.message} onRetry={() => connectorsQuery.refetch()} />
  }
  const connectors = connectorsQuery.data ?? []
  if (connectors.length === 0) {
    return <EmptyState title={t('No connectors configured')} detail="The connector registry returned no entries." />
  }

  const selected = connectors.find((c) => c.id === selectedId) ?? connectors[0] ?? null
  const requiringReview = connectors.filter((c) => c.health === 'review-required' || c.health === 'not-connected').length
  const notConfigured = connectors.filter((c) => c.authenticationMode === 'not-configured').length

  const columns: Array<Column<Connector>> = [
    {
      id: 'name',
      header: t('Connector'),
      cell: (c) => (
        <div className="min-w-0">
          <p className="font-medium text-ink-800">{c.name}</p>
          <p className="text-[0.6875rem] text-ink-400">{CONNECTOR_TYPE_LABEL[c.type]}</p>
        </div>
      ),
      sortValue: (c) => c.name,
      searchValue: (c) => `${c.name} ${c.targetSystem} ${c.sourceAuthority}`,
    },
    {
      id: 'owner',
      header: t('Owner'),
      cell: (c) => (
        <div className="min-w-0">
          <p className="truncate text-[0.8125rem] text-ink-700">{departmentName(c.ownerDepartmentId)}</p>
          <p className="truncate text-[0.6875rem] text-ink-400">{officerDisplayName(c.ownerOfficerId)}</p>
        </div>
      ),
      sortValue: (c) => departmentName(c.ownerDepartmentId),
      hideBelow: 'lg',
    },
    {
      id: 'auth',
      header: t('Authentication mode'),
      cell: (c) => <Badge tone={c.authenticationMode === 'not-configured' ? 'warn' : 'muted'}>{AUTH_LABEL[c.authenticationMode]}</Badge>,
      sortValue: (c) => c.authenticationMode,
      hideBelow: 'md',
    },
    {
      id: 'environment',
      header: t('Environment'),
      cell: (c) => <Badge tone="intel">{c.environment}</Badge>,
      sortValue: (c) => c.environment,
      hideBelow: 'lg',
    },
    {
      id: 'classification',
      header: t('Classification'),
      cell: (c) => <ClassificationBadge classification={c.classification} />,
      sortValue: (c) => c.classification,
      hideBelow: 'xl',
    },
    {
      id: 'target',
      header: t('Target system'),
      cell: (c) => (
        <div className="min-w-0">
          <p className="text-[0.8125rem] text-ink-700">{c.targetSystem}</p>
          {/* Who operates it. A departmental system can be directed; a state
              or national service has to be requested or subscribed to, and
              that is what determines whether the feed can be provisioned. */}
          <p className="text-[0.6875rem] text-ink-400">{c.sourceAuthority}</p>
        </div>
      ),
      sortValue: (c) => c.targetSystem,
      hideBelow: 'lg',
    },
    {
      id: 'health',
      header: t('State'),
      cell: (c) => <StateBadge state={c.health} />,
      sortValue: (c) => c.health,
    },
  ]

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('Administration')}
        breadcrumbs={[{ label: t('Administration') }, { label: t('Connectors') }]}
      />

      <MetricGrid columns={4}>
        <Card>
          <p className="label-institutional">{t('Connectors configured')}</p>
          <p className="numeric mt-2 text-metric font-semibold text-ink-900">{connectors.length}</p>
        </Card>
        <Card tone={requiringReview > 0 ? 'warn' : 'default'}>
          <p className="label-institutional">{t('Requiring review or agreement')}</p>
          <p className="numeric mt-2 text-metric font-semibold text-ink-900">{requiringReview}</p>
        </Card>
        <Card>
          <p className="label-institutional">{t('Adapter ready')}</p>
          <p className="numeric mt-2 text-metric font-semibold text-ink-900">
            {connectors.filter((c) => c.health === 'adapter-ready').length}
          </p>
        </Card>
        <Card tone={notConfigured > 0 ? 'critical' : 'default'}>
          <p className="label-institutional">{t('Authentication not configured')}</p>
          <p className="numeric mt-2 text-metric font-semibold text-ink-900">{notConfigured}</p>
        </Card>
      </MetricGrid>

      <Card flush>
        <CardHeader className="p-4" icon={<Link2 className="h-4 w-4" />} title={t('Connector configuration register')} />
        <SplitLayout
          className="px-4 pb-4"
          asideWidth="lg"
          main={
            <DataTable
              rows={connectors}
              columns={columns}
              rowKey={(c) => c.id}
              onRowClick={(c) => setSelectedId(c.id)}
              activeRowKey={selected?.id}
              searchable
              searchPlaceholder="Search connectors"
              pageSize={10}
              initialSort={{ columnId: 'name', direction: 'asc' }}
            />
          }
          aside={
            selected ? (
              <Card tone="sunken">
                <div className="flex items-center gap-1.5">
                  <StateBadge state={selected.health} />
                  <Badge tone="muted">{DOMAIN_LABEL[selected.domain]}</Badge>
                </div>
                <p className="mt-2 text-[0.8125rem] font-semibold text-ink-900">{selected.name}</p>
                <DefinitionList className="mt-3">
                  <DefinitionRow label={t('Type')}>{CONNECTOR_TYPE_LABEL[selected.type]}</DefinitionRow>
                  <DefinitionRow label={t('Owner department')}>{departmentName(selected.ownerDepartmentId)}</DefinitionRow>
                  <DefinitionRow label={t('Owner officer')}>{officerDisplayName(selected.ownerOfficerId)}</DefinitionRow>
                  <DefinitionRow label={t('Target system')}>{selected.targetSystem}</DefinitionRow>
                  <DefinitionRow label={t('Operated by')}>{selected.sourceAuthority}</DefinitionRow>
                  <DefinitionRow label={t('Authentication mode')}>{AUTH_LABEL[selected.authenticationMode]}</DefinitionRow>
                  <DefinitionRow label={t('Environment')}>{selected.environment}</DefinitionRow>
                  <DefinitionRow label={t('Classification')}>
                    <ClassificationBadge classification={selected.classification} />
                  </DefinitionRow>
                  <DefinitionRow label={t('Target system')}>{selected.targetSystem}</DefinitionRow>
                  {selected.lastSyncAt ? (
                    <DefinitionRow label={t('Last simulated sync')}>{formatRelative(selected.lastSyncAt)}</DefinitionRow>
                  ) : null}
                  {typeof selected.latencyMs === 'number' ? (
                    <DefinitionRow label={t('Latency')}>{selected.latencyMs} ms</DefinitionRow>
                  ) : null}
                  {typeof selected.qualityScore === 'number' ? (
                    <DefinitionRow label={t('Quality score')}>{selected.qualityScore}/100</DefinitionRow>
                  ) : null}
                </DefinitionList>

                <div className="mt-3 flex items-start gap-2 rounded-md border border-govt-200 bg-govt-50/60 px-2.5 py-2">
                  {selected.health === 'review-required' ? (
                    <ShieldAlert className="mt-px h-3.5 w-3.5 shrink-0 text-crit-600" />
                  ) : (
                    <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-govt-600" />
                  )}
                  <div className="min-w-0">
                    <p className="text-[0.6875rem] font-semibold text-ink-800">{t('Provisioning prerequisite')}</p>
                    <p className="mt-0.5 text-[0.6875rem] leading-relaxed text-ink-600">
                      {provisioningPrerequisite(selected)}
                    </p>
                  </div>
                </div>

                <p className="mt-3 border-t border-ink-100 pt-2 text-[0.6875rem] leading-relaxed text-ink-500">
                  {selected.notes}
                </p>
              </Card>
            ) : (
              <EmptyState title={t('Select a connector')} compact />
            )
          }
        />
      </Card>

      <DemonstrationNotice />
    </PageBody>
  )
}

export default ConnectorsPage
