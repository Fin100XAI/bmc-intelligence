import { useState } from 'react'
import { CheckCircle2, KeyRound, Layers, ShieldQuestion, XCircle } from 'lucide-react'
import { PageBody, PageHeader, SplitLayout } from '@/components/layout/PageHeader'
import { Badge, ClassificationBadge } from '@/components/ui/badges'
import {
  Card,
  CardHeader,
  DefinitionList,
  DefinitionRow,
  Divider,
  Label,
  MetricGrid,
  Select,
} from '@/components/ui/primitives'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { DemonstrationNotice, EmptyState, ErrorState, LoadingState } from '@/components/ui/states'
import { useServiceQuery } from '@/hooks'
import { authService, wardService } from '@/services'
import {
  ACTION_LABEL,
  RESOURCE_LABEL,
  ROLES_ORDERED,
  canAccess,
  describeScope,
  expandPermissions,
  permission,
  type ActionType,
  type ResourceType,
} from '@/security'
import type { AccessContext, AccessDecision } from '@/security/model'
import { CLASSIFICATION_LABEL, DOMAIN_LABEL, type DataClassification, type IntelligenceDomain } from '@/types/common'
import type { Role } from '@/types/organisation'
import { DEPARTMENTS_ORDERED, wardName } from '@/data/reference'
import { cn } from '@/utils/cn'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/**
 * src/pages/trust/AccessGovernancePage.tsx
 *
 * The role catalogue, the permission matrix and a live permission-engine
 * tester that calls `canAccess` - the real function every service method in
 * the platform calls before touching a record - rather than a mock.
 */

const ALL_RESOURCES = Object.keys(RESOURCE_LABEL) as ResourceType[]
const ALL_ACTIONS = Object.keys(ACTION_LABEL) as ActionType[]
const ACTION_INITIAL: Record<ActionType, string> = {
  view: 'V',
  create: 'C',
  edit: 'E',
  approve: 'Ap',
  assign: 'As',
  escalate: 'Es',
  export: 'X',
  administer: 'Ad',
}

function roleAbbreviation(role: Role): string {
  return role.id
    .split('-')
    .map((s) => s[0])
    .join('')
    .toUpperCase()
}

function actionsHeld(role: Role, resource: ResourceType): ActionType[] {
  return ALL_ACTIONS.filter((a) => role.permissionIds.includes(permission(resource, a)))
}

function groupPermissions(ids: string[]): Array<{ resource: ResourceType; actions: ActionType[] }> {
  const map = new Map<ResourceType, ActionType[]>()
  for (const id of ids) {
    const [res, act] = id.split(':') as [ResourceType, ActionType]
    if (!res || !act) continue
    const list = map.get(res) ?? []
    list.push(act)
    map.set(res, list)
  }
  return Array.from(map.entries())
    .map(([resource, actions]) => ({ resource, actions }))
    .sort((a, b) => RESOURCE_LABEL[a.resource].localeCompare(RESOURCE_LABEL[b.resource]))
}

function build$ROLE_COLUMNS(): Array<Column<Role>> {
  return [
  {
    id: 'role',
    header: t('Role'),
    cell: (r) => (
      <div className="min-w-0">
        <p className="font-medium text-ink-800">{r.name}</p>
        <p className="font-mono text-[0.625rem] text-ink-400">{r.id}</p>
      </div>
    ),
    sortValue: (r) => r.name,
  },
  {
    id: 'band',
    header: t('Band'),
    cell: (r) => <Badge tone="muted">{r.band}</Badge>,
    sortValue: (r) => r.band,
  },
  {
    id: 'ceiling',
    header: t('Classification ceiling'),
    cell: (r) => <ClassificationBadge classification={r.maxClassification} />,
    sortValue: (r) => r.maxClassification,
  },
  {
    id: 'route',
    header: t('Landing route'),
    cell: (r) => <span className="font-mono text-[0.6875rem] text-ink-500">{r.landingRoute}</span>,
    sortValue: (r) => r.landingRoute,
    hideBelow: 'lg',
  },
  {
    id: 'permissions',
    header: t('Permissions'),
    cell: (r) => <span className="numeric">{r.permissionIds.length}</span>,
    sortValue: (r) => r.permissionIds.length,
    align: 'right',
  },
]
}
let ROLE_COLUMNS: Array<Column<Role>> = build$ROLE_COLUMNS()
registerLayer(() => {
  ROLE_COLUMNS = build$ROLE_COLUMNS()
})

export function AccessGovernancePage(): React.JSX.Element {
  const [selectedRoleId, setSelectedRoleId] = useState<string>(ROLES_ORDERED[0]?.id ?? '')

  const profilesQuery = useServiceQuery(['trust-access-governance', 'demo-profiles'], () =>
    authService.listDemoProfiles(),
  )
  const wardsQuery = useServiceQuery(['trust-access-governance', 'wards'], (user) => wardService.list(user))

  const [principalId, setPrincipalId] = useState<string>('')
  const [resource, setResource] = useState<ResourceType>('intelligence')
  const [action, setAction] = useState<ActionType>('view')
  const [testWardId, setTestWardId] = useState('')
  const [testDepartmentId, setTestDepartmentId] = useState('')
  const [testDomain, setTestDomain] = useState<IntelligenceDomain | ''>('')
  const [testClassification, setTestClassification] = useState<DataClassification | ''>('')

  if (profilesQuery.isLoading || wardsQuery.isLoading) return <LoadingState variant="metrics" />
  if (profilesQuery.error) {
    return <ErrorState detail={profilesQuery.error.message} onRetry={() => profilesQuery.refetch()} />
  }
  if (wardsQuery.error) return <ErrorState detail={wardsQuery.error.message} onRetry={() => wardsQuery.refetch()} />

  const profiles = profilesQuery.data ?? []
  const wards = wardsQuery.data ?? []
  const activeUserId = principalId || profiles[0]?.user.id || ''
  const activeProfile = profiles.find((p) => p.user.id === activeUserId)
  const activeUser = activeProfile?.user ?? null

  const context: AccessContext = {}
  if (testWardId) context.wardId = testWardId
  if (testDepartmentId) context.departmentId = testDepartmentId
  if (testDomain) context.domain = testDomain
  if (testClassification) context.classification = testClassification

  const decision: AccessDecision = canAccess(activeUser, resource, action, context)
  const selectedRole = ROLES_ORDERED.find((r) => r.id === selectedRoleId) ?? ROLES_ORDERED[0]

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('Trust Centre')}
        title={t('Access Governance')}
        description={t('Every read and write in this platform resolves through one permission engine - role-based grants combined with ward, department, domain and classification attributes. This page renders the role catalogue exactly as configured and calls that same engine live, so the decision shown below is the decision the platform itself would make.')}
        breadcrumbs={[{ label: t('Trust Centre'), to: '/trust' }, { label: t('Access Governance') }]}
      />

      <MetricGrid columns={4}>
        <Card>
          <p className="label-institutional">{t('Roles in the catalogue')}</p>
          <p className="numeric mt-2 text-metric font-semibold text-ink-900">{ROLES_ORDERED.length}</p>
        </Card>
        <Card>
          <p className="label-institutional">{t('Resources governed')}</p>
          <p className="numeric mt-2 text-metric font-semibold text-ink-900">{ALL_RESOURCES.length}</p>
        </Card>
        <Card>
          <p className="label-institutional">{t('Action types')}</p>
          <p className="numeric mt-2 text-metric font-semibold text-ink-900">{ALL_ACTIONS.length}</p>
        </Card>
        <Card tone="info">
          <p className="label-institutional">{t('Decision bases')}</p>
          <p className="mt-2 text-xs leading-relaxed text-ink-700">
            {t('role-permission · ward-scope · department-scope · domain-scope · classification-ceiling')}
          </p>
        </Card>
      </MetricGrid>

      <Card flush>
        <CardHeader
          className="p-4"
          icon={<KeyRound className="h-4 w-4" />}
          title={t('Role catalogue')}
          description={t('Every institutional role, ordered by seniority band then classification ceiling.')}
        />
        <SplitLayout
          className="px-4 pb-4"
          asideWidth="lg"
          main={
            <DataTable
              rows={ROLES_ORDERED}
              columns={ROLE_COLUMNS}
              rowKey={(r) => r.id}
              onRowClick={(r) => setSelectedRoleId(r.id)}
              activeRowKey={selectedRoleId}
              searchable
              searchPlaceholder="Search roles"
              pageSize={14}
              initialSort={{ columnId: 'permissions', direction: 'desc' }}
            />
          }
          aside={
            selectedRole ? (
              <Card tone="sunken">
                <p className="text-[0.8125rem] font-semibold text-ink-900">{selectedRole.name}</p>
                <p className="mt-1 text-xs leading-relaxed text-ink-600">{selectedRole.description}</p>
                <DefinitionList className="mt-3">
                  <DefinitionRow label={t('Band')}>{selectedRole.band}</DefinitionRow>
                  <DefinitionRow label={t('Classification ceiling')}>
                    <ClassificationBadge classification={selectedRole.maxClassification} />
                  </DefinitionRow>
                  <DefinitionRow label={t('Landing route')} mono>
                    {selectedRole.landingRoute}
                  </DefinitionRow>
                  <DefinitionRow label={t('Permissions held')}>{selectedRole.permissionIds.length}</DefinitionRow>
                </DefinitionList>
                <Divider className="my-3" />
                <p className="label-institutional mb-2">{t('Full permission list')}</p>
                <div className="scrollbar-slim max-h-72 space-y-2 overflow-y-auto pr-1">
                  {groupPermissions(selectedRole.permissionIds).map((g) => (
                    <div key={g.resource} className="rounded-md bg-surface px-2 py-1.5">
                      <p className="text-[0.6875rem] font-medium text-ink-700">{RESOURCE_LABEL[g.resource]}</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {g.actions.map((a) => (
                          <Badge key={a} tone="muted" size="xs">
                            {ACTION_LABEL[a]}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            ) : (
              <EmptyState title={t('Select a role')} compact />
            )
          }
        />
      </Card>

      <Card>
        <CardHeader
          icon={<Layers className="h-4 w-4" />}
          title={t('Permission matrix - roles × resources')}
          description={t('Each cell lists the action initials the role holds on that resource (V=View, C=Create, E=Edit, Ap=Approve, As=Assign, Es=Escalate, X=Export, Ad=Administer). A dash means the role holds no grant at all on that resource.')}
        />
        <div className="scrollbar-slim mt-3 max-h-[520px] overflow-auto rounded-md border border-ink-100">
          <table className="w-full border-separate border-spacing-0 text-left">
            <thead>
              <tr>
                <th className="sticky top-0 left-0 z-20 min-w-[9rem] border-b border-ink-100 bg-surface-sunken px-2 py-1.5 text-left text-[0.625rem] font-semibold text-ink-500">
                  {t('Resource')}
                </th>
                {ROLES_ORDERED.map((role) => (
                  <th
                    key={role.id}
                    title={role.name}
                    className="sticky top-0 z-10 border-b border-ink-100 bg-surface-sunken px-1.5 py-1.5 text-center text-[0.625rem] font-semibold whitespace-nowrap text-ink-500"
                  >
                    {roleAbbreviation(role)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ALL_RESOURCES.map((res) => (
                <tr key={res} className="odd:bg-surface even:bg-surface-sunken/40">
                  <th
                    scope="row"
                    className="sticky left-0 z-10 border-b border-ink-50 bg-inherit px-2 py-1 text-left text-[0.6875rem] font-medium whitespace-nowrap text-ink-700"
                  >
                    {RESOURCE_LABEL[res]}
                  </th>
                  {ROLES_ORDERED.map((role) => {
                    const held = actionsHeld(role, res)
                    return (
                      <td
                        key={role.id}
                        title={`${role.name} · ${RESOURCE_LABEL[res]}: ${held.length === 0 ? 'no grant' : held.map((a) => ACTION_LABEL[a]).join(', ')}`}
                        className={cn(
                          'border-b border-ink-50 px-1.5 py-1 text-center text-[0.5625rem] whitespace-nowrap',
                          held.length === ALL_ACTIONS.length
                            ? 'font-semibold text-govt-700'
                            : held.length > 0
                              ? 'text-ink-600'
                              : 'text-ink-200',
                        )}
                      >
                        {held.length === 0 ? '-' : held.map((a) => ACTION_INITIAL[a]).join('·')}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[0.6875rem] text-ink-400">
          {t('Column key: {0}', ROLES_ORDERED.map((r) => `${roleAbbreviation(r)}=${r.name}`).join(' · '))}
        </p>
      </Card>

      <Card tone="info">
        <CardHeader
          icon={<ShieldQuestion className="h-4 w-4" />}
          title={t('Live permission engine tester')}
          description={t('Selects a principal, a resource and an action, evaluates the request through the real canAccess engine and shows the resulting decision, reason and basis. No record is read or written and no audit event is produced.')}
        />

        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <div>
            <Label htmlFor="tester-principal">{t('Acting principal')}</Label>
            <Select
              id="tester-principal"
              value={activeUserId}
              onChange={(e) => setPrincipalId(e.target.value)}
              options={profiles.map((p) => ({ value: p.user.id, label: `${p.user.name} - ${p.user.designation}` }))}
            />
          </div>
          <div>
            <Label htmlFor="tester-resource">{t('Resource')}</Label>
            <Select
              id="tester-resource"
              value={resource}
              onChange={(e) => setResource(e.target.value as ResourceType)}
              options={ALL_RESOURCES.map((r) => ({ value: r, label: RESOURCE_LABEL[r] }))}
            />
          </div>
          <div>
            <Label htmlFor="tester-action">{t('Action')}</Label>
            <Select
              id="tester-action"
              value={action}
              onChange={(e) => setAction(e.target.value as ActionType)}
              options={ALL_ACTIONS.map((a) => ({ value: a, label: ACTION_LABEL[a] }))}
            />
          </div>
          <div>
            <Label htmlFor="tester-classification" hint="optional">
              {t('Record classification')}
            </Label>
            <Select
              id="tester-classification"
              value={testClassification}
              onChange={(e) => setTestClassification(e.target.value as DataClassification | '')}
              options={[
                { value: '', label: t('No constraint') },
                ...(Object.keys(CLASSIFICATION_LABEL) as DataClassification[]).map((c) => ({
                  value: c,
                  label: CLASSIFICATION_LABEL[c],
                })),
              ]}
            />
          </div>
          <div>
            <Label htmlFor="tester-ward" hint="optional">
              {t('Record ward')}
            </Label>
            <Select
              id="tester-ward"
              value={testWardId}
              onChange={(e) => setTestWardId(e.target.value)}
              options={[{ value: '', label: t('No constraint') }, ...wards.map((w) => ({ value: w.id, label: `${w.code} - ${w.name}` }))]}
            />
          </div>
          <div>
            <Label htmlFor="tester-department" hint="optional">
              {t('Record department')}
            </Label>
            <Select
              id="tester-department"
              value={testDepartmentId}
              onChange={(e) => setTestDepartmentId(e.target.value)}
              options={[
                { value: '', label: t('No constraint') },
                ...DEPARTMENTS_ORDERED.map((d) => ({ value: d.id, label: d.shortName })),
              ]}
            />
          </div>
          <div>
            <Label htmlFor="tester-domain" hint="optional">
              {t('Record domain')}
            </Label>
            <Select
              id="tester-domain"
              value={testDomain}
              onChange={(e) => setTestDomain(e.target.value as IntelligenceDomain | '')}
              options={[
                { value: '', label: t('No constraint') },
                ...(Object.keys(DOMAIN_LABEL) as IntelligenceDomain[]).map((d) => ({ value: d, label: DOMAIN_LABEL[d] })),
              ]}
            />
          </div>
        </div>

        <Divider className="my-4" />

        <div className="grid gap-4 lg:grid-cols-2">
          <Card tone={decision.allowed ? 'positive' : 'critical'}>
            <div className="flex items-center gap-2">
              {decision.allowed ? (
                <CheckCircle2 className="h-5 w-5 shrink-0 text-ok-600" />
              ) : (
                <XCircle className="h-5 w-5 shrink-0 text-crit-600" />
              )}
              <p className={cn('text-sm font-semibold', decision.allowed ? 'text-ok-700' : 'text-crit-700')}>
                {decision.allowed ? 'Access granted' : 'Access denied'}
              </p>
            </div>
            <p className="mt-2 text-[0.8125rem] leading-relaxed text-ink-700">{decision.reason}</p>
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <Badge tone="muted">{t('basis: {0}', decision.basis)}</Badge>
              <Badge tone="muted" className="font-mono">
                {resource}:{action}
              </Badge>
            </div>
          </Card>

          {activeUser ? (
            <Card>
              <p className="label-institutional mb-2">{t('Acting principal scope')}</p>
              <DefinitionList>
                <DefinitionRow label={t('Name')}>
                  {activeUser.name} <span className="text-ink-400">({activeUser.designation})</span>
                </DefinitionRow>
                {/* The acting principal's own role - not `selectedRole`, which
                    tracks the role highlighted in the explorer table above and
                    would mislabel every principal as whichever role is
                    selected there. */}
                <DefinitionRow label={t('Role')}>
                  {ROLES_ORDERED.find((r) => r.id === activeUser.roleId)?.name ?? activeUser.roleId}
                </DefinitionRow>
                <DefinitionRow label={t('Scope')}>{describeScope(activeUser, wardName)}</DefinitionRow>
                <DefinitionRow label={t('MFA enrolled')}>{activeUser.mfaEnrolled ? 'Yes' : 'No'}</DefinitionRow>
              </DefinitionList>
              <p className="label-institutional mt-3 mb-1.5">{t('Permissions held ({0})', expandPermissions(activeUser).length)}</p>
              <div className="scrollbar-slim max-h-32 overflow-y-auto">
                <div className="flex flex-wrap gap-1">
                  {groupPermissions(expandPermissions(activeUser)).map((g) => (
                    <Badge key={g.resource} tone="muted" title={g.actions.map((a) => ACTION_LABEL[a]).join(', ')}>
                      {RESOURCE_LABEL[g.resource]} ({g.actions.length})
                    </Badge>
                  ))}
                </div>
              </div>
            </Card>
          ) : null}
        </div>
      </Card>

      <DemonstrationNotice />
    </PageBody>
  )
}

export default AccessGovernancePage
