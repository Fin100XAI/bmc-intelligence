import { TENANT_ID, activeCorporation } from '@/config/municipality.config'
import type { IntelligenceDomain, Severity } from '@/types/common'
import type {
  ActionItem,
  ActionStatus,
  AssetCategory,
  Complaint,
  ComplaintCategory,
  DecisionAlternative,
  DecisionCase,
  DecisionStatus,
  Incident,
  IncidentStatus,
  IncidentType,
  MunicipalAsset,
  ResponseTeam,
  ServiceHealth,
  TimelineEvent,
  WorkforceUnit,
} from '@/types/operations'
import { det, isoDaysFromAnchor, isoFromAnchor } from '@/utils/deterministic'
import { DEPARTMENTS, WARDS, WARD_BY_ID, wardName } from './reference'
import { EVIDENCE_ITEMS } from './evidence.data'
import { INTELLIGENCE_ITEMS } from './intelligence.data'
import { PROJECTS } from './finance.data'
import { stateFrom } from './city.data'
import { CORPORATION_SHORT_NAME, landmarkName, localityFor } from './naming'
import { CITY_SCALE, scaled, scaledCount } from './scale'
import { registerLayer } from './runtime'
import { t } from '@/i18n'

/**
 * Operational records - complaints, service health, municipal assets,
 * workforce, incidents, decision cases and actions.
 *
 * Volumes track the active corporation: complaint, incident, decision and
 * action counts scale with residents served, asset counts with ground covered,
 * money with the corporation's own budget outlay. Floors are applied so the
 * smallest corporation still renders a working Situation Room rather than an
 * empty one. Place names come from the corporation's own published localities
 * through `./naming.ts` and never from another city.
 *
 * Every collection below is a LIVE BINDING, rebuilt on a corporation switch.
 */

/** ---------------------------------------------------------------------
 * Citizen complaints - aggregate records only, no personal data
 * ------------------------------------------------------------------- */

const COMPLAINT_CATEGORIES: ComplaintCategory[] = [
  'water-supply',
  'drainage',
  'road-defect',
  'solid-waste',
  'street-light',
  'sewerage',
  'building',
  'health-sanitation',
  'encroachment',
  'other',
]

const CATEGORY_DEPARTMENT: Record<ComplaintCategory, string> = {
  'water-supply': 'dept-hydraulic',
  drainage: 'dept-stormwater',
  'road-defect': 'dept-roads',
  'solid-waste': 'dept-solid-waste',
  // Street lighting now has the department that actually owns it rather than
  // Estates, which held it only because no electrical department existed.
  'street-light': 'dept-electrical',
  sewerage: 'dept-sewerage',
  building: 'dept-building',
  'health-sanitation': 'dept-health',
  encroachment: 'dept-estates',
  garden: 'dept-gardens',
  'public-convenience': 'dept-health',
  'stray-animal': 'dept-health',
  education: 'dept-education',
  licensing: 'dept-licence',
  registration: 'dept-registration',
  other: 'dept-commissioner',
}

function build$CATEGORY_SUMMARY(): Record<ComplaintCategory, string[]> {
  return {
  'water-supply': [t('Inadequate supply pressure during scheduled hours'), t('Supply interruption without prior notice'), t('Water quality concern reported at the tap')],
  drainage: [t('Water accumulation persisting after rainfall'), t('Blocked roadside drain reported'), t('Drain cover missing or damaged')],
  'road-defect': [t('Road surface defect affecting vehicle movement'), t('Depression forming after utility trench reinstatement'), t('Footpath surface damaged')],
  'solid-waste': [t('Collection not performed on scheduled day'), t('Accumulation at the collection point'), t('Container overflowing at the market location')],
  'street-light': [t('Street light not functioning on the stretch'), t('Intermittent operation reported'), t('Pole damage reported after storm')],
  sewerage: [t('Sewer overflow reported at the manhole'), t('Persistent odour reported from the network'), t('Backflow reported in the lane')],
  building: [t('Structural concern reported for an ageing structure'), t('Construction activity outside permitted hours'), t('Debris obstructing the access lane')],
  'health-sanitation': [t('Public sanitation facility requiring attention'), t('Stagnant water requiring treatment'), t('Sanitation at the market location requiring attention')],
  encroachment: [t('Obstruction of the footpath reported'), t('Unauthorised structure reported on municipal land'), t('Vending obstruction reported at the junction')],
  garden: [t('Play equipment at the garden requiring repair'), t('Garden closed outside published hours'), t('Overgrowth obstructing the walking path')],
  'public-convenience': [t('Public convenience requiring cleaning'), t('Water supply to the sanitation block interrupted'), t('Sanitation block locked during published hours')],
  'stray-animal': [t('Stray cattle obstructing the carriageway'), t('Stray dog nuisance reported in the lane'), t('Animal carcass requiring removal')],
  education: [t('School building repair required before the term'), t('Mid-day meal not served on the scheduled day'), t('Drinking water at the school requiring attention')],
  licensing: [t('Trade premises operating without a current licence'), t('Licence renewal application pending beyond the charter period'), t('Hoarding erected without permission')],
  registration: [t('Birth certificate not issued within the committed period'), t('Correction sought in a registration entry'), t('Registration counter closed during published hours')],
  other: [t('General municipal service request'), t('Information request regarding municipal services')],
}
}
let CATEGORY_SUMMARY: Record<ComplaintCategory, string[]> = build$CATEGORY_SUMMARY()
registerLayer(() => {
  CATEGORY_SUMMARY = build$CATEGORY_SUMMARY()
})

/**
 * Neutral civic place-kinds. Combined by `landmarkName` with the active
 * corporation's own published localities, they produce a location label that
 * describes a feature every municipal area has rather than borrowing a real
 * settlement name from another city or inventing one that sounds real.
 */
function build$PLACE_KINDS() {
  return [
  t('Chowk'),
  t('Junction'),
  t('Market'),
  t('Main Road'),
  t('Cross Lane'),
  t('Bus Depot'),
  t('Municipal School Lane'),
  t('Water Works Lane'),
  t('Housing Board Colony'),
  t('Industrial Estate'),
]
}
let PLACE_KINDS: ReturnType<typeof build$PLACE_KINDS> = build$PLACE_KINDS()
registerLayer(() => {
  PLACE_KINDS = build$PLACE_KINDS()
})

/**
 * The institutional reference prefix stamped on grievance and incident
 * numbers. Each corporation uses its own - "MCGM/GRV/..." is Brihanmumbai's
 * and belongs to Brihanmumbai alone.
 */
function refPrefix(): string {
  return CORPORATION_SHORT_NAME.replace(/[^A-Za-z0-9]/g, '').toUpperCase() || 'ULB'
}

/**
 * A resident count written the way a municipal note writes it: in lakh where
 * that is the natural unit, in plain grouped figures where the corporation is
 * small enough that "0.05 lakh residents" would be an absurd way to say 4,800.
 */
function residentsPhrase(base: number): string {
  const n = scaledCount(base, CITY_SCALE.population, 800)
  if (n >= 100_000) return t('{0} lakh residents', (n / 100_000).toFixed(1))
  return `${(Math.round(n / 100) * 100).toLocaleString('en-IN')} residents`
}

/** A money figure restated for the active corporation. Zero stays zero - an
 * option that costs nothing costs nothing at any scale. */
function money(crore: number): number {
  return crore === 0 ? 0 : scaled(crore, CITY_SCALE.budget, 0.1)
}

function buildComplaints(): Complaint[] {
  const prefix = refPrefix()
  // Complaint volume tracks residents served, but the floor is set from the
  // number of administrative units rather than as a flat minimum: a ward
  // profile with no complaints at all is not a smaller picture of the city,
  // it is an empty page.
  const count = scaledCount(620, CITY_SCALE.population, Math.max(25, CITY_SCALE.wardCount * 8))

  return Array.from({ length: count }, (_, i) => {
    const r = det(`complaint:${i}`)
    const ward = r.pick(WARDS)
    const category = r.pick(COMPLAINT_CATEGORIES)
    const slaHours = category === 'water-supply' || category === 'sewerage' ? 24 : category === 'road-defect' ? 72 : 48

    // Channel mix follows deployment scale rather than being flat across the
    // roster. A corporation that has procured a citizen app and staffed a
    // round-the-clock helpline takes most of its complaints digitally; a
    // smaller one still takes them over the counter at the ward office. The
    // digital share is derived from the population ratio so the mix moves
    // with the corporation instead of being asserted per city.
    const digitalReach = Math.min(1, Math.max(0.12, Math.sqrt(CITY_SCALE.population)))
    const channel = r.weighted([
      ['helpline', 26],
      ['citizen-portal', Math.round(10 + digitalReach * 18)],
      ['mobile-app', Math.round(4 + digitalReach * 22)],
      ['ward-office', Math.round(30 - digitalReach * 16)],
      ['social-media', Math.round(2 + digitalReach * 8)],
      ['field-inspection', 8],
    ] as const)
    const ageHours = r.round(0.5, slaHours * 2.6, 1)
    const status = r.weighted([
      ['registered', 3],
      ['assigned', 4],
      ['in-progress', 4],
      ['resolved', 5],
      ['reopened', 1],
      ['closed', 3],
    ] as const)

    return {
      id: `cmp-${String(i + 1).padStart(4, '0')}`,
      tenantId: TENANT_ID,
      reference: `${prefix}/GRV/${r.int(100000, 999999)}`,
      category,
      channel,
      summary: r.pick(CATEGORY_SUMMARY[category]),
      wardId: ward.id,
      localityName: landmarkName(`complaint:${i}`, r.pick(PLACE_KINDS)),
      departmentId: CATEGORY_DEPARTMENT[category],
      raisedAt: isoFromAnchor(-Math.round(ageHours * 60)),
      status,
      slaHours,
      ageHours,
      slaBreached: ageHours > slaHours && status !== 'resolved' && status !== 'closed',
      repeatCount: r.weighted([[0, 6], [1, 3], [2, 2], [3, 1]] as const),
      severity: r.weighted([
        ['low', 4],
        ['medium', 5],
        ['high', 2],
        ['critical', 1],
      ] as const satisfies ReadonlyArray<readonly [Severity, number]>),
      assignedOfficerId: status === 'registered' ? undefined : `off-ward-${ward.id}`,
      location: {
        lat: ward.centroid.lat + r.float(-0.014, 0.014),
        lng: ward.centroid.lng + r.float(-0.014, 0.014),
      },
    }
  })
}

function buildServiceHealth(): ServiceHealth[] {
  return WARDS.flatMap((ward) =>
    COMPLAINT_CATEGORIES.map((category) => {
      const relevant = COMPLAINTS.filter((c) => c.wardId === ward.id && c.category === category)
      const open = relevant.filter((c) => c.status !== 'resolved' && c.status !== 'closed').length
      const resolved = relevant.filter((c) => c.status === 'resolved' || c.status === 'closed').length
      const r = det(`svchealth:${ward.id}:${category}`)
      const compliance = Math.round(
        Math.max(30, Math.min(99, 92 - open * 3.6 + (ward.healthScore - 60) * 0.4 + r.float(-6, 6))) * 10,
      ) / 10
      return {
        wardId: ward.id,
        category,
        open,
        resolved30d: resolved,
        avgResolutionHours: r.round(6, 96, 1),
        slaCompliancePct: compliance,
        trendPct: r.round(-18, 18, 1),
        state: stateFrom(compliance),
      }
    }),
  )
}

/** ---------------------------------------------------------------------
 * Municipal assets
 * ------------------------------------------------------------------- */

const ASSET_CATEGORIES: AssetCategory[] = [
  'water-asset',
  'pumping-station',
  'drain',
  'road',
  'bridge',
  'building',
  'hospital',
  'school',
  'waste-facility',
  'vehicle',
  'street-light',
  'park',
]

const ASSET_DEPARTMENT: Record<AssetCategory, string> = {
  'water-asset': 'dept-hydraulic',
  'pumping-station': 'dept-stormwater',
  drain: 'dept-stormwater',
  road: 'dept-roads',
  bridge: 'dept-roads',
  building: 'dept-estates',
  hospital: 'dept-hospitals',
  // School buildings belong to Education, not to Building Proposals; street
  // lights to Electrical, not Estates; parks to Gardens, not Environment.
  // Each was held by the nearest available department until the department
  // that actually owns it existed.
  school: 'dept-education',
  'waste-facility': 'dept-solid-waste',
  vehicle: 'dept-solid-waste',
  'street-light': 'dept-electrical',
  park: 'dept-gardens',
  market: 'dept-estates',
  crematorium: 'dept-health',
  'public-convenience': 'dept-health',
}

const ASSET_LIFE: Record<AssetCategory, number> = {
  'water-asset': 40,
  'pumping-station': 30,
  drain: 50,
  road: 12,
  bridge: 60,
  building: 60,
  hospital: 50,
  school: 50,
  'waste-facility': 25,
  vehicle: 10,
  'street-light': 15,
  park: 30,
  market: 45,
  crematorium: 40,
  'public-convenience': 20,
}

function buildAssets(): MunicipalAsset[] {
  // The asset register scales with ground covered rather than with residents,
  // and carries the same per-unit floor as complaints so every ward profile has
  // an asset list to show.
  const count = scaledCount(420, CITY_SCALE.area, Math.max(20, CITY_SCALE.wardCount * 5))

  return Array.from({ length: count }, (_, i) => {
    const r = det(`asset:${i}`)
    const category = r.pick(ASSET_CATEGORIES)
    const ward = r.pick(WARDS)
    const life = ASSET_LIFE[category]
    const installedYear = 2026 - r.int(1, Math.round(life * 1.5))
    const age = 2026 - installedYear
    const condition = Math.max(8, Math.min(98, Math.round(96 - (age / life) * 62 + r.float(-12, 12))))
    const criticality: Severity = r.weighted([
      ['critical', 1],
      ['high', 3],
      ['medium', 5],
      ['low', 4],
    ] as const)

    return {
      id: `ast-${String(i + 1).padStart(4, '0')}`,
      tenantId: TENANT_ID,
      name: `${category.replace('-', ' ')} - ${ward.code}/${String(i + 1).padStart(3, '0')}`,
      category,
      wardId: ward.id,
      departmentId: ASSET_DEPARTMENT[category],
      installedYear,
      designLifeYears: life,
      conditionIndex: condition,
      state: stateFrom(condition),
      lastInspectedAt: isoDaysFromAnchor(-r.int(2, 640)),
      nextInspectionDue: isoDaysFromAnchor(r.int(-90, 220)),
      replacementValueCrore: money(r.round(0.08, 86, 2)),
      criticality,
      location: {
        lat: ward.centroid.lat + r.float(-0.012, 0.012),
        lng: ward.centroid.lng + r.float(-0.012, 0.012),
      },
      openObservations: r.int(0, 7),
      classification: 'internal',
    }
  })
}

/** ---------------------------------------------------------------------
 * Workforce
 * ------------------------------------------------------------------- */

function build$CADRES() {
  return [
  t('Sanitation workers'),
  t('Junior engineers'),
  t('Assistant engineers'),
  t('Sub-engineers'),
  t('Clerical establishment'),
  t('Health workers'),
  t('Vehicle operators'),
  t('Supervisors'),
]
}
let CADRES: ReturnType<typeof build$CADRES> = build$CADRES()
registerLayer(() => {
  CADRES = build$CADRES()
})

function buildWorkforceUnits(): WorkforceUnit[] {
  // Departmental establishment is already scaled to the corporation in
  // `./reference.ts`, so the cadre split below inherits the right magnitude
  // without scaling a second time.
  return DEPARTMENTS.flatMap((dept) => {
    const r = det(`workforce:${dept.id}`)
    const cadres = r.sample(CADRES, r.int(2, 4))
    return cadres.map((cadre, i) => {
      const wr = det(`workforce:${dept.id}:${cadre}`)
      const sanctioned = Math.max(20, Math.round((dept.staffCount / cadres.length) * wr.float(0.6, 1.4)))
      const deployed = Math.round(sanctioned * wr.float(0.62, 0.98))
      const onLeave = Math.round(deployed * wr.float(0.02, 0.11))
      const contractual = Math.round(sanctioned * wr.float(0, 0.34))
      const vacancy = Math.round(((sanctioned - deployed) / sanctioned) * 1000) / 10
      const workload = Math.min(100, Math.round(52 + vacancy * 1.4 + wr.float(-8, 12)))
      return {
        id: `wf-${dept.id}-${i}`,
        tenantId: TENANT_ID,
        departmentId: dept.id,
        cadre,
        sanctioned,
        deployed,
        onLeave,
        contractual,
        vacancyPct: vacancy,
        workloadIndex: workload,
        state: stateFrom(100 - workload),
      }
    })
  })
}

/** ---------------------------------------------------------------------
 * Incidents
 * ------------------------------------------------------------------- */

interface IncidentSpec {
  type: IncidentType
  title: string
  description: string
  departmentId: string
}

/**
 * The flood incident every corporation actually gets, in the form its own
 * geography produces. A tidal creek backflow is a real and recurring event in a
 * coastal corporation and a physical impossibility in an inland one, so the
 * incident register must not carry it everywhere.
 */
function outfallFloodSpec(): Pick<IncidentSpec, 'title' | 'description'> {
  switch (activeCorporation.form.type) {
    case 'coastal':
    case 'creek-side':
      return {
        title: t('Creek-side backflow during high tide'),
        description: t('Tidal backflow through an outfall affecting the creek-side settlement during the spring tide window.'),
      }
    case 'riverine':
      return {
        title: t('Outfall backflow at high river stage'),
        description: t('Backflow through a storm water outfall affecting the riverside settlement while the river is running at high stage.'),
      }
    case 'lakeside':
      return {
        title: t('Spill channel overflow into adjoining settlement'),
        description: t('Overflow from the lake spill channel affecting the adjoining settlement after sustained catchment rainfall.'),
      }
    default:
      return {
        title: t('Nallah overtopping at a constricted reach'),
        description: t('Overtopping of a nallah at a constricted reach affecting the adjoining settlement after sustained rainfall.'),
      }
  }
}

function incidentSpecs(): IncidentSpec[] {
  const outfall = outfallFloodSpec()
  return [
    { type: 'flood', title: t('Waterlogging at subway approach'), description: t('Water accumulation reported at the subway approach following high-intensity rainfall coinciding with a high-tide window.'), departmentId: 'dept-stormwater' },
    { type: 'flood', title: t('Low-lying settlement inundation'), description: t('Standing water reported in a low-lying settlement with residents requiring temporary relocation assistance.'), departmentId: 'dept-disaster' },
    { type: 'fire', title: t('Commercial premises fire'), description: t('Fire reported at a commercial premises. Fire brigade units deployed and adjoining structures assessed.'), departmentId: 'dept-fire' },
    { type: 'fire', title: t('Electrical fire in residential structure'), description: t('Fire originating from an electrical installation in a residential structure. Evacuation of upper floors completed.'), departmentId: 'dept-fire' },
    { type: 'building-collapse', title: t('Partial structural collapse of ageing building'), description: t('Partial collapse reported at an ageing structure. Search and rescue units deployed; adjoining structures evacuated pending assessment.'), departmentId: 'dept-building' },
    { type: 'infrastructure-failure', title: t('Trunk water main burst'), description: t('Burst on a trunk distribution main causing supply interruption across multiple localities and localised road damage.'), departmentId: 'dept-hydraulic' },
    { type: 'infrastructure-failure', title: t('Retaining wall failure adjoining road'), description: t('Retaining wall failure adjoining a municipal road following sustained rainfall. Road partially closed pending assessment.'), departmentId: 'dept-roads' },
    { type: 'extreme-weather', title: t('High-wind tree fall obstructing corridor'), description: t('Multiple tree falls during a high-wind episode obstructing a primary corridor and damaging overhead utilities.'), departmentId: 'dept-environment' },
    { type: 'public-health', title: t('Gastroenteritis cluster under investigation'), description: t('Aggregate case cluster reported from health posts in a single locality. Water quality sampling and sanitation inspection initiated.'), departmentId: 'dept-health' },
    { type: 'road-disruption', title: t('Carriageway subsidence following utility works'), description: t('Localised carriageway subsidence following utility trenching. Lane closure imposed pending reinstatement.'), departmentId: 'dept-roads' },
    { type: 'utility-incident', title: t('Sewer overflow at trunk manhole'), description: t('Sewer overflow at a trunk manhole affecting the adjoining lane. Jetting unit deployed and sanitation measures initiated.'), departmentId: 'dept-sewerage' },
    { type: 'flood', title: outfall.title, description: outfall.description, departmentId: 'dept-stormwater' },
  ]
}

const TEAM_TYPES: ResponseTeam['type'][] = ['fire', 'disaster-response', 'medical', 'engineering', 'dewatering', 'police-liaison']

/**
 * Corridor labels for an incident. One is anchored on the corporation's own
 * localities; the rest describe corridors every municipal area has, so a
 * landlocked corporation is never reported as having lost a sea-facing road.
 */
function roadLabels(seed: string): string[] {
  return [
    t('{0} Main Road', localityFor(seed)),
    t('Station Road'),
    t('Market Road'),
    t('Highway Service Road'),
    t('Hospital Approach Road'),
    t('Municipal Depot Road'),
  ]
}

function buildTimeline(seed: string, status: IncidentStatus, detectedMinutesAgo: number): TimelineEvent[] {
  const r = det(`timeline:${seed}`)
  const stages: Array<{ kind: TimelineEvent['kind']; title: string; detail: string }> = [
    { kind: 'detection', title: t('Incident detected'), detail: t('Report received at the Emergency Operations Centre and logged against the incident register.') },
    { kind: 'assessment', title: t('Field validation completed'), detail: t('Ward field team confirmed the report and provided an initial situation assessment.') },
    { kind: 'deployment', title: t('Response resources deployed'), detail: t('Response teams dispatched from the nearest station with estimated arrival confirmed.') },
    { kind: 'update', title: t('Situation report received'), detail: t('Deployed team reported progress and current resource requirement from site.') },
    { kind: 'escalation', title: t('Escalated to zonal authority'), detail: t('Severity assessment revised upward; zonal authority notified for additional resources.') },
    { kind: 'resolution', title: t('Normal service restored'), detail: t('Site cleared, normal service restored and the location released for public use.') },
    { kind: 'decision', title: t('Post-incident review recorded'), detail: t('Review completed with lessons captured for preparedness planning.') },
  ]

  const stageCount =
    status === 'detected' ? 1 : status === 'validated' ? 2 : status === 'active' ? 4 : status === 'contained' ? 5 : status === 'resolved' ? 6 : 7

  return stages.slice(0, stageCount).map((stage, i) => ({
    id: `${seed}-tl-${i + 1}`,
    at: isoFromAnchor(-detectedMinutesAgo + Math.round((detectedMinutesAgo / Math.max(stageCount, 1)) * i)),
    actor: r.pick([t('EOC Operator'), t('Ward Field Team'), t('Zonal Control'), t('Department Duty Officer'), t('Response Team Leader')]),
    title: stage.title,
    detail: stage.detail,
    kind: stage.kind,
  }))
}

function buildIncidents(): Incident[] {
  const prefix = refPrefix()
  const specs = incidentSpecs()
  const floodWards = WARDS.filter((w) => w.floodProne)
  // The incident register scales with residents served. The floor keeps the
  // Situation Room, the incident map and the response board populated for the
  // smallest corporation - an empty operations centre demonstrates nothing.
  const count = scaledCount(64, CITY_SCALE.population, 10)

  return Array.from({ length: count }, (_, i) => {
    const r = det(`incident:${i}`)
    const spec = specs[i % specs.length] as IncidentSpec
    const ward = spec.type === 'flood' && floodWards.length > 0 ? r.pick(floodWards) : r.pick(WARDS)
    const status = r.weighted([
      ['detected', 2],
      ['validated', 2],
      ['active', 4],
      ['contained', 3],
      ['resolved', 4],
      ['reviewed', 3],
    ] as const satisfies ReadonlyArray<readonly [IncidentStatus, number]>)
    const severity: Severity = r.weighted([
      ['critical', 1],
      ['high', 4],
      ['medium', 5],
      ['low', 2],
    ] as const)
    const detectedMinutesAgo = r.int(20, 60 * 24 * 9)
    const teamCount = severity === 'critical' ? r.int(3, 6) : severity === 'high' ? r.int(2, 4) : r.int(1, 3)

    const teams: ResponseTeam[] = Array.from({ length: teamCount }, (__team, entry) => {
      const tr = det(`team:${i}:${entry}`)
      return {
        id: `inc-${i}-team-${entry}`,
        name: t('{0} Unit', tr.pick(['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot'])),
        type: tr.pick(TEAM_TYPES),
        strength: tr.int(4, 22),
        status:
          status === 'resolved' || status === 'reviewed'
            ? 'stood-down'
            : tr.weighted([['deployed', 5], ['en-route', 2], ['standby', 2]] as const),
        assignedAt: isoFromAnchor(-detectedMinutesAgo + tr.int(5, 60)),
        wardId: ward.id,
      }
    })

    const affectedPopulation = Math.round(ward.population * r.float(0.002, 0.06))

    return {
      id: `inc-${String(i + 1).padStart(4, '0')}`,
      tenantId: TENANT_ID,
      reference: `${prefix}/INC/2026/${String(1400 + i)}`,
      title: `${spec.title} - ${ward.code}`,
      description: spec.description,
      type: spec.type,
      severity,
      status,
      wardId: ward.id,
      locationName: `${landmarkName(`incident:${i}`, r.pick(PLACE_KINDS))}, ${wardName(ward.id)}`,
      location: {
        lat: ward.centroid.lat + r.float(-0.012, 0.012),
        lng: ward.centroid.lng + r.float(-0.012, 0.012),
      },
      affectedPopulation,
      affectedAreaSqKm: Math.round(ward.areaSqKm * r.float(0.01, 0.16) * 100) / 100,
      responseTeams: teams,
      timeline: buildTimeline(`inc-${i}`, status, detectedMinutesAgo),
      evidenceIds: r.sample(EVIDENCE_ITEMS.filter((e) => e.wardIds.includes(ward.id)), 2).map((e) => e.id),
      notes: [],
      decisionCaseIds: [],
      actionIds: [],
      ownerId: `off-ward-${ward.id}`,
      departmentId: spec.departmentId,
      detectedAt: isoFromAnchor(-detectedMinutesAgo),
      updatedAt: isoFromAnchor(-Math.round(detectedMinutesAgo * r.float(0.05, 0.4))),
      resolvedAt: status === 'resolved' || status === 'reviewed' ? isoFromAnchor(-Math.round(detectedMinutesAgo * 0.2)) : undefined,
      roadsImpacted: r.sample(roadLabels(`inc-roads:${i}`), r.int(0, 3)),
      hospitalsImpacted: r.chance(0.24) ? [t('Hospital approach affected in {0}', ward.code)] : [],
      classification: 'confidential',
      confidence: r.weighted([['high', 5], ['medium', 4], ['low', 1]] as const),
    }
  })
}

/** ---------------------------------------------------------------------
 * Decision cases
 * ------------------------------------------------------------------- */

interface DecisionSpec {
  title: string
  problem: string
  background: string
  domain: DecisionCase['domain']
  departmentIds: string[]
  financialImpactCrore: number
  citizenImpact: string
  recommendation: string
  risks: string[]
  alternatives: Array<{ title: string; description: string; cost: number; days: number; benefits: string[]; risks: string[]; score: number; rationale: string }>
}

/**
 * The standing decision set every corporation faces, restated at its own scale.
 * Cost and exposure figures were written for Brihanmumbai; the counts of
 * waterlogging locations, pumps and drain reaches were too. Both are scaled
 * here, and the relative magnitudes are preserved so the trade-off each case
 * turns on - capacity short of need - still holds for the smallest corporation.
 */
function decisionSpecs(): DecisionSpec[] {
  const scale = CITY_SCALE
  const chronicLocations = scaledCount(61, scale.area, 8)
  const pumpCapacity = scaledCount(40, scale.area, 5)
  const desiltingReaches = scaledCount(11, scale.area, 3)

  return [
    {
      title: t('Pre-monsoon dewatering resource allocation across flood-prone wards'),
      problem:
        'Available dewatering capacity is insufficient to cover every chronic waterlogging location simultaneously under the modelled heavy-rain and high-tide coincidence. A prioritisation decision is required.',
      background:
        `${chronicLocations} chronic waterlogging locations are recorded across flood-prone wards. The central pump pool holds capacity for approximately ${pumpCapacity} simultaneous deployments. Pre-monsoon desilting has not reached the departmental target on ${desiltingReaches} reaches.`,
      domain: 'monsoon',
      departmentIds: ['dept-stormwater', 'dept-disaster', 'dept-roads'],
      financialImpactCrore: money(12.4),
      citizenImpact:
        `Approximately ${residentsPhrase(210_000)} live within the modelled exposure area of the prioritised locations. Hospital access is a factor at four locations.`,
      recommendation:
        t('Allocate capacity by combined exposure - chronic index, critical route status and hospital proximity - rather than uniformly across wards.'),
      risks: [
        t('Wards not prioritised will have longer clearance times if rainfall distribution differs from the outlook'),
        t('Prioritisation by exposure may be perceived as inequitable without a published basis'),
      ],
      alternatives: [
        {
          title: t('Exposure-weighted allocation'),
          description: t('Allocate dewatering capacity in proportion to combined chronic index, critical-route status and hospital proximity.'),
          cost: money(12.4),
          days: 3,
          benefits: [t('Maximises modelled population protected'), t('Preserves hospital access under the coincidence scenario'), t('Basis is publishable and defensible')],
          risks: [t('Lower-exposure wards receive reduced cover')],
          score: 82,
          rationale: t('Highest modelled population protected per unit of deployed capacity, with hospital access explicitly preserved.'),
        },
        {
          title: t('Uniform ward allocation'),
          description: t('Distribute available capacity equally across all flood-prone wards irrespective of assessed exposure.'),
          cost: money(12.4),
          days: 2,
          benefits: [t('Simple to administer'), t('Perceived as equitable across wards')],
          risks: [t('Highest-exposure locations remain under-resourced'), t('Hospital access is not specifically protected')],
          score: 48,
          rationale: t('Administratively simple but leaves the highest-exposure locations materially under-resourced.'),
        },
        {
          title: t('Hire additional capacity from the market'),
          description: t('Procure supplementary dewatering capacity to cover all chronic locations without prioritisation.'),
          cost: money(31.8),
          days: 21,
          benefits: [t('Removes the prioritisation trade-off entirely')],
          risks: [t('Procurement lead time exceeds the forecast window'), t('Cost is materially higher'), t('Market availability during monsoon is uncertain')],
          score: 55,
          rationale: t('Removes the trade-off but the lead time does not meet the operational window.'),
        },
      ],
    },
    {
      title: t('Response to schedule variance on a major storm water augmentation work'),
      problem:
        'A major storm water augmentation work has accumulated schedule variance beyond tolerance with two milestones slipped and financial progress leading physical progress.',
      background:
        'The work commenced fourteen months ago against a twenty-four month programme. Two extensions have been granted. Physical progress stands materially behind the phased plan while payment released stands ahead of it.',
      domain: 'projects',
      departmentIds: ['dept-stormwater', 'dept-projects', 'dept-procurement'],
      financialImpactCrore: money(86.2),
      citizenImpact:
        `Completion of this work directly affects drainage capacity for approximately ${residentsPhrase(460_000)} in the contributing catchment.`,
      recommendation:
        t('Convene a milestone recovery review, hold further payment release pending physical verification, and assess whether the programme itself requires revision.'),
      risks: [
        t('Withholding payment may affect executing agency cash flow and slow progress further'),
        t('A recovery plan without additional resource commitment is unlikely to hold'),
      ],
      alternatives: [
        {
          title: t('Recovery plan with payment verification control'),
          description: t('Agree a dated recovery plan and release further payment only against verified physical measurement.'),
          cost: 0,
          days: 14,
          benefits: [t('Restores alignment between financial and physical progress'), t('Retains the existing executing agency and site knowledge')],
          risks: [t('Recovery plans without resource change frequently slip again')],
          score: 78,
          rationale: t('Addresses the control weakness directly while preserving continuity of execution.'),
        },
        {
          title: t('Revise the programme and re-baseline'),
          description: t('Accept that the original programme was not achievable and formally re-baseline the completion date.'),
          cost: money(4.2),
          days: 30,
          benefits: [t('Produces a realistic and monitorable programme')],
          risks: [t('Removes contractual pressure'), t('Delays the drainage benefit to the catchment by a further season')],
          score: 52,
          rationale: t('Realistic but defers the operational benefit and reduces delivery pressure.'),
        },
        {
          title: t('Split the remaining scope into a separate package'),
          description: t('Retain the current agency for completed sections and tender the remaining scope separately.'),
          cost: money(18.6),
          days: 120,
          benefits: [t('Introduces additional delivery capacity')],
          risks: [t('Tendering lead time is substantial'), t('Interface risk between packages'), t('Additional cost')],
          score: 41,
          rationale: t('Adds capacity but the tendering lead time exceeds the benefit horizon for this season.'),
        },
      ],
    },
    {
      title: t('Capital re-phasing in response to year-to-date under-utilisation'),
      problem:
        'Capital expenditure across three departments trails the phased plan by more than fifteen percentage points at the reporting date, placing the annual utilisation target at risk.',
      background:
        'Booked plus committed expenditure stands materially below the phased plan. Departmental returns attribute the position to a combination of monsoon working constraints and tendering timelines rather than accounting lag.',
      domain: 'budget',
      departmentIds: ['dept-finance', 'dept-projects', 'dept-roads'],
      financialImpactCrore: money(412.8),
      citizenImpact:
        'Under-utilisation defers the delivery of works whose benefits accrue to residents across multiple wards within the current year.',
      recommendation:
        t('Re-phase realistically for the remainder of the year and identify works that can be advanced rather than assuming recovery within the existing phasing.'),
      risks: [
        t('Re-phasing may surface an implicit reduction in annual delivery'),
        t('Advancing works without capacity assessment simply moves the constraint'),
      ],
      alternatives: [
        {
          title: t('Re-phase and advance shovel-ready works'),
          description: t('Correct the phasing and bring forward works that already hold clearances and appointed agencies.'),
          cost: 0,
          days: 30,
          benefits: [t('Defensible phasing'), t('Recovers a portion of annual utilisation'), t('No additional sanction required')],
          risks: [t('Depends on genuine shovel-readiness of the advanced works')],
          score: 80,
          rationale: t('Corrects the position without over-claiming recovery that delivery capacity cannot support.'),
        },
        {
          title: t('Retain phasing and monitor'),
          description: t('Leave the phasing unchanged and monitor for recovery in the post-monsoon working season.'),
          cost: 0,
          days: 0,
          benefits: [t('No administrative effort')],
          risks: [t('Position is likely to deteriorate further'), t('Reporting continues against a plan known to be unachievable')],
          score: 26,
          rationale: t('Retains a plan already known to be unachievable, which weakens the value of the reporting itself.'),
        },
        {
          title: t('Reallocate to departments delivering ahead of plan'),
          description: t('Move a portion of allocation to departments whose delivery is running ahead of the phased plan.'),
          cost: 0,
          days: 45,
          benefits: [t('Improves aggregate utilisation')],
          risks: [t('Requires revised sanction'), t('Penalises departments facing genuine external constraints')],
          score: 58,
          rationale: t('Improves the aggregate position but requires revised sanction and may misattribute the cause.'),
        },
      ],
    },
    {
      title: t('Structural audit compliance for the overdue ageing-structure cohort'),
      problem:
        'A cohort of ageing structures has passed the statutory structural audit due date without a completed audit, representing an unquantified life-safety exposure ahead of the monsoon season.',
      background:
        'Structures above the statutory age threshold require periodic structural audit. A material cohort remains overdue. Empanelled auditor capacity is the binding constraint.',
      domain: 'buildings',
      departmentIds: ['dept-building', 'dept-fire'],
      financialImpactCrore: money(8.6),
      citizenImpact:
        'Occupants of the overdue cohort remain in structures whose condition has not been formally assessed within the statutory cycle.',
      recommendation:
        t('Issue compliance notices, expand empanelled auditor capacity and prioritise inspection by age and occupancy density.'),
      risks: [
        t('Notice issue will generate representations requiring adjudication'),
        t('Findings may require relocation arrangements that are not currently provisioned'),
      ],
      alternatives: [
        {
          title: t('Prioritised audit programme with expanded panel'),
          description: t('Expand the empanelled auditor list and sequence audits by structure age and occupancy density.'),
          cost: money(8.6),
          days: 90,
          benefits: [t('Clears the overdue cohort within the quarter'), t('Prioritises the highest-occupancy exposure first')],
          risks: [t('Panel expansion requires an empanelment cycle')],
          score: 84,
          rationale: t('Addresses both the capacity constraint and the sequencing question with a defensible priority basis.'),
        },
        {
          title: t('Notices only, existing panel'),
          description: t('Issue compliance notices and rely on the existing panel to complete audits over a longer period.'),
          cost: money(1.2),
          days: 180,
          benefits: [t('Lowest immediate cost')],
          risks: [t('Overdue exposure persists through the monsoon season')],
          score: 44,
          rationale: t('Lowest cost but leaves the exposure unresolved through the highest-risk period.'),
        },
      ],
    },
    {
      title: t('Prioritisation of emergency corridor rectification works'),
      problem:
        'Defect accumulation on designated emergency access corridors exceeds the rectification capacity available within the current window. A prioritisation basis must be adopted.',
      background:
        'The Road Defect Priority Engine identifies a set of corridor defects above the priority threshold. Rectification capacity, constrained by monsoon working conditions, covers a portion of this set.',
      domain: 'roads',
      departmentIds: ['dept-roads', 'dept-projects'],
      financialImpactCrore: money(24.6),
      citizenImpact:
        'Corridor condition directly affects emergency vehicle response times and hospital access for residents across the affected wards.',
      recommendation:
        t('Rectify in strict priority-score order with hospital-access segments treated first, and publish the ordering so the basis is transparent.'),
      risks: [
        t('Monsoon conditions limit the durability of rectification undertaken now'),
        t('Strict ordering may leave some wards without treatment in this window'),
      ],
      alternatives: [
        {
          title: t('Strict priority-score ordering'),
          description: t('Treat defects strictly in the order produced by the published priority engine.'),
          cost: money(24.6),
          days: 21,
          benefits: [t('Transparent and defensible'), t('Directs capacity to the highest assessed impact')],
          risks: [t('Geographic distribution of treatment will be uneven')],
          score: 79,
          rationale: t('Directs constrained capacity by published, explainable criteria rather than by representation.'),
        },
        {
          title: t('Ward-balanced allocation'),
          description: t('Allocate rectification capacity so that every ward receives some treatment in the window.'),
          cost: money(24.6),
          days: 21,
          benefits: [t('Even geographic distribution')],
          risks: [t('Highest-priority corridor defects remain untreated')],
          score: 47,
          rationale: t('Distributes evenly but does not direct capacity to the highest assessed impact.'),
        },
      ],
    },
    {
      title: t('Response to sustained low-pressure supply in a distribution zone'),
      problem:
        'Tail-end pressure in a distribution zone has remained below the service standard for six consecutive supply cycles with rising tanker dependency.',
      background:
        'Monitoring points at the tail end of the zone record pressure below standard through the supply window. Tanker trips in the affected area have risen materially. Non-revenue water in the zone is above the departmental threshold.',
      domain: 'water',
      departmentIds: ['dept-hydraulic'],
      financialImpactCrore: money(4.8),
      citizenImpact:
        `Approximately ${residentsPhrase(140_000)} in the tail-end area are receiving supply below the service standard.`,
      recommendation:
        t('Rebalance the supply schedule and verify valve settings first; commission a district metered area survey in parallel to localise loss.'),
      risks: [
        t('Rebalancing may reduce pressure in adjoining areas'),
        t('Survey accuracy is reduced where supply hours are irregular'),
      ],
      alternatives: [
        {
          title: t('Operational rebalancing with parallel DMA survey'),
          description: t('Rebalance schedule and valves immediately while commissioning a district metered area survey to localise network loss.'),
          cost: money(4.8),
          days: 14,
          benefits: [t('Immediate partial relief'), t('Establishes the underlying cause'), t('Low cost')],
          risks: [t('Adjoining areas require monitoring during rebalancing')],
          score: 83,
          rationale: t('Delivers immediate relief while establishing the cause, rather than treating only the symptom.'),
        },
        {
          title: t('Increase tanker provision'),
          description: t('Meet the shortfall through additional tanker supply until a capital solution is delivered.'),
          cost: money(11.4),
          days: 2,
          benefits: [t('Fastest relief for residents')],
          risks: [t('Recurring cost'), t('Does not address the network cause'), t('Tanker dependency becomes structural')],
          score: 38,
          rationale: t('Fast but converts a network problem into a recurring operating cost without resolving it.'),
        },
      ],
    },
  ]
}

const DECISION_STATUS_WEIGHTS: ReadonlyArray<readonly [DecisionStatus, number]> = [
  ['draft', 2],
  ['under-review', 4],
  ['approved', 3],
  ['assigned', 2],
  ['implementing', 3],
  ['verification', 2],
  ['closed', 2],
  ['rejected', 1],
]

function buildDecisionCases(): DecisionCase[] {
  const specs = decisionSpecs()
  // The threshold above which a third approver is required is a money figure
  // like any other: at Brihanmumbai's outlay ₹50 crore is a significant case,
  // and at a small corporation's it is the entire capital programme.
  const thirdApproverThreshold = money(50)
  // Decision cases scale with residents served. Six is the floor - fewer than
  // that and the Decision Centre cannot show a comparison, a queue and a
  // closed case with a measured outcome at the same time.
  const count = scaledCount(34, CITY_SCALE.population, 6)

  return Array.from({ length: count }, (_, i) => {
    const r = det(`decision:${i}`)
    const spec = specs[i % specs.length] as DecisionSpec
    const relatedIntel = INTELLIGENCE_ITEMS.filter((item) => item.domain === spec.domain)
    const sourceIntel = r.sample(relatedIntel.length > 0 ? relatedIntel : INTELLIGENCE_ITEMS, r.int(1, 3))
    const wardIds = Array.from(new Set(sourceIntel.flatMap((s) => s.wardIds)))
    const status = r.weighted(DECISION_STATUS_WEIGHTS)
    const createdDaysAgo = r.int(2, 72)

    const alternatives: DecisionAlternative[] = spec.alternatives.map((alt, ai) => ({
      id: `dc-${i}-alt-${ai + 1}`,
      title: alt.title,
      description: alt.description,
      indicativeCostCrore: alt.cost,
      timeToEffectDays: alt.days,
      benefits: alt.benefits,
      risks: alt.risks,
      score: alt.score,
      scoreRationale: alt.rationale,
    }))

    const best = alternatives.reduce((a, b) => (b.score > a.score ? b : a))
    const decided = ['approved', 'assigned', 'implementing', 'verification', 'closed'].includes(status)

    const evidenceIds = Array.from(new Set(sourceIntel.flatMap((s) => s.evidenceIds))).slice(0, 5)

    const approverPool = [
      { id: 'user-commissioner', designation: t('Municipal Commissioner') },
      { id: 'user-addl-commissioner', designation: t('Additional Municipal Commissioner') },
      { id: 'user-finance', designation: t('Chief Accountant (Finance)') },
      { id: 'user-chief-engineer', designation: t('Chief Engineer') },
    ]
    const approvers = r.sample(approverPool, spec.financialImpactCrore > thirdApproverThreshold ? 3 : 2)

    return {
      id: `dc-${String(i + 1).padStart(4, '0')}`,
      tenantId: TENANT_ID,
      reference: `DC-2026-${String(i + 1).padStart(4, '0')}`,
      title: `${spec.title}${wardIds.length === 1 ? ` - ${wardName(wardIds[0] ?? '')}` : ''}`,
      problemStatement: spec.problem,
      background: spec.background,
      sourceIntelligenceIds: sourceIntel.map((s) => s.id),
      evidenceIds,
      alternatives,
      aiAnalysis: {
        summary: t('Comparative assessment of {0} alternatives against modelled impact, cost, time to effect and dependency risk. The assessment is advisory; authority rests with the competent officer.', alternatives.length),
        keyFindings: [
          t('"{0}" scores highest at {1}/100 on the published comparison basis.', best.title, best.score),
          t('Indicative cost range across alternatives spans ₹{0} Cr to ₹{1} Cr.', Math.min(...alternatives.map((a) => a.indicativeCostCrore)).toFixed(1), Math.max(...alternatives.map((a) => a.indicativeCostCrore)).toFixed(1)),
          t('Time to effect ranges from {0} to {1} days, which is material given the operational window.', Math.min(...alternatives.map((a) => a.timeToEffectDays)), Math.max(...alternatives.map((a) => a.timeToEffectDays))),
        ],
        confidence: r.weighted([['high', 2], ['medium', 6], ['low', 2]] as const),
        modelId: 'model-decision-analysis-v1',
        generatedAt: isoDaysFromAnchor(-createdDaysAgo + 1),
        limitations: [
          t('Scores are produced from modelled demonstration data, not from live departmental systems.'),
          t('Cost figures are indicative and require departmental estimation before any sanction.'),
          t('The assessment cannot account for factors not represented in the platform data model.'),
        ],
      },
      risks: spec.risks,
      financialImpactCrore: spec.financialImpactCrore,
      geographicImpact: wardIds.map((w) => wardName(w)),
      citizenImpact: spec.citizenImpact,
      departmentIds: spec.departmentIds,
      wardIds,
      domain: spec.domain,
      recommendationId: best.id,
      recommendationSummary: spec.recommendation,
      humanDecision: decided
        ? {
            selectedAlternativeId: best.id,
            rationale: t('Adopted on the basis of the highest assessed impact per unit of committed resource, with the published comparison basis recorded. {0}', spec.recommendation),
            decidedBy: 'user-commissioner',
            decidedAt: isoDaysFromAnchor(-Math.round(createdDaysAgo * 0.55)),
          }
        : undefined,
      ownerId: r.pick(['user-commissioner', 'user-addl-commissioner', 'user-chief-engineer', 'user-disaster']),
      approvals: approvers.map((a, ai) => ({
        id: `dc-${i}-app-${ai + 1}`,
        approverId: a.id,
        approverDesignation: a.designation,
        status: decided ? 'approved' : ai === 0 ? 'pending' : r.weighted([['pending', 3], ['approved', 2]] as const),
        decidedAt: decided ? isoDaysFromAnchor(-Math.round(createdDaysAgo * 0.6)) : undefined,
        note: decided ? t('Approved subject to the recorded implementation conditions.') : undefined,
      })),
      dueDate: isoDaysFromAnchor(r.int(-6, 40)),
      actionIds: [],
      outcome:
        status === 'closed'
          ? {
              measuredAt: isoDaysFromAnchor(-r.int(1, 12)),
              summary:
                t('Post-implementation measurement recorded against the indicators identified at approval. Results are reported without adjustment.'),
              indicators: [
                { label: t('Primary indicator'), before: r.round(30, 60, 1), after: r.round(45, 88, 1), unit: '%' },
                { label: t('Secondary indicator'), before: r.round(20, 55, 1), after: r.round(28, 76, 1), unit: '%' },
              ],
              effectiveness: r.weighted([
                ['effective', 4],
                ['partially-effective', 4],
                ['too-early', 2],
                ['not-effective', 1],
              ] as const),
            }
          : undefined,
      status,
      severity: r.weighted([
        ['critical', 1],
        ['high', 4],
        ['medium', 4],
        ['low', 1],
      ] as const satisfies ReadonlyArray<readonly [Severity, number]>),
      classification: 'confidential',
      createdAt: isoDaysFromAnchor(-createdDaysAgo),
      updatedAt: isoDaysFromAnchor(-Math.round(createdDaysAgo * 0.25)),
      createdBy: r.pick(['user-analyst', 'user-commissioner', 'user-chief-engineer', 'user-disaster']),
    }
  })
}

/** ---------------------------------------------------------------------
 * Actions
 * ------------------------------------------------------------------- */

const ACTION_STATUS_WEIGHTS: ReadonlyArray<readonly [ActionStatus, number]> = [
  ['open', 3],
  ['assigned', 4],
  ['in-progress', 4],
  ['blocked', 1],
  ['completed', 3],
  ['verified', 2],
  ['closed', 2],
]

/**
 * Which signed-in officer carries the task load for each intelligence domain.
 *
 * Every field action used to be owned by the ward's roster officer
 * (`off-ward-<ward>`). That roster is a display-only directory - nobody signs
 * in as a roster officer - so "My Tasks" opened empty for every profile in the
 * platform, whatever their authority. A deterministic share of each domain's
 * actions is therefore owned by the principal actually accountable for that
 * domain. The two Ward Officer profiles are absent from this table on purpose:
 * they inherit their own ward's roster actions through `User.officerId` in
 * `src/auth/demo-users.ts`, which is ward-correct without duplicating anything.
 *
 * Identifiers are written as literals rather than imported from
 * `@/auth/demo-users` so this data layer keeps no dependency on the
 * authentication layer - the same reason the decision-case owners above are
 * literals. Only principals whose role holds `action:view` appear here; a task
 * owned by a principal who cannot open the action resource would be
 * unreachable by its own owner.
 */
const DOMAIN_TASK_OWNER: Partial<Record<IntelligenceDomain, string>> = {
  budget: 'user-finance',
  revenue: 'user-finance',
  property: 'user-finance',
  procurement: 'user-finance',
  disaster: 'user-disaster',
  emergency: 'user-disaster',
  monsoon: 'user-disaster',
  stormwater: 'user-disaster',
  health: 'user-health',
  hospitals: 'user-health',
  environment: 'user-health',
  waste: 'user-health',
  projects: 'user-chief-engineer',
  roads: 'user-chief-engineer',
  assets: 'user-chief-engineer',
  water: 'user-chief-engineer',
  sewerage: 'user-chief-engineer',
  buildings: 'user-chief-engineer',
  executive: 'user-commissioner',
  planning: 'user-addl-commissioner',
  coastal: 'user-addl-commissioner',
  wards: 'user-dmc-zone3',
  'citizen-services': 'user-dmc-zone3',
  mobility: 'user-operator',
  workforce: 'user-operator',
}

/**
 * Where critical work escalates to.
 *
 * The executive holds no domain of its own - its authority is city-wide - so
 * routing by domain alone leaves the Municipal Commissioner and the Deputy
 * Municipal Commissioner with nothing, which is both wrong and the emptiest
 * possible first impression of the platform's flagship profile. What actually
 * reaches an executive desk is the critical item that has outgrown the officer
 * who raised it. That is what this models.
 */
const ESCALATION_OWNERS = ['user-commissioner', 'user-dmc-zone3']

/** Priorities an action has to carry before it can have reached the executive. */
const ESCALATION_PRIORITIES: Severity[] = ['critical', 'high']

/** Share of those actions that have in fact escalated. Deliberately a minority:
 *  an executive board that held most of the city's high-priority work would be
 *  describing a corporation where delegation had broken down. */
const ESCALATED_SHARE = 0.3

/** Share of a domain's remaining actions that sit with the accountable
 *  principal rather than with the ward's roster officer. Kept below half so the
 *  ward officer profiles - and the ward task lists - stay properly populated. */
const PRINCIPAL_OWNED_SHARE = 0.34

function buildActionItems(): ActionItem[] {
  // Action volume tracks residents served. The floor keeps the action board,
  // the ward task list and the overdue view populated at the smallest scale.
  const count = scaledCount(96, CITY_SCALE.population, 10)

  return Array.from({ length: count }, (_, i) => {
    const r = det(`action:${i}`)
    const source = r.pick(INTELLIGENCE_ITEMS)
    const recommended = source.recommendedActions[0]
    const decision = r.chance(0.4) ? r.pick(DECISION_CASES) : undefined
    const status = r.weighted(ACTION_STATUS_WEIGHTS)
    const createdDaysAgo = r.int(1, 46)
    const project = r.chance(0.25) ? r.pick(PROJECTS) : undefined

    // Drawn from its own namespace rather than from `r`, so introducing this
    // routing leaves every other seeded figure on this record untouched. All
    // three draws are taken unconditionally so the stream position does not
    // depend on which branch a given action falls down.
    const draw = det(`action-owner:${i}`)
    const hasEscalated = draw.chance(ESCALATED_SHARE)
    const heldByDomainOfficer = draw.chance(PRINCIPAL_OWNED_SHARE)
    const escalationOwnerId = draw.pick(ESCALATION_OWNERS)

    const wardOwnerId = `off-ward-${source.wardIds[0] ?? WARDS[0]!.id}`
    const domainOwnerId = DOMAIN_TASK_OWNER[source.domain]
    const ownerId =
      ESCALATION_PRIORITIES.includes(source.severity) && hasEscalated
        ? escalationOwnerId
        : domainOwnerId && heldByDomainOfficer
          ? domainOwnerId
          : wardOwnerId

    return {
      id: `act-${String(i + 1).padStart(4, '0')}`,
      tenantId: TENANT_ID,
      reference: `ACT-2026-${String(i + 1).padStart(4, '0')}`,
      title: recommended?.title ?? t('Field action for {0}', source.title.slice(0, 60)),
      description:
        recommended?.rationale ??
        t('Operational action raised from an intelligence item and assigned to the responsible department for execution.'),
      ownerId,
      departmentId: source.departmentId,
      wardIds: source.wardIds,
      priority: source.severity,
      dueDate: isoDaysFromAnchor(r.int(-8, 26)),
      sourceIntelligenceId: source.id,
      decisionCaseId: decision?.id,
      status,
      notes:
        status === 'open'
          ? []
          : [
              {
                id: `act-${i}-note-1`,
                authorId: 'user-analyst',
                authorName: 'A. P. Tambe',
                body: t('Site position confirmed with the ward team{0}. Progress will be reported against the agreed due date.', project ? ` and cross-referenced against ${project.reference}` : ''),
                createdAt: isoDaysFromAnchor(-Math.round(createdDaysAgo * 0.4)),
              },
            ],
      evidenceIds: source.evidenceIds.slice(0, 2),
      createdAt: isoDaysFromAnchor(-createdDaysAgo),
      updatedAt: isoDaysFromAnchor(-Math.round(createdDaysAgo * 0.3)),
      createdBy: 'user-analyst',
      domain: source.domain,
      classification: source.classification,
    }
  })
}

/** ---------------------------------------------------------------------
 * Live bindings
 * ------------------------------------------------------------------- */

export let COMPLAINTS: Complaint[] = []
export let SERVICE_HEALTH: ServiceHealth[] = []
export let MUNICIPAL_ASSETS: MunicipalAsset[] = []
export let WORKFORCE_UNITS: WorkforceUnit[] = []
export let INCIDENTS: Incident[] = []
export let DECISION_CASES: DecisionCase[] = []
export let ACTION_ITEMS: ActionItem[] = []

export let DECISION_BY_ID: Map<string, DecisionCase> = new Map()
export let INCIDENT_BY_ID: Map<string, Incident> = new Map()
export let ACTION_BY_ID: Map<string, ActionItem> = new Map()
export let COMPLAINT_BY_ID: Map<string, Complaint> = new Map()
export let ASSET_BY_ID: Map<string, MunicipalAsset> = new Map()

/** ---------------------------------------------------------------------
 * Roll-ups
 * ------------------------------------------------------------------- */

export function wardComplaints(wardId: string): Complaint[] {
  return COMPLAINTS.filter((c) => c.wardId === wardId)
}

export function wardServiceHealth(wardId: string): ServiceHealth[] {
  return SERVICE_HEALTH.filter((s) => s.wardId === wardId)
}

export function wardIncidents(wardId: string): Incident[] {
  return INCIDENTS.filter((i) => i.wardId === wardId)
}

export function wardAssets(wardId: string): MunicipalAsset[] {
  return MUNICIPAL_ASSETS.filter((a) => a.wardId === wardId)
}

export function activeIncidents(): Incident[] {
  return INCIDENTS.filter((i) => i.status === 'active' || i.status === 'validated' || i.status === 'detected')
}

export function wardComplaintSummary(wardId: string): {
  open: number
  slaBreached: number
  resolvedRate: number
  repeatRate: number
} {
  const items = wardComplaints(wardId)
  if (items.length === 0) return { open: 0, slaBreached: 0, resolvedRate: 0, repeatRate: 0 }
  const open = items.filter((c) => c.status !== 'resolved' && c.status !== 'closed').length
  const breached = items.filter((c) => c.slaBreached).length
  const resolved = items.filter((c) => c.status === 'resolved' || c.status === 'closed').length
  const repeats = items.filter((c) => c.repeatCount > 0).length
  return {
    open,
    slaBreached: breached,
    resolvedRate: Math.round((resolved / items.length) * 1000) / 10,
    repeatRate: Math.round((repeats / items.length) * 1000) / 10,
  }
}

export { WARD_BY_ID }

/**
 * Rebuild order matters: service health counts complaints, and actions draw
 * their decision links from the decision cases built immediately above them.
 */
registerLayer(() => {
  COMPLAINTS = buildComplaints()
  SERVICE_HEALTH = buildServiceHealth()
  MUNICIPAL_ASSETS = buildAssets()
  WORKFORCE_UNITS = buildWorkforceUnits()
  INCIDENTS = buildIncidents()
  DECISION_CASES = buildDecisionCases()
  ACTION_ITEMS = buildActionItems()

  DECISION_BY_ID = new Map(DECISION_CASES.map((d) => [d.id, d]))
  INCIDENT_BY_ID = new Map(INCIDENTS.map((i) => [i.id, i]))
  ACTION_BY_ID = new Map(ACTION_ITEMS.map((a) => [a.id, a]))
  COMPLAINT_BY_ID = new Map(COMPLAINTS.map((c) => [c.id, c]))
  ASSET_BY_ID = new Map(MUNICIPAL_ASSETS.map((a) => [a.id, a]))
})
