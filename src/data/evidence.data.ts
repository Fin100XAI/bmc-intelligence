import { TENANT_ID } from '@/config/municipality.config'
import type { DataClassification, IntelligenceDomain } from '@/types/common'
import type { EvidenceItem, EvidenceKind } from '@/types/intelligence'
import { det, isoFromAnchor } from '@/utils/deterministic'
import { DEPARTMENTS, WARDS } from './reference'
import { CITY_SCALE, REFERENCE_SCALE, scaled, scaledCount } from './scale'
import { registerLayer } from './runtime'
import { t } from '@/i18n'

/**
 * Evidence corpus. Every intelligence item, alert, decision case and AI
 * response references evidence records here, so that no statement anywhere in
 * the platform is unsupported by a traceable source.
 *
 * The corpus is sized and its magnitudes scaled to the active corporation
 * (`./scale.ts`). A corporation a fiftieth of Brihanmumbai's size does not
 * book ₹96 crore against one ledger line, move 240 tonnes on one collection
 * round or supply 340 MLD into a single distribution zone, and an evidence
 * record that says it does discredits every statement resting on it. Rates,
 * indices, instrument readings and the observation clock are scale-free and
 * are left exactly as they were.
 *
 * Both exports are LIVE BINDINGS, rebuilt on a corporation switch.
 */

interface EvidenceTemplate {
  kind: EvidenceKind
  title: string
  summary: string
  sourceSystem: string
  transformation: string
  domain: IntelligenceDomain
  classification: DataClassification
  attributeKeys: string[]
}

/**
 * Stays a module-scope constant: the templates describe the kinds of record a
 * municipal corporation holds, name no place, carry no magnitude and draw no
 * seeded figure. Only the values written against them move with the
 * corporation.
 */
function build$TEMPLATES(): EvidenceTemplate[] {
  return [
  {
    kind: 'sensor-reading',
    title: t('Automatic rain gauge observation'),
    summary: t('Fifteen-minute rainfall accumulation recorded at the ward automatic weather station.'),
    sourceSystem: 'Automatic Weather Station Network (simulated)',
    transformation: 'Raw 15-minute tips aggregated to hourly and 24-hour accumulation; outliers flagged against neighbouring stations.',
    domain: 'monsoon',
    classification: 'internal',
    attributeKeys: [t('Station'), t('Rainfall (1h)'), t('Rainfall (24h)'), t('Instrument status'), t('Neighbour agreement')],
  },
  {
    kind: 'sensor-reading',
    title: t('Pumping station telemetry snapshot'),
    summary: t('Operational status and running hours reported by the storm-water pumping station controller.'),
    sourceSystem: 'SWD Pumping Telemetry (simulated)',
    transformation: 'Controller state polled at 5-minute intervals; availability computed as operational pumps over installed pumps.',
    domain: 'stormwater',
    classification: 'internal',
    attributeKeys: [t('Station'), t('Pumps operational'), t('Pumps installed'), t('Standby power'), t('Last test')],
  },
  {
    kind: 'derived-metric',
    title: t('Ward service reliability index'),
    summary: t('Composite reliability index derived from complaint resolution, SLA compliance and repeat-failure rates.'),
    sourceSystem: 'BMC Intelligence Core - derived',
    transformation: 'Weighted composite of four normalised sub-indices; weights approved by the Intelligence Governance Board.',
    domain: 'wards',
    classification: 'internal',
    attributeKeys: [t('Index value'), t('SLA compliance'), t('Repeat failures'), t('Sample size'), t('Weighting version')],
  },
  {
    kind: 'complaint',
    title: t('Aggregated citizen complaint cluster'),
    summary: t('Spatial cluster of citizen complaints of the same category raised within a defined radius and window.'),
    sourceSystem: 'Citizen Grievance Platform (simulated)',
    transformation: 'Complaints geocoded to ward and locality, clustered at 250 m radius over a rolling 14-day window. No personal data retained.',
    domain: 'wards',
    classification: 'internal',
    attributeKeys: [t('Category'), t('Cluster size'), t('Radius'), t('Window'), t('Repeat share')],
  },
  {
    kind: 'inspection',
    title: t('Field inspection observation'),
    summary: t('Observation recorded by a departmental field inspector during a scheduled site visit.'),
    sourceSystem: 'Field Inspection Register (simulated)',
    transformation: 'Inspector observation digitised, categorised against the standard observation taxonomy and linked to the asset register.',
    domain: 'projects',
    classification: 'confidential',
    attributeKeys: [t('Inspector'), t('Observation class'), t('Severity'), t('Rectification due'), t('Status')],
  },
  {
    kind: 'financial-record',
    title: t('Expenditure ledger extract'),
    summary: t('Booked expenditure against the budget head for the reporting period.'),
    sourceSystem: 'Municipal Financial Management System (simulated)',
    transformation: 'Ledger entries aggregated by budget head and department; commitments included separately from booked expenditure.',
    domain: 'budget',
    classification: 'confidential',
    attributeKeys: [t('Budget head'), t('Booked'), t('Committed'), t('Period'), t('Reconciliation status')],
  },
  {
    kind: 'financial-record',
    title: t('Collection reconciliation extract'),
    summary: t('Assessed demand against realised collection for the revenue stream and period.'),
    sourceSystem: 'Assessment & Collection System (simulated)',
    transformation: 'Demand and receipt registers matched on assessment reference; unmatched receipts held for reconciliation.',
    domain: 'revenue',
    classification: 'confidential',
    attributeKeys: [t('Stream'), t('Demand'), t('Realised'), t('Unmatched receipts'), t('Reconciliation status')],
  },
  {
    kind: 'source-record',
    title: t('Asset register record'),
    summary: t('Master record for the municipal asset including condition assessment and inspection history.'),
    sourceSystem: 'Municipal Asset Register (simulated)',
    transformation: 'Register record joined to the latest condition assessment; condition index normalised to a 0–100 scale.',
    domain: 'assets',
    classification: 'internal',
    attributeKeys: [t('Asset'), t('Category'), t('Condition index'), t('Installed'), t('Last inspection')],
  },
  {
    kind: 'field-report',
    title: t('Field team situation report'),
    summary: t('Situation report submitted by a deployed field team during an active operation.'),
    sourceSystem: 'Emergency Operations Centre Log (simulated)',
    transformation: 'Voice report transcribed by the control room operator and structured against the standard SITREP schema.',
    domain: 'disaster',
    classification: 'confidential',
    attributeKeys: [t('Team'), t('Location'), t('Situation'), t('Resources on site'), t('Reported at')],
  },
  {
    kind: 'source-record',
    title: t('Water distribution zone reading'),
    summary: t('Zone-level supply, pressure and non-revenue water figures for the reporting day.'),
    sourceSystem: 'Hydraulic SCADA & Zonal Register (simulated)',
    transformation: 'Bulk meter readings differenced against zonal consumption to derive non-revenue water; pressure averaged over the supply window.',
    domain: 'water',
    classification: 'internal',
    attributeKeys: [t('Zone'), t('Supply (MLD)'), t('Pressure (m)'), t('NRW %'), t('Supply hours')],
  },
  {
    kind: 'source-record',
    title: t('Collection route adherence log'),
    summary: t('Vehicle route adherence and servicing record for the solid waste collection round.'),
    sourceSystem: 'SWM Vehicle Tracking (simulated)',
    transformation: 'Vehicle track matched to the planned route geometry; points within 50 m of a scheduled stop counted as serviced.',
    domain: 'waste',
    classification: 'internal',
    attributeKeys: [t('Route'), t('Vehicle'), t('Adherence %'), t('Points missed'), t('Tonnage')],
  },
  {
    kind: 'source-record',
    title: t('Aggregate health surveillance return'),
    summary: t('Aggregate case counts reported by health posts for the surveillance period. No patient-level data.'),
    sourceSystem: 'Public Health Surveillance Return (simulated)',
    transformation: 'Health post returns aggregated to ward level; counts below the disclosure threshold suppressed. Individual records are never ingested.',
    domain: 'health',
    classification: 'confidential',
    attributeKeys: [t('Indicator'), t('Cases (period)'), t('Cases (previous)'), t('Posts reporting'), t('Suppression applied')],
  },
  {
    kind: 'document',
    title: t('Contract milestone certificate'),
    summary: t('Certified milestone completion document submitted against the contract.'),
    sourceSystem: 'Contract Management System (simulated)',
    transformation: 'Document metadata extracted and matched to the contract milestone schedule; certificate held as the source of record.',
    domain: 'procurement',
    classification: 'confidential',
    attributeKeys: [t('Contract'), t('Milestone'), t('Certified by'), t('Certified on'), t('Value released')],
  },
  {
    kind: 'model-output',
    title: t('Waterlogging risk model output'),
    summary: t('Modelled waterlogging likelihood for the location under the stated rainfall and tide conditions.'),
    sourceSystem: 'Urban Flood Risk Model (demonstration)',
    transformation: 'Deterministic rule model combining rainfall intensity, drain capacity, desilting completion, tide height and pump availability.',
    domain: 'monsoon',
    classification: 'internal',
    attributeKeys: [t('Location'), t('Modelled risk'), t('Rainfall input'), t('Tide input'), t('Model version')],
  },
  {
    kind: 'source-record',
    title: t('Road defect register entry'),
    summary: t('Recorded surface defect with location, class and rectification status.'),
    sourceSystem: 'Road Asset & Defect Register (simulated)',
    transformation: 'Defect geocoded to the road segment; priority computed by the Road Defect Priority Engine with published weights.',
    domain: 'roads',
    classification: 'internal',
    attributeKeys: [t('Segment'), t('Defect class'), t('Reported'), t('Priority score'), t('Work order')],
  },
  {
    kind: 'source-record',
    title: t('Hospital capacity return'),
    summary: t('Bed, critical care and service availability position reported by the facility.'),
    sourceSystem: 'Hospital Management System (simulated)',
    transformation: 'Facility returns normalised to a common bed taxonomy; occupancy computed against functional rather than sanctioned beds.',
    domain: 'hospitals',
    classification: 'confidential',
    attributeKeys: [t('Facility'), t('Beds functional'), t('Occupied'), t('ICU occupied'), t('Services curtailed')],
  },
]
}
let TEMPLATES: EvidenceTemplate[] = build$TEMPLATES()
registerLayer(() => {
  TEMPLATES = build$TEMPLATES()
})

const CLASSIFICATION_ATTRIBUTE_VALUES: Record<string, () => string> = {}

/**
 * The value written against an attribute key. Called during the rebuild, so it
 * reads the active corporation's scale rather than freezing to whichever
 * corporation was loaded first.
 *
 * Magnitudes are scaled on the dimension they belong to - water against what
 * the corporation actually supplies, waste against what it actually collects,
 * money against its own outlay, counts against residents served. Rainfall and
 * pressure are physical observations, and percentages, indices and periods are
 * ratios: neither is scaled, because neither gets larger when the city does.
 */
function attributeValue(key: string, seed: string): string {
  const r = det(`evattr:${seed}:${key}`)
  const custom = CLASSIFICATION_ATTRIBUTE_VALUES[key]
  if (custom) return custom()

  const scale = CITY_SCALE
  const waterRatio = scale.waterSupplyMLD / REFERENCE_SCALE.waterSupplyMLD
  const wasteRatio = scale.solidWasteTPD / REFERENCE_SCALE.solidWasteTPD

  if (/%|share|adherence|compliance|availability/i.test(key)) return `${r.round(52, 99, 1)}%`
  if (/rainfall/i.test(key)) return `${r.round(4, 148, 1)} mm`
  if (/pressure/i.test(key)) return `${r.round(6, 22, 1)} m`
  if (/mld|supply \(/i.test(key)) return `${r.round(scaled(40, waterRatio, 0.4), scaled(340, waterRatio, 3), 1)} MLD`
  if (/tonnage/i.test(key)) return `${r.round(scaled(18, wasteRatio, 0.5), scaled(240, wasteRatio, 4), 1)} t`
  if (/index|score/i.test(key)) return `${r.int(28, 96)} / 100`
  if (/cases/i.test(key)) return `${r.int(scaledCount(3, scale.population, 1), scaledCount(184, scale.population, 12))}`
  if (/size|count|pumps|posts|points|beds|occupied|resources/i.test(key)) return `${r.int(1, scaledCount(42, scale.population, 8))}`
  if (/value|booked|committed|demand|realised|released|receipts/i.test(key)) return t('₹{0} Cr', r.round(scaled(0.4, scale.budget, 0.05), scaled(96, scale.budget, 2), 2))
  if (/radius/i.test(key)) return t('250 m')
  if (/window|period/i.test(key)) return r.pick([t('14 days'), t('30 days'), t('Rolling 7 days'), t('Q1 FY 2026–27')])
  if (/due|at$|on$|inspection|installed|test|reported/i.test(key)) return t('{0} days ago', r.int(1, 26))
  if (/status/i.test(key)) return r.pick([t('Verified'), t('Pending reconciliation'), t('Operational'), t('Under review'), t('Rectification due')])
  if (/version/i.test(key)) return `v${r.int(1, 4)}.${r.int(0, 9)}`
  if (/severity/i.test(key)) return r.pick([t('Critical'), t('High'), t('Medium'), t('Low')])
  if (/suppression/i.test(key)) return r.pick([t('Applied - counts below threshold withheld'), t('Not required')])
  if (/agreement/i.test(key)) return r.pick([t('Within tolerance'), t('Divergence flagged')])
  return r.pick([t('Recorded'), t('Confirmed'), t('Within tolerance'), t('Under verification')])
}

/** The corpus size these templates were written for: Brihanmumbai's 24 wards. */
const REFERENCE_EVIDENCE_COUNT = 320

/**
 * How many records to hold for the active corporation.
 *
 * The corpus scales with residents served, because that is what generates the
 * observations. But it is also what every ward page, alert and AI answer cites
 * from, so it is floored twice: at eight records per administrative unit, so
 * no unit's page is left with nothing to show, and at 96 overall, so the
 * smallest corporation still has every evidence kind represented several times
 * across the sixteen templates.
 */
function evidenceCount(): number {
  return Math.max(96, WARDS.length * 8, scaledCount(REFERENCE_EVIDENCE_COUNT, CITY_SCALE.population, 1))
}

/** ---------------------------------------------------------------------
 * Live bindings
 * ------------------------------------------------------------------- */

export let EVIDENCE_ITEMS: EvidenceItem[] = []
export let EVIDENCE_BY_ID: Map<string, EvidenceItem> = new Map()

export function evidenceForDomain(domain: IntelligenceDomain, count: number, seed: string): string[] {
  const pool = EVIDENCE_ITEMS.filter((e) => {
    const template = TEMPLATES.find((evidenceTemplate) => evidenceTemplate.title === e.title.split(' - ')[0])
    return template?.domain === domain
  })
  const source = pool.length >= count ? pool : EVIDENCE_ITEMS
  return det(`evfor:${seed}`).sample(source, count).map((e) => e.id)
}

export function evidenceForWard(wardId: string, count: number, seed: string): string[] {
  const pool = EVIDENCE_ITEMS.filter((e) => e.wardIds.includes(wardId))
  const source = pool.length >= count ? pool : EVIDENCE_ITEMS
  return det(`evward:${seed}`).sample(source, count).map((e) => e.id)
}

registerLayer(() => {
  EVIDENCE_ITEMS = Array.from({ length: evidenceCount() }, (_, i) => {
    const seed = `evidence-${i}`
    const r = det(seed)
    const template = TEMPLATES[i % TEMPLATES.length] as EvidenceTemplate
    const ward = r.pick(WARDS)
    const department = DEPARTMENTS.find((d) => d.domain === template.domain) ?? r.pick(DEPARTMENTS)
    const observedMinutesAgo = r.int(20, 60 * 24 * 21)
    const id = `ev-${String(i + 1).padStart(4, '0')}`

    return {
      id,
      tenantId: TENANT_ID,
      kind: template.kind,
      title: `${template.title} - ${ward.code}`,
      summary: template.summary,
      sourceSystem: template.sourceSystem,
      sourceRecordRef: `${template.sourceSystem.split(' ')[0]?.toUpperCase().slice(0, 4)}/${r.int(10000, 99999)}`,
      observedAt: isoFromAnchor(-observedMinutesAgo),
      ingestedAt: isoFromAnchor(-Math.max(3, Math.round(observedMinutesAgo * 0.7))),
      transformation: template.transformation,
      dataQuality: r.int(63, 99),
      classification: template.classification,
      modelId: template.kind === 'model-output' ? 'model-flood-risk-v2' : undefined,
      confidence: template.kind === 'model-output' ? r.pick(['high', 'medium'] as const) : undefined,
      wardIds: [ward.id],
      departmentId: department.id,
      attributes: template.attributeKeys.map((key) => ({ key, value: attributeValue(key, `${id}:${key}`) })),
      lineageId: `lin-${template.domain}`,
    }
  })

  EVIDENCE_BY_ID = new Map(EVIDENCE_ITEMS.map((e) => [e.id, e]))
})
