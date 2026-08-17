import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  ShieldCheck,
} from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import { Badge, ClassificationBadge, StateBadge } from '@/components/ui/badges'
import {
  Button,
  Card,
  DefinitionList,
  DefinitionRow,
  Label,
  MetricGrid,
  ProgressBar,
  ScoreDial,
  Select,
} from '@/components/ui/primitives'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { DemonstrationNotice, EmptyState, ErrorState, LoadingState } from '@/components/ui/states'
import { ConfirmDialog, Tabs } from '@/components/ui/overlays'
import { ChartFrame } from '@/components/charts/ChartFrame'
import { GovPanel } from '@/components/gov/GovPanel'
import { CATEGORICAL_SERIES, DonutChart, RankedBarChart } from '@/components/charts/charts'
import { useServiceQuery, useServiceAction } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { securityService } from '@/services'
import { allowed, getRole } from '@/security'
import { useCurrentUser } from '@/stores/auth.store'
import { useDrawerStore } from '@/stores/ui.store'
import { usePageMasthead } from '@/stores/masthead.store'
import { userDisplayName } from '@/auth/demo-users'
import { formatDate, formatDateTime, formatPercent, formatRelative } from '@/utils/format'
import { SECURITY_EVENT_LABEL, type SecurityEvent } from '@/types/governance'
import { SEVERITY_LABEL, type Severity } from '@/types/common'
import type { Session, User } from '@/types/organisation'
import { cn } from '@/utils/cn'
import { t } from '@/i18n'

/**
 * src/pages/trust/SecurityCommandCentrePage.tsx
 *
 * Flagship module. Posture, the security event workflow and identity &
 * access in one command surface, calling `securityService` throughout -
 * every figure here is a real service result, not a mock.
 */

const STATUS_OPTIONS: SecurityEvent['status'][] = ['open', 'investigating', 'contained', 'closed', 'false-positive']
const STATUS_TONE: Record<SecurityEvent['status'], 'critical' | 'warn' | 'info' | 'positive' | 'muted'> = {
  open: 'critical',
  investigating: 'warn',
  contained: 'info',
  closed: 'positive',
  'false-positive': 'muted',
}

export function SecurityCommandCentrePage(): React.JSX.Element {
  const currentUser = useCurrentUser()
  const openDrawer = useDrawerStore((s) => s.open)
  const [tab, setTab] = useState<'events' | 'identity'>('events')

  // The shell's masthead carries the screen's name; the page states the wording.
  usePageMasthead(t('Security Command Centre'))

  const postureQuery = useServiceQuery(queryKeys.security('posture'), (user) => securityService.posture(user))
  const eventsQuery = useServiceQuery(queryKeys.security('events'), (user) => securityService.events(user))
  const usersQuery = useServiceQuery(queryKeys.security('users'), (user) => securityService.users(user))
  const sessionsQuery = useServiceQuery(queryKeys.security('sessions'), (user) => securityService.sessions(user))

  const [severityFilter, setSeverityFilter] = useState<Severity | ''>('')
  const [statusFilter, setStatusFilter] = useState<SecurityEvent['status'] | ''>('')
  const [statusEditEvent, setStatusEditEvent] = useState<SecurityEvent | null>(null)
  const [nextStatus, setNextStatus] = useState<SecurityEvent['status']>('investigating')

  const updateStatus = useServiceAction(
    (user, id: string, status: SecurityEvent['status'], reason: string) =>
      securityService.updateEventStatus(user, id, status, reason),
    [queryKeys.security('events'), queryKeys.security('posture')],
  )

  const events = eventsQuery.data ?? []
  const filteredEvents = useMemo(
    () =>
      events.filter(
        (e) => (!severityFilter || e.severity === severityFilter) && (!statusFilter || e.status === statusFilter),
      ),
    [events, severityFilter, statusFilter],
  )

  const canEditEvents = allowed(currentUser, 'security', 'edit', { domain: 'security' })

  if (postureQuery.isLoading || eventsQuery.isLoading) return <LoadingState variant="metrics" />
  if (postureQuery.error) return <ErrorState detail={postureQuery.error.message} onRetry={() => postureQuery.refetch()} />
  if (eventsQuery.error) return <ErrorState detail={eventsQuery.error.message} onRetry={() => eventsQuery.refetch()} />
  const posture = postureQuery.data
  if (!posture) return <EmptyState title={t('Security posture unavailable')} />

  const eventColumns: Array<Column<SecurityEvent>> = [
    {
      id: 'reference',
      header: t('Reference'),
      cell: (e) => <span className="font-mono text-[0.6875rem] text-ink-600">{e.reference}</span>,
      sortValue: (e) => e.reference,
    },
    {
      id: 'type',
      header: t('Type'),
      cell: (e) => <Badge tone="muted">{SECURITY_EVENT_LABEL[e.type]}</Badge>,
      sortValue: (e) => SECURITY_EVENT_LABEL[e.type],
    },
    {
      id: 'severity',
      header: t('Severity'),
      cell: (e) => (
        <Badge tone={e.severity === 'critical' ? 'critical' : e.severity === 'high' ? 'risk' : e.severity === 'medium' ? 'warn' : 'neutral'} dot>
          {SEVERITY_LABEL[e.severity]}
        </Badge>
      ),
      sortValue: (e) => e.severity,
    },
    {
      id: 'detected',
      header: t('Detected'),
      cell: (e) => formatRelative(e.detectedAt),
      sortValue: (e) => e.detectedAt,
    },
    {
      id: 'subject',
      header: t('Subject user'),
      cell: (e) => e.subjectUserName,
      sortValue: (e) => e.subjectUserName,
      searchValue: (e) => `${e.subjectUserName} ${e.description}`,
      hideBelow: 'lg',
    },
    {
      id: 'role',
      header: t('Role'),
      cell: (e) => (e.subjectRole ? getRole(e.subjectRole)?.name ?? e.subjectRole : '-'),
      sortValue: (e) => e.subjectRole ?? '',
      hideBelow: 'xl',
    },
    {
      id: 'session',
      header: t('Session'),
      cell: (e) => <span className="font-mono text-[0.625rem] text-ink-400">{e.sessionId ?? '-'}</span>,
      hideBelow: 'xl',
      sortable: false,
    },
    {
      id: 'device',
      header: t('Device'),
      cell: (e) => <span className="text-[0.75rem] text-ink-500">{e.device}</span>,
      sortValue: (e) => e.device,
      hideBelow: 'lg',
    },
    {
      id: 'source',
      header: t('Source address'),
      cell: () => <span className="font-mono text-[0.625rem] text-ink-300">{'•••• (not recorded)'}</span>,
      sortable: false,
      hideBelow: 'xl',
    },
    {
      id: 'status',
      header: t('Status'),
      cell: (e) => (
        <Badge tone={STATUS_TONE[e.status]} dot>
          {e.status.replace('-', ' ')}
        </Badge>
      ),
      sortValue: (e) => e.status,
    },
    {
      id: 'owner',
      header: t('Owner'),
      cell: (e) => userDisplayName(e.ownerId),
      sortValue: (e) => userDisplayName(e.ownerId),
      hideBelow: 'lg',
    },
  ]

  const typeChartData = (Object.keys(SECURITY_EVENT_LABEL) as SecurityEvent['type'][])
    .map((securityEventType) => ({ label: SECURITY_EVENT_LABEL[securityEventType], value: events.filter((e) => e.type === securityEventType).length }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value)

  const severityChartData = (['critical', 'high', 'medium', 'low', 'info'] as Severity[])
    .map((s, i) => ({ label: SEVERITY_LABEL[s], value: events.filter((e) => e.severity === s).length, colour: CATEGORICAL_SERIES[i] }))
    .filter((d) => d.value > 0)

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('Trust Centre - Flagship')}
        breadcrumbs={[{ label: t('Trust Centre'), to: '/trust' }, { label: t('Security Command Centre') }]}
      />

      {/* ---------------------------------------------------------------- Posture */}
      <div className="grid gap-4 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <Card className="flex flex-col items-center justify-center text-center">
          <ScoreDial score={posture.authenticationHealth} label="/ 100" caption={t('Authentication health')} size={104} />
        </Card>
        <MetricGrid columns={4}>
          <Card background="red">
            <p className="label-institutional">{t('MFA coverage')}</p>
            <p className="numeric mt-2 text-metric font-semibold text-ink-900">{formatPercent(posture.mfaCoveragePct, 1)}</p>
            <ProgressBar value={posture.mfaCoveragePct} size="xs" className="mt-2" />
          </Card>
          <Card background="amber">
            <p className="label-institutional">{t('Privileged accounts')}</p>
            <p className="numeric mt-2 text-metric font-semibold text-ink-900">{posture.privilegedAccounts}</p>
          </Card>
          <Card tone={posture.privilegedWithoutMfa > 0 ? 'critical' : 'default'} background="green">
            <p className="label-institutional">{t('Privileged without MFA')}</p>
            <p className={cn('numeric mt-2 text-metric font-semibold', posture.privilegedWithoutMfa > 0 ? 'text-crit-700' : 'text-ink-900')}>
              {posture.privilegedWithoutMfa}
            </p>
            {posture.privilegedWithoutMfa > 0 ? (
              <p className="mt-1 flex items-center gap-1 text-[0.625rem] font-medium text-crit-700">
                <AlertTriangle className="h-3 w-3" />{' '}{t('Requires attention')}
              </p>
            ) : null}
          </Card>
          <Card>
            <p className="label-institutional">{t('Suspicious sessions')}</p>
            <p className="numeric mt-2 text-metric font-semibold text-ink-900">{posture.suspiciousSessions}</p>
          </Card>
        </MetricGrid>
      </div>

      <MetricGrid columns={4}>
        <Card background="amber">
          <p className="label-institutional">{t('Policy violations (30d)')}</p>
          <p className="numeric mt-2 text-metric font-semibold text-ink-900">{posture.policyViolations30d}</p>
        </Card>
        <Card background="green">
          <p className="label-institutional">{t('Security events (30d)')}</p>
          <p className="numeric mt-2 text-metric font-semibold text-ink-900">{posture.securityEvents30d}</p>
        </Card>
        <Card background="red">
          <p className="label-institutional">{t('Integrations requiring review')}</p>
          <p className="numeric mt-2 text-metric font-semibold text-ink-900">{posture.integrationsRequiringReview}</p>
        </Card>
        <Card>
          <p className="label-institutional">{t('Last assessment')}</p>
          <p className="mt-2 text-sm font-semibold text-ink-900">{formatDate(posture.lastAssessmentAt)}</p>
        </Card>
      </MetricGrid>

      {/* Vulnerabilities, encryption and the certification note read as one
          posture band rather than three stacked rows. */}
      <div className="grid gap-4 lg:grid-cols-3">
        <GovPanel title={t('Open vulnerabilities by severity')} tone="amber">
          <div className="grid grid-cols-4 gap-2">
            {(['critical', 'high', 'medium', 'low'] as const).map((sev) => (
              <div key={sev} className="rounded-md bg-surface-sunken px-2 py-2 text-center">
                <p className="numeric text-lg font-semibold text-ink-900">{posture.openVulnerabilities[sev]}</p>
                <p className="mt-0.5 text-[0.625rem] text-ink-500 capitalize">{sev}</p>
              </div>
            ))}
          </div>
        </GovPanel>
        <GovPanel title={t('Encryption posture')} tone="red">
          <DefinitionList>
            <DefinitionRow label={t('In transit')}>
              <StateBadge state={posture.encryptionInTransit} />
            </DefinitionRow>
            <DefinitionRow label={t('At rest')}>
              <StateBadge state={posture.encryptionAtRest} />
            </DefinitionRow>
          </DefinitionList>
        </GovPanel>
        <Card tone="warn">
          <div className="flex items-start gap-2.5">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-warn-700" />
            <p className="text-[0.8125rem] leading-relaxed text-ink-800">{posture.certificationNote}</p>
          </div>
        </Card>
      </div>

      {/* ------------------------------------------------------------ Tabs */}
      <Tabs
        items={[
          { id: 'events', label: t('Security events'), count: events.length },
          { id: 'identity', label: t('Identity & access'), count: (usersQuery.data ?? []).length || undefined },
        ]}
        value={tab}
        onChange={(id) => setTab(id as 'events' | 'identity')}
        ariaLabel="Security Command Centre sections"
      />

      {tab === 'events' ? (
        /* Two columns. The event register is the record and holds the wide
           column; the two distributions are summaries of those same rows and
           read beside them. */
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          <div className="flex min-w-0 flex-col gap-4 xl:col-span-8">
          <GovPanel
            title={t('Security events')}
            tone="amber"
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  value={severityFilter}
                  onChange={(e) => setSeverityFilter(e.target.value as Severity | '')}
                  options={[
                    { value: '', label: t('All severities') },
                    ...(Object.keys(SEVERITY_LABEL) as Severity[]).map((s) => ({ value: s, label: SEVERITY_LABEL[s] })),
                  ]}
                />
                <Select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as SecurityEvent['status'] | '')}
                  options={[{ value: '', label: t('All statuses') }, ...STATUS_OPTIONS.map((s) => ({ value: s, label: s.replace('-', ' ') }))]}
                />
              </div>
            }
          >
            <p className="mb-3 text-xs leading-relaxed text-ink-500">{t('Every recorded security event within scope. Select a row to open the full record.')}</p>
            <div>
              <DataTable
                rows={filteredEvents}
                columns={eventColumns}
                rowKey={(e) => e.id}
                onRowClick={(e) => openDrawer({ kind: 'security-event', id: e.id })}
                searchable
                searchPlaceholder="Search events by subject or description"
                pageSize={10}
                initialSort={{ columnId: 'detected', direction: 'desc' }}
                rowAccent={(e) => (
                  <span className={cn('block h-full w-full rounded-full', e.severity === 'critical' ? 'bg-crit-500' : e.severity === 'high' ? 'bg-risk-500' : 'bg-transparent')} />
                )}
                rowActions={(e) => (
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={!canEditEvents}
                    title={canEditEvents ? 'Update the status of this security event' : 'Your role does not hold security:edit. This control is disabled by the permission engine.'}
                    onClick={(ev) => {
                      ev.stopPropagation()
                      setNextStatus(STATUS_OPTIONS.find((s) => s !== e.status) ?? 'investigating')
                      setStatusEditEvent(e)
                    }}
                  >
                    {t('Update status')}
                  </Button>
                )}
              />
            </div>
          </GovPanel>
          </div>

          <div className="flex min-w-0 flex-col gap-4 xl:col-span-4">
            <Card>
              <ChartFrame title={t('Events by type')} unit="events" timeframe="All recorded events" height={Math.max(200, typeChartData.length * 26)}>
                <RankedBarChart data={typeChartData} unit="" higherIsWorse />
              </ChartFrame>
            </Card>
            <Card>
              <ChartFrame title={t('Severity distribution')} unit="events" timeframe="All recorded events" height={220}>
                <DonutChart data={severityChartData} centreValue={String(events.length)} centreLabel="events" />
              </ChartFrame>
            </Card>
          </div>
        </div>
      ) : (
        /* Two columns. Who holds an account reads down the wide column; what
           they are currently doing with it sits beside the register. */
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          <div className="flex min-w-0 flex-col gap-4 xl:col-span-8">
          <GovPanel title={t('Demonstration principals')} tone="amber">
            {usersQuery.isLoading ? (
              <LoadingState variant="table" />
            ) : usersQuery.error ? (
              <ErrorState detail={usersQuery.error.message} onRetry={() => usersQuery.refetch()} />
            ) : (
              <div>
                <DataTable
                  rows={usersQuery.data ?? []}
                  rowKey={(u: User) => u.id}
                  searchable
                  searchPlaceholder="Search principals"
                  pageSize={10}
                  columns={[
                    {
                      id: 'name',
                      header: t('Principal'),
                      cell: (u: User) => (
                        <div className="min-w-0">
                          <p className="font-medium text-ink-800">{u.name}</p>
                          <p className="text-[0.6875rem] text-ink-400">{u.designation}</p>
                        </div>
                      ),
                      sortValue: (u: User) => u.name,
                    },
                    {
                      id: 'role',
                      header: t('Role'),
                      cell: (u: User) => getRole(u.roleId)?.name ?? u.roleId,
                      sortValue: (u: User) => getRole(u.roleId)?.name ?? '',
                    },
                    {
                      id: 'scope',
                      header: t('Scope'),
                      cell: (u: User) =>
                        u.scope.wardIds === '*' ? 'City-wide' : `${u.scope.wardIds.length} ward(s)`,
                      sortValue: (u: User) => (u.scope.wardIds === '*' ? 999 : u.scope.wardIds.length),
                      hideBelow: 'lg',
                    },
                    {
                      id: 'ceiling',
                      header: t('Classification ceiling'),
                      cell: (u: User) => <ClassificationBadge classification={getRole(u.roleId)?.maxClassification ?? 'public'} />,
                      sortValue: (u: User) => getRole(u.roleId)?.maxClassification ?? '',
                      hideBelow: 'md',
                    },
                    {
                      id: 'mfa',
                      header: t('MFA posture'),
                      cell: (u: User) => (
                        <Badge tone={u.mfaEnrolled ? 'positive' : 'critical'} dot>
                          {u.mfaEnrolled ? 'Enrolled' : 'Not enrolled'}
                        </Badge>
                      ),
                      sortValue: (u: User) => (u.mfaEnrolled ? 1 : 0),
                    },
                    {
                      id: 'lastSignIn',
                      header: t('Last sign-in'),
                      cell: (u: User) => formatRelative(u.lastSignInAt),
                      sortValue: (u: User) => u.lastSignInAt,
                    },
                    {
                      id: 'status',
                      header: t('Status'),
                      cell: (u: User) => (
                        <Badge tone={u.status === 'active' ? 'positive' : u.status === 'suspended' ? 'critical' : 'warn'} dot>
                          {u.status.replace('-', ' ')}
                        </Badge>
                      ),
                      sortValue: (u: User) => u.status,
                    },
                  ]}
                />
              </div>
            )}
          </GovPanel>
          </div>

          <div className="flex min-w-0 flex-col gap-4 xl:col-span-4">
          <GovPanel title={t('Active sessions')} tone="amber">
            <p className="mb-3 text-xs leading-relaxed text-ink-500">{t('Sessions established through the authentication service during this browser session.')}</p>
            {sessionsQuery.isLoading ? (
              <LoadingState variant="inline" />
            ) : sessionsQuery.error ? (
              <ErrorState detail={sessionsQuery.error.message} onRetry={() => sessionsQuery.refetch()} />
            ) : (sessionsQuery.data ?? []).length === 0 ? (
              <EmptyState
                compact
                title={t('No tracked sessions in this browser session')}
                detail="The demonstration role switcher changes the acting principal without establishing a new tracked session. Signing out and back in through the login screen creates one."
              />
            ) : (
              <div className="space-y-2">
                {(sessionsQuery.data as Session[]).map((s) => (
                  <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface-sunken px-3 py-2">
                    <div className="min-w-0">
                      <p className="font-mono text-[0.6875rem] text-ink-600">{s.id}</p>
                      <p className="text-[0.75rem] text-ink-700">{userDisplayName(s.userId)} · {s.device}</p>
                    </div>
                    <div className="flex items-center gap-2 text-[0.6875rem] text-ink-500">
                      <span>{t('Started {0}', formatDateTime(s.startedAt))}</span>
                      <Badge tone={s.mfaSatisfied ? 'positive' : 'critical'}>{s.mfaSatisfied ? 'MFA satisfied' : 'MFA not satisfied'}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </GovPanel>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(statusEditEvent)}
        onClose={() => setStatusEditEvent(null)}
        onConfirm={(reason) => {
          if (!statusEditEvent) return
          void updateStatus(statusEditEvent.id, nextStatus, reason)
        }}
        title={statusEditEvent ? `Update status - ${statusEditEvent.reference}` : 'Update status'}
        description={t('This status change is written permanently to the audit trail against your name.')}
        confirmLabel={t('Update status')}
        intent="primary"
        requireReason
        extra={
          <div>
            <Label htmlFor="next-status">{t('New status')}</Label>
            <Select
              id="next-status"
              value={nextStatus}
              onChange={(e) => setNextStatus(e.target.value as SecurityEvent['status'])}
              options={STATUS_OPTIONS.map((s) => ({ value: s, label: s.replace('-', ' ') }))}
            />
          </div>
        }
      />

      <DemonstrationNotice />
    </PageBody>
  )
}

export default SecurityCommandCentrePage
