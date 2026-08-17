import { useMemo, useState } from 'react'
import { CheckCircle2, CircleAlert, HelpCircle, Layers } from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/badges'
import { Card, CardHeader, MetricGrid, Select } from '@/components/ui/primitives'
import { DemonstrationNotice } from '@/components/ui/states'
import { CORPORATIONS } from '@/config/corporations'
import { usePageMasthead } from '@/stores/masthead.store'
import { cn } from '@/utils/cn'
import { t } from '@/i18n'

/**
 * src/pages/trust/TestingPage.tsx
 *
 * Testing & Quality Assurance.
 *
 * This is not a CI dashboard reporting real pass/fail results, because none
 * exist: this repository carries no automated test framework - no `*.test.ts`
 * or `*.spec.ts` file, no Vitest/Jest configuration, no CI workflow. Stating
 * that plainly is the point of the page, in the same spirit as Platform
 * Readiness: a coverage claim this register cannot back with an actual run is
 * not made here.
 *
 * What IS real: a manual verification pass run live against this build in the
 * course of the work that produced it - sign-in through to the console, the
 * two newest features exercised end-to-end, the permission engine's denial
 * path deliberately triggered twice. Each row below states plainly whether it
 * was manually verified, not yet covered, or requires automation before this
 * platform could responsibly claim test coverage in a production sense.
 *
 * REUSABLE-ENGINE SCOPE. Several rows are marked "single-tenant only" -
 * `CORPORATIONS` presently carries one record (Brihanmumbai), so nothing in
 * this build, manual or automated, has ever exercised the reusable engine
 * against a second corporation. That gap is stated once here rather than
 * silently assumed away.
 */

type CoverageStatus = 'verified-manually' | 'not-covered' | 'requires-automation'
type CoverageCategory = 'permission-engine' | 'multi-tenant-engine' | 'data-pipeline' | 'interaction' | 'build-integrity'

function build$STATUS_LABEL(): Record<CoverageStatus, string> {
  return {
    'verified-manually': t('Verified manually'),
    'not-covered': t('Not yet covered'),
    'requires-automation': t('Requires automation'),
  }
}

function build$CATEGORY_LABEL(): Record<CoverageCategory, string> {
  return {
    'permission-engine': t('Permission engine'),
    'multi-tenant-engine': t('Multi-tenant / reusable engine'),
    'data-pipeline': t('Data pipeline'),
    interaction: t('Interface interaction'),
    'build-integrity': t('Build integrity'),
  }
}

const STATUS_TONE: Record<CoverageStatus, 'positive' | 'warn' | 'critical'> = {
  'verified-manually': 'positive',
  'not-covered': 'critical',
  'requires-automation': 'warn',
}

const STATUS_ICON: Record<CoverageStatus, typeof CheckCircle2> = {
  'verified-manually': CheckCircle2,
  'not-covered': CircleAlert,
  'requires-automation': HelpCircle,
}

interface CoverageRow {
  category: CoverageCategory
  title: string
  detail: string
  status: CoverageStatus
  /** True where the check, however verified, ran against BMC only - the sole populated tenant. */
  singleTenantOnly: boolean
}

function build$ROWS(): CoverageRow[] {
  return [
    // --- Permission engine -------------------------------------------------
    {
      category: 'permission-engine',
      title: t('Route-level denial for a missing resource permission'),
      detail: t('Signed in as Security Administrator and opened Water Intelligence directly by URL. The permission engine correctly returned "Access not authorised - Security Administrator does not hold intelligence:view", named the exact resource:action pair, and recorded the attempt rather than silently redirecting.'),
      status: 'verified-manually',
      singleTenantOnly: false,
    },
    {
      category: 'permission-engine',
      title: t('Action-level denial for a missing administer permission'),
      detail: t('Signed in as Municipal Commissioner and attempted to upload a CSV on Pilot Data Ingestion. Correctly blocked with "does not hold connector:administer" before the request reached the backend; switching to Security Administrator (which does hold it) then succeeded.'),
      status: 'verified-manually',
      singleTenantOnly: false,
    },
    {
      category: 'permission-engine',
      title: t('Every role\'s landing redirect resolves to a page it can actually read'),
      detail: t('Fourteen demonstration roles exist in `demo-users.ts`; only two (Municipal Commissioner, Security Administrator) have had their post-sign-in landing route manually confirmed this session. The other twelve rely on `RoleLandingRedirect`\'s declared logic, unexercised.'),
      status: 'not-covered',
      singleTenantOnly: false,
    },
    // --- Multi-tenant / reusable engine -------------------------------------
    {
      category: 'multi-tenant-engine',
      title: t('Ward/zone resolution against a second corporation'),
      detail: t('`resolveWardCount` and `resolveDivisions` are written generically, but `CORPORATIONS` carries exactly one record. No test, manual or automated, has run these resolvers against a corporation with a genuinely different ward-count regime, terminology or published division list.'),
      status: 'not-covered',
      singleTenantOnly: true,
    },
    {
      category: 'multi-tenant-engine',
      title: t('Geography generator against a non-coastal city form'),
      detail: t('The boundary generator has only ever rendered Brihanmumbai\'s coastal shape. A landlocked or river-bisected corporation\'s `form.type` is declared in the schema but has never been generated or visually checked.'),
      status: 'not-covered',
      singleTenantOnly: true,
    },
    {
      category: 'multi-tenant-engine',
      title: t('AI evaluation verdicts hold independent of tenant'),
      detail: t('Confirmed by reading `ai.service.ts`: `evaluations()` calls no `scopeToTenant` - the evaluation store is genuinely tenant-agnostic, not merely assumed so. This is a code-reading verification, not a runtime one.'),
      status: 'requires-automation',
      singleTenantOnly: false,
    },
    {
      category: 'multi-tenant-engine',
      title: t('Marathi (mr) locale renders correctly end-to-end'),
      detail: t('The language switcher was confirmed present in the header; no page was actually switched to Marathi and visually checked for layout breakage, truncation or an untranslated string this session.'),
      status: 'not-covered',
      singleTenantOnly: false,
    },
    // --- Data pipeline -------------------------------------------------------
    {
      category: 'data-pipeline',
      title: t('Pilot CSV ingestion, full round trip'),
      detail: t('Uploaded a real 2-row CSV through the dev-server plugin, confirmed exact row/column counts and rendered content matched the file, then cleared it and confirmed the register returned to empty. The one genuinely non-simulated connector in this platform was exercised start to finish.'),
      status: 'verified-manually',
      singleTenantOnly: false,
    },
    {
      category: 'data-pipeline',
      title: t('Every field cited in Data & Resources resolves to a live URL'),
      detail: t('53 citations are recorded in `corporations.ts`. None has been re-fetched to confirm the source page still exists and still states what the note claims - link rot and source-content drift are unchecked.'),
      status: 'not-covered',
      singleTenantOnly: false,
    },
    // --- Interface interaction -------------------------------------------------
    {
      category: 'interaction',
      title: t('Sign-in through to the console, live'),
      detail: t('Fresh browser state, root URL, through to Commissioner Cockpit: redirected to /login, signed in, landed on the portal front door, clicked a module tile, reached the full dashboard. Zero console errors at any step.'),
      status: 'verified-manually',
      singleTenantOnly: false,
    },
    {
      category: 'interaction',
      title: t('Contrast toggle actually changes application state'),
      detail: t('Clicked High, then read `document.documentElement.dataset.contrast` directly rather than trusting the screenshot - confirmed it flips to "high". The visual difference is intentionally subtle, so this check has to be state-level, not pixel-level.'),
      status: 'verified-manually',
      singleTenantOnly: false,
    },
    {
      category: 'interaction',
      title: t('Font-size control cycles all three densities'),
      detail: t('Confirmed present in the header and wired to the same preference store as Contrast, by reading the component; never actually clicked through compact → comfortable → spacious and confirmed the resulting layout at each step.'),
      status: 'requires-automation',
      singleTenantOnly: false,
    },
    // --- Build integrity -------------------------------------------------------
    {
      category: 'build-integrity',
      title: t('Full-project TypeScript build'),
      detail: t('`tsc -b --force` run clean, zero errors, after every batch of changes this session - the one check in this register that is genuinely automated and repeatable, even though it is a type check rather than a behavioural test.'),
      status: 'verified-manually',
      singleTenantOnly: false,
    },
    {
      category: 'build-integrity',
      title: t('No automated test framework is installed'),
      detail: t('Confirmed directly: zero `*.test.ts`/`*.test.tsx`/`*.spec.ts` files anywhere in the repository, no Vitest or Jest dependency in `package.json`, no `.github/workflows` directory. This is the honest baseline every other row in this register has to be read against.'),
      status: 'not-covered',
      singleTenantOnly: false,
    },
  ]
}

export function TestingPage(): React.JSX.Element {
  usePageMasthead(
    t('Testing & Quality Assurance'),
    t('What has actually been verified against this build, how, and what has not - stated plainly rather than claimed. This platform carries no automated test suite; every row below says so where it applies.'),
  )

  const rows = useMemo(build$ROWS, [])
  const [categoryFilter, setCategoryFilter] = useState<CoverageCategory | ''>('')
  const [statusFilter, setStatusFilter] = useState<CoverageStatus | ''>('')

  const STATUS_LABEL = build$STATUS_LABEL()
  const CATEGORY_LABEL = build$CATEGORY_LABEL()

  const filtered = rows.filter(
    (r) => (!categoryFilter || r.category === categoryFilter) && (!statusFilter || r.status === statusFilter),
  )

  const verified = rows.filter((r) => r.status === 'verified-manually').length
  const notCovered = rows.filter((r) => r.status === 'not-covered').length
  const requiresAutomation = rows.filter((r) => r.status === 'requires-automation').length
  const singleTenantOnly = rows.filter((r) => r.singleTenantOnly).length

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('Trust Centre')}
        breadcrumbs={[{ label: t('Trust Centre'), to: '/trust' }, { label: t('Testing & Quality Assurance') }]}
        controls={
          <div className="flex flex-wrap items-center gap-2">
            <Select
              aria-label={t('Filter by category')}
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as CoverageCategory | '')}
              options={[
                { value: '', label: t('All categories') },
                ...(Object.keys(CATEGORY_LABEL) as CoverageCategory[]).map((c) => ({ value: c, label: CATEGORY_LABEL[c] })),
              ]}
            />
            <Select
              aria-label={t('Filter by status')}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as CoverageStatus | '')}
              options={[
                { value: '', label: t('All statuses') },
                ...(Object.keys(STATUS_LABEL) as CoverageStatus[]).map((s) => ({ value: s, label: STATUS_LABEL[s] })),
              ]}
            />
          </div>
        }
      />

      <Card tone="critical" className="flex items-start gap-3">
        <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-crit-600" aria-hidden />
        <p className="text-xs leading-relaxed text-ink-700">
          <span className="font-semibold">{t('No automated test suite exists in this repository.')}</span>{' '}
          {t('Every "Verified manually" row below is a one-off check performed live during development, not a repeatable, CI-enforced guarantee. Treat this register as an honest starting point for building real coverage, not as evidence the platform is tested in a production sense.')}
        </p>
      </Card>

      <MetricGrid columns={4}>
        <Card tone="sunken">
          <p className="label-institutional">{t('Verified manually')}</p>
          <p className="numeric mt-2 text-metric font-semibold text-ok-700">{verified}</p>
          <p className="mt-0.5 text-[0.6875rem] text-ink-500">{t('of {0} checks in this register', rows.length)}</p>
        </Card>
        <Card tone="critical">
          <p className="label-institutional">{t('Not yet covered')}</p>
          <p className="numeric mt-2 text-metric font-semibold text-ink-900">{notCovered}</p>
          <p className="mt-0.5 text-[0.6875rem] text-ink-500">{t('No manual or automated check exists')}</p>
        </Card>
        <Card tone="warn">
          <p className="label-institutional">{t('Requires automation')}</p>
          <p className="numeric mt-2 text-metric font-semibold text-ink-900">{requiresAutomation}</p>
          <p className="mt-0.5 text-[0.6875rem] text-ink-500">{t('Checked once; needs a repeatable test')}</p>
        </Card>
        <Card>
          <p className="label-institutional">{t('Single-tenant only')}</p>
          <p className="numeric mt-2 text-metric font-semibold text-ink-900">{singleTenantOnly}</p>
          <p className="mt-0.5 text-[0.6875rem] text-ink-500">{t('Never exercised beyond Brihanmumbai')}</p>
        </Card>
      </MetricGrid>

      <Card flush>
        <CardHeader
          icon={<Layers className="h-4 w-4" />}
          title={t('Coverage register')}
          description={t('Showing {0} of {1} checks.', filtered.length, rows.length)}
        />
        <ul className="divide-y divide-ink-50">
          {filtered.map((row) => {
            const Icon = STATUS_ICON[row.status]
            return (
              <li key={row.title} className="px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 text-[0.8125rem] font-medium text-ink-800">{row.title}</p>
                  <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                    <Badge tone="muted" size="xs">
                      {CATEGORY_LABEL[row.category]}
                    </Badge>
                    {row.singleTenantOnly ? (
                      <Badge tone="neutral" size="xs">
                        {t('Single-tenant only')}
                      </Badge>
                    ) : null}
                    <Badge tone={STATUS_TONE[row.status]} size="sm">
                      <Icon className={cn('mr-1 inline h-3 w-3')} aria-hidden />
                      {STATUS_LABEL[row.status]}
                    </Badge>
                  </div>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-ink-600">{row.detail}</p>
              </li>
            )
          })}
        </ul>
      </Card>

      {CORPORATIONS.length === 1 ? (
        <Card tone="info" className="flex items-start gap-3">
          <Layers className="mt-0.5 h-4 w-4 shrink-0 text-govt-600" aria-hidden />
          <p className="text-xs leading-relaxed text-ink-700">
            {t('The corporation registry (`CORPORATIONS` in `src/config/corporations.ts`) currently carries one record. Every "reusable engine" mechanism this platform is built on - ward resolution, geography generation, the bilingual layer, tenant-scoped permissions - is written generically, but none of it has been proven against a second corporation. The most valuable single addition to this register would be a second, genuinely sourced corporation record and the manual pass that follows from standing it up.')}
          </p>
        </Card>
      ) : null}

      <DemonstrationNotice />
    </PageBody>
  )
}

export default TestingPage
