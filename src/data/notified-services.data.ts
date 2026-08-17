import { TENANT_ID } from '@/config/municipality.config'
import type { NotifiedService, NotifiedServiceChannel, NotifiedServiceDomain } from '@/types/civic-services'
import { det } from '@/utils/deterministic'
import { stateFrom } from './city.data'
import { CITY_SCALE, scaledCount } from './scale'
import { registerLayer } from './runtime'
import { t } from '@/i18n'

/**
 * src/data/notified-services.data.ts
 *
 * The Notified Services Register - one cross-department list of the
 * statutory certificates, licences and permits a corporation is obliged to
 * decide within a published timeline, on the pattern set by Maharashtra's
 * Right to Public Services Act, 2015 (the "Sevottam"/Aaple Sarkar regime) and
 * the individual Acts and Rules that notify each service in turn.
 *
 * The platform already modelled ONE such timeline in isolation - births and
 * deaths registration in `civic.data.ts`, at the same twenty-one days this
 * register states for it - but held nothing that let a reader see the whole
 * notified-service estate a corporation runs at once, across every
 * department that issues one. That absence is what this register exists to
 * close.
 *
 * NOT EVERY SERVICE PERFORMS. A register in which every row clears ninety
 * per cent would not be a credible model of a Maharashtra corporation's
 * notified-service performance - Right to Public Services compliance is
 * published as genuinely uneven across services, and this register is built
 * to show that unevenness rather than flatter it away.
 */

/* ==========================================================================
   Live bindings
   ========================================================================== */

export let NOTIFIED_SERVICES: NotifiedService[] = []

/* ==========================================================================
   Vocabulary
   ========================================================================== */

/**
 * The statutory days figure for births and deaths registration MUST stay
 * equal to `STATUTORY_PERIOD_DAYS` in `CitizenRegistrationPage.tsx` - both
 * describe the same notified timeline under the same Act, read from two
 * different screens.
 */
const BIRTH_DEATH_STATUTORY_DAYS = 21

type ComplianceBand = 'excellent' | 'good' | 'fair' | 'poor'

const COMPLIANCE_RANGE: Record<ComplianceBand, [number, number]> = {
  excellent: [90, 99],
  good: [80, 91],
  fair: [66, 81],
  poor: [42, 69],
}

/** Mean issue time as a multiple of the statutory period, by band - a service
 *  in the `poor` band is not merely slow, it routinely overruns its own
 *  published deadline. */
const ISSUE_MULTIPLE_RANGE: Record<ComplianceBand, [number, number]> = {
  excellent: [0.35, 0.65],
  good: [0.55, 0.82],
  fair: [0.76, 1.05],
  poor: [1.05, 1.65],
}

interface NotifiedServiceSpec {
  key: string
  name: () => string
  domain: NotifiedServiceDomain
  departmentId: string
  statutoryDays: number
  channel: NotifiedServiceChannel
  /** Applications in a thirty-day period, at Brihanmumbai scale. */
  baseApplications30d: number
  band: ComplianceBand
}

function specs(): NotifiedServiceSpec[] {
  return [
    {
      key: 'birth-certificate',
      name: () => t('Birth Certificate'),
      domain: 'registration',
      departmentId: 'dept-registration',
      statutoryDays: BIRTH_DEATH_STATUTORY_DAYS,
      channel: 'both',
      baseApplications30d: 9200,
      band: 'excellent',
    },
    {
      key: 'death-certificate',
      name: () => t('Death Certificate'),
      domain: 'registration',
      departmentId: 'dept-registration',
      statutoryDays: BIRTH_DEATH_STATUTORY_DAYS,
      channel: 'both',
      baseApplications30d: 4300,
      band: 'excellent',
    },
    {
      key: 'marriage-registration',
      name: () => t('Marriage Registration Certificate'),
      domain: 'registration',
      departmentId: 'dept-registration',
      statutoryDays: 30,
      channel: 'ward-office',
      baseApplications30d: 620,
      band: 'good',
    },
    {
      key: 'trade-licence',
      name: () => t('Trade Licence (Shop & Establishment)'),
      domain: 'licensing',
      departmentId: 'dept-licence',
      statutoryDays: 30,
      channel: 'both',
      baseApplications30d: 1850,
      band: 'fair',
    },
    {
      key: 'eating-house-licence',
      name: () => t('Eating House Licence'),
      domain: 'licensing',
      departmentId: 'dept-licence',
      statutoryDays: 30,
      channel: 'both',
      baseApplications30d: 960,
      band: 'fair',
    },
    {
      key: 'factory-licence',
      name: () => t('Factory Licence'),
      domain: 'licensing',
      departmentId: 'dept-licence',
      statutoryDays: 30,
      channel: 'ward-office',
      baseApplications30d: 145,
      band: 'fair',
    },
    {
      key: 'advertisement-hoarding-licence',
      name: () => t('Advertisement Hoarding Licence'),
      domain: 'licensing',
      departmentId: 'dept-licence',
      statutoryDays: 21,
      channel: 'ward-office',
      baseApplications30d: 90,
      band: 'poor',
    },
    {
      key: 'health-trade-licence',
      name: () => t('Health Licence for Food Establishments'),
      domain: 'health',
      departmentId: 'dept-health',
      statutoryDays: 21,
      channel: 'both',
      baseApplications30d: 1320,
      band: 'good',
    },
    {
      key: 'dog-pet-licence',
      name: () => t('Dog / Pet Licence'),
      domain: 'health',
      departmentId: 'dept-health',
      statutoryDays: 15,
      channel: 'online',
      baseApplications30d: 430,
      band: 'excellent',
    },
    {
      key: 'water-connection-new',
      name: () => t('Water Connection (New)'),
      domain: 'water',
      departmentId: 'dept-hydraulic',
      statutoryDays: 45,
      channel: 'ward-office',
      baseApplications30d: 640,
      band: 'poor',
    },
    {
      key: 'drainage-sewerage-noc',
      name: () => t('Drainage / Sewerage NOC'),
      domain: 'sewerage',
      departmentId: 'dept-sewerage',
      statutoryDays: 30,
      channel: 'ward-office',
      baseApplications30d: 385,
      band: 'fair',
    },
    {
      key: 'building-completion-certificate',
      name: () => t('Building Completion Certificate'),
      domain: 'buildings',
      departmentId: 'dept-building',
      statutoryDays: 60,
      channel: 'ward-office',
      baseApplications30d: 115,
      band: 'poor',
    },
    {
      key: 'commencement-certificate',
      name: () => t('Commencement Certificate (Building Permission)'),
      domain: 'buildings',
      departmentId: 'dept-building',
      statutoryDays: 30,
      channel: 'ward-office',
      baseApplications30d: 155,
      band: 'fair',
    },
    {
      key: 'na-use-certificate',
      name: () => t('Non-Agricultural (NA) Use Certificate'),
      domain: 'planning',
      departmentId: 'dept-planning',
      statutoryDays: 45,
      channel: 'ward-office',
      baseApplications30d: 72,
      band: 'poor',
    },
    {
      key: 'property-tax-no-dues',
      name: () => t('Property Tax Assessment / No-Dues Certificate'),
      domain: 'property',
      departmentId: 'dept-assessment',
      statutoryDays: BIRTH_DEATH_STATUTORY_DAYS,
      channel: 'both',
      baseApplications30d: 2650,
      band: 'good',
    },
    {
      key: 'market-stall-licence',
      name: () => t('Market Stall Licence (Gala Allotment)'),
      domain: 'assets',
      departmentId: 'dept-estates',
      statutoryDays: 30,
      channel: 'ward-office',
      baseApplications30d: 85,
      band: 'fair',
    },
    {
      key: 'tree-felling-permission',
      name: () => t('Tree Felling / Transplantation Permission'),
      domain: 'gardens',
      departmentId: 'dept-gardens',
      statutoryDays: 60,
      channel: 'ward-office',
      baseApplications30d: 130,
      band: 'fair',
    },
    {
      key: 'encroachment-removal-ack',
      name: () => t('Encroachment Removal Request - Acknowledgement'),
      domain: 'enforcement',
      departmentId: 'dept-building',
      statutoryDays: 7,
      channel: 'both',
      baseApplications30d: 540,
      band: 'excellent',
    },
  ]
}

/* ==========================================================================
   Rebuild
   ========================================================================== */

registerLayer(() => {
  const scale = CITY_SCALE

  NOTIFIED_SERVICES = specs().map((spec) => {
    const r = det(`notified-service:${spec.key}`)
    const [lo, hi] = COMPLIANCE_RANGE[spec.band]
    const compliance = r.round(lo, hi, 1)
    const [issueLo, issueHi] = ISSUE_MULTIPLE_RANGE[spec.band]
    const avgIssueDays = Math.max(0.5, Math.round(spec.statutoryDays * r.float(issueLo, issueHi) * 10) / 10)

    const applications30d = scaledCount(spec.baseApplications30d, scale.population, 8)
    // A service running well behind its own charter carries a heavier
    // backlog relative to its monthly volume than one that clears on time.
    const backlogFactor = compliance >= 88 ? r.float(0.02, 0.14) : compliance >= 75 ? r.float(0.08, 0.28) : r.float(0.18, 0.55)
    const backlog = Math.round(applications30d * backlogFactor)

    return {
      id: `nsv-${spec.key}`,
      tenantId: TENANT_ID,
      name: spec.name(),
      domain: spec.domain,
      departmentId: spec.departmentId,
      statutoryDays: spec.statutoryDays,
      channel: spec.channel,
      applications30d,
      issuedWithinStatutoryPeriodPct: compliance,
      avgIssueDays,
      backlog,
      trendPct: r.round(-8, 9, 1),
      state: stateFrom(compliance),
    }
  })
})
