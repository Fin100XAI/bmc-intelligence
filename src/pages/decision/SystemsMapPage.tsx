import { useMemo } from 'react'
import { Layers } from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import { GovPanel } from '@/components/gov/GovPanel'
import { MetricCard } from '@/components/cards'
import { SystemsCapabilityMap } from '@/components/decision/SystemsCapabilityMap'
import { capabilityAreas, existingSystems, type MapStatus } from '@/config/bmc/capability-map'
import { activeCorporation } from '@/config/municipality.config'
import { usePageMasthead } from '@/stores/masthead.store'
import { formatNumber } from '@/utils/format'
import { t } from '@/i18n'

/**
 * src/pages/decision/SystemsMapPage.tsx
 *
 * SYSTEMS & CAPABILITY MAP - the capability areas the corporation's existing
 * systems cover, the decision this platform adds above each, and where it
 * honestly stands on each one. The rows live in `config/bmc/capability-map.ts`.
 */

export function SystemsMapPage(): React.JSX.Element {
  const rows = useMemo(() => capabilityAreas(), [])
  usePageMasthead(t('Capability Map'), t('{0} capability areas, the existing system behind each, the decision the platform adds, and where it stands.', rows.length))
  const counts = useMemo(() => {
    const c: Record<MapStatus, number> = { live: 0, partial: 0, modelled: 0, 'not-built': 0 }
    for (const r of rows) c[r.status] += 1
    return c
  }, [rows])
  const systemCount = useMemo(() => existingSystems().length, [])

  return (
    <PageBody width="full" className="space-y-3 p-3 sm:p-4">
      <PageHeader eyebrow={t('Platform')} breadcrumbs={[{ label: t('Platform') }, { label: t('Capability Map') }]} hideProvenance />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <MetricCard label={t('Existing systems mapped')} value={formatNumber(systemCount)} support={t('Each found on a public page')} size="sm" />
        <MetricCard label={t('Live on public data')} value={formatNumber(counts.live)} support={t('Runs today on opened public sources')} tone="positive" size="sm" />
        <MetricCard label={t('Partly live')} value={formatNumber(counts.partial)} support={t('The rest needs {0} records', activeCorporation.shortName)} size="sm" />
        <MetricCard label={t('Built - modelled until corporation data')} value={formatNumber(counts.modelled)} support={t('Screen exists, labelled modelled figures')} tone="warn" size="sm" />
        <MetricCard label={t('Not built yet')} value={formatNumber(counts['not-built'])} support={t('Proposed only')} size="sm" />
      </div>

      <SystemsCapabilityMap />

      <GovPanel title={t('Positioning')} tone="green">
        <p className="text-[0.9375rem] font-bold text-ink-900">{t('Decision and outcome intelligence above the systems the corporation already runs.')}</p>
        <p className="mt-1.5 flex items-start gap-1.5 text-[0.75rem] leading-relaxed text-ink-600">
          <Layers className="mt-0.5 h-4 w-4 shrink-0 text-govt-600" aria-hidden />
          {t('It reads the systems {0} already runs and does not replace them. What it adds is what no single system gives: decisions that cross departments, places and budgets, backed by evidence and followed to a verified result.', activeCorporation.shortName)}
        </p>
      </GovPanel>
    </PageBody>
  )
}

export default SystemsMapPage
