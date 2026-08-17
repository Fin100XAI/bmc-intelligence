import { useMemo, useState } from 'react'
import { Info, ListChecks, RotateCcw } from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import { Badge, ClassificationBadge, StateBadge } from '@/components/ui/badges'
import {
  Button,
  Card,
  DefinitionList,
  DefinitionRow,
  MetricGrid,
  ProgressBar,
  Select,
} from '@/components/ui/primitives'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Drawer } from '@/components/ui/overlays'
import { DemonstrationNotice, EmptyState, ErrorState, LoadingState } from '@/components/ui/states'
import { ChartFrame } from '@/components/charts/ChartFrame'
import { DonutChart } from '@/components/charts/charts'
import { GovPanel } from '@/components/gov/GovPanel'
import { useServiceQuery } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { connectorService } from '@/services'
import { usePageMasthead } from '@/stores/masthead.store'
import { departmentName, officerDisplayName } from '@/data/reference'
import { formatRelative } from '@/utils/format'
import { DOMAIN_LABEL } from '@/types/common'
import { CONNECTOR_TYPE_LABEL, type Connector } from '@/types/governance'
import type { DataClassification, OperationalState } from '@/types/common'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/**
 * src/pages/trust/IntegrationHealthPage.tsx
 *
 * The honest integration surface. Every connector in this environment is
 * declared in one of four states, and none of them is "live" — that word is
 * deliberately absent from the platform's operational-state vocabulary.
 *
 * The page's working end is the provisioning pack. Nothing on this screen can
 * advance a connector, and it does not pretend otherwise: moving a connector
 * forward is an institutional act — a design review, a signed data-sharing
 * agreement, a completed privacy review — carried out by people, in a sequence
 * this platform does not control. What the page *can* do is name the next step
 * for each connector precisely, let an operator gather the ones they are
 * chasing, and export that as a request pack addressed to the departments who
 * actually hold those steps. A button that claimed to "request access" and
 * merely coloured a chip would be worse than no button.
 */

type ConnectorHealth = Connector['health']

const STATE_EXPLANATION: Record<ConnectorHealth, string> = {
  simulation:
    'The adapter contract is implemented and the connector produces deterministic demonstration data shaped exactly like the target system\'s real feed. No departmental endpoint is contacted.',
  'adapter-ready':
    'The adapter has been built and tested against the target system\'s published schema, but no live endpoint has been provisioned. A departmental data-sharing agreement and endpoint credentials are required before this can move further.',
  'not-connected':
    'No adapter has been provisioned for this source. An integration design review and a departmental data-sharing agreement are required before development begins.',
  'review-required':
    'The source is sensitive enough - or the proposed integration path unusual enough - that a privacy and security review must be completed before any provisioning step, including adapter development, may proceed.',
}

/**
 * The named institutional step that has to happen next, per state. These are
 * people-and-paperwork steps, not engineering tasks, which is why none of them
 * is actionable from this screen.
 */
const NEXT_STEP: Record<ConnectorHealth, string> = {
  simulation:
    'No step outstanding for demonstration use. Moving beyond simulation requires a departmental data-sharing agreement and issued endpoint credentials.',
  'adapter-ready':
    'Departmental data-sharing agreement, then endpoint credentials issued to the platform. The engineering work is complete; the institutional work is not.',
  'not-connected':
    'Integration design review, then a departmental data-sharing agreement, before adapter development may begin.',
  'review-required':
    'Privacy and security review completed and recorded. No provisioning step, including adapter development, may proceed until it is.',
}

/**
 * How far along the provisioning path each state sits, as a share of the four
 * declared gates: design review · data-sharing agreement · adapter built ·
 * endpoint provisioned. Simulation stops at three of four by design — the
 * fourth gate is exactly what this environment does not have.
 */
const PROVISIONING_PROGRESS: Record<ConnectorHealth, number> = {
  'review-required': 0,
  'not-connected': 25,
  'adapter-ready': 50,
  simulation: 75,
}

const DONUT_COLOUR: Record<ConnectorHealth, string> = {
  simulation: '#0ea5b7',
  'adapter-ready': '#2f6feb',
  'not-connected': '#8195ac',
  'review-required': '#f59e0b',
}

function build$HEALTH_LABEL(): Record<ConnectorHealth, string> {
  return {
  simulation: t('Simulation'),
  'adapter-ready': t('Adapter Ready'),
  'not-connected': t('Not Connected'),
  'review-required': t('Review Required'),
}
}
let HEALTH_LABEL: Record<ConnectorHealth, string> = build$HEALTH_LABEL()
registerLayer(() => {
  HEALTH_LABEL = build$HEALTH_LABEL()
})

function build$AUTH_LABEL(): Record<Connector['authenticationMode'], string> {
  return {
  mtls: t('Mutual TLS'),
  oauth2: t('OAuth 2.0'),
  'api-key-vault': t('API key from vault'),
  'sftp-key': t('SFTP key pair'),
  'not-configured': t('Not configured'),
}
}
let AUTH_LABEL: Record<Connector['authenticationMode'], string> = build$AUTH_LABEL()
registerLayer(() => {
  AUTH_LABEL = build$AUTH_LABEL()
})

export function IntegrationHealthPage(): React.JSX.Element {
  // The shell's masthead carries the screen's name; the page states the wording.
  usePageMasthead(t('Integration Health'))

  const connectorsQuery = useServiceQuery(queryKeys.connectors(), (u) => connectorService.list(u))
  const healthQuery = useServiceQuery(['trust-integration-health', 'health'], (u) => connectorService.health(u))

  const [healthFilter, setHealthFilter] = useState<ConnectorHealth | ''>('')
  const [classificationFilter, setClassificationFilter] = useState<DataClassification | ''>('')
  const [departmentFilter, setDepartmentFilter] = useState<string>('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [detailId, setDetailId] = useState<string | null>(null)

  const connectors = useMemo(() => connectorsQuery.data ?? [], [connectorsQuery.data])

  const filtered = useMemo(
    () =>
      connectors.filter((c) => {
        if (healthFilter && c.health !== healthFilter) return false
        if (classificationFilter && c.classification !== classificationFilter) return false
        if (departmentFilter && c.ownerDepartmentId !== departmentFilter) return false
        return true
      }),
    [connectors, healthFilter, classificationFilter, departmentFilter],
  )

  const activeFilters = (healthFilter ? 1 : 0) + (classificationFilter ? 1 : 0) + (departmentFilter ? 1 : 0)
  const selected = useMemo(() => connectors.filter((c) => selectedIds.includes(c.id)), [connectors, selectedIds])
  const detail = useMemo(() => connectors.find((c) => c.id === detailId) ?? null, [connectors, detailId])


  if (connectorsQuery.isLoading || healthQuery.isLoading) return <LoadingState variant="metrics" />
  if (connectorsQuery.error) {
    return <ErrorState detail={connectorsQuery.error.message} onRetry={() => connectorsQuery.refetch()} />
  }
  if (healthQuery.error) return <ErrorState detail={healthQuery.error.message} onRetry={() => healthQuery.refetch()} />

  const health = healthQuery.data
  if (connectors.length === 0 || !health) {
    return <EmptyState title={t('No connectors registered')} detail="The connector registry returned no entries." />
  }

  const needsAgreementOrReview = connectors.filter(
    (c) => c.health === 'not-connected' || c.health === 'review-required',
  )
  const departmentIds = Array.from(new Set(connectors.map((c) => c.ownerDepartmentId))).sort((a, b) =>
    departmentName(a).localeCompare(departmentName(b)),
  )

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
      searchValue: (c) => `${c.name} ${c.targetSystem} ${c.sourceAuthority} ${departmentName(c.ownerDepartmentId)} ${c.notes}`,
      width: 'minmax(12rem,1.5fr)',
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
      id: 'health',
      header: t('State'),
      cell: (c) => <StateBadge state={c.health as OperationalState} />,
      sortValue: (c) => c.health,
    },
    {
      id: 'progress',
      header: t('Provisioning path'),
      cell: (c) => (
        <div className="flex items-center gap-2">
          <ProgressBar value={PROVISIONING_PROGRESS[c.health]} size="xs" className="w-16" />
          <span className="numeric text-[0.6875rem] text-ink-500">{PROVISIONING_PROGRESS[c.health] / 25}/4</span>
        </div>
      ),
      sortValue: (c) => PROVISIONING_PROGRESS[c.health],
      hideBelow: 'lg',
    },
    {
      id: 'lastSync',
      header: t('Last simulated sync'),
      cell: (c) => (c.lastSyncAt ? formatRelative(c.lastSyncAt) : <span className="text-ink-300">{t('Never')}</span>),
      sortValue: (c) => c.lastSyncAt ?? '',
      hideBelow: 'xl',
    },
    {
      id: 'latency',
      header: t('Latency'),
      cell: (c) => (typeof c.latencyMs === 'number' ? <span className="numeric">{c.latencyMs} ms</span> : '-'),
      sortValue: (c) => c.latencyMs ?? -1,
      align: 'right',
      hideBelow: 'xl',
    },
    {
      id: 'quality',
      header: t('Quality score'),
      cell: (c) => (typeof c.qualityScore === 'number' ? <span className="numeric">{c.qualityScore}/100</span> : '-'),
      sortValue: (c) => c.qualityScore ?? -1,
      align: 'right',
      hideBelow: 'xl',
    },
    {
      id: 'environment',
      header: t('Environment'),
      cell: (c) => <Badge tone="intel">{c.environment}</Badge>,
      sortValue: (c) => c.environment,
      hideBelow: 'xl',
    },
    {
      id: 'classification',
      header: t('Classification'),
      cell: (c) => <ClassificationBadge classification={c.classification} showIcon={false} />,
      sortValue: (c) => c.classification,
      hideBelow: 'lg',
    },
    {
      id: 'target',
      header: t('Target system'),
      cell: (c) => (
        <div className="min-w-0">
          <p className="text-[0.75rem] text-ink-600">{c.targetSystem}</p>
          <p className="text-[0.6875rem] text-ink-400">{c.sourceAuthority}</p>
        </div>
      ),
      sortValue: (c) => c.targetSystem,
      hideBelow: 'xl',
    },
  ]

  const donutData = (Object.keys(health.byHealth) as ConnectorHealth[])
    .filter((k) => health.byHealth[k] > 0)
    .map((k) => ({ label: HEALTH_LABEL[k], value: health.byHealth[k], colour: DONUT_COLOUR[k] }))

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('Trust Centre')}
        breadcrumbs={[{ label: t('Trust Centre'), to: '/trust' }, { label: t('Integration Health') }]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {selected.length > 0 ? (
              <Button variant="ghost" size="sm" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={() => setSelectedIds([])}>
                {t('Clear selection')}
              </Button>
            ) : null}
          </div>
        }
      />

      <Card tone="warn">
        <div className="flex items-start gap-2.5">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-warn-700" />
          <div className="min-w-0">
            <p className="text-[0.8125rem] font-semibold text-warn-700">{t('No connector is live')}</p>
            <p className="mt-1 text-xs leading-relaxed text-ink-700">
              {t('This deployment does not exchange data with any departmental system. Every connector below is either a deterministic demonstration simulation, an adapter built and tested but not yet provisioned against a live endpoint, awaiting a security review, or not yet started. The state vocabulary is deliberate and precise - the word &quot;live&quot; is never used to describe a connector in this environment.')}
            </p>
          </div>
        </div>
      </Card>

      <MetricGrid columns={4}>
        <Card>
          <p className="label-institutional">{t('Connectors registered')}</p>
          <p className="numeric mt-2 text-metric font-semibold text-ink-900">{health.total}</p>
        </Card>
        <Card>
          <p className="label-institutional">{t('Simulation')}</p>
          <p className="numeric mt-2 text-metric font-semibold text-ink-900">{health.byHealth.simulation}</p>
          <p className="mt-0.5 text-[0.6875rem] text-ink-500">{t('Adapter implemented, no endpoint contacted')}</p>
        </Card>
        <Card>
          <p className="label-institutional">{t('Adapter ready')}</p>
          <p className="numeric mt-2 text-metric font-semibold text-ink-900">{health.byHealth['adapter-ready']}</p>
          <p className="mt-0.5 text-[0.6875rem] text-ink-500">{t('Engineering done, agreement outstanding')}</p>
        </Card>
        <Card tone={health.requiringReview > 0 ? 'warn' : 'default'}>
          <p className="label-institutional">{t('Requiring review or agreement')}</p>
          <p className="numeric mt-2 text-metric font-semibold text-ink-900">{health.requiringReview}</p>
          <p className="mt-0.5 text-[0.6875rem] text-ink-500">{t('Blocked on an institutional step')}</p>
        </Card>
      </MetricGrid>

      {/* Two columns. What the register says and what is blocked read down the
          wide column, in that order; the distribution and the state vocabulary
          those two are written in sit beside them as reference. */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-4 xl:col-span-8">
        <GovPanel
          title={t('Connector register')}
          tone="amber"
          dense
          actions={
            activeFilters > 0 ? (
              <Button
                variant="ghost"
                size="xs"
                icon={<RotateCcw className="h-3 w-3" />}
                onClick={() => {
                  setHealthFilter('')
                  setClassificationFilter('')
                  setDepartmentFilter('')
                }}
              >
                {t('Clear {0} filter{1}', activeFilters, activeFilters === 1 ? '' : 's')}
              </Button>
            ) : null
          }
        >
          <p className="px-3 pt-3 pb-2 text-xs leading-relaxed text-ink-500">
            {t('Select a row to open the connector; tick connectors to build a provisioning request pack for the departments that hold their next step.')}
          </p>
          <div className="flex flex-wrap items-center gap-2 px-3">
            <Select
              aria-label={t('Filter by state')}
              value={healthFilter}
              onChange={(e) => setHealthFilter(e.target.value as ConnectorHealth | '')}
              options={[
                { value: '', label: t('All states') },
                ...(Object.keys(HEALTH_LABEL) as ConnectorHealth[]).map((k) => ({ value: k, label: HEALTH_LABEL[k] })),
              ]}
            />
            <Select
              aria-label={t('Filter by classification')}
              value={classificationFilter}
              onChange={(e) => setClassificationFilter(e.target.value as DataClassification | '')}
              options={[
                { value: '', label: t('All classifications') },
                ...(['public', 'internal', 'confidential', 'restricted'] as DataClassification[]).map((c) => ({
                  value: c,
                  label: c,
                })),
              ]}
            />
            <Select
              aria-label={t('Filter by owner department')}
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              options={[
                { value: '', label: t('All departments') },
                ...departmentIds.map((id) => ({ value: id, label: departmentName(id) })),
              ]}
            />
          </div>
          <div className="p-3">
            <DataTable
              rows={filtered}
              columns={columns}
              rowKey={(c) => c.id}
              searchable
              searchPlaceholder="Search connectors"
              pageSize={10}
              selectable
              selectedKeys={selectedIds}
              onSelectionChange={setSelectedIds}
              activeRowKey={detailId ?? undefined}
              onRowClick={(c) => setDetailId(c.id)}
              initialSort={{ columnId: 'progress', direction: 'asc' }}
              emptyTitle={t('No connector matches the current filters')}
            />
          </div>
        </GovPanel>

        <GovPanel title={t('Requires a data-sharing agreement or security review before provisioning')} tone="critical">
          <p className="mb-2 text-xs leading-relaxed text-ink-500">
            {t('These connectors cannot proceed to adapter development, or beyond it, without the named institutional step being completed first.')}
          </p>
          {needsAgreementOrReview.length === 0 ? (
            <EmptyState compact title={t('No connector currently requires this step')} />
          ) : (
            <ul className="space-y-2">
              {needsAgreementOrReview.map((c) => (
                <li key={c.id} className="flex flex-wrap items-start justify-between gap-3 rounded-md bg-surface px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[0.8125rem] font-medium text-ink-800">{c.name}</p>
                    <p className="mt-0.5 text-[0.6875rem] text-ink-500">
                      {departmentName(c.ownerDepartmentId)} · {c.targetSystem}
                    </p>
                    <p className="mt-1 text-[0.6875rem] leading-relaxed text-ink-600">{NEXT_STEP[c.health]}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <StateBadge state={c.health as OperationalState} />
                    <Button size="xs" variant="outline" onClick={() => setDetailId(c.id)}>
                      {t('Open')}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </GovPanel>
        </div>

        <div className="flex min-w-0 flex-col gap-4 xl:col-span-4">
        <Card>
          <ChartFrame title={t('Connectors by state')} unit="connectors" timeframe="Current" height={200}>
            <DonutChart data={donutData} centreValue={String(health.total)} centreLabel="total" />
          </ChartFrame>
          <div className="mt-3 space-y-1.5 border-t border-ink-100 pt-3">
            {(Object.keys(HEALTH_LABEL) as ConnectorHealth[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setHealthFilter(healthFilter === k ? '' : k)}
                className={cnFilterRow(healthFilter === k)}
              >
                <span className="inline-flex items-center gap-1.5 text-ink-600">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: DONUT_COLOUR[k] }} aria-hidden />
                  {HEALTH_LABEL[k]}
                </span>
                <span className="numeric font-semibold text-ink-800">{health.byHealth[k]}</span>
              </button>
            ))}
          </div>
          <p className="mt-2.5 border-t border-ink-100 pt-2.5 text-[0.625rem] leading-relaxed text-ink-500">
            {t('Select a state to filter the register to it.')}
          </p>
        </Card>

        <GovPanel title={t('What each state means')} tone="amber">
          <p className="mb-3 text-xs leading-relaxed text-ink-500">{t('The precise, exhaustive definition of every connector state this platform ever reports.')}</p>
          <DefinitionList>
            {(Object.keys(STATE_EXPLANATION) as ConnectorHealth[]).map((k) => (
              <DefinitionRow key={k} label={HEALTH_LABEL[k]}>
                {STATE_EXPLANATION[k]}
              </DefinitionRow>
            ))}
          </DefinitionList>
        </GovPanel>
        </div>
      </div>

      {/* Connector detail -------------------------------------------------- */}
      <Drawer
        open={detail !== null}
        onClose={() => setDetailId(null)}
        width="md"
        eyebrow={detail ? CONNECTOR_TYPE_LABEL[detail.type] : ''}
        title={detail?.name ?? ''}
        description={detail?.notes}
        meta={
          detail ? (
            <>
              <StateBadge state={detail.health as OperationalState} />
              <ClassificationBadge classification={detail.classification} />
              <Badge tone="muted">{DOMAIN_LABEL[detail.domain]}</Badge>
              <Badge tone="intel">{detail.environment}</Badge>
            </>
          ) : null
        }
        footer={
          detail ? (
            <>
              <Button variant="ghost" onClick={() => setDetailId(null)}>
                {t('Close')}
              </Button>
              <Button
                variant="outline"
                icon={<ListChecks className="h-3.5 w-3.5" />}
                onClick={() =>
                  setSelectedIds((ids) => (ids.includes(detail.id) ? ids : [...ids, detail.id]))
                }
                disabled={selectedIds.includes(detail.id)}
              >
                {selectedIds.includes(detail.id) ? 'In provisioning pack' : 'Add to provisioning pack'}
              </Button>
            </>
          ) : null
        }
      >
        {detail ? (
          <div className="space-y-4">
            <Card tone="sunken">
              <p className="label-institutional">{t('Provisioning path')}</p>
              <div className="mt-2 flex items-center gap-3">
                <ProgressBar value={PROVISIONING_PROGRESS[detail.health]} size="sm" className="flex-1" />
                <span className="numeric text-[0.8125rem] font-semibold text-ink-900">
                  {t('{0} of 4', PROVISIONING_PROGRESS[detail.health] / 25)}
                </span>
              </div>
              <p className="mt-2 text-[0.6875rem] leading-relaxed text-ink-500">
                {t('Four gates: integration design review · departmental data-sharing agreement · adapter built and tested · endpoint provisioned. A connector in simulation has cleared three; the fourth is precisely what this environment does not have, which is why nothing here is described as live.')}
              </p>
            </Card>

            <DefinitionList>
              <DefinitionRow label={t('Target system')}>{detail.targetSystem}</DefinitionRow>
              <DefinitionRow label={t('Adapter type')}>{CONNECTOR_TYPE_LABEL[detail.type]}</DefinitionRow>
              <DefinitionRow label={t('Owner department')}>{departmentName(detail.ownerDepartmentId)}</DefinitionRow>
              <DefinitionRow label={t('Accountable officer')}>{officerDisplayName(detail.ownerOfficerId)}</DefinitionRow>
              <DefinitionRow label={t('Authentication')}>{AUTH_LABEL[detail.authenticationMode]}</DefinitionRow>
              <DefinitionRow label={t('Last simulated sync')}>
                {detail.lastSyncAt ? formatRelative(detail.lastSyncAt) : 'Never'}
              </DefinitionRow>
              <DefinitionRow label={t('Observed latency')}>
                {typeof detail.latencyMs === 'number' ? <span className="numeric">{detail.latencyMs} ms</span> : 'Not measured'}
              </DefinitionRow>
              <DefinitionRow label={t('Quality score')}>
                {typeof detail.qualityScore === 'number' ? <span className="numeric">{detail.qualityScore}/100</span> : 'Not assessed'}
              </DefinitionRow>
            </DefinitionList>

            <GovPanel title={t('What "{0}" means', HEALTH_LABEL[detail.health])} tone="amber">
              <p className="text-[0.8125rem] leading-relaxed text-ink-700">{STATE_EXPLANATION[detail.health]}</p>
            </GovPanel>

            <GovPanel title={t('Next institutional step')} tone="red">
              <p className="mb-2 text-xs leading-relaxed text-ink-500">{t('Held by a department or a review body — not by this platform.')}</p>
              <p className="text-[0.8125rem] leading-relaxed text-ink-700">{NEXT_STEP[detail.health]}</p>
              <p className="mt-2 text-[0.6875rem] leading-relaxed text-ink-500">
                {t('Nothing on this screen can complete that step, and no control here pretends to. Add the connector to a provisioning pack to export the request in a form the accountable department can act on.')}
              </p>
            </GovPanel>
          </div>
        ) : null}
      </Drawer>

      <DemonstrationNotice />
    </PageBody>
  )
}

/** Row styling for the clickable state legend. */
function cnFilterRow(active: boolean): string {
  return [
    'flex w-full items-center justify-between gap-2 rounded px-1.5 py-1 text-[0.6875rem] transition-colors',
    active ? 'bg-govt-50 ring-1 ring-govt-200' : 'hover:bg-ink-50',
  ].join(' ')
}

export default IntegrationHealthPage
