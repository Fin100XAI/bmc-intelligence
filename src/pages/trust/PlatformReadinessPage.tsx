import { useMemo, useState } from 'react'
import { RotateCcw, Target } from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/badges'
import {
  Button,
  Card,
  Input,
  MetricGrid,
  ProgressBar,
  SegmentedControl,
  Select,
} from '@/components/ui/primitives'
import { DemonstrationNotice, EmptyState, ErrorState, LoadingState } from '@/components/ui/states'
import { GovPanel } from '@/components/gov/GovPanel'
import { useServiceQuery } from '@/hooks'
import { platformService } from '@/services'
import { usePageMasthead } from '@/stores/masthead.store'
import { cn } from '@/utils/cn'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/**
 * src/pages/trust/PlatformReadinessPage.tsx
 *
 * The transparency page. Two lists: what this demonstration actually
 * implements, and what a production deployment additionally requires. No item
 * on either side is dressed up or hedged.
 *
 * What makes the right-hand list useful rather than merely honest is the
 * `heldBy` field. Most of what stands between this build and production is not
 * engineering — it is a signed agreement, a completed review, a hosting
 * decision taken by someone who does not write code. Sorting the gap by *who
 * has to act* turns a list of caveats into a plan, and stops a reader assuming
 * that a longer sprint would close it.
 */

type ReadinessCategory =
  | 'access-identity'
  | 'data-integration'
  | 'security'
  | 'privacy-legal'
  | 'ai-governance'
  | 'operations'
  | 'infrastructure'
  | 'multi-tenant'

function build$CATEGORY_LABEL(): Record<ReadinessCategory, string> {
  return {
  'access-identity': t('Access & identity'),
  'data-integration': t('Data & integration'),
  security: t('Security'),
  'privacy-legal': t('Privacy & legal'),
  'ai-governance': t('AI governance'),
  operations: t('Operations'),
  infrastructure: t('Infrastructure'),
  'multi-tenant': t('Multi-tenant / reusable engine'),
}
}
let CATEGORY_LABEL: Record<ReadinessCategory, string> = build$CATEGORY_LABEL()
registerLayer(() => {
  CATEGORY_LABEL = build$CATEGORY_LABEL()
})

/** Who actually has to act. Nearly everything outstanding is not engineering. */
type Holder = 'platform-engineering' | 'corporation' | 'third-party' | 'state-government'

function build$HOLDER_LABEL(): Record<Holder, string> {
  return {
  'platform-engineering': t('Platform engineering'),
  corporation: t('The corporation'),
  'third-party': t('An independent third party'),
  'state-government': t('State government'),
}
}
let HOLDER_LABEL: Record<Holder, string> = build$HOLDER_LABEL()
registerLayer(() => {
  HOLDER_LABEL = build$HOLDER_LABEL()
})

const HOLDER_TONE: Record<Holder, 'info' | 'warn' | 'intel' | 'muted'> = {
  'platform-engineering': 'info',
  corporation: 'warn',
  'third-party': 'intel',
  'state-government': 'muted',
}

interface ImplementedItem {
  title: string
  detail: string
  category: ReadinessCategory
}

interface RequiredItem extends ImplementedItem {
  heldBy: Holder
  /** Rough scale, stated as a band because a precise estimate would be false. */
  scale: 'weeks' | 'months' | 'quarters'
}

function build$IMPLEMENTED(): ImplementedItem[] {
  return [
  { category: 'access-identity', title: t('Role-based and attribute-based access control engine'), detail: t('A single `canAccess` function evaluates role grants together with ward, department, domain and classification attributes on every read and write.') },
  { category: 'security', title: t('Institutional audit trail'), detail: t('Every consequential action - approvals, transitions, exports, denials - is written to an append-style event log with actor, reason and outcome.') },
  { category: 'data-integration', title: t('Evidence and lineage provenance chain'), detail: t('Every intelligence item, alert and decision traces back through transformation, metric and source with a visual provenance rail.') },
  { category: 'ai-governance', title: t('AI governance registers'), detail: t('A model registry, prompt registry, AI risk register and human oversight workflow with acceptance/modification/rejection rates.') },
  { category: 'ai-governance', title: t('Human-in-the-loop enforcement points'), detail: t('Named high-impact actions - expenditure approval, payment sanction, penalty, procurement award, record amendment - are technically blocked from AI execution.') },
  { category: 'access-identity', title: t('Multi-role demonstration identity set'), detail: t('Fourteen illustrative principals spanning executive, senior, operational and oversight bands, each with a distinct scope.') },
  { category: 'data-integration', title: t('Deterministic connector simulations'), detail: t('Adapter contracts for every departmental source, producing schema-accurate demonstration data with declared latency and quality.') },
  { category: 'access-identity', title: t('Tenant-isolation architecture'), detail: t('Every record carries a tenant identifier and every service call filters to it before any further check is applied.') },
  { category: 'privacy-legal', title: t('Classification-aware data handling'), detail: t('Public, internal, confidential and restricted classification is enforced consistently from data model through to the interface.') },
  { category: 'operations', title: t('Workflow state machines'), detail: t('Intelligence, alert, incident and decision lifecycles progress only through declared transitions, several requiring a recorded reason.') },
  { category: 'data-integration', title: t('Data lineage graphs'), detail: t('Source → ingestion → validation → canonical entity → derived metric → intelligence → dashboard → decision, modelled per metric with a quality score at every stage.') },
  { category: 'data-integration', title: t('Deterministic, reproducible demonstration data'), detail: t('Every figure is generated from a fixed seed, so the same principal sees the same city on every visit - no figure moves without cause.') },
  { category: 'multi-tenant', title: t('Corporation registry and factual-spine schema'), detail: t('A single `CorporationRef` type carries every published fact a deployment is built on - area, population, budget, water supply, sources - already shaped to hold any Maharashtra municipal corporation, not just Brihanmumbai.') },
  { category: 'multi-tenant', title: t('Ward and zone resolution, generalised'), detail: t('`resolveWardCount` / `resolveDivisions` derive a corporation\'s administrative units from whatever it actually publishes - named divisions, administrative wards, electoral seats or zones - rather than assuming Brihanmumbai\'s own 24-ward structure.') },
  { category: 'multi-tenant', title: t('Tenant-agnostic AI evaluation'), detail: t('Model and prompt evaluations run against the platform\'s AI gateway, not against any one corporation\'s data - a passed evaluation applies unchanged to every tenant the engine serves.') },
  { category: 'multi-tenant', title: t('Bilingual interface, corporation-independent'), detail: t('English and Marathi coverage is a platform-wide layer, not authored per deployment - a newly onboarded corporation inherits full translation from day one.') },
]
}
let IMPLEMENTED: ImplementedItem[] = build$IMPLEMENTED()
registerLayer(() => {
  IMPLEMENTED = build$IMPLEMENTED()
})

function build$PRODUCTION_REQUIREMENTS(): RequiredItem[] {
  return [
  { category: 'data-integration', heldBy: 'corporation', scale: 'quarters', title: t('Authoritative departmental integrations'), detail: t('Real connections to the systems of record - grievance, financial management, SCADA, asset registers - replacing every simulated adapter with a governed live feed.') },
  { category: 'access-identity', heldBy: 'corporation', scale: 'months', title: t('Production identity provider'), detail: t('Federated institutional single sign-on replacing the demonstration profile switcher, so every principal is a real, individually accountable officer.') },
  { category: 'access-identity', heldBy: 'corporation', scale: 'months', title: t('Enforced multi-factor authentication'), detail: t('Mandatory MFA at sign-in for every account, particularly privileged roles, closing the gap this environment surfaces but does not enforce.') },
  { category: 'infrastructure', heldBy: 'state-government', scale: 'quarters', title: t('Sovereign hosting decision'), detail: t('A determined hosting jurisdiction and infrastructure ownership model appropriate to municipal and citizen data sensitivity.') },
  { category: 'security', heldBy: 'platform-engineering', scale: 'months', title: t('Encryption key management'), detail: t('A managed key lifecycle - generation, rotation, escrow and revocation - for data at rest and in transit, rather than an environment-level assumption.') },
  { category: 'infrastructure', heldBy: 'platform-engineering', scale: 'months', title: t('Production database'), detail: t('A durable, backed-up, access-controlled data store replacing the in-session, browser-lifetime demonstration store.') },
  { category: 'security', heldBy: 'platform-engineering', scale: 'months', title: t('Real append-only audit store'), detail: t('A tamper-evident, independently retained audit log - the current in-session trail resets on reload and cannot alone satisfy an institutional assurance requirement.') },
  { category: 'security', heldBy: 'corporation', scale: 'quarters', title: t('SIEM / SOC integration'), detail: t('Security events routed to a monitored security operations capability with defined escalation, rather than surfaced only within this application.') },
  { category: 'infrastructure', heldBy: 'platform-engineering', scale: 'quarters', title: t('Backup and disaster recovery'), detail: t('A tested recovery point and recovery time objective for every production data store and service.') },
  { category: 'security', heldBy: 'third-party', scale: 'months', title: t('Independent security assessment'), detail: t('A third-party penetration test and architecture review - this environment carries no security certification or attestation of any kind.') },
  { category: 'privacy-legal', heldBy: 'corporation', scale: 'months', title: t('Privacy review'), detail: t('A formal privacy impact assessment against applicable data protection obligations for each dataset before it is connected.') },
  { category: 'privacy-legal', heldBy: 'corporation', scale: 'quarters', title: t('Data-sharing agreements'), detail: t('Signed inter-departmental and, where relevant, inter-agency agreements establishing purpose, retention and access terms before any live feed is provisioned.') },
  { category: 'ai-governance', heldBy: 'third-party', scale: 'months', title: t('Model evaluation'), detail: t('Documented evaluation of every AI model against accuracy, bias and safety criteria before production use, beyond the illustrative evaluation status shown here.') },
  { category: 'ai-governance', heldBy: 'corporation', scale: 'quarters', title: t('AI governance approvals'), detail: t('Formal sign-off from an AI governance authority for each approved use case, prompt template and risk disposition.') },
  { category: 'operations', heldBy: 'corporation', scale: 'months', title: t('Operational standard operating procedures'), detail: t('Documented runbooks for incident response, escalation, change management and on-call ownership once the platform carries real operational weight.') },
  { category: 'multi-tenant', heldBy: 'platform-engineering', scale: 'months', title: t('A second sourced corporation record'), detail: t('Every field this build carries for Brihanmumbai - area, population, water supply, budget, each with a cited source - researched and populated for one further Maharashtra corporation, proving the roster generalises rather than asserting it.') },
  { category: 'multi-tenant', heldBy: 'platform-engineering', scale: 'months', title: t('Geography generator validated against a second city form'), detail: t('The ward-boundary generator has been exercised only against Brihanmumbai\'s coastal shape; a landlocked or river-bisected corporation needs its own generated geography checked for the same visual honesty before that corporation goes live.') },
  { category: 'multi-tenant', heldBy: 'corporation', scale: 'quarters', title: t('Per-corporation onboarding agreement'), detail: t('Each additional corporation the engine serves needs its own data-sharing, hosting and access agreement - the reusable engine lowers the engineering cost of a second deployment, not the institutional one.') },
]
}
let PRODUCTION_REQUIREMENTS: RequiredItem[] = build$PRODUCTION_REQUIREMENTS()
registerLayer(() => {
  PRODUCTION_REQUIREMENTS = build$PRODUCTION_REQUIREMENTS()
})

function build$SCALE_LABEL(): Record<RequiredItem['scale'], string> {
  return {
  weeks: t('Weeks'),
  months: t('Months'),
  quarters: t('Quarters'),
}
}
let SCALE_LABEL: Record<RequiredItem['scale'], string> = build$SCALE_LABEL()
registerLayer(() => {
  SCALE_LABEL = build$SCALE_LABEL()
})

/** Category and free-text filter, shared by both lists. */
function matchesFilters(item: ImplementedItem, category: ReadinessCategory | '', query: string): boolean {
  if (category && item.category !== category) return false
  if (!query) return true
  return `${item.title} ${item.detail}`.toLowerCase().includes(query)
}

export function PlatformReadinessPage(): React.JSX.Element {
  // The shell's masthead carries the screen's name; the page states the wording.
  usePageMasthead(t('Platform Readiness'))

  const summaryQuery = useServiceQuery(['trust-platform-readiness', 'summary'], (u) => platformService.summary(u))

  const [side, setSide] = useState<'both' | 'implemented' | 'required'>('both')
  const [categoryFilter, setCategoryFilter] = useState<ReadinessCategory | ''>('')
  const [holderFilter, setHolderFilter] = useState<Holder | ''>('')
  const [search, setSearch] = useState('')

  const query = search.trim().toLowerCase()

  const implemented = useMemo(
    () => IMPLEMENTED.filter((item) => matchesFilters(item, categoryFilter, query)),
    [categoryFilter, query],
  )
  const required = useMemo(
    () =>
      PRODUCTION_REQUIREMENTS.filter(
        (item) => matchesFilters(item, categoryFilter, query) && (!holderFilter || item.heldBy === holderFilter),
      ),
    [categoryFilter, holderFilter, query],
  )

  /** Where the gap sits by category — the readable form of the two lists. */
  const byCategory = useMemo(
    () =>
      (Object.keys(CATEGORY_LABEL) as ReadinessCategory[])
        .map((category) => {
          const done = IMPLEMENTED.filter((i) => i.category === category).length
          const outstanding = PRODUCTION_REQUIREMENTS.filter((i) => i.category === category).length
          return { category, done, outstanding, total: done + outstanding }
        })
        .filter((row) => row.total > 0)
        .sort((a, b) => b.outstanding - a.outstanding),
    [],
  )

  /** Who holds the outstanding work. Mostly not engineering — which is the point. */
  const byHolder = useMemo(
    () =>
      (Object.keys(HOLDER_LABEL) as Holder[])
        .map((holder) => ({ holder, count: PRODUCTION_REQUIREMENTS.filter((i) => i.heldBy === holder).length }))
        .filter((row) => row.count > 0)
        .sort((a, b) => b.count - a.count),
    [],
  )

  const activeFilters = (categoryFilter ? 1 : 0) + (holderFilter ? 1 : 0) + (query ? 1 : 0)
  const engineeringHeld = PRODUCTION_REQUIREMENTS.filter((i) => i.heldBy === 'platform-engineering').length


  if (summaryQuery.isLoading) return <LoadingState variant="metrics" />
  if (summaryQuery.error) return <ErrorState detail={summaryQuery.error.message} onRetry={() => summaryQuery.refetch()} />
  const summary = summaryQuery.data

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('Trust Centre')}
        breadcrumbs={[{ label: t('Trust Centre'), to: '/trust' }, { label: t('Platform Readiness') }]}
        controls={
          <div className="flex w-full flex-wrap items-center gap-2">
            <SegmentedControl<'both' | 'implemented' | 'required'>
              value={side}
              onChange={setSide}
              ariaLabel="Which side to show"
              options={[
                { value: 'both', label: t('Both') },
                { value: 'implemented', label: t('Implemented') },
                { value: 'required', label: t('Required') },
              ]}
            />
            <Select
              aria-label={t('Filter by category')}
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as ReadinessCategory | '')}
              options={[
                { value: '', label: t('All categories') },
                ...(Object.keys(CATEGORY_LABEL) as ReadinessCategory[]).map((c) => ({
                  value: c,
                  label: CATEGORY_LABEL[c],
                })),
              ]}
            />
            <Select
              aria-label={t('Filter by who holds the work')}
              value={holderFilter}
              onChange={(e) => setHolderFilter(e.target.value as Holder | '')}
              options={[
                { value: '', label: t('Held by anyone') },
                ...(Object.keys(HOLDER_LABEL) as Holder[]).map((h) => ({ value: h, label: HOLDER_LABEL[h] })),
              ]}
            />
            <div className="min-w-[12rem] flex-1">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('Search capabilities and workstreams')}
                aria-label={t('Search readiness items')}
              />
            </div>
            {activeFilters > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                icon={<RotateCcw className="h-3.5 w-3.5" />}
                onClick={() => {
                  setCategoryFilter('')
                  setHolderFilter('')
                  setSearch('')
                }}
              >
                {t('Clear')}
              </Button>
            ) : null}
          </div>
        }
      />

      <MetricGrid columns={4}>
        <Card>
          <p className="label-institutional">{t('Implemented in this demonstration')}</p>
          <p className="numeric mt-2 text-metric font-semibold text-ink-900">{IMPLEMENTED.length}</p>
          <p className="mt-0.5 text-[0.6875rem] text-ink-500">{t('capabilities, exercised by every page in this build')}</p>
        </Card>
        <Card tone="warn">
          <p className="label-institutional">{t('Required for production')}</p>
          <p className="numeric mt-2 text-metric font-semibold text-ink-900">{PRODUCTION_REQUIREMENTS.length}</p>
          <p className="mt-0.5 text-[0.6875rem] text-ink-500">
            {t('workstreams · only {0} are engineering', engineeringHeld)}
          </p>
        </Card>
        {summary ? (
          <Card>
            <p className="label-institutional">{t('Simulated platform services today')}</p>
            <p className="numeric mt-2 text-metric font-semibold text-ink-900">{summary.simulatedServices}</p>
            <p className="mt-0.5 text-[0.6875rem] text-ink-500">{t('of the platform services register')}</p>
          </Card>
        ) : null}
        <Card tone="info">
          <p className="label-institutional">{t('Certification claimed')}</p>
          <p className="mt-2 text-sm font-semibold text-govt-800">{t('None')}</p>
          <p className="mt-0.5 text-[0.6875rem] text-ink-500">{t('by design, in every environment')}</p>
        </Card>
      </MetricGrid>

      {/* Two columns. The two lists this page exists to state read down the
          wide column; the analysis of the gap between them — by category, by
          who holds it — reads beside them as the register's own commentary. */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-4 xl:order-2 xl:col-span-4">
        <GovPanel title={t('Where the gap sits')} tone="amber">
          <p className="mb-3 text-xs leading-relaxed text-ink-500">{t('Implemented against outstanding, by category. Select a bar to filter both lists.')}</p>
          <div className="space-y-2.5">
            {byCategory.map((row) => (
              <button
                key={row.category}
                type="button"
                onClick={() => setCategoryFilter(categoryFilter === row.category ? '' : row.category)}
                className={cn(
                  'w-full rounded-md px-2 py-1.5 text-left transition-colors',
                  categoryFilter === row.category ? 'bg-govt-50 ring-1 ring-govt-200' : 'hover:bg-ink-50',
                )}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[0.8125rem] font-medium text-ink-800">{CATEGORY_LABEL[row.category]}</span>
                  <span className="numeric text-[0.6875rem] text-ink-500">
                    {t('{0} done · {1} outstanding', row.done, row.outstanding)}
                  </span>
                </div>
                <ProgressBar value={(row.done / row.total) * 100} size="xs" className="mt-1.5" />
              </button>
            ))}
          </div>
        </GovPanel>

        <GovPanel title={t('Who holds the outstanding work')} tone="red">
          <p className="mb-3 text-xs leading-relaxed text-ink-500">{t('The reason the right-hand column is not a sprint backlog.')}</p>
          <div className="space-y-2">
            {byHolder.map((row) => (
              <button
                key={row.holder}
                type="button"
                onClick={() => setHolderFilter(holderFilter === row.holder ? '' : row.holder)}
                className={cn(
                  'flex w-full items-center justify-between gap-3 rounded-md border border-ink-100 px-3 py-2 text-left transition-colors',
                  holderFilter === row.holder ? 'border-govt-300 bg-govt-50' : 'bg-surface-sunken hover:border-govt-200',
                )}
              >
                <span className="flex items-center gap-2">
                  <Badge tone={HOLDER_TONE[row.holder]}>{HOLDER_LABEL[row.holder]}</Badge>
                </span>
                <span className="numeric text-[0.8125rem] font-semibold text-ink-900">{row.count}</span>
              </button>
            ))}
          </div>
          <p className="mt-3 border-t border-ink-100 pt-3 text-[0.6875rem] leading-relaxed text-ink-500">
            {t('{0} of {1} outstanding workstreams sit with platform engineering. The rest are signed agreements, completed reviews, a hosting decision and an independent assessment — none of which is shortened by writing more code, and all of which have to be true before a single live feed is provisioned.', engineeringHeld, PRODUCTION_REQUIREMENTS.length)}
          </p>
        </GovPanel>

        <Card tone="info">
          <div className="flex items-start gap-2.5">
            <Target className="mt-0.5 h-4 w-4 shrink-0 text-govt-700" />
            <p className="text-xs leading-relaxed text-ink-700">
              {t('Neither list is exhaustive of every engineering detail, and completing the right-hand column is a multi-department, multi-quarter undertaking, not a release. The indicative scale on each workstream is a band rather than an estimate: a precise figure would be false when the critical path runs through signed agreements and completed reviews rather than through code. This page will be revised as work against each item begins and completes - no item moves from &quot;Required&quot; to &quot;Implemented&quot; here without the underlying capability actually existing.')}
            </p>
          </div>
        </Card>
        </div>

        <div className="min-w-0 xl:order-1 xl:col-span-8">
      <div className={cn('grid gap-4', side === 'both' && 'lg:grid-cols-2')}>
        {side !== 'required' ? (
          <GovPanel title={t('Implemented in demonstration environment')} tone="amber">
            <p className="mb-3 text-xs leading-relaxed text-ink-500">
              {t('Working today, exercised by every page in this build. Showing {0} of {1}.', implemented.length, IMPLEMENTED.length)}
            </p>
            <div>
              {implemented.length === 0 ? (
                <EmptyState compact title={t('No implemented capability matches the current filters')} />
              ) : (
                <ul className="space-y-3">
                  {implemented.map((item) => (
                    <li key={item.title} className="rounded-lg border border-ink-100 bg-surface p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <p className="text-[0.8125rem] font-medium text-ink-800">{item.title}</p>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <Badge tone="muted" size="xs">
                            {CATEGORY_LABEL[item.category]}
                          </Badge>
                          <Badge tone="positive" dot>
                            {t('Implemented')}
                          </Badge>
                        </div>
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-ink-600">{item.detail}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </GovPanel>
        ) : null}

        {side !== 'implemented' ? (
          <GovPanel title={t('Required for production deployment')} tone="green">
            <p className="mb-3 text-xs leading-relaxed text-ink-500">
              {t('Not present in this environment. Each is a named institutional or engineering workstream, not a configuration toggle. Showing {0} of {1}.', required.length, PRODUCTION_REQUIREMENTS.length)}
            </p>
            <div>
              {required.length === 0 ? (
                <EmptyState compact title={t('No outstanding workstream matches the current filters')} />
              ) : (
                <ul className="space-y-3">
                  {required.map((item) => (
                    <li key={item.title} className="rounded-lg border border-ink-100 bg-surface-sunken p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <p className="text-[0.8125rem] font-medium text-ink-800">{item.title}</p>
                        <Badge tone="warn" dot>
                          {t('Required')}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-ink-600">{item.detail}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-ink-100 pt-2">
                        <Badge tone="muted" size="xs">
                          {CATEGORY_LABEL[item.category]}
                        </Badge>
                        <Badge tone={HOLDER_TONE[item.heldBy]} size="xs">
                          {t('Held by {0}', HOLDER_LABEL[item.heldBy].toLowerCase())}
                        </Badge>
                        <Badge tone="neutral" size="xs">
                          {SCALE_LABEL[item.scale]}
                        </Badge>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </GovPanel>
        ) : null}
      </div>
        </div>
      </div>

      <DemonstrationNotice />
    </PageBody>
  )
}

export default PlatformReadinessPage
