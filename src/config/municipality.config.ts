import type { IntelligenceDomain } from '@/types/common'
import { getActiveCorporationId, registerLayer } from '@/data/runtime'
import {
  CORPORATIONS,
  cityName,
  corporationById,
  corporationName,
  resolveWardCount,
  resolveZoneCount,
  type CorporationRef,
} from './corporations'
import { t } from '@/i18n'

/**
 * Municipal configuration. The Urban Intelligence Core is deployment-neutral;
 * everything corporation-specific is derived here from the real reference
 * roster in `./corporations.ts`, so the same platform serves Brihanmumbai,
 * Pune, Nagpur, Thane, Nashik, Pimpri-Chinchwad or any other municipal
 * corporation in Maharashtra with separate institutional governance, security
 * and data boundaries.
 *
 * `municipality` and `TENANT_ID` are LIVE BINDINGS, rebuilt whenever the
 * operator switches corporation (`src/data/runtime.ts`). Read them at render
 * time - never destructure either at module scope, or the value freezes to
 * whichever corporation happened to be active when the module first evaluated.
 */

export interface AdministrativeUnitTerminology {
  /** e.g. "Ward" for BMC, "Prabhag" elsewhere. */
  primaryUnitSingular: string
  primaryUnitPlural: string
  secondaryUnitSingular: string
  secondaryUnitPlural: string
  executiveTitle: string
  fieldOfficerTitle: string
}

export interface MapConfiguration {
  /** Normalised map viewport. Geometry is illustrative, never surveyed GIS. */
  viewBoxWidth: number
  viewBoxHeight: number
  centre: { lat: number; lng: number }
  /** Statement shown on every spatial surface. */
  provenanceStatement: string
}

export interface BrandingConfiguration {
  productFamily: string
  productName: string
  /** Product name without the tenant prefix - used where space is tight. */
  productShortName: string
  /**
   * The institutional panel colour: the page identity banner and the sign-in
   * panel. Held here rather than as a stylesheet token because it is a fixed
   * brand value, not a theme value that should drift with the token palette.
   */
  panelColor: string
  productSubtitle: string
  deploymentLine: string
  markPath: string
  /** Primary institutional accent used by the shell. */
  accent: 'govt' | 'intel'
}

export interface MunicipalityConfig {
  tenantId: string
  municipalityName: string
  shortName: string
  state: string
  country: string
  branding: BrandingConfiguration
  terminology: AdministrativeUnitTerminology
  administrativeUnits: {
    zones: number
    wards: number
  }
  /** Financial year label format used across finance modules. */
  financialYear: string
  currencyUnitLabel: string
  /** Modules enabled for this deployment. */
  enabledModules: IntelligenceDomain[]
  /** Platform capabilities that can be toggled per deployment. */
  featureFlags: FeatureFlag[]
  mapConfiguration: MapConfiguration
  /** Environment banner text. Never claims production or certification. */
  environmentLabel: string
  dataProvenanceStatement: string
}

export type FeatureFlagStage = 'ga' | 'beta' | 'experimental' | 'planned'

export interface FeatureFlag {
  id: string
  label: string
  description: string
  enabled: boolean
  stage: FeatureFlagStage
  /** The area of the platform this flag governs. */
  category: 'ai' | 'intelligence' | 'governance' | 'integration' | 'experience'
  /** Where the capability is only demonstrated, not production-ready. */
  demonstrationOnly: boolean
}

/**
 * Platform capabilities. These are properties of the Urban Intelligence Core
 * rather than of any one corporation, so every deployment is offered the same
 * set and the same honest stage labels.
 */
function build$PLATFORM_FEATURE_FLAGS(): FeatureFlag[] {
  return [
  {
    id: 'ff-copilot',
    label: t('Municipal Copilot'),
    description: t('The governed, evidence-backed conversational assistant.'),
    enabled: true,
    stage: 'beta',
    category: 'ai',
    demonstrationOnly: true,
  },
  {
    id: 'ff-agent-workflows',
    label: t('Agent workflows'),
    description: t('Multi-step agent sequences with mandatory human checkpoints.'),
    enabled: true,
    stage: 'beta',
    category: 'ai',
    demonstrationOnly: true,
  },
  {
    id: 'ff-scenario-studio',
    label: t('Scenario intelligence studio'),
    description: t('Interactive what-if simulation across monsoon, budget and planning.'),
    enabled: true,
    stage: 'ga',
    category: 'intelligence',
    demonstrationOnly: false,
  },
  {
    id: 'ff-digital-twin',
    label: t('Illustrative digital twin'),
    description: t('Layered spatial view of wards, assets, incidents and risk.'),
    enabled: true,
    stage: 'experimental',
    category: 'experience',
    demonstrationOnly: true,
  },
  {
    id: 'ff-hyperlocal',
    label: t('Hyperlocal intelligence'),
    description: t('Locality-level signal stacking below the ward.'),
    enabled: true,
    stage: 'beta',
    category: 'intelligence',
    demonstrationOnly: false,
  },
  {
    id: 'ff-infra-graph',
    label: t('City infrastructure graph'),
    description: t('Accountability-chain tracing from any infrastructure anchor.'),
    enabled: true,
    stage: 'beta',
    category: 'intelligence',
    demonstrationOnly: false,
  },
  {
    id: 'ff-multi-corporation',
    label: t('Multi-corporation deployment'),
    description:
      t('Switch the active municipal corporation and rebuild every intelligence layer against its own published reference data.'),
    enabled: true,
    stage: 'beta',
    category: 'integration',
    demonstrationOnly: true,
  },
  {
    id: 'ff-live-connectors',
    label: t('Live source connectors'),
    description: t('Replace demonstration adapters with authoritative municipal feeds.'),
    enabled: false,
    stage: 'planned',
    category: 'integration',
    demonstrationOnly: false,
  },
  {
    id: 'ff-sovereign-model',
    label: t('Sovereign model routing'),
    description: t('Route AI requests to an approved sovereign or on-premise model.'),
    enabled: false,
    stage: 'planned',
    category: 'ai',
    demonstrationOnly: false,
  },
  {
    id: 'ff-mfa-enforcement',
    label: t('Enforced multi-factor authentication'),
    description: t('Institutional identity provider with mandatory MFA at sign-in.'),
    enabled: false,
    stage: 'planned',
    category: 'governance',
    demonstrationOnly: false,
  },
  {
    id: 'ff-external-sharing',
    label: t('Governed inter-agency sharing'),
    description: t('Controlled data sharing to state and national intelligence tiers.'),
    enabled: false,
    stage: 'planned',
    category: 'governance',
    demonstrationOnly: false,
  },
]
}
export let PLATFORM_FEATURE_FLAGS: FeatureFlag[] = build$PLATFORM_FEATURE_FLAGS()
registerLayer(() => {
  PLATFORM_FEATURE_FLAGS = build$PLATFORM_FEATURE_FLAGS()
})

/**
 * Domains every municipal corporation runs. Coastal zone management is added
 * only where the corporation actually has a shoreline or a tidal creek to
 * manage - a landlocked corporation with a mangrove programme would be an
 * obvious fabrication, and the platform would deserve to lose the room over it.
 */
const UNIVERSAL_MODULES: IntelligenceDomain[] = [
  'executive',
  'wards',
  'water',
  'sewerage',
  'stormwater',
  'monsoon',
  'waste',
  'roads',
  'mobility',
  'health',
  'hospitals',
  'citizen-services',
  'emergency',
  'disaster',
  'property',
  'revenue',
  'budget',
  'procurement',
  'projects',
  'buildings',
  'environment',
  'planning',
  'assets',
  'workforce',
  'security',
  'ai-governance',
  'platform',
  // Obligatory services under the Twelfth Schedule and the Maharashtra
  // Municipal Corporation Act, 1949. Every corporation runs all of them, so
  // none is optional per deployment.
  'education',
  'housing',
  'street-lighting',
  'licensing',
  'registration',
  'gardens',
  'council',
  'legal',
  'enforcement',
  'correspondence',
  'heritage',
  'civic-participation',
]

/** True where the corporation has a sea shoreline or a tidal creek frontage. */
export function hasCoastalJurisdiction(corp: CorporationRef): boolean {
  return corp.form.type === 'coastal' || corp.form.type === 'creek-side'
}

function enabledModulesFor(corp: CorporationRef): IntelligenceDomain[] {
  return hasCoastalJurisdiction(corp) ? [...UNIVERSAL_MODULES, 'coastal'] : [...UNIVERSAL_MODULES]
}

/** Derives the deployment configuration for one municipal corporation. */
export function buildMunicipalityConfig(corp: CorporationRef): MunicipalityConfig {
  // The unit an operator calls a ward or a zone is the corporation's own
  // terminology, so it is translated as a term rather than reworded.
  const unit = t(corp.wardTerminology)
  const tier = t(corp.zoneTerminology)
  const name = corporationName(corp)
  const city = cityName(corp)
  return {
    tenantId: corp.id,
    municipalityName: name,
    shortName: corp.shortName,
    state: t('Maharashtra'),
    country: t('India'),
    branding: {
      productFamily: t('BMC Intelligence Infrastructure'),
      productName: t('BMC Intelligence Infrastructure'),
      productShortName: t('BMC Intelligence Infrastructure'),
      panelColor: 'rgb(23 99 224 / 98%)',
      productSubtitle: t('Sovereign Urban Intelligence & Decision Infrastructure for {0}', city),
      deploymentLine: `${name} - ${city}`,
      markPath: '/bmc-headquarters.jpg',
      accent: 'govt',
    },
    terminology: {
      primaryUnitSingular: unit,
      /* Marathi does not form a plural by adding an 's'. Both forms are
         catalogue entries so each language can inflect the unit its own way -
         प्रभाग is both singular and plural, झोन takes झोन. */
      primaryUnitPlural: t(corp.wardTerminology.endsWith('s') ? corp.wardTerminology : `${corp.wardTerminology}s`),
      secondaryUnitSingular: tier,
      secondaryUnitPlural: t(corp.zoneTerminology.endsWith('s') ? corp.zoneTerminology : `${corp.zoneTerminology}s`),
      executiveTitle: t('Municipal Commissioner'),
      fieldOfficerTitle: t('{0} Officer', unit),
    },
    administrativeUnits: {
      zones: resolveZoneCount(corp),
      wards: resolveWardCount(corp),
    },
    financialYear: t('FY 2026-27'),
    currencyUnitLabel: t('₹ crore'),
    enabledModules: enabledModulesFor(corp),
    featureFlags: PLATFORM_FEATURE_FLAGS,
    mapConfiguration: {
      viewBoxWidth: 100,
      viewBoxHeight: 100,
      centre: corp.latLng,
      provenanceStatement:
        corp.id === 'bmc'
          ? t('Illustrative spatial representation. Boundaries are generated for demonstration and are not official GIS boundaries.')
          : t(
              'Illustrative spatial representation. {0} names and counts are {1}’s own published administrative divisions; the boundaries are a schematic tessellation generated for demonstration and are not official GIS boundaries.',
              unit,
              corp.shortName,
            ),
    },
    environmentLabel: t('Demonstration Environment'),
    dataProvenanceStatement: t(
      'Figures shown in this environment are modelled demonstration data built on {0}’s published reference statistics, and are not connected to live {0} departmental systems.',
      corp.shortName,
    ),
  }
}

/** ---------------------------------------------------------------------
 * The active deployment
 * ------------------------------------------------------------------- */

/** The municipal corporation every data layer is currently built for. */
export let activeCorporation: CorporationRef = corporationById(getActiveCorporationId())

/** The active configuration for this deployment. Live binding - see the file header. */
export let municipality: MunicipalityConfig = buildMunicipalityConfig(activeCorporation)

/** Convenience accessor used throughout the data services. Live binding. */
export let TENANT_ID: string = activeCorporation.id

/**
 * The first layer registered, and therefore the first rebuilt on a switch.
 * Every other layer reads the corporation through the three bindings above, so
 * this ordering is what makes the rest of the graph correct by construction.
 */
registerLayer(() => {
  activeCorporation = corporationById(getActiveCorporationId())
  municipality = buildMunicipalityConfig(activeCorporation)
  TENANT_ID = activeCorporation.id
})

/** Retained for compatibility: the Brihanmumbai deployment configuration. */
export const BMC_CONFIG: MunicipalityConfig = buildMunicipalityConfig(corporationById('bmc'))

/**
 * The full municipal corporation roster this build can be deployed against -
 * proof the core is not hardwired to Mumbai, and the source list behind the
 * corporation selector in the shell.
 */
export interface MunicipalityProfile
  extends Pick<MunicipalityConfig, 'tenantId' | 'municipalityName' | 'shortName' | 'state'> {
  wards: number
  population2011: number
  division: string
  status: 'active' | 'available'
}

/**
 * A function rather than a constant: `status` depends on which corporation is
 * active, and a module-scoped array would freeze that to whichever corporation
 * happened to be selected when this module first evaluated.
 */
export function municipalityProfiles(): MunicipalityProfile[] {
  return CORPORATIONS.map((corp) => ({
    tenantId: corp.id,
    municipalityName: corporationName(corp),
    shortName: corp.shortName,
    state: 'Maharashtra',
    division: corp.division,
    wards: resolveWardCount(corp),
    population2011: corp.population2011,
    status: corp.id === TENANT_ID ? 'active' : 'available',
  }))
}

/** The platform hierarchy rendered in the shell and the Trust Centre. */
export const PLATFORM_HIERARCHY = [
  { id: 'national', label: 'National Governance Intelligence', scope: 'Conceptual' },
  { id: 'state', label: 'Maha State Intelligence', scope: 'Conceptual' },
  { id: 'urban-core', label: 'Urban Intelligence Infrastructure', scope: 'Platform Core' },
  { id: 'municipal', label: 'BMC Intelligence', scope: 'This Deployment' },
  { id: 'department', label: 'Department Intelligence', scope: 'Active' },
  { id: 'ward', label: 'Ward Intelligence', scope: 'Active' },
  { id: 'zone', label: 'Zone Intelligence', scope: 'Active' },
  { id: 'asset', label: 'Asset / Project / Service Intelligence', scope: 'Active' },
] as const
