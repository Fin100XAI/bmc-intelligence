import { useMemo, useState } from 'react'
import { Lock, ScrollText, ShieldCheck } from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import { useServiceQuery } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { aiService } from '@/services'
import { usePageMasthead } from '@/stores/masthead.store'
import { getRole } from '@/security'
import { isoFromAnchor } from '@/utils/deterministic'
import { formatRelative } from '@/utils/format'
import { AI_USE_CASE_LABEL, type PromptTemplate } from '@/types/ai'
import {
  Badge,
  Card,
  DataTable,
  DemonstrationNotice,
  EmptyState,
  ErrorState,
  Label,
  LoadingState,
  MetricGrid,
  Select,
  type Column,
} from '@/components/ui'
import { MetricCard } from '@/components/cards'
import { GovPanel } from '@/components/gov/GovPanel'
import { t } from '@/i18n'

/**
 * Prompt Registry.
 *
 * Every prompt template the governed AI layer is permitted to use - versioned,
 * approved, with declared guardrails and the roles authorised to invoke it.
 * A prompt in production use is immutable: a change creates a new version
 * with its own approval record, never a silent edit of a live template.
 */

const FRESHNESS = {
  generatedAt: isoFromAnchor(0),
  sourceObservedAt: isoFromAnchor(-1440),
  refreshIntervalMinutes: 1440,
  origin: 'demonstration' as const,
  sourceState: 'operational' as const,
  stale: false,
}

const APPROVAL_TONE: Record<PromptTemplate['approvalStatus'], 'positive' | 'warn' | 'neutral' | 'critical'> = {
  approved: 'positive',
  'under-review': 'warn',
  draft: 'neutral',
  withdrawn: 'critical',
}

const RISK_TONE: Record<PromptTemplate['riskClass'], 'positive' | 'warn' | 'critical'> = {
  limited: 'positive',
  moderate: 'warn',
  high: 'critical',
}

export function PromptRegistryPage(): React.JSX.Element {
  // The shell's masthead states the screen's name; the page states the wording.
  usePageMasthead(t('Prompt Registry'))

  const promptsQuery = useServiceQuery(queryKeys.ai('prompts'), (u) => aiService.prompts(u))
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [approvalFilter, setApprovalFilter] = useState<'all' | PromptTemplate['approvalStatus']>('all')
  const [riskFilter, setRiskFilter] = useState<'all' | PromptTemplate['riskClass']>('all')

  const prompts = promptsQuery.data ?? []

  const filtered = useMemo(
    () =>
      prompts.filter((p) => {
        if (approvalFilter !== 'all' && p.approvalStatus !== approvalFilter) return false
        if (riskFilter !== 'all' && p.riskClass !== riskFilter) return false
        return true
      }),
    [prompts, approvalFilter, riskFilter],
  )

  const selected = prompts.find((p) => p.id === selectedId) ?? filtered[0] ?? null

  const columns: Array<Column<PromptTemplate>> = [
    {
      id: 'title',
      header: t('Prompt'),
      cell: (row) => <span className="font-medium text-ink-900">{row.title}</span>,
      sortValue: (row) => row.title,
      searchValue: (row) => `${row.title} ${row.id} ${row.body}`,
      width: '16rem',
    },
    { id: 'id', header: t('Prompt ID'), cell: (row) => <span className="font-mono text-[0.6875rem] text-ink-500">{row.id}</span>, sortValue: (row) => row.id, hideBelow: 'lg' },
    {
      id: 'useCase',
      header: t('Use case'),
      cell: (row) => <Badge tone="intel">{AI_USE_CASE_LABEL[row.useCase]}</Badge>,
      sortValue: (row) => row.useCase,
    },
    { id: 'owner', header: t('Owner'), cell: (row) => row.ownerId, sortValue: (row) => row.ownerId, hideBelow: 'xl' },
    { id: 'version', header: t('Version'), cell: (row) => <span className="font-mono text-xs">{row.version}</span>, sortValue: (row) => row.version, hideBelow: 'md' },
    {
      id: 'approval',
      header: t('Approval status'),
      cell: (row) => <Badge tone={APPROVAL_TONE[row.approvalStatus]} dot>{row.approvalStatus.replace(/-/g, ' ')}</Badge>,
      sortValue: (row) => row.approvalStatus,
    },
    {
      id: 'risk',
      header: t('Risk class'),
      cell: (row) => <Badge tone={RISK_TONE[row.riskClass]}>{row.riskClass}</Badge>,
      sortValue: (row) => row.riskClass,
    },
    {
      id: 'modified',
      header: t('Last modified'),
      cell: (row) => formatRelative(row.lastModifiedAt),
      sortValue: (row) => row.lastModifiedAt,
      hideBelow: 'lg',
    },
    {
      id: 'roles',
      header: t('Allowed roles'),
      cell: (row) => <span className="numeric text-ink-600">{row.allowedRoles.length}</span>,
      sortValue: (row) => row.allowedRoles.length,
      align: 'center',
      hideBelow: 'xl',
    },
  ]

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('AI & Automation')}
        breadcrumbs={[{ label: t('AI & Automation') }, { label: t('Prompt Registry') }]}
        freshness={FRESHNESS}
      />

      {promptsQuery.isLoading ? <LoadingState variant="metrics" /> : null}
      {promptsQuery.error ? <ErrorState detail={promptsQuery.error.message} onRetry={() => promptsQuery.refetch()} /> : null}

      {/* ── Two columns ─────────────────────────────────────────────
          The register reads down the wide column, filters directly above the
          table they narrow. The template an officer has opened — its body,
          guardrails and the roles that may invoke it — stands beside it, with
          the standing figures and the immutability rule beneath. */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-3 xl:col-span-8">
          {!promptsQuery.isLoading && !promptsQuery.error ? (
            prompts.length === 0 ? (
              <EmptyState title={t('No prompt templates registered')} detail="No prompt templates are visible within your authorised scope." />
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    aria-label={t('Filter by approval status')}
                    value={approvalFilter}
                    onChange={(e) => setApprovalFilter(e.target.value as typeof approvalFilter)}
                    className="w-auto min-w-[10rem]"
                    options={[
                      { value: 'all', label: t('All approval statuses') },
                      { value: 'approved', label: t('Approved') },
                      { value: 'under-review', label: t('Under review') },
                      { value: 'draft', label: t('Draft') },
                      { value: 'withdrawn', label: t('Withdrawn') },
                    ]}
                  />
                  <Select
                    aria-label={t('Filter by risk class')}
                    value={riskFilter}
                    onChange={(e) => setRiskFilter(e.target.value as typeof riskFilter)}
                    className="w-auto min-w-[9rem]"
                    options={[
                      { value: 'all', label: t('All risk classes') },
                      { value: 'limited', label: t('Limited risk') },
                      { value: 'moderate', label: t('Moderate risk') },
                      { value: 'high', label: t('High risk') },
                    ]}
                  />
                </div>

                <GovPanel title={t('Prompt templates')} tone="amber" dense>
                  <p className="px-3 pt-3 pb-2 text-xs leading-relaxed text-ink-500">
                    {t('Select a template to view its full body and guardrails alongside.')}
                  </p>
                  <DataTable
                    rows={filtered}
                    columns={columns}
                    rowKey={(row) => row.id}
                    pageSize={9}
                    stickyHeader
                    maxHeight="30rem"
                    searchPlaceholder="Search prompts"
                    onRowClick={(row) => setSelectedId(row.id)}
                    activeRowKey={selected?.id}
                    emptyTitle={t('No prompts match these filters')}
                    emptyDetail="Adjust the approval or risk filters above."
                  />
                </GovPanel>
              </>
            )
          ) : null}
        </div>

        {/* The whole column pins, not one panel of it: a `sticky` element stays
            in flow, so a panel below a pinned one would slide up underneath it. */}
        <div className="xl:col-span-4">
          <div className="scrollbar-rail flex flex-col gap-3 xl:sticky xl:top-[3.75rem] xl:max-h-[calc(100vh-4.5rem)] xl:overflow-y-auto">
            {!promptsQuery.isLoading && !promptsQuery.error && prompts.length > 0 ? (
              <MetricGrid columns={2}>
                <MetricCard label={t('Registered prompts')} value={prompts.length} icon={<ScrollText className="h-4 w-4" />} />
                <MetricCard label={t('Approved')} value={prompts.filter((p) => p.approvalStatus === 'approved').length} tone="positive" />
                <MetricCard label={t('Under review')} value={prompts.filter((p) => p.approvalStatus === 'under-review').length} tone="warn" />
                <MetricCard label={t('High risk class')} value={prompts.filter((p) => p.riskClass === 'high').length} tone={prompts.some((p) => p.riskClass === 'high') ? 'critical' : 'default'} />
              </MetricGrid>
            ) : null}

            {selected ? (
              <GovPanel
                title={selected.title}
                subtitle={t('{0} · v{1}', selected.id, selected.version)}
                tone="red"
                actions={<Badge tone={APPROVAL_TONE[selected.approvalStatus]} dot>{selected.approvalStatus.replace(/-/g, ' ')}</Badge>}
              >
                <p className="mb-3 text-xs leading-relaxed text-ink-500">
                  {t('{0} · last modified {1}', AI_USE_CASE_LABEL[selected.useCase], formatRelative(selected.lastModifiedAt))}
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <Badge tone={RISK_TONE[selected.riskClass]}>{selected.riskClass} risk</Badge>
                  <Badge tone="muted">{t('Owner: {0}', selected.ownerId)}</Badge>
                </div>

                <div className="mt-4">
                  <Label>{t('Prompt body')}</Label>
                  <pre className="scrollbar-slim max-h-72 overflow-auto whitespace-pre-wrap rounded-[2px] border border-ink-100 bg-surface-sunken p-3 font-mono text-[0.6875rem] leading-relaxed text-ink-700">
                    {selected.body}
                  </pre>
                </div>

                <div className="mt-4">
                  <Label>{t('Guardrails')}</Label>
                  {selected.guardrails.length === 0 ? (
                    <p className="text-xs text-ink-400">{t('No guardrail is separately declared for this template.')}</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {selected.guardrails.map((g) => (
                        <li key={g} className="flex items-start gap-1.5 text-xs leading-relaxed text-ink-700">
                          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-govt-600" />
                          {g}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="mt-4">
                  <Label>{t('Allowed roles')}</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {selected.allowedRoles.map((roleId) => (
                      <Badge key={roleId} tone="neutral">
                        {getRole(roleId)?.name ?? roleId}
                      </Badge>
                    ))}
                  </div>
                </div>
              </GovPanel>
            ) : (
              <EmptyState title={t('No prompt selected')} detail="Select a prompt from the register to view its body and guardrails." />
            )}

            <Card tone="info">
              <p className="flex items-start gap-2 text-xs leading-relaxed text-ink-700">
                <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-govt-600" />
                {t('Prompts in this registry are versioned, formally approved and immutable at runtime. A revision to an approved prompt is published as a new version with its own approval record - the platform never applies a silent in-place edit to a template already governing live requests.')}
              </p>
            </Card>

            <DemonstrationNotice />
          </div>
        </div>
      </div>
    </PageBody>
  )
}

export default PromptRegistryPage
