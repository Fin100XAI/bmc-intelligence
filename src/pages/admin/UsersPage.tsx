import { useState } from 'react'
import { ArrowUpRight, KeyRound, ShieldOff, Users as UsersIcon } from 'lucide-react'
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
import { Tabs } from '@/components/ui/overlays'
import { MiniBar } from '@/components/charts/charts'
import { useServiceQuery } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { adminService } from '@/services'
import {
  ACTION_LABEL,
  RESOURCE_LABEL,
  describeScope,
  expandPermissions,
  getRole,
  permission,
  type ActionType,
  type ResourceType,
} from '@/security'
import { departmentName, wardName } from '@/data/reference'
import { formatDateTime, formatRelative } from '@/utils/format'
import type { Role, RoleId, User } from '@/types/organisation'
import { t } from '@/i18n'

/**
 * src/pages/admin/UsersPage.tsx
 *
 * The access directory for this deployment: who is provisioned, and what the
 * role each of them holds actually permits.
 *
 * These were two registers on two screens. That split cost the administrator
 * the only question the section exists to answer - "this officer can reach
 * that; on what authority?" - because half the answer was always on the page
 * they were not looking at. They are one screen here, divided by tab so that
 * two dense registers never compete for the same viewport, and joined in both
 * directions: a principal's role opens in the role register, and a role names
 * and counts the principals holding it.
 *
 * Both registers read through `adminService`, both gated on
 * `resource: 'administration'`, which only the Security Administrator role
 * holds. No password, token or credential material is modelled anywhere.
 *
 * Distinct from Trust Centre -> Access Governance, which pairs this same role
 * catalogue with a live permission-engine tester. This is the plain register.
 */

type DirectoryTab = 'users' | 'roles'

const STATUS_TONE: Record<User['status'], 'positive' | 'critical' | 'warn'> = {
  active: 'positive',
  suspended: 'critical',
  'review-required': 'warn',
}

const BAND_TONE: Record<Role['band'], 'info' | 'intel' | 'muted' | 'neutral'> = {
  executive: 'info',
  senior: 'intel',
  operational: 'neutral',
  oversight: 'muted',
}

const ALL_RESOURCES = Object.keys(RESOURCE_LABEL) as ResourceType[]
const ALL_ACTIONS = Object.keys(ACTION_LABEL) as ActionType[]

/**
 * The two directions of the same join wear the same clothes deliberately: an
 * operator should recognise "this takes me to the other register" once, not
 * twice.
 */
const CROSS_LINK =
  'inline-flex max-w-full items-center gap-1 rounded font-medium text-govt-700 underline-offset-2 ' +
  'hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-govt-500'

function countByResource(role: Role): Array<{ resource: ResourceType; count: number }> {
  return ALL_RESOURCES.map((resource) => ({
    resource,
    count: ALL_ACTIONS.filter((a) => role.permissionIds.includes(permission(resource, a))).length,
  })).filter((r) => r.count > 0)
}

/**
 * Role columns are a factory rather than a module constant because the
 * register can now state how many principals hold each role - a fact that
 * only exists once the two registers share a screen, and the one that turns
 * an unprovisioned role from invisible into a visible governance finding.
 */
function roleColumns(holdersByRole: Map<RoleId, number>): Array<Column<Role>> {
  return [
    {
      id: 'name',
      header: t('Role'),
      cell: (r) => (
        <div className="min-w-0">
          <p className="font-medium text-ink-800">{r.name}</p>
          <p className="mt-0.5 line-clamp-1 text-[0.6875rem] text-ink-400">{r.description}</p>
        </div>
      ),
      sortValue: (r) => r.name,
      searchValue: (r) => `${r.name} ${r.description}`,
    },
    {
      id: 'band',
      header: t('Band'),
      cell: (r) => <Badge tone={BAND_TONE[r.band]}>{r.band}</Badge>,
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
      id: 'resources',
      header: t('Resources touched'),
      cell: (r) => <span className="numeric">{countByResource(r).length}</span>,
      sortValue: (r) => countByResource(r).length,
      align: 'right',
      hideBelow: 'md',
    },
    {
      id: 'permissions',
      header: t('Permissions'),
      cell: (r) => <span className="numeric font-semibold text-ink-800">{r.permissionIds.length}</span>,
      sortValue: (r) => r.permissionIds.length,
      align: 'right',
    },
    {
      id: 'principals',
      header: t('Principals'),
      cell: (r) => {
        const held = holdersByRole.get(r.id) ?? 0
        return held === 0 ? <span className="text-ink-300">{t('None')}</span> : <span className="numeric">{held}</span>
      },
      sortValue: (r) => holdersByRole.get(r.id) ?? 0,
      align: 'right',
      hideBelow: 'sm',
    },
  ]
}

export function UsersPage(): React.JSX.Element {
  const usersQuery = useServiceQuery(queryKeys.admin('users'), (user) => adminService.users(user))
  const rolesQuery = useServiceQuery(queryKeys.admin('roles'), (user) => adminService.roles(user))

  const [tab, setTab] = useState<DirectoryTab>('users')
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null)
  const [roleFilter, setRoleFilter] = useState<RoleId | ''>('')
  const [mfaFilter, setMfaFilter] = useState<'' | 'enrolled' | 'not-enrolled'>('')
  const [statusFilter, setStatusFilter] = useState<User['status'] | ''>('')

  const users = usersQuery.data ?? []
  const roles = rolesQuery.data ?? []

  /**
   * One label source for both views. A role is named on the Users tab from
   * the very array the Roles tab renders, so the two registers can never
   * drift into calling the same role two different things. The static
   * catalogue remains the fallback for a principal whose role the register
   * did not return.
   */
  const roleById = new Map(roles.map((r) => [r.id, r]))
  const roleFor = (roleId: RoleId): Role | undefined => roleById.get(roleId) ?? getRole(roleId)

  const holdersByRole = new Map<RoleId, number>()
  for (const u of users) holdersByRole.set(u.roleId, (holdersByRole.get(u.roleId) ?? 0) + 1)

  /** Users -> Roles: open the register entry that grants what this officer holds. */
  function inspectRole(roleId: RoleId): void {
    setSelectedRoleId(roleId)
    setTab('roles')
  }

  /**
   * Roles -> Users: show exactly the principals counted on the role card. The
   * other two filters are cleared on the way across, so the roster that
   * arrives matches the number that was clicked rather than some narrower
   * subset an earlier filter happened to leave in place.
   */
  function listHolders(roleId: RoleId): void {
    setRoleFilter(roleId)
    setMfaFilter('')
    setStatusFilter('')
    setSelectedUserId(null)
    setTab('users')
  }

  const roleOptions = Array.from(new Set(users.map((u) => u.roleId))).sort()

  const filtered = users.filter((u) => {
    if (roleFilter && u.roleId !== roleFilter) return false
    if (mfaFilter === 'enrolled' && !u.mfaEnrolled) return false
    if (mfaFilter === 'not-enrolled' && u.mfaEnrolled) return false
    if (statusFilter && u.status !== statusFilter) return false
    return true
  })

  const selectedUser = filtered.find((u) => u.id === selectedUserId) ?? filtered[0] ?? null
  const selectedRole = roles.find((r) => r.id === selectedRoleId) ?? roles[0] ?? null
  const withoutMfa = users.filter((u) => !u.mfaEnrolled).length
  const unheldRoles = roles.filter((r) => (holdersByRole.get(r.id) ?? 0) === 0).length
  const selectedRoleHolders = selectedRole ? (holdersByRole.get(selectedRole.id) ?? 0) : 0

  const userColumns: Array<Column<User>> = [
    {
      id: 'name',
      header: t('Principal'),
      cell: (u) => (
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-govt-700 text-[0.625rem] font-semibold text-white">
            {u.avatarInitials}
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium text-ink-800">{u.name}</p>
            <p className="truncate text-[0.6875rem] text-ink-400">{u.designation}</p>
          </div>
        </div>
      ),
      sortValue: (u) => u.name,
      searchValue: (u) => `${u.name} ${u.designation} ${u.email} ${u.employeeCode}`,
    },
    {
      id: 'role',
      header: t('Role'),
      cell: (u) => <Badge tone="muted">{roleFor(u.roleId)?.name ?? u.roleId}</Badge>,
      sortValue: (u) => roleFor(u.roleId)?.name ?? u.roleId,
    },
    {
      id: 'department',
      header: t('Department'),
      cell: (u) => departmentName(u.departmentId),
      sortValue: (u) => departmentName(u.departmentId),
      hideBelow: 'md',
    },
    {
      id: 'ward',
      header: t('Ward'),
      cell: (u) => (u.wardId ? wardName(u.wardId) : <span className="text-ink-300">{'City-wide'}</span>),
      sortValue: (u) => (u.wardId ? wardName(u.wardId) : ''),
      hideBelow: 'lg',
    },
    {
      id: 'ceiling',
      header: t('Classification ceiling'),
      cell: (u) => {
        const ceiling = roleFor(u.roleId)?.maxClassification ?? 'public'
        return <ClassificationBadge classification={ceiling} />
      },
      sortValue: (u) => roleFor(u.roleId)?.maxClassification ?? '',
      hideBelow: 'lg',
    },
    {
      id: 'mfa',
      header: t('MFA posture'),
      cell: (u) => (
        <Badge tone={u.mfaEnrolled ? 'positive' : 'critical'} dot>
          {u.mfaEnrolled ? 'Enrolled' : 'Not enrolled'}
        </Badge>
      ),
      sortValue: (u) => (u.mfaEnrolled ? 1 : 0),
    },
    {
      id: 'lastSignIn',
      header: t('Last sign-in'),
      cell: (u) => formatRelative(u.lastSignInAt),
      sortValue: (u) => u.lastSignInAt,
    },
    {
      id: 'status',
      header: t('Status'),
      cell: (u) => (
        <Badge tone={STATUS_TONE[u.status]} dot>
          {u.status.replace('-', ' ')}
        </Badge>
      ),
      sortValue: (u) => u.status,
    },
    {
      id: 'code',
      header: t('Employee code'),
      cell: (u) => <span className="font-mono text-[0.6875rem] text-ink-500">{u.employeeCode}</span>,
      sortValue: (u) => u.employeeCode,
      hideBelow: 'xl',
    },
  ]

  /**
   * Both registers are gated together rather than tab by tab. Each view now
   * states a fact drawn from the other - a role's holder count, a principal's
   * ceiling - and a half-loaded directory would render those as zeroes, which
   * reads as a provisioning finding rather than as an unfinished request.
   */
  const directoryLoading = usersQuery.isLoading || rolesQuery.isLoading
  const directoryError = usersQuery.error ?? rolesQuery.error

  const header = (
    <PageHeader
      eyebrow={t('Administration')}
      title={t('Users & Roles')}
      description={t('Every principal provisioned in this demonstration environment, and the role catalogue that decides what each of them may reach. Permissions are listed in full against every role - there is no implicit or inherited grant anywhere in the platform - and no password, token or credential material is modelled.')}
      breadcrumbs={[{ label: t('Administration') }, { label: t('Users & Roles') }]}
      controls={
        <Tabs
          items={[
            {
              id: 'users',
              label: t('Users'),
              icon: <UsersIcon className="h-3.5 w-3.5" />,
              count: users.length || undefined,
            },
            {
              id: 'roles',
              label: t('Roles'),
              icon: <KeyRound className="h-3.5 w-3.5" />,
              count: roles.length || undefined,
            },
          ]}
          value={tab}
          onChange={(id) => setTab(id as DirectoryTab)}
          ariaLabel="Access directory sections"
        />
      }
    />
  )

  if (directoryLoading) {
    return (
      <PageBody>
        {header}
        <LoadingState variant="table" />
        <DemonstrationNotice />
      </PageBody>
    )
  }

  if (directoryError) {
    return (
      <PageBody>
        {header}
        <ErrorState
          detail={directoryError.message}
          onRetry={() => {
            if (usersQuery.error) void usersQuery.refetch()
            if (rolesQuery.error) void rolesQuery.refetch()
          }}
        />
        <DemonstrationNotice />
      </PageBody>
    )
  }

  return (
    <PageBody>
      {header}

      {tab === 'users' ? (
        users.length === 0 ? (
          <EmptyState title={t('No principals registered')} detail="The user roster returned no entries." />
        ) : (
          <>
            <MetricGrid columns={4}>
              <Card>
                <p className="label-institutional">{t('Principals')}</p>
                <p className="numeric mt-2 text-metric font-semibold text-ink-900">{users.length}</p>
              </Card>
              <Card tone={withoutMfa > 0 ? 'warn' : 'default'}>
                <p className="label-institutional">{t('Without MFA')}</p>
                <p className="numeric mt-2 text-metric font-semibold text-ink-900">{withoutMfa}</p>
              </Card>
              <Card>
                <p className="label-institutional">{t('Active')}</p>
                <p className="numeric mt-2 text-metric font-semibold text-ink-900">
                  {users.filter((u) => u.status === 'active').length}
                </p>
              </Card>
              <Card>
                <p className="label-institutional">{t('City-wide scope')}</p>
                <p className="numeric mt-2 text-metric font-semibold text-ink-900">
                  {users.filter((u) => u.scope.wardIds === '*').length}
                </p>
              </Card>
            </MetricGrid>

            <Card flush>
              <CardHeader className="p-4" icon={<UsersIcon className="h-4 w-4" />} title={t('User roster')} />
              <SplitLayout
                className="px-4 pb-4"
                asideWidth="md"
                main={
                  <DataTable
                    rows={filtered}
                    columns={userColumns}
                    rowKey={(u) => u.id}
                    onRowClick={(u) => setSelectedUserId(u.id)}
                    activeRowKey={selectedUser?.id}
                    searchable
                    searchPlaceholder="Search by name, email or employee code"
                    pageSize={10}
                    initialSort={{ columnId: 'name', direction: 'asc' }}
                    toolbar={
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="w-40">
                          <Label htmlFor="filter-role" className="sr-only">
                            {t('Role')}
                          </Label>
                          <Select
                            id="filter-role"
                            value={roleFilter}
                            onChange={(e) => setRoleFilter(e.target.value as RoleId | '')}
                            options={[
                              { value: '', label: t('All roles') },
                              ...roleOptions.map((r) => ({ value: r, label: roleFor(r)?.name ?? r })),
                            ]}
                          />
                        </div>
                        <div className="w-36">
                          <Label htmlFor="filter-mfa" className="sr-only">
                            MFA
                          </Label>
                          <Select
                            id="filter-mfa"
                            value={mfaFilter}
                            onChange={(e) => setMfaFilter(e.target.value as typeof mfaFilter)}
                            options={[
                              { value: '', label: t('Any MFA posture') },
                              { value: 'enrolled', label: t('MFA enrolled') },
                              { value: 'not-enrolled', label: t('MFA not enrolled') },
                            ]}
                          />
                        </div>
                        <div className="w-32">
                          <Label htmlFor="filter-status" className="sr-only">
                            {t('Status')}
                          </Label>
                          <Select
                            id="filter-status"
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value as User['status'] | '')}
                            options={[
                              { value: '', label: t('Any status') },
                              { value: 'active', label: t('Active') },
                              { value: 'suspended', label: t('Suspended') },
                              { value: 'review-required', label: t('Review required') },
                            ]}
                          />
                        </div>
                      </div>
                    }
                  />
                }
                aside={
                  selectedUser ? (
                    <Card tone="sunken">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-govt-700 text-xs font-semibold text-white">
                          {selectedUser.avatarInitials}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-[0.8125rem] font-semibold text-ink-900">{selectedUser.name}</p>
                          <p className="truncate text-[0.6875rem] text-ink-500">{selectedUser.designation}</p>
                        </div>
                      </div>
                      <DefinitionList className="mt-3">
                        <DefinitionRow label={t('Role')}>
                          <button
                            type="button"
                            className={CROSS_LINK}
                            onClick={() => inspectRole(selectedUser.roleId)}
                            title={t('Open this role in the role register')}
                          >
                            <span className="truncate">{roleFor(selectedUser.roleId)?.name ?? selectedUser.roleId}</span>
                            <ArrowUpRight className="h-3 w-3 shrink-0" aria-hidden />
                          </button>
                        </DefinitionRow>
                        <DefinitionRow label={t('Department')}>{departmentName(selectedUser.departmentId)}</DefinitionRow>
                        <DefinitionRow label={t('Ward')}>
                          {selectedUser.wardId ? wardName(selectedUser.wardId) : 'City-wide'}
                        </DefinitionRow>
                        <DefinitionRow label={t('Scope')}>{describeScope(selectedUser, wardName)}</DefinitionRow>
                        <DefinitionRow label={t('Classification ceiling')}>
                          <ClassificationBadge
                            classification={roleFor(selectedUser.roleId)?.maxClassification ?? 'public'}
                          />
                        </DefinitionRow>
                        <DefinitionRow label={t('Email')} mono>
                          {selectedUser.email}
                        </DefinitionRow>
                        <DefinitionRow label={t('Employee code')} mono>
                          {selectedUser.employeeCode}
                        </DefinitionRow>
                        <DefinitionRow label={t('Last sign-in')}>{formatDateTime(selectedUser.lastSignInAt)}</DefinitionRow>
                        <DefinitionRow label={t('Status')}>
                          <Badge tone={STATUS_TONE[selectedUser.status]} dot>
                            {selectedUser.status.replace('-', ' ')}
                          </Badge>
                        </DefinitionRow>
                      </DefinitionList>
                      {!selectedUser.mfaEnrolled ? (
                        <p className="mt-3 flex items-start gap-1.5 rounded-md bg-crit-50 px-2.5 py-2 text-[0.6875rem] leading-relaxed text-crit-700">
                          <ShieldOff className="mt-px h-3 w-3 shrink-0" />
                          {t('This principal has not enrolled multi-factor authentication. See the Security Command Centre for the platform-wide MFA coverage position.')}
                        </p>
                      ) : null}
                      <p className="mt-3 border-t border-ink-100 pt-2 text-[0.6875rem] text-ink-400">
                        {t('Holds {0} permission(s) across {1} of {2} resources and {3} of {4} action types.', expandPermissions(selectedUser).length, new Set(expandPermissions(selectedUser).map((p) => p.split(':')[0])).size, Object.keys(RESOURCE_LABEL).length, new Set(expandPermissions(selectedUser).map((p) => p.split(':')[1])).size, Object.keys(ACTION_LABEL).length)}
                      </p>
                    </Card>
                  ) : (
                    <EmptyState title={t('No principal selected')} compact />
                  )
                }
              />
            </Card>
          </>
        )
      ) : roles.length === 0 ? (
        <EmptyState
          title={t('No roles configured')}
          detail="The role catalogue returned no entries for your principal."
        />
      ) : (
        <>
          <MetricGrid columns={5}>
            <Card>
              <p className="label-institutional">{t('Roles configured')}</p>
              <p className="numeric mt-2 text-metric font-semibold text-ink-900">{roles.length}</p>
            </Card>
            <Card>
              <p className="label-institutional">{t('Executive band')}</p>
              <p className="numeric mt-2 text-metric font-semibold text-ink-900">
                {roles.filter((r) => r.band === 'executive').length}
              </p>
            </Card>
            <Card>
              <p className="label-institutional">{t('Oversight band')}</p>
              <p className="numeric mt-2 text-metric font-semibold text-ink-900">
                {roles.filter((r) => r.band === 'oversight').length}
              </p>
            </Card>
            <Card>
              <p className="label-institutional">{t('Restricted-ceiling roles')}</p>
              <p className="numeric mt-2 text-metric font-semibold text-ink-900">
                {roles.filter((r) => r.maxClassification === 'restricted').length}
              </p>
            </Card>
            <Card tone={unheldRoles > 0 ? 'info' : 'default'}>
              <p className="label-institutional">{t('Held by nobody')}</p>
              <p className="numeric mt-2 text-metric font-semibold text-ink-900">{unheldRoles}</p>
              <p className="mt-0.5 text-[0.6875rem] text-ink-500">{t('Configured, no principal provisioned')}</p>
            </Card>
          </MetricGrid>

          <Card flush>
            <CardHeader className="p-4" icon={<KeyRound className="h-4 w-4" />} title={t('Role register')} />
            <SplitLayout
              className="px-4 pb-4"
              asideWidth="lg"
              main={
                <DataTable
                  rows={roles}
                  columns={roleColumns(holdersByRole)}
                  rowKey={(r) => r.id}
                  onRowClick={(r) => setSelectedRoleId(r.id)}
                  activeRowKey={selectedRole?.id}
                  searchable
                  searchPlaceholder="Search roles by name or description"
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
                      <DefinitionRow label={t('Total permissions')}>{selectedRole.permissionIds.length}</DefinitionRow>
                      <DefinitionRow label={t('Held by')}>
                        {selectedRoleHolders === 0 ? (
                          <span className="text-ink-400">{t('No principal provisioned')}</span>
                        ) : (
                          <button
                            type="button"
                            className={CROSS_LINK}
                            onClick={() => listHolders(selectedRole.id)}
                            title={t('Show the principals holding this role in the user roster')}
                          >
                            <span className="truncate">
                              {selectedRoleHolders} principal{selectedRoleHolders === 1 ? '' : 's'}
                            </span>
                            <ArrowUpRight className="h-3 w-3 shrink-0" aria-hidden />
                          </button>
                        )}
                      </DefinitionRow>
                    </DefinitionList>

                    <Divider className="my-3" />
                    <p className="label-institutional mb-2">{t('Permission counts by resource')}</p>
                    <ul className="space-y-1.5">
                      {countByResource(selectedRole).map((row) => (
                        <li key={row.resource} className="flex items-center justify-between gap-2 text-[0.6875rem]">
                          <span className="truncate text-ink-600">{RESOURCE_LABEL[row.resource]}</span>
                          <span className="flex shrink-0 items-center gap-1.5">
                            <MiniBar value={row.count} max={ALL_ACTIONS.length} width={44} />
                            <span className="numeric w-6 text-right font-semibold text-ink-800">{row.count}</span>
                          </span>
                        </li>
                      ))}
                    </ul>

                    <Divider className="my-3" />
                    <p className="label-institutional mb-2">{t('Expandable permission list')}</p>
                    <div className="scrollbar-slim max-h-56 space-y-2 overflow-y-auto pr-1">
                      {countByResource(selectedRole).map(({ resource }) => (
                        <div key={resource} className="rounded-md bg-surface px-2 py-1.5">
                          <p className="text-[0.6875rem] font-medium text-ink-700">{RESOURCE_LABEL[resource]}</p>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {ALL_ACTIONS.filter((a) => selectedRole.permissionIds.includes(permission(resource, a))).map(
                              (a) => (
                                <Badge key={a} tone="muted" size="xs">
                                  {ACTION_LABEL[a]}
                                </Badge>
                              ),
                            )}
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
        </>
      )}

      <DemonstrationNotice />
    </PageBody>
  )
}

export default UsersPage
