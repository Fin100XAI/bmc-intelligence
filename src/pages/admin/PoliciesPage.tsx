import { useState } from 'react'
import { Ban, CheckCircle2, ListChecks } from 'lucide-react'
import { PageBody, PageHeader, SplitLayout } from '@/components/layout/PageHeader'
import { Badge, ClassificationBadge } from '@/components/ui/badges'
import { Card, CardHeader, DefinitionList, DefinitionRow, MetricGrid } from '@/components/ui/primitives'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { DemonstrationNotice, EmptyState, ErrorState, LoadingState } from '@/components/ui/states'
import { useServiceQuery } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { adminService } from '@/services'
import { usePageMasthead } from '@/stores/masthead.store'
import { RESOURCE_LABEL, getRole, type ResourceType } from '@/security'
import { userDisplayName } from '@/auth/demo-users'
import { formatDate } from '@/utils/format'
import { cn } from '@/utils/cn'
import type { AccessPolicy } from '@/types/governance'
import { t } from '@/i18n'

/**
 * src/pages/admin/PoliciesPage.tsx
 *
 * The access policy register - sourced from `adminService.policies`.
 * Deny policies (e.g. the AI high-impact action prohibition) are visually
 * distinguished, since a deny policy is the platform actively refusing a
 * class of request rather than merely not granting it.
 */

const STATUS_TONE: Record<AccessPolicy['status'], 'positive' | 'neutral' | 'warn' | 'muted'> = {
  active: 'positive',
  draft: 'neutral',
  'review-required': 'warn',
  retired: 'muted',
}

export function PoliciesPage(): React.JSX.Element {
  const policiesQuery = useServiceQuery(queryKeys.admin('policies'), (user) => adminService.policies(user))
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // The shell renders the masthead; this page states what it should say.
  usePageMasthead(
    t('Policies'),
    t('The attribute-based access control policies layered over the role catalogue - the conditions, in addition to a role grant, under which a request is allowed or explicitly refused.'),
  )

  if (policiesQuery.isLoading) return <LoadingState variant="table" />
  if (policiesQuery.error) {
    return <ErrorState detail={policiesQuery.error.message} onRetry={() => policiesQuery.refetch()} />
  }
  const policies = policiesQuery.data ?? []
  if (policies.length === 0) {
    return <EmptyState title={t('No access policies registered')} detail="The policy register returned no entries." />
  }

  const selected = policies.find((p) => p.id === selectedId) ?? policies[0] ?? null
  const denyCount = policies.filter((p) => p.effect === 'deny').length

  const columns: Array<Column<AccessPolicy>> = [
    {
      id: 'name',
      header: t('Policy'),
      cell: (p) => (
        <div className="min-w-0">
          <p className="font-medium text-ink-800">{p.name}</p>
          <p className="mt-0.5 line-clamp-1 text-[0.6875rem] text-ink-400">{p.description}</p>
        </div>
      ),
      sortValue: (p) => p.name,
      searchValue: (p) => `${p.name} ${p.description}`,
    },
    {
      id: 'effect',
      header: t('Effect'),
      cell: (p) => (
        <Badge tone={p.effect === 'deny' ? 'critical' : 'positive'} icon={p.effect === 'deny' ? <Ban className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}>
          {p.effect === 'deny' ? 'Deny' : 'Allow'}
        </Badge>
      ),
      sortValue: (p) => p.effect,
    },
    {
      id: 'resources',
      header: t('Resource types'),
      cell: (p) => (
        <div className="flex max-w-[14rem] flex-wrap gap-1">
          {p.resourceTypes.slice(0, 3).map((r) => (
            <Badge key={r} tone="muted">
              {RESOURCE_LABEL[r as ResourceType] ?? r}
            </Badge>
          ))}
          {p.resourceTypes.length > 3 ? <Badge tone="muted">+{p.resourceTypes.length - 3}</Badge> : null}
        </div>
      ),
      sortable: false,
      hideBelow: 'lg',
    },
    {
      id: 'ceiling',
      header: t('Classification ceiling'),
      cell: (p) => <ClassificationBadge classification={p.maxClassification} />,
      sortValue: (p) => p.maxClassification,
      hideBelow: 'md',
    },
    {
      id: 'status',
      header: t('Status'),
      cell: (p) => (
        <Badge tone={STATUS_TONE[p.status]} dot>
          {p.status.replace('-', ' ')}
        </Badge>
      ),
      sortValue: (p) => p.status,
    },
    {
      id: 'reviewed',
      header: t('Last reviewed'),
      cell: (p) => formatDate(p.lastReviewedAt),
      sortValue: (p) => p.lastReviewedAt,
      hideBelow: 'lg',
    },
    {
      id: 'owner',
      header: t('Owner'),
      cell: (p) => userDisplayName(p.ownerId),
      sortValue: (p) => userDisplayName(p.ownerId),
      hideBelow: 'xl',
    },
  ]

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('Administration')}
        breadcrumbs={[{ label: t('Administration') }, { label: t('Policies') }]}
      />

      <MetricGrid columns={4}>
        <Card>
          <p className="label-institutional">{t('Policies')}</p>
          <p className="numeric mt-2 text-metric font-semibold text-ink-900">{policies.length}</p>
        </Card>
        <Card>
          <p className="label-institutional">{t('Active')}</p>
          <p className="numeric mt-2 text-metric font-semibold text-ink-900">
            {policies.filter((p) => p.status === 'active').length}
          </p>
        </Card>
        <Card tone={denyCount > 0 ? 'critical' : 'default'}>
          <p className="label-institutional">{t('Deny policies')}</p>
          <p className="numeric mt-2 text-metric font-semibold text-ink-900">{denyCount}</p>
        </Card>
        <Card>
          <p className="label-institutional">{t('Review required')}</p>
          <p className="numeric mt-2 text-metric font-semibold text-ink-900">
            {policies.filter((p) => p.status === 'review-required').length}
          </p>
        </Card>
      </MetricGrid>

      <Card flush>
        <CardHeader className="p-4" icon={<ListChecks className="h-4 w-4" />} title={t('Policy register')} />
        <SplitLayout
          className="px-4 pb-4"
          asideWidth="lg"
          main={
            <DataTable
              rows={policies}
              columns={columns}
              rowKey={(p) => p.id}
              onRowClick={(p) => setSelectedId(p.id)}
              activeRowKey={selected?.id}
              searchable
              searchPlaceholder="Search policies"
              pageSize={10}
              initialSort={{ columnId: 'effect', direction: 'asc' }}
              rowAccent={(p) => (
                <span className={cn('block h-full w-full rounded-full', p.effect === 'deny' ? 'bg-crit-500' : 'bg-ok-500')} />
              )}
            />
          }
          aside={
            selected ? (
              <Card tone={selected.effect === 'deny' ? 'critical' : 'sunken'}>
                <div className="flex items-center gap-1.5">
                  <Badge tone={selected.effect === 'deny' ? 'critical' : 'positive'}>
                    {selected.effect === 'deny' ? 'Deny policy' : 'Allow policy'}
                  </Badge>
                  <Badge tone={STATUS_TONE[selected.status]}>{selected.status.replace('-', ' ')}</Badge>
                </div>
                <p className="mt-2 text-[0.8125rem] font-semibold text-ink-900">{selected.name}</p>
                <p className="mt-1 text-xs leading-relaxed text-ink-600">{selected.description}</p>

                <DefinitionList className="mt-3">
                  <DefinitionRow label={t('Classification ceiling')}>
                    <ClassificationBadge classification={selected.maxClassification} />
                  </DefinitionRow>
                  <DefinitionRow label={t('Last reviewed')}>{formatDate(selected.lastReviewedAt)}</DefinitionRow>
                  <DefinitionRow label={t('Owner')}>{userDisplayName(selected.ownerId)}</DefinitionRow>
                </DefinitionList>

                <p className="label-institutional mt-3 mb-1.5">{t('Applies to roles')}</p>
                <div className="flex flex-wrap gap-1">
                  {selected.roleIds.map((r) => (
                    <Badge key={r} tone="muted">
                      {getRole(r)?.name ?? r}
                    </Badge>
                  ))}
                </div>

                <p className="label-institutional mt-3 mb-1.5">{t('Resource types')}</p>
                <div className="flex flex-wrap gap-1">
                  {selected.resourceTypes.map((r) => (
                    <Badge key={r} tone="muted">
                      {RESOURCE_LABEL[r as ResourceType] ?? r}
                    </Badge>
                  ))}
                </div>

                <p className="label-institutional mt-3 mb-1.5">{t('Actions governed')}</p>
                <div className="flex flex-wrap gap-1">
                  {selected.actions.map((a) => (
                    <Badge key={a} tone="muted">
                      {a}
                    </Badge>
                  ))}
                </div>

                <p className="label-institutional mt-3 mb-1.5">{t('ABAC conditions')}</p>
                <ul className="space-y-1">
                  {selected.conditions.map((c, i) => (
                    <li key={i} className="rounded-md bg-surface px-2 py-1.5 font-mono text-[0.6875rem] text-ink-700">
                      {c.attribute} <span className="text-ink-400">{c.operator}</span> {c.value}
                    </li>
                  ))}
                </ul>
              </Card>
            ) : (
              <EmptyState title={t('Select a policy')} compact />
            )
          }
        />
      </Card>

      <DemonstrationNotice />
    </PageBody>
  )
}

export default PoliciesPage
