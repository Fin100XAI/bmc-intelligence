import { activeCorporation } from '@/config/municipality.config'
import { det, isoFromAnchor } from '@/utils/deterministic'
import type { DataClassification, IntelligenceDomain, Severity } from '@/types/common'
import type {
  DataSource,
  DataSourceCategory,
  DataSourceField,
  DataSourceFormat,
  DataSourceIncident,
  DataSourceQuality,
  DataSourceStatus,
  DataSourceSyncRun,
  SyncFrequency,
  SyncOutcome,
} from '@/types/governance'
import { CITY_SCALE, scaledCount } from './scale'
import { registerLayer } from './runtime'
import { t } from '@/i18n'

/**
 * src/data/data-sources.data.ts
 *
 * The seed ingestion register for the Data Sources administration surface —
 * the upstream feeds the Urban Intelligence Core would draw on in a live
 * deployment: sensor networks, departmental systems of record, public
 * registries, citizen channels, geospatial layers and external agency feeds.
 *
 * In this environment none is connected. Every figure is modelled and every
 * sync is simulated. What is *not* modelled loosely is the shape: each source
 * declares the schema it would ingest, the purpose it is ingested for, the
 * retention it is held under and the metrics downstream of it, because those
 * four facts are what a privacy review, an impact assessment and a data
 * steward actually work from. A register that lists feeds without them looks
 * complete and answers nothing.
 *
 * Determinism: every numeric field — record counts, the five quality
 * dimensions, latency, sync-run history, last-sync age — is derived from the
 * source's id through `det`, so the register reads identically on every load.
 * Session mutations (enabling, pausing, cadence, syncs, additions, removals)
 * live in `useDataSourceStore` and are layered over this seed by the page.
 *
 * The register is corporation-specific in two ways, and `DATA_SOURCES` is a
 * LIVE BINDING rebuilt on every switch to keep both true. First, the feeds a
 * corporation runs follow its geography: a corporation on a river gauges the
 * river, and showing it a tide gauge and a mangrove survey would be an obvious
 * fabrication. Second, ingested record counts follow how much corporation
 * there is to observe, so the volume bands are scaled before a count is drawn
 * from them. Retention, freshness expectations and classifications are policy
 * rather than magnitude, and do not move with size.
 */

interface Spec {
  id: string
  name: string
  category: DataSourceCategory
  ownerDepartmentId: string
  domain: IntelligenceDomain
  classification: DataClassification
  format: DataSourceFormat
  frequency: SyncFrequency
  /** Volume band for the simulated record count. */
  volume: 'low' | 'medium' | 'high'
  enabled: boolean
  /** Why this feed is ingested. Purpose limitation, written down. */
  purpose: string
  retentionDays: number
  /** Freshness expectation in minutes — breaching it is what makes it stale. */
  slaMinutes: number
  endpointLabel: string
  schema: DataSourceField[]
  downstream: string[]
  notes?: string
}

/* --------------------------------------------------------------------------
   Reusable field groups
   Most municipal feeds carry the same spine: an identifier, a ward reference
   and an observation instant. Declaring them once keeps the register honest —
   a feed that genuinely lacks a ward reference is then visibly different,
   rather than differing only because an author forgot to type it.
   ----------------------------------------------------------------------- */

function build$ID_FIELD(): DataSourceField {
  return {
  name: 'record_id',
  type: 'string',
  nullable: false,
  description: t('Natural key from the source system; the uniqueness dimension is measured against it.'),
}
}
let ID_FIELD: DataSourceField = build$ID_FIELD()
registerLayer(() => {
  ID_FIELD = build$ID_FIELD()
})

function build$WARD_FIELD(): DataSourceField {
  return {
  name: 'ward_code',
  type: 'enum',
  nullable: false,
  description: t('Administrative ward code, validated against the canonical ward register on ingest.'),
}
}
let WARD_FIELD: DataSourceField = build$WARD_FIELD()
registerLayer(() => {
  WARD_FIELD = build$WARD_FIELD()
})

function build$OBSERVED_FIELD(): DataSourceField {
  return {
  name: 'observed_at',
  type: 'timestamp',
  nullable: false,
  description: t('Instant the observation was taken at source; drives the timeliness dimension.'),
}
}
let OBSERVED_FIELD: DataSourceField = build$OBSERVED_FIELD()
registerLayer(() => {
  OBSERVED_FIELD = build$OBSERVED_FIELD()
})

function build$GEO_FIELD(): DataSourceField {
  return {
  name: 'location',
  type: 'geo-point',
  nullable: true,
  description: t('Point location. Illustrative in this environment — not surveyed GIS.'),
}
}
let GEO_FIELD: DataSourceField = build$GEO_FIELD()
registerLayer(() => {
  GEO_FIELD = build$GEO_FIELD()
})

/* --------------------------------------------------------------------------
   Water-front feeds
   Two feeds in the register only exist because of the water body the
   corporation sits on. A coastal corporation gauges the tide and surveys its
   mangroves; a riverine one gauges the river and surveys its embankments. The
   identifiers stay `ds-tide-gauge` and `ds-mangrove-survey` so every reference
   to them keeps resolving, on the same basis as `dept-coastal` in
   `./reference.ts` — what changes is what the feed says it observes.
   ----------------------------------------------------------------------- */

interface WaterFrontFeeds {
  gaugeName: string
  gaugePurpose: string
  gaugeEndpoint: string
  levelFieldName: string
  levelDescription: string
  predictedDescription: string
  surveyName: string
  surveyPurpose: string
  surveyEndpoint: string
  segmentDescription: string
  protectionDescription: string
  surveyDownstream: string[]
}

function waterFrontFeeds(): WaterFrontFeeds {
  const form = activeCorporation.form
  const named = form.waterBodies[0] ?? t('the municipal water body')
  switch (form.type) {
    case 'coastal':
    case 'creek-side':
      return {
        gaugeName: 'Coastal Tide Gauge Network',
        gaugePurpose: 'Establish high-tide windows during which storm water discharge to the sea is not possible.',
        gaugeEndpoint: 'api: coastal.tide-gauge.v2',
        levelFieldName: 'tide_level_m',
        levelDescription: 'Observed tide height above chart datum.',
        predictedDescription: 'Predicted tide height for the same instant.',
        surveyName: 'Mangrove & Shoreline Survey Register',
        surveyPurpose: 'Track shoreline vulnerability and mangrove extent against the coastal protection programme.',
        surveyEndpoint: 'sftp: coastal/shoreline-survey/',
        segmentDescription: 'Surveyed shoreline segment length.',
        protectionDescription: 'Seawall · mangrove · rock armour · unprotected.',
        surveyDownstream: [t('Shoreline vulnerability index'), t('Mangrove extent'), t('Coastal intelligence')],
      }
    case 'riverine':
      return {
        gaugeName: 'River Level Gauge Network',
        gaugePurpose: `Establish the river stages at which storm water discharge to ${named} is not possible.`,
        gaugeEndpoint: 'api: waterbody.river-gauge.v2',
        levelFieldName: 'river_level_m',
        levelDescription: 'Observed river stage above gauge datum.',
        predictedDescription: 'Forecast river stage for the same instant.',
        surveyName: 'Riverbank & Embankment Survey Register',
        surveyPurpose: 'Track bank vulnerability and embankment condition against the river protection programme.',
        surveyEndpoint: 'sftp: waterbody/riverbank-survey/',
        segmentDescription: 'Surveyed bank segment length.',
        protectionDescription: 'Embankment · revetment · vegetated bank · unprotected.',
        surveyDownstream: [t('Bank vulnerability index'), t('Embankment condition'), t('Water body intelligence')],
      }
    case 'lakeside':
      return {
        gaugeName: 'Lake Level Gauge Network',
        gaugePurpose: `Establish the lake levels at which storm water discharge to ${named} is not possible.`,
        gaugeEndpoint: 'api: waterbody.lake-gauge.v2',
        levelFieldName: 'lake_level_m',
        levelDescription: 'Observed lake level above gauge datum.',
        predictedDescription: 'Forecast lake level for the same instant.',
        surveyName: 'Lakefront & Foreshore Survey Register',
        surveyPurpose: 'Track foreshore vulnerability and lakefront encroachment against the lake conservation programme.',
        surveyEndpoint: 'sftp: waterbody/lakefront-survey/',
        segmentDescription: 'Surveyed foreshore segment length.',
        protectionDescription: 'Retaining wall · bunded · vegetated foreshore · unprotected.',
        surveyDownstream: [t('Foreshore vulnerability index'), t('Lakefront encroachment'), t('Water body intelligence')],
      }
    default:
      return {
        gaugeName: 'Water Body Level Gauge Network',
        gaugePurpose: 'Establish the receiving-water levels at which storm water discharge is not possible.',
        gaugeEndpoint: 'api: waterbody.level-gauge.v2',
        levelFieldName: 'water_level_m',
        levelDescription: 'Observed level above gauge datum at the receiving water body.',
        predictedDescription: 'Forecast level for the same instant.',
        surveyName: 'Water Body & Catchment Survey Register',
        surveyPurpose: 'Track catchment condition and water body extent against the conservation programme.',
        surveyEndpoint: 'sftp: waterbody/catchment-survey/',
        segmentDescription: 'Surveyed water body perimeter segment length.',
        protectionDescription: 'Retaining wall · bunded · vegetated margin · unprotected.',
        surveyDownstream: [t('Catchment condition index'), t('Water body extent'), t('Water body intelligence')],
      }
  }
}

/**
 * A function rather than a constant: two feeds are named from the active
 * corporation's water body, and the GIS layer's caveat names the corporation.
 */
function specs(): Spec[] {
  const corp = activeCorporation
  const front = waterFrontFeeds()

  return [
    /* ---- Storm water, monsoon and coastal ------------------------------- */
    {
      id: 'ds-flood-sensors',
      name: t('Flood Sensor Telemetry Grid'),
      category: 'sensor-network',
      ownerDepartmentId: 'dept-stormwater',
      domain: 'stormwater',
      classification: 'internal',
      format: 'event-stream',
      frequency: 'realtime',
      volume: 'high',
      enabled: true,
      purpose: t('Detect standing water at known flooding points early enough to deploy dewatering pumps.'),
      retentionDays: 1095,
      slaMinutes: 10,
      endpointLabel: 'stream: swd.flood-telemetry.v3',
      downstream: [t('Waterlogging spot risk'), t('Monsoon readiness index'), t('Ward risk index'), t('Situation Room flood layer')],
      schema: [
        ID_FIELD,
        WARD_FIELD,
        OBSERVED_FIELD,
        GEO_FIELD,
        { name: 'water_level_cm', type: 'decimal', nullable: false, description: t('Standing water depth at the sensor, in centimetres.') },
        { name: 'sensor_state', type: 'enum', nullable: false, description: t('reporting · degraded · offline — offline readings are excluded, never zero-filled.') },
        { name: 'battery_pct', type: 'integer', nullable: true, description: t('Remaining battery, used to predict sensor dropout before it happens.') },
      ],
    },
    {
      id: 'ds-pumping-station',
      name: t('Storm Water Pumping Station Telemetry'),
      category: 'sensor-network',
      ownerDepartmentId: 'dept-stormwater',
      domain: 'stormwater',
      classification: 'internal',
      format: 'event-stream',
      frequency: '5-min',
      volume: 'medium',
      enabled: true,
      purpose: t('Confirm that pumping capacity is actually running during a rainfall event, not merely available on paper.'),
      retentionDays: 1095,
      slaMinutes: 15,
      endpointLabel: 'stream: swd.pump-scada.v2',
      downstream: [t('Pumping station readiness'), t('Monsoon scenario simulation'), t('Storm water intelligence')],
      schema: [
        ID_FIELD,
        WARD_FIELD,
        OBSERVED_FIELD,
        { name: 'station_code', type: 'string', nullable: false, description: t('Pumping station identifier.') },
        { name: 'pumps_running', type: 'integer', nullable: false, description: t('Pumps currently operating.') },
        { name: 'pumps_installed', type: 'integer', nullable: false, description: t('Pumps installed at the station.') },
        { name: 'discharge_cumecs', type: 'decimal', nullable: true, description: t('Discharge rate in cubic metres per second.') },
      ],
    },
    {
      id: 'ds-imd-rainfall',
      name: t('IMD Rainfall & Nowcast Feed'),
      category: 'external-feed',
      ownerDepartmentId: 'dept-disaster',
      domain: 'monsoon',
      classification: 'public',
      format: 'json-api',
      frequency: 'hourly',
      volume: 'medium',
      enabled: true,
      purpose: t('Anchor every rainfall figure and monsoon simulation to the meteorological authority rather than to a municipal estimate.'),
      retentionDays: 3650,
      slaMinutes: 120,
      endpointLabel: 'api: external.imd.rainfall.v1',
      downstream: [t('Rainfall observed'), t('Monsoon scenario simulation'), t('Flood risk by ward'), t('Executive brief')],
      notes: t('An external authority feed. The platform never restates or adjusts an IMD figure; where a municipal reading disagrees, both are shown.'),
      schema: [
        ID_FIELD,
        OBSERVED_FIELD,
        { name: 'station_name', type: 'string', nullable: false, description: t('Observing station.') },
        { name: 'rainfall_mm_1h', type: 'decimal', nullable: false, description: t('Rainfall in the preceding hour.') },
        { name: 'rainfall_mm_24h', type: 'decimal', nullable: false, description: t('Rainfall in the preceding 24 hours.') },
        { name: 'warning_level', type: 'enum', nullable: true, description: t('Issued colour warning, where one is in force.') },
      ],
    },
    {
      id: 'ds-tide-gauge',
      name: front.gaugeName,
      category: 'sensor-network',
      ownerDepartmentId: 'dept-disaster',
      domain: 'coastal',
      classification: 'public',
      format: 'json-api',
      frequency: '5-min',
      volume: 'medium',
      enabled: true,
      purpose: front.gaugePurpose,
      retentionDays: 3650,
      slaMinutes: 15,
      endpointLabel: front.gaugeEndpoint,
      downstream: [t('Discharge window'), t('Monsoon compound risk'), t('Water body intelligence')],
      schema: [
        ID_FIELD,
        OBSERVED_FIELD,
        GEO_FIELD,
        { name: front.levelFieldName, type: 'decimal', nullable: false, description: front.levelDescription },
        { name: 'predicted_level_m', type: 'decimal', nullable: false, description: front.predictedDescription },
      ],
    },
    {
      id: 'ds-mangrove-survey',
      name: front.surveyName,
      category: 'geospatial',
      ownerDepartmentId: 'dept-coastal',
      domain: 'coastal',
      classification: 'internal',
      format: 'csv-sftp',
      frequency: 'weekly',
      volume: 'low',
      enabled: true,
      purpose: front.surveyPurpose,
      retentionDays: 3650,
      slaMinutes: 20_160,
      endpointLabel: front.surveyEndpoint,
      downstream: front.surveyDownstream,
      schema: [
        ID_FIELD,
        WARD_FIELD,
        GEO_FIELD,
        { name: 'segment_length_m', type: 'decimal', nullable: false, description: front.segmentDescription },
        { name: 'protection_type', type: 'enum', nullable: true, description: front.protectionDescription },
        { name: 'condition_grade', type: 'enum', nullable: false, description: t('Surveyed condition grade for the segment.') },
      ],
    },

    /* ---- Water and sewerage --------------------------------------------- */
    {
      id: 'ds-water-scada',
      name: t('Water Supply SCADA'),
      category: 'sensor-network',
      ownerDepartmentId: 'dept-hydraulic',
      domain: 'water',
      classification: 'confidential',
      format: 'db-replica',
      frequency: '5-min',
      volume: 'high',
      enabled: true,
      purpose: t('Monitor bulk supply, reservoir levels and network pressure to locate loss and supply shortfall.'),
      retentionDays: 1825,
      slaMinutes: 15,
      endpointLabel: 'replica: hyd.scada.readonly',
      downstream: [t('Supply-demand gap'), t('Non-revenue water'), t('Pressure adequacy'), t('Water intelligence')],
      notes: t('Held confidential: reservoir and trunk-main detail is infrastructure-sensitive, not because the readings are commercially valuable.'),
      schema: [
        ID_FIELD,
        WARD_FIELD,
        OBSERVED_FIELD,
        { name: 'reservoir_code', type: 'string', nullable: true, description: t('Service reservoir the reading belongs to.') },
        { name: 'level_pct', type: 'decimal', nullable: true, description: t('Reservoir level as a share of capacity.') },
        { name: 'flow_mld', type: 'decimal', nullable: false, description: t('Flow in million litres per day.') },
        { name: 'pressure_bar', type: 'decimal', nullable: true, description: t('Network pressure at the measurement point.') },
      ],
    },
    {
      id: 'ds-water-quality-lab',
      name: t('Water Quality Laboratory Results'),
      category: 'departmental-system',
      ownerDepartmentId: 'dept-hydraulic',
      domain: 'water',
      classification: 'internal',
      format: 'json-api',
      frequency: 'daily',
      volume: 'medium',
      enabled: true,
      purpose: t('Publish potability compliance by ward and trigger investigation where a sample fails.'),
      retentionDays: 3650,
      slaMinutes: 1440,
      endpointLabel: 'api: hyd.lab-results.v2',
      downstream: [t('Potability compliance'), t('Contamination signal'), t('Public health outbreak signal')],
      schema: [
        ID_FIELD,
        WARD_FIELD,
        OBSERVED_FIELD,
        { name: 'sample_point', type: 'string', nullable: false, description: t('Collection point reference.') },
        { name: 'residual_chlorine_mgl', type: 'decimal', nullable: true, description: t('Residual chlorine in milligrams per litre.') },
        { name: 'coliform_present', type: 'boolean', nullable: false, description: t('Whether coliform was detected in the sample.') },
        { name: 'result', type: 'enum', nullable: false, description: t('Pass · fail · retest required.') },
      ],
    },
    {
      id: 'ds-sewage-treatment',
      name: t('Sewage Treatment Facility Telemetry'),
      category: 'sensor-network',
      ownerDepartmentId: 'dept-sewerage',
      domain: 'sewerage',
      classification: 'internal',
      format: 'db-replica',
      frequency: 'hourly',
      volume: 'medium',
      enabled: true,
      purpose: t('Report treatment throughput and effluent compliance against consent conditions.'),
      retentionDays: 2555,
      slaMinutes: 120,
      endpointLabel: 'replica: sew.stp-scada.readonly',
      downstream: [t('Treatment capacity utilisation'), t('Effluent compliance'), t('Sewerage intelligence')],
      schema: [
        ID_FIELD,
        OBSERVED_FIELD,
        { name: 'facility_code', type: 'string', nullable: false, description: t('Treatment facility identifier.') },
        { name: 'inflow_mld', type: 'decimal', nullable: false, description: t('Inflow in million litres per day.') },
        { name: 'treated_mld', type: 'decimal', nullable: false, description: t('Volume treated to consent standard.') },
        { name: 'bod_mgl', type: 'decimal', nullable: true, description: t('Biochemical oxygen demand of the effluent.') },
      ],
    },
    {
      id: 'ds-sewer-overflow',
      name: t('Sewer Overflow & Blockage Reports'),
      category: 'departmental-system',
      ownerDepartmentId: 'dept-sewerage',
      domain: 'sewerage',
      classification: 'internal',
      format: 'webhook',
      frequency: 'realtime',
      volume: 'medium',
      enabled: true,
      purpose: t('Associate repeat overflow locations with network condition so rehabilitation is prioritised on evidence.'),
      retentionDays: 1825,
      slaMinutes: 30,
      endpointLabel: 'webhook: sew.overflow-events',
      downstream: [t('Network condition index'), t('Repeat overflow locations'), t('Citizen complaint root cause')],
      schema: [
        ID_FIELD,
        WARD_FIELD,
        OBSERVED_FIELD,
        GEO_FIELD,
        { name: 'reach_code', type: 'string', nullable: true, description: t('Sewer reach the event was attributed to.') },
        { name: 'event_type', type: 'enum', nullable: false, description: t('Overflow · blockage · collapse.') },
      ],
    },

    /* ---- Solid waste ----------------------------------------------------- */
    {
      id: 'ds-weighbridge',
      name: t('Solid Waste Weighbridge Feed'),
      category: 'departmental-system',
      ownerDepartmentId: 'dept-solid-waste',
      domain: 'waste',
      classification: 'internal',
      format: 'csv-sftp',
      frequency: 'daily',
      volume: 'medium',
      enabled: true,
      purpose: t('Reconcile waste tonnage collected against tonnage received at processing and disposal sites.'),
      retentionDays: 2555,
      slaMinutes: 1440,
      endpointLabel: 'sftp: swm/weighbridge/daily/',
      downstream: [t('Waste generated per capita'), t('Processing share'), t('Collection-to-disposal reconciliation')],
      schema: [
        ID_FIELD,
        WARD_FIELD,
        OBSERVED_FIELD,
        { name: 'facility_code', type: 'string', nullable: false, description: t('Transfer station or disposal site.') },
        { name: 'vehicle_number', type: 'string', nullable: false, description: t('Collection vehicle registration.') },
        { name: 'net_weight_kg', type: 'integer', nullable: false, description: t('Net weight recorded at the bridge.') },
        { name: 'waste_stream', type: 'enum', nullable: false, description: t('Dry · wet · construction · biomedical.') },
      ],
    },
    {
      id: 'ds-collection-gps',
      name: t('Waste Collection Vehicle Tracking'),
      category: 'sensor-network',
      ownerDepartmentId: 'dept-solid-waste',
      domain: 'waste',
      classification: 'internal',
      format: 'event-stream',
      frequency: 'realtime',
      volume: 'high',
      enabled: true,
      purpose: t('Measure route coverage and missed collections against the published collection plan.'),
      retentionDays: 365,
      slaMinutes: 10,
      endpointLabel: 'stream: swm.fleet-telemetry.v4',
      downstream: [t('Collection coverage'), t('Route adherence'), t('Missed collection hotspots')],
      notes: t('Vehicle-level, never operator-level. The feed carries no driver identity: route performance is a fleet measure and is not used to appraise an individual.'),
      schema: [
        ID_FIELD,
        WARD_FIELD,
        OBSERVED_FIELD,
        GEO_FIELD,
        { name: 'vehicle_number', type: 'string', nullable: false, description: t('Collection vehicle registration.') },
        { name: 'route_code', type: 'string', nullable: false, description: t('Planned collection route.') },
        { name: 'stop_completed', type: 'boolean', nullable: false, description: t('Whether the scheduled stop was serviced.') },
      ],
    },

    /* ---- Roads, mobility and assets -------------------------------------- */
    {
      id: 'ds-road-defects',
      name: t('Road Defect Inspection Register'),
      category: 'departmental-system',
      ownerDepartmentId: 'dept-roads',
      domain: 'roads',
      classification: 'internal',
      format: 'json-api',
      frequency: 'daily',
      volume: 'medium',
      enabled: true,
      purpose: t('Feed the explainable road defect priority engine with inspected condition rather than complaint volume alone.'),
      retentionDays: 2555,
      slaMinutes: 1440,
      endpointLabel: 'api: roads.defect-register.v3',
      downstream: [t('Road defect priority score'), t('Surface condition index'), t('Roads intelligence')],
      schema: [
        ID_FIELD,
        WARD_FIELD,
        OBSERVED_FIELD,
        GEO_FIELD,
        { name: 'defect_type', type: 'enum', nullable: false, description: t('Pothole · crack · settlement · edge failure.') },
        { name: 'severity_grade', type: 'enum', nullable: false, description: t('Inspected severity grade.') },
        { name: 'carriageway_class', type: 'enum', nullable: false, description: t('Arterial · sub-arterial · local.') },
      ],
    },
    {
      id: 'ds-traffic-cctv',
      name: t('Traffic & Junction CCTV Analytics'),
      category: 'sensor-network',
      ownerDepartmentId: 'dept-mobility',
      domain: 'mobility',
      classification: 'confidential',
      format: 'event-stream',
      frequency: 'realtime',
      volume: 'high',
      enabled: false,
      purpose: t('Derive junction-level congestion from aggregate vehicle counts for corridor performance analysis.'),
      retentionDays: 90,
      slaMinutes: 10,
      endpointLabel: 'stream: mob.junction-analytics.v2',
      downstream: [t('Corridor travel time'), t('Junction congestion index'), t('Traffic & mobility')],
      notes: t('Paused pending privacy review. The adapter ingests aggregate counts only — no image, plate or face data enters the platform — but the review has not concluded, so the feed stays paused rather than being run on the strength of that design intention.'),
      schema: [
        ID_FIELD,
        OBSERVED_FIELD,
        GEO_FIELD,
        { name: 'junction_code', type: 'string', nullable: false, description: t('Junction identifier.') },
        { name: 'vehicle_count', type: 'integer', nullable: false, description: t('Aggregate vehicle count in the interval.') },
        { name: 'mean_speed_kph', type: 'decimal', nullable: true, description: t('Mean approach speed in the interval.') },
        { name: 'queue_length_m', type: 'decimal', nullable: true, description: t('Estimated queue length on the approach.') },
      ],
    },
    {
      id: 'ds-bridge-inspection',
      name: t('Bridge & Flyover Inspection Records'),
      category: 'departmental-system',
      ownerDepartmentId: 'dept-roads',
      domain: 'assets',
      classification: 'internal',
      format: 'csv-sftp',
      frequency: 'weekly',
      volume: 'low',
      enabled: true,
      purpose: t('Maintain structural condition of the bridge stock and surface those due or overdue for inspection.'),
      retentionDays: 7300,
      slaMinutes: 20_160,
      endpointLabel: 'sftp: roads/structures/inspections/',
      downstream: [t('Structure condition grade'), t('Inspection overdue register'), t('Asset lifecycle exposure')],
      schema: [
        ID_FIELD,
        WARD_FIELD,
        GEO_FIELD,
        { name: 'structure_code', type: 'string', nullable: false, description: t('Bridge or flyover identifier.') },
        { name: 'inspected_on', type: 'timestamp', nullable: false, description: t('Date of the recorded inspection.') },
        { name: 'condition_grade', type: 'enum', nullable: false, description: t('Assessed structural condition grade.') },
        { name: 'next_due_on', type: 'timestamp', nullable: false, description: t('Date the next inspection falls due.') },
      ],
    },
    {
      id: 'ds-asset-register',
      name: t('Municipal Asset Register'),
      category: 'departmental-system',
      ownerDepartmentId: 'dept-estates',
      domain: 'assets',
      classification: 'internal',
      format: 'db-replica',
      frequency: 'daily',
      volume: 'high',
      enabled: true,
      purpose: t('Hold the canonical municipal asset inventory that every condition and lifecycle figure is computed against.'),
      retentionDays: 7300,
      slaMinutes: 1440,
      endpointLabel: 'replica: est.asset-register.readonly',
      downstream: [t('Asset condition distribution'), t('Replacement liability'), t('Infrastructure graph'), t('Asset intelligence')],
      schema: [
        ID_FIELD,
        WARD_FIELD,
        GEO_FIELD,
        { name: 'asset_class', type: 'enum', nullable: false, description: t('Asset classification within the register.') },
        { name: 'commissioned_on', type: 'timestamp', nullable: true, description: t('Date the asset entered service.') },
        { name: 'book_value_inr', type: 'decimal', nullable: true, description: t('Carrying value in the asset register.') },
        { name: 'condition_grade', type: 'enum', nullable: true, description: t('Last assessed condition grade.') },
      ],
    },

    /* ---- Health, hospitals and emergency --------------------------------- */
    {
      id: 'ds-vital-registry',
      name: t('Births & Deaths Registry'),
      category: 'public-registry',
      ownerDepartmentId: 'dept-health',
      domain: 'health',
      classification: 'restricted',
      format: 'csv-sftp',
      frequency: 'daily',
      volume: 'medium',
      enabled: true,
      purpose: t('Produce aggregate vital statistics by ward. Nothing individual-level is surfaced anywhere in the platform.'),
      retentionDays: 3650,
      slaMinutes: 1440,
      endpointLabel: 'sftp: health/civil-registration/',
      downstream: [t('Crude birth rate'), t('Crude death rate'), t('Public health indicators')],
      notes: t('Restricted, and minimised at ingest: name and address fields are dropped at the adapter and never enter the platform store. Only ward, age band, sex and cause group are retained.'),
      schema: [
        ID_FIELD,
        WARD_FIELD,
        OBSERVED_FIELD,
        { name: 'event_type', type: 'enum', nullable: false, description: t('Birth or death registration.') },
        { name: 'age_band', type: 'enum', nullable: true, description: t('Banded age. Exact age is not ingested.'), sensitive: true },
        { name: 'sex', type: 'enum', nullable: true, description: t('As recorded in the civil register.'), sensitive: true },
        { name: 'cause_group', type: 'enum', nullable: true, description: t('Grouped cause classification, never free text.'), sensitive: true },
      ],
    },
    {
      id: 'ds-disease-surveillance',
      name: t('Disease Surveillance Reporting'),
      category: 'departmental-system',
      ownerDepartmentId: 'dept-health',
      domain: 'health',
      classification: 'confidential',
      format: 'json-api',
      frequency: 'daily',
      volume: 'medium',
      enabled: true,
      purpose: t('Detect outbreak signals early from aggregate case counts by ward and disease.'),
      retentionDays: 3650,
      slaMinutes: 1440,
      endpointLabel: 'api: health.surveillance.v2',
      downstream: [t('Case counts by ward'), t('Outbreak signal'), t('Vector control priority'), t('Public health')],
      notes: t('Aggregate counts only. Case-level records are not ingested, so no individual can be identified from anything this feed contributes.'),
      schema: [
        ID_FIELD,
        WARD_FIELD,
        OBSERVED_FIELD,
        { name: 'disease_code', type: 'enum', nullable: false, description: t('Notifiable disease classification.') },
        { name: 'case_count', type: 'integer', nullable: false, description: t('Cases reported in the interval for the ward.') },
        { name: 'facility_type', type: 'enum', nullable: true, description: t('Reporting facility type.') },
      ],
    },
    {
      id: 'ds-bed-occupancy',
      name: t('Hospital Bed Occupancy'),
      category: 'departmental-system',
      ownerDepartmentId: 'dept-hospitals',
      domain: 'hospitals',
      classification: 'confidential',
      format: 'json-api',
      frequency: 'hourly',
      volume: 'medium',
      enabled: true,
      purpose: t('Report critical-care headroom across the hospital network during an incident or outbreak.'),
      retentionDays: 1825,
      slaMinutes: 120,
      endpointLabel: 'api: hosp.bed-census.v3',
      downstream: [t('Critical care headroom'), t('Bed occupancy rate'), t('Hospital accessibility'), t('Situation Room capacity layer')],
      schema: [
        ID_FIELD,
        OBSERVED_FIELD,
        { name: 'facility_code', type: 'string', nullable: false, description: t('Hospital identifier.') },
        { name: 'bed_category', type: 'enum', nullable: false, description: t('General · ICU · ventilator · paediatric.') },
        { name: 'beds_total', type: 'integer', nullable: false, description: t('Sanctioned beds in the category.') },
        { name: 'beds_occupied', type: 'integer', nullable: false, description: t('Beds occupied at the census instant.') },
      ],
    },
    {
      id: 'ds-ambulance-dispatch',
      name: t('Ambulance Dispatch Log'),
      category: 'departmental-system',
      ownerDepartmentId: 'dept-hospitals',
      domain: 'hospitals',
      classification: 'confidential',
      format: 'webhook',
      frequency: 'realtime',
      volume: 'medium',
      enabled: true,
      purpose: t('Measure emergency response intervals by ward, without ingesting any patient detail.'),
      retentionDays: 1095,
      slaMinutes: 30,
      endpointLabel: 'webhook: hosp.dispatch-events',
      downstream: [t('Emergency response time'), t('Coverage gaps'), t('Hospital intelligence')],
      notes: t('Carries no patient identity, condition or destination detail — only dispatch, arrival and clearing instants against a ward.'),
      schema: [
        ID_FIELD,
        WARD_FIELD,
        OBSERVED_FIELD,
        { name: 'dispatched_at', type: 'timestamp', nullable: false, description: t('Instant the vehicle was dispatched.') },
        { name: 'arrived_at', type: 'timestamp', nullable: true, description: t('Instant of arrival on scene.') },
        { name: 'cleared_at', type: 'timestamp', nullable: true, description: t('Instant the vehicle cleared the scene.') },
      ],
    },
    {
      id: 'ds-fire-incidents',
      name: t('Fire & Rescue Incident Log'),
      category: 'departmental-system',
      ownerDepartmentId: 'dept-fire',
      domain: 'emergency',
      classification: 'internal',
      format: 'webhook',
      frequency: 'realtime',
      volume: 'medium',
      enabled: true,
      purpose: t('Report station response times, appliance availability and incident load by ward.'),
      retentionDays: 2555,
      slaMinutes: 30,
      endpointLabel: 'webhook: fire.incident-events',
      downstream: [t('Station response time'), t('Appliance availability'), t('Coverage adequacy'), t('Fire & emergency')],
      schema: [
        ID_FIELD,
        WARD_FIELD,
        OBSERVED_FIELD,
        GEO_FIELD,
        { name: 'station_code', type: 'string', nullable: false, description: t('Responding fire station.') },
        { name: 'incident_class', type: 'enum', nullable: false, description: t('Fire · rescue · hazardous material · special service.') },
        { name: 'response_minutes', type: 'decimal', nullable: true, description: t('Interval from call to arrival.') },
      ],
    },
    {
      id: 'ds-fire-safety-audit',
      name: t('Fire Safety Audit Register'),
      category: 'departmental-system',
      ownerDepartmentId: 'dept-fire',
      domain: 'emergency',
      classification: 'internal',
      format: 'csv-sftp',
      frequency: 'weekly',
      volume: 'low',
      enabled: true,
      purpose: t('Track fire safety compliance of high-occupancy buildings and surface overdue audits.'),
      retentionDays: 3650,
      slaMinutes: 20_160,
      endpointLabel: 'sftp: fire/safety-audits/',
      downstream: [t('Audit compliance rate'), t('High-risk premises register'), t('Building intelligence')],
      schema: [
        ID_FIELD,
        WARD_FIELD,
        { name: 'premises_code', type: 'string', nullable: false, description: t('Audited premises identifier.') },
        { name: 'audited_on', type: 'timestamp', nullable: true, description: t('Date of the last completed audit.') },
        { name: 'outcome', type: 'enum', nullable: true, description: t('Compliant · conditional · non-compliant.') },
        { name: 'occupancy_class', type: 'enum', nullable: false, description: t('Occupancy classification of the premises.') },
      ],
    },

    /* ---- Environment ------------------------------------------------------ */
    {
      id: 'ds-aqi-grid',
      name: t('Air Quality Monitoring Grid'),
      category: 'sensor-network',
      ownerDepartmentId: 'dept-environment',
      domain: 'environment',
      classification: 'public',
      format: 'json-api',
      frequency: 'hourly',
      volume: 'medium',
      enabled: true,
      purpose: t('Publish air quality by ward and associate exceedances with construction and traffic activity.'),
      retentionDays: 3650,
      slaMinutes: 120,
      endpointLabel: 'api: env.aqi-grid.v2',
      downstream: [t('Air quality index'), t('Exceedance days'), t('Construction dust association'), t('Environment intelligence')],
      schema: [
        ID_FIELD,
        WARD_FIELD,
        OBSERVED_FIELD,
        GEO_FIELD,
        { name: 'pm25_ugm3', type: 'decimal', nullable: true, description: t('Fine particulate concentration.') },
        { name: 'pm10_ugm3', type: 'decimal', nullable: true, description: t('Coarse particulate concentration.') },
        { name: 'no2_ugm3', type: 'decimal', nullable: true, description: t('Nitrogen dioxide concentration.') },
      ],
    },
    {
      id: 'ds-noise-monitoring',
      name: t('Ambient Noise Monitoring'),
      category: 'sensor-network',
      ownerDepartmentId: 'dept-environment',
      domain: 'environment',
      classification: 'public',
      format: 'json-api',
      frequency: 'hourly',
      volume: 'medium',
      enabled: true,
      purpose: t('Measure ambient noise against silence-zone and residential limits.'),
      retentionDays: 1825,
      slaMinutes: 180,
      endpointLabel: 'api: env.noise-grid.v1',
      downstream: [t('Noise exceedance'), t('Silence zone compliance'), t('Environment intelligence')],
      schema: [
        ID_FIELD,
        WARD_FIELD,
        OBSERVED_FIELD,
        GEO_FIELD,
        { name: 'leq_db', type: 'decimal', nullable: false, description: t('Equivalent continuous sound level.') },
        { name: 'zone_class', type: 'enum', nullable: false, description: t('Silence · residential · commercial · industrial.') },
      ],
    },
    {
      id: 'ds-tree-census',
      name: t('Tree Authority Census & Permissions'),
      category: 'departmental-system',
      ownerDepartmentId: 'dept-environment',
      domain: 'environment',
      classification: 'public',
      format: 'db-replica',
      frequency: 'weekly',
      volume: 'medium',
      enabled: true,
      purpose: t('Maintain the tree census and reconcile felling permissions against compensatory planting.'),
      retentionDays: 7300,
      slaMinutes: 20_160,
      endpointLabel: 'replica: env.tree-authority.readonly',
      downstream: [t('Green cover'), t('Compensatory planting compliance'), t('Environment intelligence')],
      schema: [
        ID_FIELD,
        WARD_FIELD,
        GEO_FIELD,
        { name: 'species', type: 'string', nullable: true, description: t('Recorded species.') },
        { name: 'girth_cm', type: 'decimal', nullable: true, description: t('Girth at breast height.') },
        { name: 'permission_type', type: 'enum', nullable: true, description: t('Felling · transplant · pruning, where one applies.') },
      ],
    },

    /* ---- Citizen channels -------------------------------------------------- */
    {
      id: 'ds-complaints',
      name: t('Citizen Complaints (Helpline & Portal)'),
      category: 'citizen-channel',
      ownerDepartmentId: 'dept-commissioner',
      domain: 'citizen-services',
      classification: 'internal',
      format: 'webhook',
      frequency: 'realtime',
      volume: 'high',
      enabled: true,
      purpose: t('Associate recurring complaints with the infrastructure condition that causes them, and measure SLA position.'),
      retentionDays: 1825,
      slaMinutes: 15,
      endpointLabel: 'webhook: cit.grievance-events',
      downstream: [t('Complaint volume by category'), t('Root cause association'), t('SLA breach register'), t('Ward risk index')],
      notes: t('Complainant name and contact are dropped at the adapter; the platform holds the complaint, its category, ward and lifecycle instants, never the person who raised it.'),
      schema: [
        ID_FIELD,
        WARD_FIELD,
        OBSERVED_FIELD,
        GEO_FIELD,
        { name: 'category_code', type: 'enum', nullable: false, description: t('Grievance category from the published catalogue.') },
        { name: 'channel', type: 'enum', nullable: false, description: t('Helpline · portal · mobile · walk-in.') },
        { name: 'closed_at', type: 'timestamp', nullable: true, description: t('Instant the complaint was closed, where it has been.') },
      ],
    },
    {
      id: 'ds-social-signals',
      name: t('Public Social Signal Digest'),
      category: 'external-feed',
      ownerDepartmentId: 'dept-commissioner',
      domain: 'citizen-services',
      classification: 'public',
      format: 'json-api',
      frequency: 'hourly',
      volume: 'medium',
      enabled: false,
      purpose: t('Surface locality-level public sentiment as a corroborating signal only, never as a primary basis for action.'),
      retentionDays: 180,
      slaMinutes: 240,
      endpointLabel: 'api: external.social-digest.v1',
      downstream: [t('Hyperlocal signal corroboration'), t('Emerging issue detection')],
      notes: t('Paused. A public-sentiment feed is corroboration, not evidence: nothing derived from it may raise an alert on its own, and the governance position on ingesting it at all has not been settled.'),
      schema: [
        ID_FIELD,
        WARD_FIELD,
        OBSERVED_FIELD,
        { name: 'topic_code', type: 'enum', nullable: false, description: t('Classified topic from the published taxonomy.') },
        { name: 'mention_count', type: 'integer', nullable: false, description: t('Aggregate mention count in the interval.') },
        { name: 'sentiment_band', type: 'enum', nullable: true, description: t('Banded sentiment. No individual post is retained.') },
      ],
    },

    /* ---- Property, revenue and finance ------------------------------------- */
    {
      id: 'ds-property-register',
      name: t('Property Assessment Register'),
      category: 'departmental-system',
      ownerDepartmentId: 'dept-assessment',
      domain: 'property',
      classification: 'confidential',
      format: 'db-replica',
      frequency: 'daily',
      volume: 'high',
      enabled: true,
      purpose: t('Hold the assessment base against which every property tax and reassessment figure is computed.'),
      retentionDays: 7300,
      slaMinutes: 1440,
      endpointLabel: 'replica: ac.assessment.readonly',
      downstream: [t('Assessment base'), t('Reassessment candidates'), t('Capital value distribution'), t('Property intelligence')],
      notes: t('Owner name is ingested because assessment is a named liability, and is classified confidential accordingly. It is never surfaced in any aggregate view.'),
      schema: [
        ID_FIELD,
        WARD_FIELD,
        GEO_FIELD,
        { name: 'owner_name', type: 'string', nullable: false, description: t('Assessee of record.'), sensitive: true },
        { name: 'capital_value_inr', type: 'decimal', nullable: false, description: t('Assessed capital value.') },
        { name: 'usage_class', type: 'enum', nullable: false, description: t('Residential · commercial · industrial · institutional.') },
        { name: 'last_assessed_on', type: 'timestamp', nullable: true, description: t('Date of the last assessment.') },
      ],
    },
    {
      id: 'ds-tax-collection',
      name: t('Property Tax Collection Ledger'),
      category: 'departmental-system',
      ownerDepartmentId: 'dept-assessment',
      domain: 'revenue',
      classification: 'confidential',
      format: 'db-replica',
      frequency: 'daily',
      volume: 'high',
      enabled: true,
      purpose: t('Measure collection efficiency and arrears position by ward and assessment band.'),
      retentionDays: 3650,
      slaMinutes: 1440,
      endpointLabel: 'replica: ac.collection-ledger.readonly',
      downstream: [t('Collection efficiency'), t('Arrears ageing'), t('Reconciliation candidates'), t('Revenue intelligence')],
      notes: t('An arrears figure is a reconciliation signal, not an allegation. Nothing derived from this feed asserts evasion.'),
      schema: [
        ID_FIELD,
        WARD_FIELD,
        OBSERVED_FIELD,
        { name: 'demand_inr', type: 'decimal', nullable: false, description: t('Demand raised for the period.') },
        { name: 'collected_inr', type: 'decimal', nullable: false, description: t('Amount collected against the demand.') },
        { name: 'arrears_days', type: 'integer', nullable: true, description: t('Age of the outstanding balance.') },
      ],
    },
    {
      id: 'ds-financial-ledger',
      name: t('Financial Management System Ledger'),
      category: 'departmental-system',
      ownerDepartmentId: 'dept-finance',
      domain: 'budget',
      classification: 'confidential',
      format: 'db-replica',
      frequency: 'daily',
      volume: 'high',
      enabled: true,
      purpose: t('Provide the expenditure and commitment position behind every budget utilisation and variance figure.'),
      retentionDays: 7300,
      slaMinutes: 1440,
      endpointLabel: 'replica: fin.fms-ledger.readonly',
      downstream: [t('Budget utilisation'), t('Expenditure variance'), t('Financial Health Index'), t('Financial intelligence')],
      schema: [
        ID_FIELD,
        OBSERVED_FIELD,
        { name: 'budget_head', type: 'string', nullable: false, description: t('Budget head the entry posts against.') },
        { name: 'department_code', type: 'enum', nullable: false, description: t('Owning department.') },
        { name: 'amount_inr', type: 'decimal', nullable: false, description: t('Posted amount.') },
        { name: 'entry_type', type: 'enum', nullable: false, description: t('Allocation · commitment · expenditure · release.') },
      ],
    },
    {
      id: 'ds-octroi-lbt',
      name: t('Grant & Compensation Receipts'),
      category: 'departmental-system',
      ownerDepartmentId: 'dept-finance',
      domain: 'revenue',
      classification: 'confidential',
      format: 'csv-sftp',
      frequency: 'weekly',
      volume: 'low',
      enabled: true,
      purpose: t('Track state compensation and grant receipts, the corporation’s largest single revenue dependency.'),
      retentionDays: 3650,
      slaMinutes: 20_160,
      endpointLabel: 'sftp: fin/receipts/grants/',
      downstream: [t('Revenue mix'), t('Grant dependency ratio'), t('Financial Health Index')],
      schema: [
        ID_FIELD,
        OBSERVED_FIELD,
        { name: 'receipt_head', type: 'string', nullable: false, description: t('Receipt classification.') },
        { name: 'amount_inr', type: 'decimal', nullable: false, description: t('Amount received.') },
        { name: 'source_authority', type: 'enum', nullable: false, description: t('Remitting authority.') },
      ],
    },

    /* ---- Procurement, projects and contractors ------------------------------ */
    {
      id: 'ds-tender-portal',
      name: t('e-Tendering & Contract Award Portal'),
      category: 'departmental-system',
      ownerDepartmentId: 'dept-procurement',
      domain: 'procurement',
      classification: 'confidential',
      format: 'json-api',
      frequency: 'daily',
      volume: 'medium',
      enabled: true,
      purpose: t('Hold the contract record behind every concentration, extension and delivery-risk indicator.'),
      retentionDays: 7300,
      slaMinutes: 1440,
      endpointLabel: 'api: proc.tender-portal.v4',
      downstream: [t('Category concentration'), t('Extension frequency'), t('Contractor delivery standing'), t('Procurement intelligence')],
      notes: t('A concentration or extension pattern is an anomaly requiring reconciliation, never an assertion of impropriety. Nothing derived from this feed names a wrongdoing.'),
      schema: [
        ID_FIELD,
        OBSERVED_FIELD,
        { name: 'contract_reference', type: 'string', nullable: false, description: t('Contract reference number.') },
        { name: 'vendor_code', type: 'string', nullable: false, description: t('Empanelled vendor identifier.') },
        { name: 'awarded_value_inr', type: 'decimal', nullable: false, description: t('Value at award.') },
        { name: 'category_code', type: 'enum', nullable: false, description: t('Procurement category.') },
        { name: 'extension_count', type: 'integer', nullable: true, description: t('Recorded extensions to date.') },
      ],
    },
    {
      id: 'ds-project-milestones',
      name: t('Capital Project Milestone Tracker'),
      category: 'departmental-system',
      ownerDepartmentId: 'dept-projects',
      domain: 'projects',
      classification: 'internal',
      format: 'json-api',
      frequency: 'daily',
      volume: 'medium',
      enabled: true,
      purpose: t('Feed the explainable project risk engine with milestone slippage and physical progress.'),
      retentionDays: 3650,
      slaMinutes: 1440,
      endpointLabel: 'api: proj.milestones.v2',
      downstream: [t('Project risk score'), t('Physical vs financial progress'), t('Delivery slippage'), t('Project intelligence')],
      schema: [
        ID_FIELD,
        WARD_FIELD,
        OBSERVED_FIELD,
        { name: 'project_code', type: 'string', nullable: false, description: t('Capital project identifier.') },
        { name: 'milestone_code', type: 'string', nullable: false, description: t('Milestone within the project plan.') },
        { name: 'planned_on', type: 'timestamp', nullable: false, description: t('Planned completion date.') },
        { name: 'actual_on', type: 'timestamp', nullable: true, description: t('Actual completion date, where reached.') },
        { name: 'physical_progress_pct', type: 'decimal', nullable: true, description: t('Certified physical progress.') },
      ],
    },

    /* ---- Buildings and planning --------------------------------------------- */
    {
      id: 'ds-building-permits',
      name: t('Building Proposal & Permits'),
      category: 'departmental-system',
      ownerDepartmentId: 'dept-building',
      domain: 'buildings',
      classification: 'internal',
      format: 'db-replica',
      frequency: 'daily',
      volume: 'medium',
      enabled: true,
      purpose: t('Track development control approvals, occupation certificates and the permission pipeline.'),
      retentionDays: 7300,
      slaMinutes: 1440,
      endpointLabel: 'replica: bp.proposals.readonly',
      downstream: [t('Permission pipeline'), t('Approval cycle time'), t('Development pressure'), t('Building intelligence')],
      schema: [
        ID_FIELD,
        WARD_FIELD,
        GEO_FIELD,
        { name: 'proposal_reference', type: 'string', nullable: false, description: t('Building proposal reference.') },
        { name: 'stage', type: 'enum', nullable: false, description: t('Stage in the approval pipeline.') },
        { name: 'built_up_area_sqm', type: 'decimal', nullable: true, description: t('Proposed built-up area.') },
      ],
    },
    {
      id: 'ds-structural-audit',
      name: t('Structural Audit & Dilapidation Register'),
      category: 'departmental-system',
      ownerDepartmentId: 'dept-building',
      domain: 'buildings',
      classification: 'internal',
      format: 'csv-sftp',
      frequency: 'weekly',
      volume: 'low',
      enabled: true,
      purpose: t('Maintain the dilapidated-building register and drive pre-monsoon structural notices.'),
      retentionDays: 7300,
      slaMinutes: 20_160,
      endpointLabel: 'sftp: bp/structural-audits/',
      downstream: [t('Dilapidated building register'), t('Pre-monsoon notice compliance'), t('Building intelligence')],
      schema: [
        ID_FIELD,
        WARD_FIELD,
        GEO_FIELD,
        { name: 'building_reference', type: 'string', nullable: false, description: t('Building identifier.') },
        { name: 'audit_category', type: 'enum', nullable: false, description: t('C1 · C2A · C2B · C3 dilapidation category.') },
        { name: 'audited_on', type: 'timestamp', nullable: true, description: t('Date of the structural audit.') },
      ],
    },
    {
      id: 'ds-ward-gis',
      name: t('Ward & Zone GIS Base Layer'),
      category: 'geospatial',
      ownerDepartmentId: 'dept-planning',
      domain: 'planning',
      classification: 'internal',
      format: 'json-api',
      frequency: 'weekly',
      volume: 'low',
      enabled: true,
      purpose: t('Provide the administrative boundary layer every ward-scoped figure and map in the platform resolves against.'),
      retentionDays: 7300,
      slaMinutes: 20_160,
      endpointLabel: 'api: plan.gis-base.v1',
      downstream: [t('Ward boundaries'), t('Zone rollups'), t('Every ward-scoped metric'), t('Digital twin base layer')],
      notes: t('Ward names and counts in this environment are {0}\'s own published administrative divisions; the polygons are authored for demonstration and are deliberately not surveyed GIS. Every map that draws them says so.', corp.shortName),
      schema: [
        ID_FIELD,
        WARD_FIELD,
        { name: 'zone_code', type: 'enum', nullable: false, description: t('Parent administrative zone.') },
        { name: 'boundary', type: 'string', nullable: false, description: t('Polygon geometry for the administrative unit.') },
        { name: 'area_sqkm', type: 'decimal', nullable: false, description: t('Administrative area.') },
      ],
    },
    {
      id: 'ds-land-use',
      name: t('Development Plan Land Use Layer'),
      category: 'geospatial',
      ownerDepartmentId: 'dept-planning',
      domain: 'planning',
      classification: 'internal',
      format: 'csv-sftp',
      frequency: 'weekly',
      volume: 'low',
      enabled: true,
      purpose: t('Compare sanctioned land use against realised development to locate infrastructure adequacy gaps.'),
      retentionDays: 7300,
      slaMinutes: 20_160,
      endpointLabel: 'sftp: plan/dp-landuse/',
      downstream: [t('Land use distribution'), t('Infrastructure adequacy'), t('Service gap analysis'), t('Urban planning')],
      schema: [
        ID_FIELD,
        WARD_FIELD,
        { name: 'reservation_code', type: 'enum', nullable: false, description: t('Development plan reservation classification.') },
        { name: 'area_sqm', type: 'decimal', nullable: false, description: t('Reserved area.') },
        { name: 'realised', type: 'boolean', nullable: false, description: t('Whether the reservation has been realised on the ground.') },
      ],
    },

    /* ---- Workforce, platform and governance --------------------------------- */
    {
      id: 'ds-hr-establishment',
      name: t('Establishment & Attendance System'),
      category: 'departmental-system',
      ownerDepartmentId: 'dept-personnel',
      domain: 'workforce',
      classification: 'restricted',
      format: 'db-replica',
      frequency: 'daily',
      volume: 'medium',
      enabled: true,
      purpose: t('Report cadre strength, vacancy and deployment pressure at department and ward level.'),
      retentionDays: 3650,
      slaMinutes: 1440,
      endpointLabel: 'replica: per.establishment.readonly',
      downstream: [t('Cadre strength'), t('Vacancy rate'), t('Workload pressure index'), t('Workforce intelligence')],
      notes: t('Restricted, and aggregated at ingest: the platform holds post-level counts, never an individual employee record. No figure derived from this feed can be attributed to a named member of staff.'),
      schema: [
        ID_FIELD,
        { name: 'department_code', type: 'enum', nullable: false, description: t('Owning department.') },
        { name: 'cadre_code', type: 'enum', nullable: false, description: t('Cadre or grade classification.') },
        { name: 'sanctioned_posts', type: 'integer', nullable: false, description: t('Sanctioned establishment.') },
        { name: 'filled_posts', type: 'integer', nullable: false, description: t('Posts filled at the reporting date.') },
        { name: 'attendance_pct', type: 'decimal', nullable: true, description: t('Aggregate attendance, never individual.'), sensitive: true },
      ],
    },
    {
      id: 'ds-identity-directory',
      name: t('Municipal Identity Directory'),
      category: 'departmental-system',
      ownerDepartmentId: 'dept-security',
      domain: 'security',
      classification: 'restricted',
      format: 'json-api',
      frequency: 'hourly',
      volume: 'low',
      enabled: true,
      purpose: t('Resolve principals, roles and multi-factor posture for the access governance and security surfaces.'),
      retentionDays: 2555,
      slaMinutes: 120,
      endpointLabel: 'api: sec.identity-directory.v2',
      downstream: [t('MFA coverage'), t('Privileged account register'), t('Access governance'), t('Security posture')],
      notes: t('In a production deployment this is the federated institutional identity provider. In this environment it resolves the fourteen demonstration principals and nothing else.'),
      schema: [
        ID_FIELD,
        { name: 'principal_id', type: 'string', nullable: false, description: t('Directory principal identifier.'), sensitive: true },
        { name: 'role_code', type: 'enum', nullable: false, description: t('Assigned institutional role.') },
        { name: 'mfa_enrolled', type: 'boolean', nullable: false, description: t('Whether multi-factor authentication is enrolled.') },
        { name: 'status', type: 'enum', nullable: false, description: t('Active · suspended · pending review.') },
      ],
    },
    {
      id: 'ds-platform-telemetry',
      name: t('Platform Service Telemetry'),
      category: 'sensor-network',
      ownerDepartmentId: 'dept-it',
      domain: 'platform',
      classification: 'internal',
      format: 'event-stream',
      frequency: 'realtime',
      volume: 'high',
      enabled: true,
      purpose: t('Report availability, latency and error rate for every platform service on the Platform Health surface.'),
      retentionDays: 365,
      slaMinutes: 5,
      endpointLabel: 'stream: it.platform-telemetry.v1',
      downstream: [t('Service availability'), t('p95 latency'), t('Pipeline job outcomes'), t('Platform health')],
      schema: [
        ID_FIELD,
        OBSERVED_FIELD,
        { name: 'service_code', type: 'string', nullable: false, description: t('Platform service identifier.') },
        { name: 'availability_pct', type: 'decimal', nullable: false, description: t('Availability over the reporting interval.') },
        { name: 'p95_latency_ms', type: 'integer', nullable: false, description: t('Ninety-fifth percentile latency.') },
        { name: 'error_rate_pct', type: 'decimal', nullable: false, description: t('Share of requests returning an error.') },
      ],
    },
    {
      id: 'ds-ai-gateway-log',
      name: t('AI Gateway Request Log'),
      category: 'departmental-system',
      ownerDepartmentId: 'dept-ai-governance',
      domain: 'ai-governance',
      classification: 'confidential',
      format: 'event-stream',
      frequency: 'realtime',
      volume: 'medium',
      enabled: true,
      purpose: t('Record every AI request with its model, prompt template, confidence and human oversight outcome.'),
      retentionDays: 2555,
      slaMinutes: 10,
      endpointLabel: 'stream: aig.request-log.v1',
      downstream: [t('AI request register'), t('Oversight acceptance rate'), t('Reserved-act block count'), t('AI governance')],
      notes: t('Includes every request the gateway *blocked* before generation. A refusal is part of the record, not an absence from it.'),
      schema: [
        ID_FIELD,
        OBSERVED_FIELD,
        { name: 'model_code', type: 'enum', nullable: false, description: t('Model the request was routed to, or blocked before.') },
        { name: 'prompt_template', type: 'string', nullable: true, description: t('Approved prompt template applied.') },
        { name: 'confidence', type: 'decimal', nullable: true, description: t('Stated confidence of the output.') },
        { name: 'gateway_outcome', type: 'enum', nullable: false, description: t('Generated · blocked-reserved-act · blocked-scope · error.') },
      ],
    },
    {
      id: 'ds-disaster-eoc',
      name: t('Emergency Operations Centre Log'),
      category: 'departmental-system',
      ownerDepartmentId: 'dept-disaster',
      domain: 'disaster',
      classification: 'confidential',
      format: 'webhook',
      frequency: 'realtime',
      volume: 'medium',
      enabled: true,
      purpose: t('Carry the multi-agency incident record that the Situation Room and incident lifecycle are built on.'),
      retentionDays: 3650,
      slaMinutes: 10,
      endpointLabel: 'webhook: dm.eoc-events',
      downstream: [t('Active incident register'), t('Multi-agency coordination log'), t('Situation Room'), t('Disaster intelligence')],
      schema: [
        ID_FIELD,
        WARD_FIELD,
        OBSERVED_FIELD,
        GEO_FIELD,
        { name: 'incident_type', type: 'enum', nullable: false, description: t('Incident classification.') },
        { name: 'severity', type: 'enum', nullable: false, description: t('Assessed severity at the time of the entry.') },
        { name: 'agencies_engaged', type: 'integer', nullable: true, description: t('Count of agencies engaged on the incident.') },
      ],
    },
    {
      id: 'ds-census-projection',
      name: t('Census & Population Projection'),
      category: 'public-registry',
      ownerDepartmentId: 'dept-planning',
      domain: 'planning',
      classification: 'public',
      format: 'csv-sftp',
      frequency: 'weekly',
      volume: 'low',
      enabled: true,
      purpose: t('Provide the denominator for every per-capita figure the platform publishes.'),
      retentionDays: 7300,
      slaMinutes: 20_160,
      endpointLabel: 'sftp: plan/census-projection/',
      downstream: [t('Population by ward'), t('Per capita service levels'), t('Density pressure'), t('Urban planning')],
      notes: t('A projection, and labelled as one everywhere it is used. Per-capita figures inherit the projection’s uncertainty and are never presented as measured.'),
      schema: [
        ID_FIELD,
        WARD_FIELD,
        { name: 'projection_year', type: 'integer', nullable: false, description: t('Year the projection applies to.') },
        { name: 'population', type: 'integer', nullable: false, description: t('Projected resident population.') },
        { name: 'households', type: 'integer', nullable: true, description: t('Projected households.') },
      ],
    },
  ]
}

/** Record-count bands, as written for Brihanmumbai. Scaled by `volumeRange`. */
const VOLUME_BANDS: Record<Spec['volume'], [number, number]> = {
  low: [1_200, 48_000],
  medium: [60_000, 640_000],
  high: [820_000, 9_400_000],
}

/**
 * Which corporation dimension a feed's record count tracks. A citizen channel
 * fills up with residents, a sensor grid and a spatial layer with ground
 * covered, a ledger and a contract register with the size of the programme
 * being spent. Reading that off the domain the spec already declares keeps the
 * register honest without asking forty specs to restate what they are.
 */
function volumeRatio(domain: IntelligenceDomain): number {
  switch (domain) {
    case 'budget':
    case 'procurement':
    case 'projects':
      return CITY_SCALE.budget
    case 'stormwater':
    case 'monsoon':
    case 'coastal':
    case 'roads':
    case 'mobility':
    case 'assets':
    case 'environment':
    case 'planning':
    case 'buildings':
      return CITY_SCALE.area
    default:
      return CITY_SCALE.population
  }
}

/**
 * The scaled band a feed's record count is drawn from. The floors matter: an
 * ingestion register whose counts round to nothing reads as a broken pipeline
 * rather than as a small corporation, and the operator cannot tell the two
 * apart from the screen.
 */
function volumeRange(spec: Spec): [number, number] {
  const [lo, hi] = VOLUME_BANDS[spec.volume]
  const ratio = volumeRatio(spec.domain)
  return [scaledCount(lo, ratio, 120), scaledCount(hi, ratio, 4_000)]
}

/** Maximum plausible age of the last sync, per cadence, in minutes. */
const MAX_SYNC_AGE_MIN: Record<SyncFrequency, number> = {
  realtime: 4,
  '5-min': 12,
  hourly: 90,
  daily: 1_600,
  weekly: 9_000,
}

/** Minutes between successive runs, used to space the simulated history. */
const RUN_INTERVAL_MIN: Record<SyncFrequency, number> = {
  realtime: 5,
  '5-min': 5,
  hourly: 60,
  daily: 1_440,
  weekly: 10_080,
}

function build$RUN_NOTE(): Record<SyncOutcome, string[]> {
  return {
  succeeded: [
    t('Completed within the freshness expectation.'),
    t('All declared fields present; no schema drift observed.'),
    t('Batch validated against the canonical ward register.'),
  ],
  partial: [
    t('Some records rejected on validation; the rest were ingested.'),
    t('A subset of reporting points did not respond within the window.'),
    t('Schema drift on one optional field; affected records held back.'),
  ],
  failed: [
    t('Simulated upstream timeout; no records ingested for this run.'),
    t('Authentication to the simulated endpoint did not complete.'),
    t('Payload failed schema validation in full and was rejected.'),
  ],
  skipped: [t('Source paused by an operator; the scheduled run did not execute.')],
}
}
let RUN_NOTE: Record<SyncOutcome, string[]> = build$RUN_NOTE()
registerLayer(() => {
  RUN_NOTE = build$RUN_NOTE()
})

/** Builds the five quality dimensions; the headline score is their mean. */
function buildQuality(spec: Spec, r: ReturnType<typeof det>): DataSourceQuality {
  // Real-time streams lose completeness to dropout; batch feeds lose
  // timeliness to their cadence. Modelling that difference is what stops the
  // register reading as one uniform number wearing five labels.
  const isStream = spec.frequency === 'realtime' || spec.frequency === '5-min'
  return {
    completeness: isStream ? r.int(82, 97) : r.int(90, 100),
    validity: r.int(88, 100),
    timeliness: isStream ? r.int(90, 100) : r.int(74, 96),
    uniqueness: r.int(93, 100),
    consistency: r.int(85, 99),
  }
}

function meanQuality(q: DataSourceQuality): number {
  return Math.round((q.completeness + q.validity + q.timeliness + q.uniqueness + q.consistency) / 5)
}

function buildSyncHistory(spec: Spec, r: ReturnType<typeof det>, recordsIngested: number): DataSourceSyncRun[] {
  const interval = RUN_INTERVAL_MIN[spec.frequency]
  const runs: DataSourceSyncRun[] = []
  const perRun = Math.max(1, Math.round(recordsIngested / 260))

  for (let i = 0; i < 12; i += 1) {
    const outcome: SyncOutcome = !spec.enabled && i === 0
      ? 'skipped'
      : r.weighted<SyncOutcome>([
          ['succeeded', 82],
          ['partial', 12],
          ['failed', 5],
          ['skipped', 1],
        ])
    const ingested = outcome === 'failed' || outcome === 'skipped' ? 0 : Math.round(perRun * r.float(0.7, 1.3))
    const rejected = outcome === 'partial' ? Math.round(ingested * r.float(0.04, 0.16)) : outcome === 'succeeded' ? Math.round(ingested * r.float(0, 0.01)) : 0
    runs.push({
      id: `${spec.id}-run-${i}`,
      startedAt: isoFromAnchor(-(i * interval + r.int(1, Math.max(2, Math.floor(interval / 4))))),
      durationSeconds: r.int(4, spec.volume === 'high' ? 320 : 90),
      outcome,
      recordsIngested: ingested,
      recordsRejected: rejected,
      note: r.pick(RUN_NOTE[outcome]),
    })
  }
  return runs
}

function buildIncidents(spec: Spec, r: ReturnType<typeof det>, quality: DataSourceQuality): DataSourceIncident[] {
  const incidents: DataSourceIncident[] = []
  const count = quality.completeness < 88 || quality.timeliness < 82 ? r.int(1, 3) : r.int(0, 1)
  const summaries: Array<[string, Severity]> = [
    [t('Reporting points dropped out of the feed for an extended window; the gap is visible in the record rather than interpolated.'), 'medium'],
    [t('Schema drift on an optional field; affected records were held back pending an adapter change.'), 'low'],
    [t('Ingestion latency exceeded the declared freshness expectation across consecutive runs.'), 'medium'],
    [t('Duplicate records arrived on the declared natural key; the duplicates were rejected, not merged.'), 'low'],
    [t('Upstream simulated endpoint refused authentication for a full cadence period.'), 'high'],
  ]
  for (let i = 0; i < count; i += 1) {
    const [summary, severity] = r.pick(summaries)
    incidents.push({
      id: `${spec.id}-inc-${i}`,
      at: isoFromAnchor(-r.int(240, 40_000)),
      severity,
      summary,
      resolved: r.chance(0.7),
    })
  }
  return incidents.sort((a, b) => (a.at < b.at ? 1 : -1))
}

function build(spec: Spec): DataSource {
  const r = det(`data-source:${spec.id}`)
  const [lo, hi] = volumeRange(spec)
  const quality = buildQuality(spec, r)
  const qualityScore = meanQuality(quality)
  const recordsIngested = r.int(lo, hi)

  let status: DataSourceStatus
  if (!spec.enabled) {
    status = 'paused'
  } else if (qualityScore < 88) {
    status = r.chance(0.5) ? 'degraded' : 'stale'
  } else {
    status = r.chance(0.86) ? 'healthy' : 'degraded'
  }

  const lastSyncAt = isoFromAnchor(-r.int(1, MAX_SYNC_AGE_MIN[spec.frequency]))

  return {
    id: spec.id,
    name: spec.name,
    category: spec.category,
    ownerDepartmentId: spec.ownerDepartmentId,
    ownerOfficerId: `off-head-${spec.ownerDepartmentId}`,
    domain: spec.domain,
    classification: spec.classification,
    format: spec.format,
    frequency: spec.frequency,
    enabled: spec.enabled,
    status,
    lastSyncAt,
    recordsIngested,
    qualityScore,
    latencyMs: r.int(28, 940),
    purpose: spec.purpose,
    personalData: spec.schema.some((f) => f.sensitive),
    retentionDays: spec.retentionDays,
    slaMinutes: spec.slaMinutes,
    endpointLabel: spec.endpointLabel,
    schema: spec.schema,
    quality,
    syncHistory: buildSyncHistory(spec, r, recordsIngested),
    incidents: buildIncidents(spec, r, quality),
    downstream: spec.downstream,
    notes: spec.notes,
  }
}

/** Live binding - rebuilt on every corporation switch. */
export let DATA_SOURCES: DataSource[] = []

registerLayer(() => {
  DATA_SOURCES = specs().map(build)
})
