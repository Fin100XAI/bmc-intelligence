import { useMemo, useState } from 'react'
import { BookMarked, Landmark, Newspaper, Quote } from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import {
  Badge,
  Card,
  DataTable,
  EmptyState,
  Input,
  MetricGrid,
  Select,
  type Column,
} from '@/components/ui'
import { MetricCard } from '@/components/cards'
import { GovPanel } from '@/components/gov/GovPanel'
import { CORPORATIONS, type CorporationRef, type CorporationSource } from '@/config/corporations'
import { t } from '@/i18n'

/**
 * src/pages/strategic/DataResourcesPage.tsx
 *
 * The bibliography behind this platform's factual spine.
 *
 * Unlike every operational register elsewhere in this build - which is
 * modelled, deterministic demonstration data and says so on every page - the
 * rows here are not generated. Each is a citation an earlier research pass
 * recorded directly on `CorporationRef.sources` in `src/config/corporations.ts`:
 * a real published figure (a budget, a supply volume, a facility count), the
 * exact source it was read from, and a note capturing what that source
 * actually said, including where two sources disagree.
 *
 * This is the reverse of every other register: rows are added here only when
 * a fact was found and sourced, never generated to fill a shape. A field with
 * no citation is not listed - see `resolveWardCount` and the corporation
 * record itself for how the platform states "not published" instead of
 * inventing a figure.
 */

type SourceKind = 'official' | 'reporting' | 'reference'

const OFFICIAL_HOST_MARKERS = ['.gov.in', '.nic.in', 'mcgm.gov.in', 'portal.mcgm.gov.in', 'mpcb.gov.in']
const REFERENCE_HOST_MARKERS = ['wikipedia.org']

function classifySource(url: string): SourceKind {
  const host = (() => {
    try {
      return new URL(url).hostname.toLowerCase()
    } catch {
      return url.toLowerCase()
    }
  })()
  if (OFFICIAL_HOST_MARKERS.some((m) => host.includes(m))) return 'official'
  if (REFERENCE_HOST_MARKERS.some((m) => host.includes(m))) return 'reference'
  return 'reporting'
}

function build$SOURCE_KIND_LABEL(): Record<SourceKind, string> {
  return {
    official: t('Official / government'),
    reporting: t('Independent reporting & research'),
    reference: t('Reference'),
  }
}

/** `waterSupplyMLD` → `Water Supply MLD`. Field names are TypeScript identifiers, not prose. */
function humanizeField(field: string): string {
  const leaf = field.includes('.') ? field.slice(field.lastIndexOf('.') + 1) : field
  return leaf
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase())
    .trim()
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

interface CitationRow extends CorporationSource {
  id: string
  corporationId: string
  corporationName: string
  kind: SourceKind
}

export function DataResourcesPage(): React.JSX.Element {
  const [search, setSearch] = useState('')
  const [kindFilter, setKindFilter] = useState<SourceKind | ''>('')
  const [corpFilter, setCorpFilter] = useState<string>('')

  const SOURCE_KIND_LABEL = build$SOURCE_KIND_LABEL()

  const rows: CitationRow[] = useMemo(
    () =>
      CORPORATIONS.flatMap((corp: CorporationRef) =>
        corp.sources.map((s, i) => ({
          ...s,
          id: `${corp.id}-${s.field}-${i}`,
          corporationId: corp.id,
          corporationName: corp.name,
          kind: classifySource(s.url),
        })),
      ),
    [],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (kindFilter && r.kind !== kindFilter) return false
      if (corpFilter && r.corporationId !== corpFilter) return false
      if (!q) return true
      return (
        humanizeField(r.field).toLowerCase().includes(q) ||
        (r.note ?? '').toLowerCase().includes(q) ||
        hostOf(r.url).toLowerCase().includes(q) ||
        r.corporationName.toLowerCase().includes(q)
      )
    })
  }, [rows, search, kindFilter, corpFilter])

  const uniqueFields = new Set(rows.map((r) => r.field)).size
  const uniqueHosts = new Set(rows.map((r) => hostOf(r.url))).size
  const officialCount = rows.filter((r) => r.kind === 'official').length

  const columns: Array<Column<CitationRow>> = [
    {
      id: 'field',
      header: t('Field'),
      cell: (r) => <span className="font-medium text-ink-900">{humanizeField(r.field)}</span>,
      sortValue: (r) => humanizeField(r.field),
      searchValue: (r) => humanizeField(r.field),
      width: 'minmax(12rem,1fr)',
    },
    {
      id: 'corporation',
      header: t('Corporation'),
      cell: (r) => <span className="text-ink-700">{r.corporationName}</span>,
      sortValue: (r) => r.corporationName,
      hideBelow: 'lg',
    },
    {
      id: 'kind',
      header: t('Source type'),
      cell: (r) => (
        <Badge tone={r.kind === 'official' ? 'positive' : r.kind === 'reference' ? 'neutral' : 'info'} size="sm">
          {SOURCE_KIND_LABEL[r.kind]}
        </Badge>
      ),
      sortValue: (r) => r.kind,
      hideBelow: 'md',
    },
    {
      id: 'source',
      header: t('Source'),
      cell: (r) => (
        <a
          href={r.url}
          target="_blank"
          rel="noreferrer"
          className="text-xs font-medium text-govt-700 underline decoration-govt-300 underline-offset-2 hover:text-govt-900"
        >
          {hostOf(r.url)}
        </a>
      ),
      sortValue: (r) => hostOf(r.url),
      width: '14rem',
    },
    {
      id: 'note',
      header: t('What the source says'),
      cell: (r) => <span className="text-xs leading-relaxed text-ink-600">{r.note ?? '-'}</span>,
      searchValue: (r) => r.note ?? '',
      width: 'minmax(20rem,2.4fr)',
    },
  ]

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('Strategic')}
        breadcrumbs={[{ label: t('Strategic') }, { label: t('Data & Resources') }]}
      />

      <Card tone="info" className="flex items-start gap-3">
        <Quote className="mt-0.5 h-4 w-4 shrink-0 text-govt-600" aria-hidden />
        <div className="min-w-0">
          <p className="text-[0.8125rem] font-semibold text-govt-800">{t('This register is real, not modelled')}</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-600">
            {t('Every other register in this platform is deterministic demonstration data, stated as such on every page. This one is the exception: each row below is a citation to a genuinely published figure - the corporation\'s own site, a state department, the Census, or contemporary reporting where no official document could be found. A field with no citation here carries no figure anywhere else in the platform either.')}
          </p>
        </div>
      </Card>

      <MetricGrid columns={4}>
        <MetricCard
          label={t('Citations on record')}
          value={rows.length}
          support={t('Across {0} corporation(s)', new Set(rows.map((r) => r.corporationId)).size)}
          icon={<BookMarked className="h-4 w-4" />}
        />
        <MetricCard label={t('Fields sourced')} value={uniqueFields} support={t('Distinct published facts')} icon={<Landmark className="h-4 w-4" />} />
        <MetricCard label={t('Distinct sources')} value={uniqueHosts} support={t('Unique publishing hosts')} icon={<Newspaper className="h-4 w-4" />} />
        <MetricCard
          label={t('Official / government')}
          value={officialCount}
          support={t('{0} of {1} citations', officialCount, rows.length)}
          tone="positive"
        />
      </MetricGrid>

      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-[14rem] flex-1">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('Search field, source or note')}
            aria-label={t('Search citations')}
          />
        </div>
        <Select
          aria-label={t('Filter by source type')}
          value={kindFilter}
          onChange={(e) => setKindFilter(e.target.value as SourceKind | '')}
          options={[
            { value: '', label: t('All source types') },
            ...(Object.keys(SOURCE_KIND_LABEL) as SourceKind[]).map((k) => ({ value: k, label: SOURCE_KIND_LABEL[k] })),
          ]}
        />
        {CORPORATIONS.length > 1 ? (
          <Select
            aria-label={t('Filter by corporation')}
            value={corpFilter}
            onChange={(e) => setCorpFilter(e.target.value)}
            options={[
              { value: '', label: t('All corporations') },
              ...CORPORATIONS.map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
        ) : null}
      </div>

      <GovPanel title={t('Citation register')} tone="amber" dense>
        {filtered.length === 0 ? (
          <EmptyState className="m-3" title={t('No citation matches the current filters')} detail="Adjust the search term or source-type filter above." />
        ) : (
          <DataTable
            rows={filtered}
            columns={columns}
            rowKey={(r) => r.id}
            pageSize={20}
            searchable={false}
            initialSort={{ columnId: 'field', direction: 'asc' }}
            ariaLabel="Data resources citation register"
          />
        )}
      </GovPanel>
    </PageBody>
  )
}

export default DataResourcesPage
