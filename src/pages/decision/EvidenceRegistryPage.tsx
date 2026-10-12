import { useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import { GovPanel } from '@/components/gov/GovPanel'
import { Badge } from '@/components/ui/badges'
import { Select } from '@/components/ui/primitives'
import { EmptyState } from '@/components/ui/states'
import { KpiTile } from '@/components/infographic'
import { EvidenceValue, VerificationBadge, useDecisionLayer, verificationLabel } from '@/components/decision'
import { isSourceStale, sourceAgeDays, type VerificationState } from '@/domains/evidence/model'
import { sourceById } from '@/services/decision-intelligence'
import { usePageMasthead } from '@/stores/masthead.store'
import { formatNumber } from '@/utils/format'
import { t } from '@/i18n'
import { activeCorporation } from '@/config/municipality.config'
import { FileCheck2, FileWarning, Library, Scale } from 'lucide-react'

/**
 * src/pages/decision/EvidenceRegistryPage.tsx
 *
 * SOURCE & EVIDENCE REGISTRY (spec §60-61, §91, §96). Every source the layer
 * reads - its authority, access basis, refresh interval, reliability,
 * coverage, format and when it was last read - and every material figure
 * drawn from it, with its verification state and any disagreement.
 */

const STATES: VerificationState[] = ['OFFICIAL_DOCUMENT_VERIFIED', 'PUBLIC_SOURCE_CORROBORATED', 'ENGAGEMENT_SOURCE', 'UNVERIFIED']

export function EvidenceRegistryPage(): React.JSX.Element {
  usePageMasthead(t('Source & Evidence Registry'), t('Every source the platform reads for {0}, and every figure drawn from it - traceable to the original document.', activeCorporation.shortName))
  const layer = useDecisionLayer()
  const [state, setState] = useState<VerificationState | 'all'>('all')
  const evidence = layer.evidence.filter((e) => state === 'all' || e.state === state)
  const count = (s: VerificationState): number => layer.evidence.filter((e) => e.state === s).length
  const conflicts = layer.evidence.filter((e) => (e.conflictsWith ?? []).length > 0).length

  return (
    <PageBody width="full" className="space-y-3 p-3 sm:p-4">
      <PageHeader
        eyebrow={t('Strategy')}
        breadcrumbs={[{ label: t('Strategy') }, { label: t('Evidence Registry') }]}
        controls={
          <Select
            aria-label={t('Verification state')}
            value={state}
            onChange={(e) => setState(e.target.value as VerificationState | 'all')}
            options={[{ value: 'all', label: t('All verification states') }, ...STATES.map((s) => ({ value: s, label: verificationLabel(s) }))]}
          />
        }
        hideProvenance
      />

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <KpiTile icon={<Library className="h-5 w-5" />} label={t('Registered sources')} value={formatNumber(layer.sources.length)} reading={t('{0} official', formatNumber(layer.sources.filter((s) => s.reliability === 'primary').length))} />
        <KpiTile icon={<FileCheck2 className="h-5 w-5" />} label={t('Official document verified')} value={formatNumber(count('OFFICIAL_DOCUMENT_VERIFIED'))} reading={t('of {0} figures', formatNumber(layer.evidence.length))} tone="positive" />
        <KpiTile icon={<Scale className="h-5 w-5" />} label={t('Public source corroborated')} value={formatNumber(count('PUBLIC_SOURCE_CORROBORATED'))} reading={t('news and public reporting')} tone="neutral" />
        <KpiTile icon={<FileWarning className="h-5 w-5" />} label={t('Figures in dispute')} value={formatNumber(conflicts)} reading={t('sources disagree - both shown')} tone="warn" />
      </div>

      <GovPanel
        title={t('Evidence records')}
        subtitle={t('Click a value for its full trace: calculation, source, original text, date and confidence.')}
        dense
        actions={
          <Badge tone="neutral" size="sm">
            {t('{0} of {1}', formatNumber(evidence.length), formatNumber(layer.evidence.length))}
          </Badge>
        }
      >
        {evidence.length === 0 ? (
          <EmptyState compact title={t('No figures in this verification state')} detail={t('Choose "All verification states" to see every figure.')} />
        ) : null}
        <div className={evidence.length === 0 ? 'hidden' : 'overflow-x-auto'}>
          <table className="w-full min-w-[56rem] text-left text-[0.75rem]">
            <thead className="bg-surface-sunken text-[0.625rem] tracking-wide text-ink-500 uppercase">
              <tr>
                <th className="px-3 py-2">{t('Value')}</th>
                <th className="px-2 py-2">{t('What it measures')}</th>
                <th className="px-2 py-2">{t('Period')}</th>
                <th className="px-2 py-2">{t('Source')}</th>
                <th className="px-2 py-2">{t('Verification')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {evidence.map((e) => (
                <tr key={e.id} className="align-top">
                  <td className="px-3 py-2 font-bold text-ink-900">
                    <EvidenceValue evidenceId={e.id} />
                  </td>
                  <td className="px-2 py-2 text-ink-700">
                    {e.label}
                    {(e.conflictsWith ?? []).length > 0 ? (
                      <Badge tone="warn" size="sm" className="ml-1">
                        {t('Disputed')}
                      </Badge>
                    ) : null}
                  </td>
                  <td className="px-2 py-2 text-ink-500">{e.period}</td>
                  <td className="px-2 py-2 text-ink-600">{sourceById(layer, e.sourceId)?.title ?? e.sourceId}</td>
                  <td className="px-2 py-2">
                    <VerificationBadge state={e.state} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GovPanel>

      <GovPanel title={t('Source Registry')} subtitle={t('Accessible online is not the same as free to reuse: each source carries its access basis.')} dense>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[72rem] text-left text-[0.6875rem]">
            <thead className="bg-surface-sunken text-[0.625rem] tracking-wide text-ink-500 uppercase">
              <tr>
                <th className="px-3 py-2">{t('Source')}</th>
                <th className="px-2 py-2">{t('Authority')}</th>
                <th className="px-2 py-2">{t('Type')}</th>
                <th className="px-2 py-2">{t('Access')}</th>
                <th className="px-2 py-2">{t('Reliability')}</th>
                <th className="px-2 py-2">{t('Coverage')}</th>
                <th className="px-2 py-2">{t('Format')}</th>
                <th className="px-2 py-2">{t('Refresh')}</th>
                <th className="px-2 py-2">{t('Published / read')}</th>
                <th className="px-2 py-2">{t('Quality')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {layer.sources.map((s) => {
                const age = sourceAgeDays(s, layer.now)
                return (
                  <tr key={s.id} className="align-top">
                    <td className="px-3 py-2">
                      {/^https?:/.test(s.url) ? (
                        <a href={s.url} target="_blank" rel="noreferrer noopener" className="font-semibold text-govt-700 hover:underline">
                          {s.title} <ExternalLink className="inline h-3 w-3" aria-hidden />
                        </a>
                      ) : (
                        <span className="font-semibold text-ink-800">{s.title}</span>
                      )}
                      {s.notes ? <p className="mt-0.5 text-[0.625rem] text-ink-500">{s.notes}</p> : null}
                    </td>
                    <td className="px-2 py-2 text-ink-700">{s.authority}</td>
                    <td className="px-2 py-2 text-ink-600">{s.sourceType}</td>
                    <td className="px-2 py-2 text-ink-600">
                      {s.accessClassification}
                      <p className="text-[0.625rem] text-ink-400">{s.accessMethod}</p>
                    </td>
                    <td className="px-2 py-2">
                      <Badge tone={s.reliability === 'primary' ? 'positive' : s.reliability === 'secondary' ? 'info' : 'warn'} size="sm">
                        {s.reliability}
                      </Badge>
                    </td>
                    <td className="px-2 py-2 text-ink-600">
                      {s.geographicCoverage}
                      <p className="text-[0.625rem] text-ink-400">{s.temporalCoverage}</p>
                    </td>
                    <td className="px-2 py-2 text-ink-600">{s.format}</td>
                    <td className="px-2 py-2 text-ink-600">{s.refreshDays === null ? t('One-off') : t('{0} days', formatNumber(s.refreshDays))}</td>
                    <td className="px-2 py-2 text-ink-600">
                      {s.publishedOn ?? t('Undated')}
                      <p className="text-[0.625rem] text-ink-400">{t('Read {0}', s.lastRetrieved)}</p>
                      {isSourceStale(s, layer.now) ? (
                        <Badge tone="warn" size="sm">
                          {t('Stale ({0} d)', formatNumber(age ?? 0))}
                        </Badge>
                      ) : null}
                    </td>
                    <td className="px-2 py-2 text-ink-600">{s.dataQuality}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </GovPanel>
    </PageBody>
  )
}

export default EvidenceRegistryPage
