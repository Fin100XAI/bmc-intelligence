/**
 * src/config/bmc/systems-data.ts
 *
 * The corporation's existing systems, the public feeds the platform reads, and
 * portal.mcgm.gov.in section by section - GENERATED from the research record
 * (_bmc_research/sources_evidence.json) by _bmc_tools/gen_evidence_systems.py.
 *
 * Every system was found named on a public page (`basis` says where). A link
 * is kept only for a public page or dashboard; internal systems behind a
 * login are named but not linked. The portal's menus are published in
 * Marathi; the section names here are English renderings of them.
 */

export type SystemAccess = 'open' | 'dashboard-only' | 'gated' | 'unknown'

export interface ExistingSystemRecord {
  name: string
  owner: string
  purpose: string
  publicFacing: boolean
  access: SystemAccess
  /** What was read that shows the system exists. */
  basis: string
  url?: string
}

export type FeedForm = 'json' | 'csv' | 'pdf' | 'html'

export interface PublicFeedRecord {
  name: string
  owner: string
  gives: string
  form: FeedForm
  refresh: string
  url?: string
}

export type SiteFeed = 'open' | 'empty' | 'gated' | 'encrypted' | 'links' | 'personal'

export interface SiteSectionRecord {
  section: string
  publishes: string
  feed: SiteFeed
  intelligence: string
}

/** The date the portal's sections were checked. */
export const WEBSITE_CHECKED_ON = '2026-10-11'

export function systemRecords(): ExistingSystemRecord[] {
  return [
    {
      name: 'MyBMC portal (portal.mcgm.gov.in)',
      owner: 'BMC IT Department',
      purpose: 'Main civic website: information, online services, payments, tenders, RTI, disclosures',
      publicFacing: true,
      access: 'open',
      basis: 'Opened 2026-10-11: title "MyBMC - Welcome to BMC\'s Website"; runs on SAP NetWeaver Enterprise Portal (/irj/ paths, iView error for non-browser clients).',
      url: 'https://portal.mcgm.gov.in/irj/portal/anonymous',
    },
    {
      name: 'SAP S/4HANA ERP (RISE with SAP, Private Cloud)',
      owner: 'BMC IT Department',
      purpose: 'Core enterprise system (finance, HR, materials, projects); employee Fiori self-service',
      publicFacing: false,
      access: 'gated',
      basis: 'Budget speech 2026-27: BMC decided to migrate core enterprise systems to "RISE with SAP - Private Cloud Edition" for the SAP S/4 HANA system; portal employee menu links Fiori launchpad and S/4 HANA password reset.',
    },
    {
      name: 'SAP CRM citizen services (crmapp.mcgm.gov.in)',
      owner: 'BMC IT Department',
      purpose: 'Back-end for RTI, trade/shop licences, photo ID and other online applications',
      publicFacing: true,
      access: 'gated',
      basis: 'Portal links for RTI status, shop & establishment and Photo ID point to crmapp.mcgm.gov.in:8080 SAP BSP applications; employee menu has "CRM system" password reset.',
    },
    {
      name: 'E-Tendering System (SAP SRM 7.0)',
      owner: 'BMC',
      purpose: 'E-procurement: vendor registration, bids, open/closed tender lists',
      publicFacing: true,
      access: 'dashboard-only',
      basis: 'Portal "For partners" menu labels it "E-Tendering System(SRM 7.0)" with open/closed tender lists.',
      url: 'https://tendering.mcgm.gov.in/irj/portal',
    },
    {
      name: 'MyBMC MARG grievance portal',
      owner: 'BMC',
      purpose: 'Citizen complaint registration and tracking (Complaints Management Portal)',
      publicFacing: true,
      access: 'gated',
      basis: 'Linked from portal as complaint registration; Outlook (Aug 2026) says 5,000+ pothole complaints came via the My BMC Marg forum; FPJ (Jul 2026) lists the MyBMC MARG app.',
    },
    {
      name: 'Unified Grievances Management System (UGMS)',
      owner: 'BMC IT Department',
      purpose: 'GIS-based web/mobile grievance platform unifying portal, WhatsApp, 1916 and social media',
      publicFacing: true,
      access: 'unknown',
      basis: 'Budget speech 2026-27: "will be released for use shortly"; portal shows complaints logged before 22-04-2026 under a separate link, suggesting a switch-over.',
    },
    {
      name: 'MyBMC Assist WhatsApp chatbot (8999228999)',
      owner: 'BMC',
      purpose: 'WhatsApp channel for services and complaints',
      publicFacing: true,
      access: 'gated',
      basis: 'Portal links wa.me/+918999228999; FPJ (Jul 2026) cites "the BMC\'s general WhatsApp chatbot (8999228999)" and a separate manhole chatbot 9324500600.',
    },
    {
      name: '1916 civic helpline / control room',
      owner: 'BMC Disaster Management Department',
      purpose: '24x7 complaints and emergency helpline routed to ward offices',
      publicFacing: true,
      access: 'gated',
      basis: 'Together V Can: control room "functions for 365 days a year receives the complaints on 1916"; FPJ Jul 2026 lists 1916 as a complaint channel; budget speech names 1916 helpdesk as a UGMS input.',
    },
    {
      name: 'Emergency Management Control Room / Disaster Management Cell',
      owner: 'BMC Disaster Management Department',
      purpose: 'Monsoon and disaster coordination at BMC headquarters',
      publicFacing: false,
      access: 'unknown',
      basis: 'UNI 4 Jul 2026: Guardian Minister Ashish Shelar reviewed preparedness at the "Emergency Management Control Room" at BMC HQ; budget lists Disaster Management Cell as dept code 21.',
    },
    {
      name: 'Disaster Management portal (dm.mcgm.gov.in) and API',
      owner: 'BMC Disaster Management Department',
      purpose: 'Public rainfall (AWS), tide, flood-spot and helpline information',
      publicFacing: true,
      access: 'open',
      basis: 'Opened 2026-10-11; its API at dmwebtwo.mcgm.gov.in returned 110 flood spots and 120 active AWS locations without authentication.',
      url: 'https://dm.mcgm.gov.in/',
    },
    {
      name: 'Automatic weather station (rain gauge) network',
      owner: 'BMC Disaster Management Department',
      purpose: 'Ward-level rainfall monitoring for flood warning',
      publicFacing: true,
      access: 'open',
      basis: 'API activeLocationsCount = 120 (2026-10-11); FPJ Jun 2023 reported 60 existing plus 60 planned, data every 15 minutes.',
      url: 'https://dmwebtwo.mcgm.gov.in/api/location/loadActiveAWSLocations',
    },
    {
      name: 'Mumbai City Surveillance (MCS) video analytics',
      owner: 'BMC Disaster Management Department',
      purpose: 'AI video analytics on CCTV for debris dumping, garbage, encroachment, water-logging',
      publicFacing: false,
      access: 'gated',
      basis: 'Budget speech: analytics on existing 500 CCTV cameras and 650 new cameras proposed; DC-DR at City Institute of Disaster Management, Parel.',
    },
    {
      name: 'Hydraulic Engineer daily lake-level report',
      owner: 'BMC Hydraulic Engineer\'s Department',
      purpose: 'Daily useful stock of the seven supply lakes',
      publicFacing: true,
      access: 'unknown',
      basis: 'FPJ daily reports (e.g. 3 Oct 2026, 24 Jun 2026) cite the Hydraulic Engineer\'s Department report; no machine-readable official URL located in this session.',
    },
    {
      name: 'Roads Monitoring System',
      owner: 'BMC Roads & Traffic Department',
      purpose: 'Public dashboard on cement-concrete road works',
      publicFacing: true,
      access: 'dashboard-only',
      basis: 'Opened 2026-10-11: page title "Roads Monitoring System"; linked from portal as concrete road progress.',
      url: 'https://roads.mcgm.gov.in/publicdashboard/',
    },
    {
      name: 'BMC Pothole QuickFix app and dashboard',
      owner: 'BMC (Roads / GIS)',
      purpose: 'Citizen pothole reporting with GPS photos, auto-routing to ward, WhatsApp integration',
      publicFacing: true,
      access: 'dashboard-only',
      basis: 'Budget speech describes "BMC Pothole QuickFix"; dashboard page title "Pothole Grievance Summary" (opened 2026-10-11).',
      url: 'https://mumgis.mcgm.gov.in/BMC_PotholeGrivance_Dashboard/index.html',
    },
    {
      name: 'SWD Works Monitoring System (desilting)',
      owner: 'BMC Storm Water Drains Department',
      purpose: 'Desilting progress monitoring',
      publicFacing: true,
      access: 'dashboard-only',
      basis: 'Homepage link "SWD Desilting Dashboard 2026-27"; page title "SWD-WMS".',
      url: 'https://swd.mcgm.gov.in/WMS2026/#/predashboard',
    },
    {
      name: 'Property tax portal and AQUA water billing',
      owner: 'BMC Assessment & Collection / Hydraulic Engineer',
      purpose: 'Online property tax and water bill payment',
      publicFacing: true,
      access: 'gated',
      basis: 'Portal links ptaxportal.mcgm.gov.in and aquaptax.mcgm.gov.in under payments/login.',
    },
    {
      name: 'MyBMC Building ID (GIS)',
      owner: 'BMC IT / GIS',
      purpose: 'Single-click building-level licences, water connection, property tax and permit data',
      publicFacing: true,
      access: 'dashboard-only',
      basis: 'Budget speech describes MyBMC Building ID; linked in portal Maps menu.',
      url: 'https://portal.mcgm.gov.in/irj/portal/anonymous/MyBMC-Building-ID',
    },
    {
      name: 'HMIS and Bed Availability Dashboard',
      owner: 'BMC Public Health / Medical Education',
      purpose: 'Hospital management system; daily bed availability across hospitals',
      publicFacing: false,
      access: 'unknown',
      basis: 'Budget speech: HMIS modules live in 10 peripheral hospitals and 30 modules in KEM; centralised bed dashboard "being developed".',
    },
    {
      name: 'AutoDCR building permission system',
      owner: 'BMC Building Proposals',
      purpose: 'Online building plan approval',
      publicFacing: true,
      access: 'gated',
      basis: 'Linked from portal for building proposals (login page opened).',
    },
    {
      name: 'BMC dashboards / employee MIS (appCONNECT, MyBMC MARG employee dashboard, BI)',
      owner: 'BMC IT Department',
      purpose: 'Internal dashboards for officers',
      publicFacing: false,
      access: 'gated',
      basis: 'Employee menu links "Dashboards (new)" (appCONNECT login), MyBMC MARG employee dashboard and a BusinessObjects BI server.',
    },
    {
      name: 'BEST Undertaking',
      owner: 'BEST (undertaking of Brihanmumbai Mahanagarpalika)',
      purpose: 'City bus transport and electricity supply in island city',
      publicFacing: true,
      access: 'unknown',
      basis: 'Website: 2.9 million daily passengers, 505 routes, 11,00,000 electricity consumers.',
    },
    {
      name: 'Mumbai Fire Brigade',
      owner: 'BMC',
      purpose: 'Fire prevention, firefighting, rescue, first responder',
      publicFacing: true,
      access: 'unknown',
      basis: 'Budget speech section "MUMBAI FIRE BRIGADE"; FPJ Aug 2024: 35 major and 19 smaller fire stations.',
    },
    {
      name: 'Aaple Sarkar (Maharashtra RTS portal)',
      owner: 'Government of Maharashtra (MahaIT)',
      purpose: 'Right to Services applications, tracking and appeals',
      publicFacing: true,
      access: 'gated',
      basis: 'Opened 2026-10-11; also linked from the BMC portal footer; portal has a Maharashtra Right to Public Services Act 2015 page.',
    },
    {
      name: 'CityFinance (MoHUA)',
      owner: 'Ministry of Housing and Urban Affairs',
      purpose: 'National municipal finance data and benchmarking',
      publicFacing: true,
      access: 'open',
      basis: 'Opened 2026-10-11: 4,332 ULBs with financial data, 16,726 statements FY 2015-16 to 2023-24.',
      url: 'https://cityfinance.in/',
    },
    {
      name: 'Air quality networks (MPCB, CPCB, SAFAR-Mumbai, BMC AQI)',
      owner: 'MPCB / CPCB / IITM / BMC',
      purpose: 'Continuous ambient air quality monitoring and AQI',
      publicFacing: true,
      access: 'open',
      basis: 'Citizen Matters (Jan 2025): 30 stations (BMC 5, IITM 9, MPCB 16); BMC portal "Air Quality Mumbai" links national, state and BMC AQI sites.',
      url: 'https://safar.tropmet.res.in/',
    },
    {
      name: 'IMD Regional Meteorological Centre Mumbai',
      owner: 'India Meteorological Department',
      purpose: 'Forecasts, nowcasts and warnings used for monsoon response',
      publicFacing: true,
      access: 'open',
      basis: 'Opened 2026-10-11.',
      url: 'https://mausam.imd.gov.in/mumbai/',
    },
  ]
}

export function feedRecords(): PublicFeedRecord[] {
  return [
    {
      name: 'MCGM DM flooding-spot list (API)',
      owner: 'MCGM Disaster Management Department',
      gives: 'All flooding spots with type (chronic/flooding), address, ward, lat/long and nearest AWS rain gauge',
      form: 'json',
      refresh: 'As updated',
      url: 'https://dmwebtwo.mcgm.gov.in/api/floodSpot/loadAll',
    },
    {
      name: 'MCGM DM active AWS locations (API)',
      owner: 'MCGM Disaster Management Department',
      gives: 'Active automatic weather station / rain-gauge locations with ward, zone (1-7), coordinates, GIS feature id',
      form: 'json',
      refresh: 'As updated',
      url: 'https://dmwebtwo.mcgm.gov.in/api/location/loadActiveAWSLocations',
    },
    {
      name: 'MCGM Disaster Management portal (rainfall, tide, flood spots)',
      owner: 'MCGM Disaster Management Department',
      gives: 'AWS rainfall reports (1h to monthly), high-tide details, flood spots, IMD warnings, helpline directory',
      form: 'html',
      refresh: '15-minute rainfall updates in monsoon (per FPJ 2023)',
      url: 'https://dm.mcgm.gov.in/',
    },
    {
      name: 'BMC Budget 2026-27 books (OpenCity mirror)',
      owner: 'BMC / OpenCity',
      gives: 'Budget speeches, at-a-glance, fund-wise budgets, performance reports, gender budget',
      form: 'pdf',
      refresh: 'Yearly',
      url: 'https://data.opencity.in/dataset/bmc-budget-2026-27',
    },
    {
      name: 'MCGM audited annual accounts',
      owner: 'BMC Chief Accountant / Chief Auditor',
      gives: 'Audited annual accounts 2018-19 to 2023-24 (portal pages)',
      form: 'html',
      refresh: 'Yearly',
      url: 'https://portal.mcgm.gov.in/irj/portal/anonymous/qlAuditedAnn202324',
    },
    {
      name: 'Roads Monitoring System public dashboard',
      owner: 'BMC Roads & Traffic Department',
      gives: 'Progress of mega cement-concrete road works',
      form: 'html',
      refresh: 'As updated',
      url: 'https://roads.mcgm.gov.in/publicdashboard/',
    },
    {
      name: 'Pothole Grievance Summary dashboard',
      owner: 'BMC (GIS / Roads)',
      gives: 'Summary of pothole complaints from Pothole QuickFix',
      form: 'html',
      refresh: 'As updated',
      url: 'https://mumgis.mcgm.gov.in/BMC_PotholeGrivance_Dashboard/index.html',
    },
    {
      name: 'SWD desilting dashboard 2026-27',
      owner: 'BMC Storm Water Drains Department',
      gives: 'Pre-monsoon nullah/drain desilting work progress',
      form: 'html',
      refresh: 'As updated (seasonal)',
      url: 'https://swd.mcgm.gov.in/WMS2026/#/predashboard',
    },
    {
      name: 'BMC AQI site',
      owner: 'BMC (Environment)',
      gives: 'Air quality index from BMC monitoring stations',
      form: 'html',
      refresh: 'As updated',
      url: 'http://103.156.21.203:8083/',
    },
    {
      name: 'Kanjur MSW project AQI',
      owner: 'BMC Solid Waste Management',
      gives: 'Air quality around Kanjurmarg landfill (CCTV feed page also linked)',
      form: 'html',
      refresh: 'As updated',
      url: 'https://swm.mcgm.gov.in/kanjuraqi/',
    },
    {
      name: 'CPCB national AQI (linked from BMC portal)',
      owner: 'Central Pollution Control Board',
      gives: 'Station-wise AQI and pollutants incl. Mumbai MPCB/BMC/IITM stations',
      form: 'html',
      refresh: 'Hourly',
      url: 'https://app.cpcbccr.com/AQI_India/',
    },
    {
      name: 'SAFAR-Mumbai',
      owner: 'IITM Pune / MoES',
      gives: 'City AQI and air-quality forecasts',
      form: 'html',
      refresh: 'Daily',
      url: 'https://safar.tropmet.res.in/',
    },
    {
      name: 'IMD RMC Mumbai',
      owner: 'India Meteorological Department',
      gives: 'Forecasts, nowcasts, district/station warnings, daily rainfall, AWS, radar',
      form: 'html',
      refresh: 'Daily / nowcast every few hours',
      url: 'https://mausam.imd.gov.in/mumbai/',
    },
    {
      name: 'CityFinance',
      owner: 'MoHUA',
      gives: 'Standardised ULB financial statements and indicators (FY 2015-16 to 2023-24)',
      form: 'html',
      refresh: 'Yearly',
      url: 'https://cityfinance.in/',
    },
    {
      name: 'BMC press releases',
      owner: 'BMC Public Relations Department',
      gives: 'Official press notes (incl. lake levels, water cuts, monsoon updates)',
      form: 'html',
      refresh: 'Daily',
      url: 'https://portal.mcgm.gov.in/irj/portal/anonymous/qlpressrelease',
    },
    {
      name: 'BMC open e-tenders (SAP SRM)',
      owner: 'BMC Central Purchase / departments',
      gives: 'List of open e-tenders',
      form: 'html',
      refresh: 'Daily',
      url: 'https://tendering.mcgm.gov.in:8000/sap/bc/bsp/sap/zmcgm_3st_open/default.htm',
    },
  ]
}

export function siteRecords(): SiteSectionRecord[] {
  return [
    {
      section: 'Home page - What\'s New / quick links',
      publishes: 'Notices (lotteries, birth-record corrections, election helpline), links to SWD desilting dashboard, concrete-road progress, emergency contacts PDF, MyBMC Assist chatbot',
      feed: 'links',
      intelligence: 'Notices are PDFs with no structured feed; a platform could index them and track dashboard KPIs over time.',
    },
    {
      section: 'About BMC (Governance, Metropolis, Ward offices)',
      publishes: 'History, elected wing, administration, geography, demographics, vital statistics report, ward list and ward pages',
      feed: 'open',
      intelligence: 'Static pages; ward-level population/area and current ward count (24 vs 26) need a single maintained master.',
    },
    {
      section: 'Departments',
      publishes: 'Department manuals and pages (Environment, IT, Estate, Health, Licence, Building & Factories, Markets, Gardens, Hydraulic Engineer, Sewerage Operations, Maintenance, Fire)',
      feed: 'links',
      intelligence: 'No departmental KPIs; a decision platform should add per-department performance and SLA tracking.',
    },
    {
      section: 'Important projects',
      publishes: 'Mega projects (Coastal Road, Coastal Road North), Solid Waste Management',
      feed: 'links',
      intelligence: 'Project pages lack physical/financial progress feeds; link to budget commitments (₹2.44 lakh cr liabilities).',
    },
    {
      section: 'Maps (BMC on Map / MyBMC Building ID / One MCGM GIS)',
      publishes: 'GIS maps of wards & offices, BEST transport, gardens, parking, toilets, health facilities, schools; Building ID',
      feed: 'open',
      intelligence: 'Spatial layers exist; could be fused with complaints, flood spots and AWS rainfall for ward risk scoring.',
    },
    {
      section: 'Media (Press releases, e-books, civic diary, FAQs)',
      publishes: 'Press notes, publications, BMC civic diary 2026',
      feed: 'open',
      intelligence: 'Lake levels and water-cut decisions appear in press notes; extract into time series.',
    },
    {
      section: 'Proactive disclosure (Budget, Annual accounts, Audited accounts, RTI)',
      publishes: 'Budgets, annual accounts, audited annual accounts 2018-19 to 2023-24, planning, public disclosure law, RTI lists',
      feed: 'open',
      intelligence: 'PDF-only financials; convert to structured revenue/expenditure/reserve series and reconcile with CityFinance.',
    },
    {
      section: 'For citizens - Information & Air Quality Mumbai',
      publishes: 'RTS Act info, citizen charter, CFC info, links to national/state/BMC/Kanjur AQI sites, veterinary, C&D waste, swimming pools',
      feed: 'links',
      intelligence: 'AQI scattered across 4 sites; unify station readings and link to SWM/construction-dust enforcement.',
    },
    {
      section: 'Apply / Know status / Complaints',
      publishes: 'Certificates (birth, death, marriage), licences, building approval (AutoDCR), RTI, tree trimming, complaints via MyBMC MARG, Pothole QuickFix dashboards, application status',
      feed: 'personal',
      intelligence: 'Transactional; aggregate (anonymised) volumes, pendency and SLA breach by ward are not published.',
    },
    {
      section: 'Login / Pay (Property tax, Water bills, online payment)',
      publishes: 'Property tax portal, AQUA water billing, online payments, FICO collection',
      feed: 'personal',
      intelligence: 'Collection efficiency and arrears by ward are not public; budget shows ₹10,948.58 cr pending state dues.',
    },
    {
      section: 'For business (Licences, permissions)',
      publishes: 'Trade, shop & establishment, hoardings, factory, Deonar abattoir, health licences, trenching, filming, tenancy, vendor/contractor registration',
      feed: 'personal',
      intelligence: 'EoDB circulars only; licence turnaround statistics would support ease-of-business monitoring.',
    },
    {
      section: 'For partners (Tenders, procurement)',
      publishes: 'Procurement plans, e-tender lists (SAP SRM 7.0), unified schedule of rates, major projects, invoice tracking, Form 16A',
      feed: 'open',
      intelligence: 'Tender lists are HTML; contract award values and vendor concentration analytics are missing.',
    },
    {
      section: 'Careers',
      publishes: 'Recruitment notices',
      feed: 'open',
      intelligence: 'Low decision value; vacancy data could feed workforce planning.',
    },
    {
      section: 'For employees',
      publishes: 'SAP S/4HANA Fiori self-service, e-Office, UPYOG, appCONNECT dashboards, MyBMC MARG employee dashboard, IT ticketing, SWM collection info',
      feed: 'gated',
      intelligence: 'Operational dashboards exist internally but are login-only; a decision platform needs governed read access or exports.',
    },
    {
      section: 'Disaster Management (dm.mcgm.gov.in, linked)',
      publishes: 'Rainfall from 120 AWS, tide information, flooding spots, IMD warnings, helpline directory',
      feed: 'open',
      intelligence: 'Unauthenticated JSON exists; add spot-level rainfall-to-flood alerts and pump/BRIMSTOWAD status (not published).',
    },
  ]
}
