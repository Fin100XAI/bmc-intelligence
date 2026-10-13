import { ROUTES, sectionForPath } from '@/config/navigation'
import { systemRecords, type ExistingSystemRecord, type SystemAccess } from '@/config/bmc/systems-data'
import { t } from '@/i18n'

export type { SystemAccess } from '@/config/bmc/systems-data'

/**
 * src/config/bmc/capability-map.ts
 *
 * Mumbai's systems & capability map: the capability areas BMC's existing
 * systems already hold, the decision this platform adds above each, and where
 * the platform stands on it today.
 *
 * Two different kinds of claim, kept apart:
 *  - `system` names the existing BMC or state system that holds the function,
 *    as found on a public page (see `systems-data.ts`). It is not a claim
 *    about how fully that system is deployed or used.
 *  - `status` is a statement about THIS platform:
 *      live      - the area brief runs today on opened public sources
 *      partial   - part runs on public sources; the rest needs BMC records
 *      modelled  - the working screen exists, on labelled modelled figures,
 *                  until authorised BMC data arrives
 *      not-built - proposed; nothing in the platform yet
 *
 * Every figure an insight states is one of the evidence records it cites, and
 * every evidence id resolves in the decision layer (`capability-map.test.ts`).
 *
 * BMC configuration, not core: another corporation supplies its own.
 */

export type MapStatus = 'live' | 'partial' | 'modelled' | 'not-built'

export interface CapabilityLink {
  label: string
  to: string
}

export interface AreaInsight {
  kind: 'finding' | 'decision' | 'gap'
  text: string
  evidenceIds: string[]
}

export interface CapabilityArea {
  n: number
  area: string
  /** The existing system that holds this function today. */
  system: string
  /** That system's public page, where it has one. */
  systemUrl?: string
  /** The intelligence the platform adds above the existing system. */
  layer: string
  /** The officer's decision it supports. */
  decision: string
  /** What is tracked to show the decision worked. */
  measure: string
  status: MapStatus
  /** Screens in this platform that already serve the area. */
  today: CapabilityLink[]
  /** The next step, and the data it needs. */
  next: string
  /** Public evidence records about this area, shown with their sources. */
  evidenceIds?: string[]
  /** What the evidence means for the officer. Each cites the records it rests on. */
  insights?: AreaInsight[]
}

export interface LeadDemonstration {
  title: string
  audience: string
  shows: string
  readiness: 'ready' | 'needs-data'
  readinessNote: string
  to: string
}

export interface ExistingSystem {
  name: string
  owner: string
  purpose: string
  access: SystemAccess
  url?: string
}

/** The address of one area's own page. */
export function capabilityAreaHref(n: number): string {
  return `${ROUTES.systemsMap}/${n}`
}

/** The systems BMC and the state already run, as found on public pages. */
export function existingSystems(): ExistingSystem[] {
  return systemRecords().map((s: ExistingSystemRecord) => ({ name: s.name, owner: s.owner, purpose: s.purpose, access: s.access, url: s.url }))
}

export function capabilityAreas(): CapabilityArea[] {
  return [
    {
      n: 1,
      area: t('Property-tax assessment and collection'),
      system: t('Property tax portal and SAP (Assessment & Collection)'),
      systemUrl: 'https://ptaxportal.mcgm.gov.in/CitizenPortal/',
      layer: t('Read demand, collection and dues together; separate what a field drive can recover from what is settled between governments.'),
      decision: t('Which dues need a recovery drive, and which need a settlement with another government?'),
      measure: t('Collection against the revised estimate; dues settled'),
      status: 'partial',
      today: [
        { label: t('Revenue Intelligence'), to: ROUTES.revenue },
        { label: t('Recovery worklist'), to: ROUTES.recoveryWorklist },
      ],
      next: t('Ward-level demand, collection and arrears need the assessment register and payment history from the property tax system.'),
      evidenceIds: ['ev-ptax-be-2026-27', 'ev-ptax-re-2025-26', 'ev-ptax-actual-jan-2026', 'ev-ptax-fy26-fpj', 'ev-ptax-fy26-angelone', 'ev-ptax-fy26-navbharat', 'ev-ptax-region-ws-fy26', 'ev-ptax-region-city-fy26', 'ev-ptax-region-es-fy26', 'ev-ptax-attach-fy26', 'ev-state-dues-jan-2026'],
      insights: [
        { kind: 'finding', text: t('By 31 January 2026, ₹4,812.34 cr of property tax had been received against a revised estimate of ₹6,200 cr for 2025-26.'), evidenceIds: ['ev-ptax-actual-jan-2026', 'ev-ptax-re-2025-26'] },
        { kind: 'finding', text: t('In 2025-26 the Western Suburbs paid ₹3,721.33 cr of property tax, the City ₹2,102.60 cr and the Eastern Suburbs ₹1,457 cr. K/East was the highest ward at ₹719.23 cr. Ward targets on this platform follow that split.'), evidenceIds: ['ev-ptax-region-ws-fy26', 'ev-ptax-region-city-fy26', 'ev-ptax-region-es-fy26', 'ev-ptax-ward-ke-fy26'] },
        { kind: 'decision', text: t('₹10,948.58 cr is pending from State Government offices. That is settled between governments, not by a field recovery drive - a dues-settlement review for the Commissioner.'), evidenceIds: ['ev-state-dues-jan-2026'] },
        { kind: 'gap', text: t('Two reports give different year-end totals for 2025-26, ₹7,610.90 cr and ₹7,309.77 cr. Both are kept until the audited figure is published.'), evidenceIds: ['ev-ptax-fy26-fpj', 'ev-ptax-fy26-angelone', 'ev-ptax-fy26-navbharat'] },
      ],
    },
    {
      n: 2,
      area: t('Budget, reserves and committed liabilities'),
      system: t('SAP S/4HANA ERP (finance)'),
      layer: t('Read the budget, the reserves and the liabilities already committed against them as one position.'),
      decision: t('Which capital works can proceed within the reserves available for infrastructure?'),
      measure: t('Capital spending against the revised estimate; reserves held'),
      status: 'live',
      today: [
        { label: t('Budget Intelligence'), to: ROUTES.budget },
        { label: t('Financial Intelligence'), to: ROUTES.financialIntelligence },
      ],
      next: t('Month-by-month expenditure against each budget head needs the finance extract from SAP.'),
      evidenceIds: ['ev-budget-total-2026-27', 'ev-revenue-income-2026-27', 'ev-revenue-exp-2026-27', 'ev-capex-2026-27', 'ev-capex-2025-26-re', 'ev-surplus-2026-27', 'ev-reserves-total-jan-2026', 'ev-reserves-committed', 'ev-reserves-infra', 'ev-committed-liabilities', 'ev-itt-2026-27', 'ev-fd-drop-2026'],
      insights: [
        { kind: 'finding', text: t('Committed liabilities of ₹2,44,552.65 cr are about three times the ₹81,449.32 cr held in reserves.'), evidenceIds: ['ev-committed-liabilities', 'ev-reserves-total-jan-2026'] },
        { kind: 'finding', text: t('Of the reserves, ₹44,826.23 cr is tied to committed liabilities such as provident fund and pensions; ₹36,623.09 cr is available for infrastructure.'), evidenceIds: ['ev-reserves-committed', 'ev-reserves-infra'] },
        { kind: 'decision', text: t('₹13,765.74 cr is to be raised through internal temporary transfer in 2026-27. Sequence capital works so that transfer is not exceeded.'), evidenceIds: ['ev-itt-2026-27', 'ev-capex-2026-27'] },
      ],
    },
    {
      n: 3,
      area: t('Revenue beyond property tax'),
      system: t('SAP S/4HANA ERP (finance)'),
      layer: t('Show how far the corporation\'s income rests on transfers and premiums rather than its own taxes.'),
      decision: t('How exposed is revenue income to a change in compensation or development premiums?'),
      measure: t('Share of revenue income from each stream'),
      status: 'live',
      today: [{ label: t('Revenue Intelligence'), to: ROUTES.revenue }],
      next: t('Stream-by-stream receipts through the year need the income ledger from SAP.'),
      evidenceIds: ['ev-octroi-comp-2026-27', 'ev-dp-income-2026-27', 'ev-interest-2026-27', 'ev-ptax-be-2026-27'],
      insights: [
        { kind: 'finding', text: t('Octroi compensation (₹15,550.02 cr) and development-plan income (₹12,050 cr) together are nearly four times the property-tax estimate of ₹7,000 cr.'), evidenceIds: ['ev-octroi-comp-2026-27', 'ev-dp-income-2026-27', 'ev-ptax-be-2026-27'] },
      ],
    },
    {
      n: 4,
      area: t('Water supply and lake storage'),
      system: t('Hydraulic Engineer\'s lake-level report and AQUA water billing'),
      layer: t('Read lake storage, supply, demand and losses together, so a water cut is decided on the whole picture.'),
      decision: t('When should a cut start or end, and where would reducing losses do more than new supply?'),
      measure: t('Lake storage against the season; losses'),
      status: 'partial',
      today: [{ label: t('Water Intelligence'), to: ROUTES.water }],
      next: t('Ward-level supply hours and metered consumption need the hydraulic engineering and AQUA billing extracts.'),
      evidenceIds: ['ev-lake-capacity', 'ev-lakes-2026-10-08', 'ev-lake-stock-2026-10-03', 'ev-lake-stock-2026-06-16', 'ev-water-cut-2026', 'ev-water-supply-2024', 'ev-water-demand-2024', 'ev-water-losses-2024', 'ev-water-augmentation'],
      insights: [
        { kind: 'finding', text: t('On 8 October 2026 the seven lakes held 94.24% of useful storage, against 99.03% on the same date in 2025. Modak Sagar was lowest at 68.7%. The reservoir figures on this platform are that day\'s readings.'), evidenceIds: ['ev-lakes-2026-10-08'] },
        { kind: 'finding', text: t('The seven lakes stood at 95.84% of useful storage on 3 October 2026, against 10.35% on 16 June 2026, when a 10% cut was in force.'), evidenceIds: ['ev-lake-stock-2026-10-03', 'ev-lake-stock-2026-06-16', 'ev-water-cut-2026'] },
        { kind: 'finding', text: t('In October 2024, 3,950 MLD was supplied against a demand of 4,463 MLD, and 34% of water was being lost.'), evidenceIds: ['ev-water-supply-2024', 'ev-water-demand-2024', 'ev-water-losses-2024'] },
        { kind: 'decision', text: t('About 800 MLD of new supply is planned over four to five years. Set it against the losses, which may be quicker to recover.'), evidenceIds: ['ev-water-augmentation', 'ev-water-losses-2024'] },
        { kind: 'gap', text: t('No official lake-level feed was found. Lake figures are read from reporting that cites the Hydraulic Engineer\'s Department.'), evidenceIds: [] },
      ],
    },
    {
      n: 5,
      area: t('Sewerage and treatment'),
      system: t('Sewerage Operations and the Mumbai Sewage Disposal Project'),
      layer: t('Track treatment capacity being built against the sewage generated, plant by plant.'),
      decision: t('Which plant\'s delay matters most for untreated discharge?'),
      measure: t('Secondary treatment capacity commissioned'),
      status: 'partial',
      today: [
        { label: t('Sewerage Intelligence'), to: ROUTES.sewerage },
        { label: t('Public Money & Investment'), to: ROUTES.publicMoney },
      ],
      next: t('Plant-by-plant inflow and treated output need the Sewerage Operations records.'),
      evidenceIds: ['ev-stp-capacity', 'ev-stp-cost', 'ev-sewage-generation', 'ev-sewer-coverage', 'ev-fpj-stp-ghatkopar-date', 'ev-fpj-stp-versova-date', 'ev-fpj-stp-bhandup-date', 'ev-fpj-stp-stalled'],
      insights: [
        { kind: 'finding', text: t('The seven new plants will add 2,464 MLD of secondary treatment, against 2,190 MLD of sewage generated a day.'), evidenceIds: ['ev-stp-capacity', 'ev-sewage-generation'] },
        { kind: 'gap', text: t('Ghatkopar and Versova were due in July 2026 and Bhandup in August 2026. No public source yet confirms whether they were commissioned.'), evidenceIds: ['ev-fpj-stp-ghatkopar-date', 'ev-fpj-stp-versova-date', 'ev-fpj-stp-bhandup-date'] },
      ],
    },
    {
      n: 6,
      area: t('Flooding spots and storm-water pumping'),
      system: t('Disaster Management portal and SWD Works Monitoring System'),
      systemUrl: 'https://dm.mcgm.gov.in/',
      layer: t('Read flooding spots, pumping capacity and desilting together before and during the monsoon.'),
      decision: t('Which flooding spots and pumping stations need attention before the next heavy rain?'),
      measure: t('Flooding spots resolved; stations operational'),
      status: 'live',
      today: [
        { label: t('Monsoon Intelligence'), to: ROUTES.monsoon },
        { label: t('Storm Water Intelligence'), to: ROUTES.stormwater },
      ],
      next: t('Station-by-station pumping logs and desilting quantities need the SWD department\'s records.'),
      evidenceIds: ['ev-flood-spots-498', 'ev-flood-hotspots-plan', 'ev-dm-api-flood-spots', 'ev-dewatering-pumps', 'ev-brimstowad-stations', 'ev-brimstowad-capacity', 'ev-fpj-mogra-status', 'ev-fpj-mahul-status'],
      insights: [
        { kind: 'finding', text: t('Three counts of flooding spots are published - 498 in the budget, 300-350 chronic hotspots in the flood plan, and 110 in the live list - and they count different things.'), evidenceIds: ['ev-flood-spots-498', 'ev-flood-hotspots-plan', 'ev-dm-api-flood-spots'] },
        { kind: 'decision', text: t('Six of the eight BRIMSTOWAD pumping stations run. Mogra is stalled and Mahul awaits land: the two remaining stations are a decision on land and contract, not on pumps.'), evidenceIds: ['ev-brimstowad-stations', 'ev-fpj-mogra-status', 'ev-fpj-mahul-status'] },
      ],
    },
    {
      n: 7,
      area: t('Rainfall and early warning'),
      system: t('Automatic weather station network and IMD Mumbai'),
      systemUrl: 'https://dm.mcgm.gov.in/',
      layer: t('Read rainfall by station against the flooding spots each one serves.'),
      decision: t('Which wards need crews on standby when a station crosses its threshold?'),
      measure: t('Warning time ahead of waterlogging'),
      status: 'live',
      today: [
        { label: t('Monsoon Intelligence'), to: ROUTES.monsoon },
        { label: t('Situation Room'), to: ROUTES.situationRoom },
      ],
      next: t('Station readings over time need read access to the disaster management feed.'),
      evidenceIds: ['ev-aws-active-api', 'ev-aws-2023', 'ev-rainfall-santacruz-2026', 'ev-rainfall-2005'],
      insights: [
        { kind: 'finding', text: t('120 automatic weather stations are active in the disaster management network, up from 60 reported in 2023.'), evidenceIds: ['ev-aws-active-api', 'ev-aws-2023'] },
      ],
    },
    {
      n: 8,
      area: t('Solid waste and landfills'),
      system: t('Solid Waste Management Department'),
      layer: t('Follow the city\'s waste from collection to the landfill that receives it.'),
      decision: t('How much depends on one landfill, and what would a disruption there do?'),
      measure: t('Waste processed rather than landfilled'),
      status: 'partial',
      today: [{ label: t('Solid Waste Intelligence'), to: ROUTES.waste }],
      next: t('Ward-level collection and vehicle trips need the Solid Waste Management records.'),
      evidenceIds: ['ev-waste-tpd', 'ev-kanjurmarg-tpd', 'ev-deonar-tpd-fpj', 'ev-deonar-tpd-orf', 'ev-deonar-bioremediation-official', 'ev-deonar-tender-orf', 'ev-swachh-rank'],
      insights: [
        { kind: 'finding', text: t('Kanjurmarg receives 5,900 of the 6,500 MT the city handles a day - about nine-tenths.'), evidenceIds: ['ev-kanjurmarg-tpd', 'ev-waste-tpd'] },
        { kind: 'gap', text: t('Deonar\'s daily intake is reported as 500-700 MT and as 4,000 TPD, and its bioremediation as ₹3,035.55 cr and ₹2,368 cr. Both are kept until confirmed.'), evidenceIds: ['ev-deonar-tpd-fpj', 'ev-deonar-tpd-orf', 'ev-deonar-bioremediation-official', 'ev-deonar-tender-orf'] },
      ],
    },
    {
      n: 9,
      area: t('Roads and potholes'),
      system: t('Roads Monitoring System and Pothole QuickFix'),
      systemUrl: 'https://roads.mcgm.gov.in/publicdashboard/',
      layer: t('Read the road network, concretisation and pothole complaints together.'),
      decision: t('Which stretches should be concretised next, and which need repair now?'),
      measure: t('Complaints resolved; road length concretised'),
      status: 'live',
      today: [{ label: t('Roads Intelligence'), to: ROUTES.roads }],
      next: t('Complaint locations over time need read access to the pothole dashboard\'s records.'),
      evidenceIds: ['ev-road-network', 'ev-concretisation-576', 'ev-pothole-complaints-2026', 'ev-fpj-ccroads-overall'],
      insights: [
        { kind: 'finding', text: t('Between 10 June and 20 August 2026, 8,032 pothole complaints were made and 7,829 resolved.'), evidenceIds: ['ev-pothole-complaints-2026'] },
      ],
    },
    {
      n: 10,
      area: t('Capital works and coordination'),
      system: t('E-Tendering System (SAP SRM)'),
      systemUrl: 'https://tendering.mcgm.gov.in/irj/portal',
      layer: t('Place every publicly identified work on the map and find works that share ground and time.'),
      decision: t('Which works must agree their sequence before the next excavation?'),
      measure: t('Coordinated sequences agreed; reinstated surfaces not re-dug'),
      status: 'live',
      today: [
        { label: t('Public Money & Investment'), to: ROUTES.publicMoney },
        { label: t('Project Intelligence'), to: ROUTES.projects },
        { label: t('Infrastructure Coordination'), to: ROUTES.infraCoordination },
      ],
      next: t('Alignments, contract values and physical progress need the works register and tender records.'),
      evidenceIds: ['ev-fpj-gmlr-cost-jan26', 'ev-fpj-gmlr-cost-2023', 'ev-nbmcw-vd-cost', 'ev-nbmcw-vd-tender', 'ev-fpj-coastal-cost'],
      insights: [
        { kind: 'finding', text: t('The Goregaon-Mulund Link Road is now reported at ₹14,000 cr, against about ₹8,550 cr in 2023.'), evidenceIds: ['ev-fpj-gmlr-cost-jan26', 'ev-fpj-gmlr-cost-2023'] },
      ],
    },
    {
      n: 11,
      area: t('Citizen complaints and grievances'),
      system: t('MyBMC MARG, the 1916 helpline and the unified grievance system'),
      systemUrl: 'https://portal.mcgm.gov.in/irj/portal/anonymous',
      layer: t('Find complaints that share a cause or a place, and the department that should own them.'),
      decision: t('Which recurring problems need a fix rather than another complaint closure?'),
      measure: t('Repeat complaints at the same place'),
      status: 'partial',
      today: [
        { label: t('Grievance Resolution'), to: ROUTES.resolutionIntelligence },
        { label: t('Citizen Service Intelligence'), to: ROUTES.citizenServices },
      ],
      next: t('Complaint category, location and closure dates need an extract from MARG and the grievance system.'),
      evidenceIds: ['ev-1916-lines', 'ev-pothole-complaints-2026'],
      insights: [
        { kind: 'gap', text: t('No public grievance statistics were found for the corporation as a whole; only the pothole dashboard publishes counts.'), evidenceIds: [] },
      ],
    },
    {
      n: 12,
      area: t('Public health and hospitals'),
      system: t('HMIS and the bed availability dashboard'),
      layer: t('Read primary care, hospital load and the health budget together.'),
      decision: t('Where is primary care taking load off the major hospitals, and where is it not?'),
      measure: t('Patients served at the nearest level of care'),
      status: 'partial',
      today: [{ label: t('Public Health'), to: ROUTES.health }],
      next: t('Facility-level attendance and bed occupancy need the HMIS extract.'),
      evidenceIds: ['ev-health-budget-2026-27', 'ev-hbt-dawakhana', 'ev-major-hospital-opd'],
    },
    {
      n: 13,
      area: t('Municipal schools'),
      system: t('Education Department records'),
      layer: t('Read schools, students and teachers together by ward.'),
      decision: t('Where are pupil-teacher ratios furthest from the norm?'),
      measure: t('Pupil-teacher ratio by school'),
      status: 'partial',
      today: [{ label: t('Education Intelligence'), to: ROUTES.education }],
      next: t('School-level enrolment and staffing need the Education Department\'s records.'),
      evidenceIds: ['ev-primary-schools', 'ev-secondary-schools'],
      insights: [
        { kind: 'finding', text: t('931 BMC primary schools teach 2,76,115 students with 7,453 teachers.'), evidenceIds: ['ev-primary-schools'] },
      ],
    },
    {
      n: 14,
      area: t('Air quality'),
      system: t('MPCB, CPCB, SAFAR-Mumbai and BMC AQI stations'),
      systemUrl: 'https://safar.tropmet.res.in/',
      layer: t('Read station readings against construction and dust complaints nearby.'),
      decision: t('Which sites should be inspected when a station worsens?'),
      measure: t('Days above the standard at each station'),
      status: 'partial',
      today: [{ label: t('Environment Intelligence'), to: ROUTES.environment }],
      next: t('Station readings over time need a read feed from the monitoring networks.'),
      evidenceIds: ['ev-aq-stations'],
    },
    {
      n: 15,
      area: t('Bus transport'),
      system: t('BEST Undertaking'),
      systemUrl: 'https://www.bestundertaking.com/',
      layer: t('Read bus routes and ridership against roads under works.'),
      decision: t('Which routes need diversion when a road is closed for works?'),
      measure: t('Trips run against schedule'),
      status: 'partial',
      today: [{ label: t('Traffic & Mobility'), to: ROUTES.traffic }],
      next: t('Route-level ridership needs BEST\'s records.'),
      evidenceIds: ['ev-best-passengers'],
    },
    {
      n: 16,
      area: t('Fire and emergency response'),
      system: t('Mumbai Fire Brigade and the emergency control room'),
      layer: t('Read fire stations and surveillance coverage against where the city is growing.'),
      decision: t('Where should the next fire stations go?'),
      measure: t('Response time by ward'),
      status: 'partial',
      today: [{ label: t('Fire & Emergency'), to: ROUTES.emergency }],
      next: t('Call and response times need the Fire Brigade\'s records.'),
      evidenceIds: ['ev-fire-stations', 'ev-cctv'],
    },
    {
      n: 17,
      area: t('Wards and governance'),
      system: t('MyBMC portal ward pages'),
      systemUrl: 'https://portal.mcgm.gov.in/irj/portal/anonymous',
      layer: t('Compare wards on the same measures, using one maintained list of wards.'),
      decision: t('Is provision following population across the wards?'),
      measure: t('Provision per resident by ward'),
      status: 'live',
      today: [
        { label: t('Ward Intelligence'), to: ROUTES.wards },
        { label: t('Ward Equity & Allocation'), to: ROUTES.wardEquity },
      ],
      next: t('A ward master reflecting the 2023 and 2026 splits, with boundaries, is needed from the corporation.'),
      evidenceIds: ['ev-population-2011', 'ev-area-greater-mumbai', 'ev-wards-24', 'ev-wards-26', 'ev-zones-7', 'ev-seats-227'],
      insights: [
        { kind: 'gap', text: t('Sources disagree on the number of wards - 24 or 26 - because P/North and K/East were split after the census. A single maintained ward list is needed.'), evidenceIds: ['ev-wards-24', 'ev-wards-26'] },
      ],
    },
    {
      n: 18,
      area: t('Building permissions'),
      system: t('AutoDCR building permission system'),
      layer: t('Measure each application against its time limit, and link approvals to property tax.'),
      decision: t('Which applications are past their time limit, and why?'),
      measure: t('Applications decided within the time limit'),
      status: 'modelled',
      today: [{ label: t('Building Intelligence'), to: ROUTES.buildings }],
      next: t('Application logs with dates need an extract from AutoDCR.'),
    },
  ]
}

/**
 * The department wing an area is read under: the menu section of the first
 * screen that serves it, so the map and the menu cannot drift apart.
 */
export function areaWing(area: CapabilityArea): string | undefined {
  const to = area.today[0]?.to
  return to ? sectionForPath(to)?.id : undefined
}

export function leadDemonstrations(): LeadDemonstration[] {
  return [
    {
      title: t('Reserves against committed liabilities'),
      audience: t('Municipal Commissioner'),
      shows: t('The budget, the reserves and the liabilities already committed against them, read from the corporation\'s own budget books.'),
      readiness: 'ready',
      readinessNote: t('Runs on official budget figures today.'),
      to: capabilityAreaHref(2),
    },
    {
      title: t('Flooding spots and pumping stations'),
      audience: t('Additional Commissioner (Projects)'),
      shows: t('Every published count of flooding spots, the pumping stations still pending, and why.'),
      readiness: 'ready',
      readinessNote: t('Runs on the disaster management feed and public reporting today.'),
      to: capabilityAreaHref(6),
    },
    {
      title: t('Works that share ground'),
      audience: t('Municipal Commissioner'),
      shows: t('Publicly identified works on a real map, with the pairs that need an agreed sequence.'),
      readiness: 'ready',
      readinessNote: t('Runs on the public works portfolio today.'),
      to: ROUTES.publicMoney,
    },
    {
      title: t('Recurring complaints by place'),
      audience: t('Deputy Municipal Commissioner (Zone)'),
      shows: t('Complaints that keep returning to the same place, and the department that should own the fix.'),
      readiness: 'needs-data',
      readinessNote: t('Needs a complaint extract from MARG with locations.'),
      to: capabilityAreaHref(11),
    },
  ]
}
