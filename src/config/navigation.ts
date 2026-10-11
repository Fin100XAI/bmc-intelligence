import type { LucideIcon } from 'lucide-react'
import {
  Activity,
  Layers,
  Library,
  Archive,
  AlertOctagon,
  AlertTriangle,
  Ambulance,
  Award,
  BadgeCheck,
  Banknote,
  BookMarked,
  Bot,
  Boxes,
  Brain,
  Building,
  Building2,
  Castle,
  CircleParking,
  CircuitBoard,
  ClipboardCheck,
  ClipboardList,
  Cloud,
  Coins,
  Compass,
  Cpu,
  Crosshair,
  Database,
  Droplets,
  Layers3,
  Megaphone,
  FileCheck2,
  FileSearch,
  FileStack,
  FileText,
  FlaskConical,
  Flame,
  Flower2,
  Gauge,
  Gavel,
  GitBranch,
  Globe2,
  GraduationCap,
  Hammer,
  HandCoins,
  Handshake,
  HardHat,
  Headset,
  Heart,
  HeartHandshake,
  Home,
  Hospital,
  KeyRound,
  LandPlot,
  Landmark,
  LayoutDashboard,
  LifeBuoy,
  Lightbulb,
  Link2,
  Lock,
  ListChecks,
  ListOrdered,
  Map,
  MapPinned,
  MessagesSquare,
  Network,
  PawPrint,
  Radar,
  Recycle,
  Route,
  Scale,
  Scale3d,
  ScrollText,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Siren,
  SlidersHorizontal,
  Sparkles,
  Sprout,
  Stamp,
  Store,
  Target,
  TestTube,
  TrafficCone,
  TrainFront,
  Trees,
  TrendingDown,
  Trophy,
  UploadCloud,
  Users,
  Users2,
  FileSignature,
  Wallet,
  Waves,
  Workflow,
} from 'lucide-react'
import type { IntelligenceDomain } from '@/types/common'
import type { ActionType, ResourceType } from '@/security/model'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/**
 * Route table and primary navigation.
 *
 * Navigation visibility is a presentation convenience. Access is enforced by
 * the permission engine on every route and every data service call - hiding a
 * link is never the control.
 */

export const ROUTES = {
  // Authentication.
  //
  // `/login` is the public portal - the corporation's front page, carrying the
  // officer sign-in panel. The previous sign-in screen is kept and stays
  // reachable at `/login/direct`: it is the faster way in for anyone
  // demonstrating the platform itself rather than the portal around it, and
  // retiring a working screen to a file nobody routes to is how it rots.
  login: '/login',
  loginDirect: '/login/direct',
  /**
   * The corporation's portal front page, reached AFTER sign-in.
   *
   * It used to be `/login` itself — a public front page whose every module tile
   * bounced an anonymous visitor to the sign-in screen. It now sits behind the
   * session: an officer signs in, arrives here, and enters the console from
   * whichever surface they came for. The tiles no longer gate anything, because
   * by the time they are on screen the principal is already established.
   */
  portal: '/portal',
  /**
   * The one genuinely public route in the platform - no session, no
   * `RequireAuth`, no `AppShell`. See `src/pages/public/TransparencyPortalPage.tsx`.
   */
  transparency: '/transparency',

  // Command
  executive: '/command/executive',
  cockpit: '/command/cockpit',
  cityIndex: '/command/city-index',
  situationRoom: '/command/situation-room',
  cityCommandMap: '/command/city-map',
  resolutionIntelligence: '/command/resolution-intelligence',
  intelligenceFeed: '/command/intelligence',
  decisions: '/command/decisions',
  myTasks: '/command/my-tasks',
  alerts: '/command/alerts',
  reports: '/command/reports',

  // City intelligence
  wards: '/city/wards',
  hyperlocal: '/city/hyperlocal',
  wardLeague: '/city/ward-league',
  wardEquity: '/city/ward-equity',
  wardTrajectory: '/city/ward-trajectory',
  wardCommitments: '/city/ward-commitments',
  wardPerformance: '/city/ward-performance',
  water: '/city/water',
  sewerage: '/city/sewerage',
  stormwater: '/city/stormwater',
  monsoon: '/city/monsoon',
  waste: '/city/waste',
  roads: '/city/roads',
  traffic: '/city/traffic',
  citizenServices: '/city/citizen-services',
  health: '/city/health',
  hospitals: '/city/hospitals',
  emergency: '/city/emergency',
  disaster: '/city/disaster',
  environment: '/city/environment',
  coastal: '/city/coastal',
  education: '/city/education',
  housing: '/city/housing',
  streetLighting: '/city/street-lighting',
  gardens: '/city/gardens',
  registration: '/city/registration',
  deathcare: '/city/deathcare',
  markets: '/city/markets',
  animalWelfare: '/city/animal-welfare',
  livelihoods: '/city/livelihoods',
  welfare: '/city/welfare',
  amenities: '/city/amenities',

  // Council - the deliberative wing
  councilResolutions: '/council/resolutions',
  wardCommittees: '/council/ward-committees',
  correspondence: '/council/correspondence',
  legal: '/council/legal',
  notifiedServices: '/council/notified-services',

  // City intelligence, continued - domains added after the initial section
  // above was written.
  heritage: '/city/heritage-tourism',
  civicParticipation: '/city/civic-participation',

  // Governance & finance
  property: '/governance/property',
  revenue: '/governance/revenue',
  reconciliation: '/governance/reconciliation',
  recoveryWorklist: '/governance/recovery-worklist',
  recoveryPilot: '/governance/recovery-pilot',
  financialIntelligence: '/governance/financial',
  budget: '/governance/budget',
  procurement: '/governance/procurement',
  projects: '/governance/projects',
  contractors: '/governance/contractors',
  buildings: '/governance/buildings',
  assets: '/governance/assets',
  workforce: '/governance/workforce',
  licensing: '/governance/licensing',
  enforcement: '/governance/enforcement',
  infraCoordination: '/governance/infrastructure-coordination',
  buildingEntity: '/governance/building-entity',

  // Strategic
  benchmarking: '/strategic/benchmarking',
  planning: '/strategic/planning',
  developmentPlan: '/strategic/development-plan-2034',
  digitalTwin: '/strategic/digital-twin',
  knowledgeGraph: '/strategic/knowledge-graph',
  infrastructureGraph: '/strategic/infrastructure-graph',
  outcomes: '/strategic/outcomes',
  institutionalMemory: '/strategic/institutional-memory',
  resilience: '/strategic/resilience',
  scenarios: '/strategic/scenarios',
  dataResources: '/strategic/data-resources',

  // Evidence & roadmap - the decision layer's real, sourced foundation
  evidenceRegistry: '/decision/evidence',
  publicMoney: '/decision/public-money',
  capabilityRoadmap: '/decision/roadmap',
  systemsMap: '/decision/systems-map',
  capabilityArea: '/decision/systems-map/:area',

  // AI
  copilot: '/ai/copilot',
  aiCentre: '/ai/centre',
  aiAgents: '/ai/agents',
  agentWorkflows: '/ai/agent-workflows',
  aiRecommendations: '/ai/recommendations',
  modelRegistry: '/ai/models',
  aiEvaluation: '/ai/evaluation',
  promptRegistry: '/ai/prompts',
  aiIncidents: '/ai/incidents',

  // Trust centre
  trustCentre: '/trust',
  security: '/trust/security',
  privacy: '/trust/privacy',
  aiGovernance: '/trust/ai-governance',
  evidenceAudit: '/trust/evidence-audit',
  lineage: '/trust/lineage',
  accessGovernance: '/trust/access',
  integrations: '/trust/integrations',
  platformHealth: '/trust/platform',
  readiness: '/trust/readiness',
  testing: '/trust/testing',
  resilienceDr: '/trust/resilience-dr',

  // Administration.
  //
  // The role catalogue lives inside Users & Roles and the feature-flag register
  // inside Settings, so neither carries a route of its own. The old paths are
  // kept as redirects in `src/routes/index.tsx` rather than declared here: a
  // path an operator may still have bookmarked should land somewhere useful,
  // but it is not a destination the platform offers.
  users: '/admin/users',
  policies: '/admin/policies',
  connectors: '/admin/connectors',
  dataSources: '/admin/data-sources',
  settings: '/admin/settings',
  pilotIngestion: '/admin/pilot-ingestion',
} as const

export type RoutePath = (typeof ROUTES)[keyof typeof ROUTES]

export interface NavItem {
  id: string
  label: string
  to: string
  icon: LucideIcon
  /** Permission required to see and enter this route. */
  requires: { resource: ResourceType; action: ActionType }
  /** Domain the route belongs to; checked against the principal's scope. */
  domain?: IntelligenceDomain
  /** Contextual badge key resolved at render time. */
  badge?: 'critical-alerts' | 'pending-decisions' | 'active-incidents' | 'ai-pending' | 'security-open'
  description: string
}

export interface NavSection {
  id: string
  label: string
  items: NavItem[]
}

/**
 * How the rail is grouped, and why.
 *
 * The sections follow the way a municipal corporation is actually organised -
 * the statutory functions of the Twelfth Schedule and the departmental wings
 * that discharge them - rather than the order the screens happened to be
 * built. An officer who has run a corporation should be able to find a page
 * by asking "which department owns this?" and land on it first time.
 *
 *   1  Command Centre                      the daily operating rhythm
 *   2  Wards & Localities                  the field administration
 *   3  Disaster & Emergency Response       life safety, ahead of everything
 *   4-9  the service wings                 water & sanitation, roads, health,
 *                                          environment, citizen & social,
 *                                          planning
 *   10-11  money and delivery              revenue and finance, then capital
 *   12  Council & Establishment            the deliberative and staff record
 *   13-14  strategy and AI                 above the operating year
 *   15-16  assurance and the platform      how the system is trusted and run
 *
 * Three placements are departmental rather than intuitive, and are deliberate:
 * births and deaths registration and the veterinary/animal-welfare function
 * both sit with Public Health because the Registrar and the veterinary cadre
 * are Health Department posts; markets and slaughterhouses sit there too,
 * because their statutory basis is food hygiene inspection, not trade.
 */
function build$NAV_SECTIONS(): NavSection[] {
  return [
  {
    id: 'command',
    label: t('Command'),
    items: [
      {
        id: 'executive',
        label: t('Executive Overview'),
        to: ROUTES.executive,
        icon: LayoutDashboard,
        requires: { resource: 'intelligence', action: 'view' },
        domain: 'executive',
        description: t('City-level operational position across every domain.'),
      },
      {
        id: 'city-index',
        label: t('City Intelligence Index'),
        to: ROUTES.cityIndex,
        icon: Gauge,
        requires: { resource: 'intelligence', action: 'view' },
        domain: 'executive',
        description: t('Composite city condition across twelve explained dimensions.'),
      },
      {
        id: 'cockpit',
        label: t('Commissioner Cockpit'),
        to: ROUTES.cockpit,
        icon: Compass,
        requires: { resource: 'intelligence', action: 'view' },
        domain: 'executive',
        badge: 'pending-decisions',
        description: t('Today\'s city picture and the Commissioner priority queue.'),
      },
      {
        id: 'copilot',
        label: t('Municipal Copilot'),
        to: ROUTES.copilot,
        icon: MessagesSquare,
        requires: { resource: 'ai', action: 'view' },
        description: t('Governed, evidence-backed BMC intelligence assistant.'),
      },
      {
        id: 'situation-room',
        label: t('Situation Room'),
        to: ROUTES.situationRoom,
        icon: Radar,
        requires: { resource: 'situation-room', action: 'view' },
        domain: 'disaster',
        badge: 'active-incidents',
        description: t('Full-screen operational command for active events.'),
      },
      {
        id: 'city-command-map',
        label: t('City Command Map'),
        to: ROUTES.cityCommandMap,
        icon: Map,
        requires: { resource: 'intelligence', action: 'view' },
        domain: 'executive',
        badge: 'active-incidents',
        description: t('One live, spatial view of incidents, at-risk projects and road defects across every ward.'),
      },
      {
        id: 'intelligence',
        label: t('Intelligence Feed'),
        to: ROUTES.intelligenceFeed,
        icon: Activity,
        requires: { resource: 'intelligence', action: 'view' },
        description: t('Institutional feed of every signal the platform has raised.'),
      },
      {
        id: 'alerts',
        label: t('Alerts & Escalations'),
        to: ROUTES.alerts,
        icon: AlertTriangle,
        requires: { resource: 'alert', action: 'view' },
        badge: 'critical-alerts',
        description: t('Operational alerts with SLA position and ownership.'),
      },
    ],
  },
  {
    id: 'finance',
    label: t('Revenue & Finance'),
    items: [
      {
        id: 'revenue',
        label: t('Revenue Intelligence'),
        to: ROUTES.revenue,
        icon: Banknote,
        requires: { resource: 'revenue', action: 'view' },
        domain: 'revenue',
        description: t('Collection efficiency, arrears and reconciliation candidates.'),
      },
      {
        id: 'licensing',
        label: t('Licences & Trade'),
        to: ROUTES.licensing,
        icon: Stamp,
        requires: { resource: 'revenue', action: 'view' },
        domain: 'revenue',
        description: t('Trade licences, renewals, compliance and licence fee position.'),
      },
      {
        id: 'financial',
        label: t('Financial Intelligence'),
        to: ROUTES.financialIntelligence,
        icon: Landmark,
        requires: { resource: 'budget', action: 'view' },
        domain: 'budget',
        description: t('Consolidated financial position and the Financial Health Index.'),
      },
      {
        id: 'budget',
        label: t('Budget Intelligence'),
        to: ROUTES.budget,
        icon: Wallet,
        requires: { resource: 'budget', action: 'view' },
        domain: 'budget',
        description: t('Allocation, utilisation, variance and scenario analysis.'),
      },
      {
        id: 'public-money',
        label: t('Public Money & Investment'),
        to: ROUTES.publicMoney,
        icon: Banknote,
        requires: { resource: 'intelligence', action: 'view' },
        domain: 'projects',
        description: t('The budget and every publicly identified work, on a real map of the city, each figure with its source.'),
      },
    ],
  },
  {
    id: 'property-tax',
    label: t('Property Tax'),
    items: [
      {
        id: 'property',
        label: t('Property Intelligence'),
        to: ROUTES.property,
        icon: Building,
        requires: { resource: 'revenue', action: 'view' },
        domain: 'property',
        description: t('Assessment base, segments and reassessment position.'),
      },
      {
        id: 'reconciliation',
        label: t('Registry Reconciliation'),
        to: ROUTES.reconciliation,
        icon: Scale,
        requires: { resource: 'revenue', action: 'view' },
        domain: 'revenue',
        description: t('Where the corporation’s own registers disagree about the same property.'),
      },
      {
        id: 'recovery-worklist',
        label: t('Recovery Worklist'),
        to: ROUTES.recoveryWorklist,
        icon: ListChecks,
        requires: { resource: 'revenue', action: 'view' },
        domain: 'revenue',
        description: t('Assessment review candidates assigned to a named officer for verification.'),
      },
      {
        id: 'recovery-pilot',
        label: t('Recovery Pilot & Returns'),
        to: ROUTES.recoveryPilot,
        icon: Target,
        requires: { resource: 'revenue', action: 'view' },
        domain: 'revenue',
        description: t('Single-ward pilot scorecard and the statutory property tax return.'),
      },
    ],
  },
  {
    id: 'decisions-actions',
    label: t('Decisions'),
    items: [
      {
        id: 'decisions',
        label: t('Decision Centre'),
        to: ROUTES.decisions,
        icon: ClipboardCheck,
        requires: { resource: 'decision', action: 'view' },
        badge: 'pending-decisions',
        description: t('Decision cases from problem statement to measured outcome.'),
      },
      {
        id: 'my-tasks',
        label: t('My Tasks'),
        to: ROUTES.myTasks,
        icon: ListChecks,
        requires: { resource: 'action', action: 'view' },
        description: t('Tasks assigned to you, and tasks you have assigned to others.'),
      },
      {
        id: 'reports',
        label: t('Report Workspace'),
        to: ROUTES.reports,
        icon: FileStack,
        requires: { resource: 'report', action: 'view' },
        description: t('Institutional reports in a print-ready format.'),
      },
    ],
  },
  {
    id: 'wards-localities',
    label: t('Wards'),
    items: [
      {
        id: 'wards',
        label: t('Ward Intelligence'),
        to: ROUTES.wards,
        icon: MapPinned,
        requires: { resource: 'ward', action: 'view' },
        domain: 'wards',
        description: t('Ward operational picture, risk index and comparison.'),
      },
      {
        id: 'hyperlocal',
        label: t('Hyperlocal Intelligence'),
        to: ROUTES.hyperlocal,
        icon: Crosshair,
        requires: { resource: 'intelligence', action: 'view' },
        domain: 'citizen-services',
        description: t('Localities where several distinct problems are stacking at once.'),
      },
      {
        id: 'ward-league',
        label: t('Ward League Table'),
        to: ROUTES.wardLeague,
        icon: ListOrdered,
        requires: { resource: 'ward', action: 'view' },
        domain: 'wards',
        description: t('Every ward ranked on one measure at a time, and the spread between best and worst.'),
      },
      {
        id: 'ward-equity',
        label: t('Ward Equity & Allocation'),
        to: ROUTES.wardEquity,
        icon: Coins,
        requires: { resource: 'ward', action: 'view' },
        domain: 'wards',
        description: t('Whether capital is going where the service deficit is, ward by ward.'),
      },
      {
        id: 'ward-trajectory',
        label: t('Ward Trajectory'),
        to: ROUTES.wardTrajectory,
        icon: TrendingDown,
        requires: { resource: 'ward', action: 'view' },
        domain: 'wards',
        description: t('Which wards are deteriorating fastest, and when they cross the intervention threshold.'),
      },
      {
        id: 'ward-commitments',
        label: t('Ward Commitments'),
        to: ROUTES.wardCommitments,
        icon: ClipboardList,
        requires: { resource: 'ward', action: 'view' },
        domain: 'wards',
        description: t('What has been resolved, sanctioned and promised to each ward, and what came of it.'),
      },
      {
        id: 'ward-performance',
        label: t('Like-for-Like Performance'),
        to: ROUTES.wardPerformance,
        icon: Award,
        requires: { resource: 'ward', action: 'view' },
        domain: 'wards',
        description: t('Ward outcomes adjusted for how hard the ward is, so practice can be separated from conditions.'),
      },
    ],
  },
  {
    id: 'disaster',
    label: t('Disaster'),
    items: [
      {
        id: 'disaster',
        label: t('Disaster Intelligence'),
        to: ROUTES.disaster,
        icon: Ambulance,
        requires: { resource: 'incident', action: 'view' },
        domain: 'disaster',
        badge: 'active-incidents',
        description: t('Unified incident management across every incident type.'),
      },
      {
        id: 'emergency',
        label: t('Fire & Emergency'),
        to: ROUTES.emergency,
        icon: Flame,
        requires: { resource: 'intelligence', action: 'view' },
        domain: 'emergency',
        description: t('Station readiness, response times and coverage.'),
      },
      {
        id: 'monsoon',
        label: t('Monsoon Intelligence'),
        to: ROUTES.monsoon,
        icon: Siren,
        requires: { resource: 'intelligence', action: 'view' },
        domain: 'monsoon',
        description: t('Flood risk, readiness and scenario simulation.'),
      },
      {
        id: 'resilience',
        label: t('Urban Resilience'),
        to: ROUTES.resilience,
        icon: ShieldAlert,
        requires: { resource: 'intelligence', action: 'view' },
        domain: 'executive',
        description: t('Preparedness across the ten hazards the city faces.'),
      },
    ],
  },
  {
    id: 'water-sanitation',
    label: t('Water & Sanitation'),
    items: [
      {
        id: 'water',
        label: t('Water Intelligence'),
        to: ROUTES.water,
        icon: Droplets,
        requires: { resource: 'intelligence', action: 'view' },
        domain: 'water',
        description: t('Supply, demand, pressure, losses and water quality.'),
      },
      {
        id: 'sewerage',
        label: t('Sewerage Intelligence'),
        to: ROUTES.sewerage,
        icon: Waves,
        requires: { resource: 'intelligence', action: 'view' },
        domain: 'sewerage',
        description: t('Treatment capacity, network condition and overflow events.'),
      },
      {
        id: 'stormwater',
        label: t('Storm Water Intelligence'),
        to: ROUTES.stormwater,
        icon: Cloud,
        requires: { resource: 'intelligence', action: 'view' },
        domain: 'stormwater',
        description: t('Nallahs, drains, culverts and pumping station readiness.'),
      },
      {
        id: 'waste',
        label: t('Solid Waste Intelligence'),
        to: ROUTES.waste,
        icon: Recycle,
        requires: { resource: 'intelligence', action: 'view' },
        domain: 'waste',
        description: t('Collection coverage, routes, processing and hotspots.'),
      },
    ],
  },
  {
    id: 'roads-transport',
    label: t('Roads & Transport'),
    items: [
      {
        id: 'roads',
        label: t('Roads Intelligence'),
        to: ROUTES.roads,
        icon: Route,
        requires: { resource: 'intelligence', action: 'view' },
        domain: 'roads',
        description: t('Condition, defects and the explainable priority engine.'),
      },
      {
        id: 'traffic',
        label: t('Traffic & Mobility'),
        to: ROUTES.traffic,
        icon: TrafficCone,
        requires: { resource: 'intelligence', action: 'view' },
        domain: 'mobility',
        description: t('Corridor performance, congestion and closures.'),
      },
      {
        id: 'street-lighting',
        label: t('Street Lighting'),
        to: ROUTES.streetLighting,
        icon: Lightbulb,
        requires: { resource: 'intelligence', action: 'view' },
        description: t('Working lights, dark stretches and energy consumption.'),
      },
    ],
  },
  {
    id: 'public-health',
    label: t('Health'),
    items: [
      {
        id: 'health',
        label: t('Public Health'),
        to: ROUTES.health,
        icon: Heart,
        requires: { resource: 'intelligence', action: 'view' },
        domain: 'health',
        description: t('Aggregate disease indicators and outbreak signals.'),
      },
      {
        id: 'hospitals',
        label: t('Hospital Intelligence'),
        to: ROUTES.hospitals,
        icon: Hospital,
        requires: { resource: 'intelligence', action: 'view' },
        domain: 'hospitals',
        description: t('Capacity, critical care headroom and accessibility.'),
      },
      {
        id: 'registration',
        label: t('Births & Deaths Registration'),
        to: ROUTES.registration,
        icon: BadgeCheck,
        requires: { resource: 'intelligence', action: 'view' },
        domain: 'registration',
        description: t('Statutory registration volumes, timeliness and certificate backlog.'),
      },
      {
        id: 'deathcare',
        label: t('Cemeteries & Crematoria'),
        to: ROUTES.deathcare,
        icon: Flower2,
        requires: { resource: 'intelligence', action: 'view' },
        domain: 'deathcare',
        description: t('Capacity remaining, waiting time and condition of the city’s burial and cremation grounds.'),
      },
      {
        id: 'animal-welfare',
        label: t('Animal Welfare'),
        to: ROUTES.animalWelfare,
        icon: PawPrint,
        requires: { resource: 'intelligence', action: 'view' },
        domain: 'animal-welfare',
        description: t('Sterilisation coverage, dog bite incidence, cattle pounds and veterinary units.'),
      },
      {
        id: 'markets',
        label: t('Markets & Slaughterhouses'),
        to: ROUTES.markets,
        icon: Store,
        requires: { resource: 'intelligence', action: 'view' },
        domain: 'markets',
        description: t('Municipal market estate, hygiene inspection cadence and licensed trade.'),
      },
    ],
  },
  {
    id: 'environment',
    label: t('Environment'),
    items: [
      {
        id: 'environment',
        label: t('Environment Intelligence'),
        to: ROUTES.environment,
        icon: Trees,
        requires: { resource: 'intelligence', action: 'view' },
        domain: 'environment',
        description: t('Air quality, noise and environmental compliance.'),
      },
      {
        id: 'coastal',
        label: t('Coastal Intelligence'),
        to: ROUTES.coastal,
        icon: LifeBuoy,
        requires: { resource: 'intelligence', action: 'view' },
        domain: 'coastal',
        description: t('Shoreline vulnerability, mangroves and protection works.'),
      },
      {
        id: 'gardens',
        label: t('Gardens & Open Space'),
        to: ROUTES.gardens,
        icon: Sprout,
        requires: { resource: 'intelligence', action: 'view' },
        description: t('Open space per resident, garden condition and tree cover.'),
      },
    ],
  },
  {
    id: 'culture-amenities',
    label: t('Culture & Amenities'),
    items: [
      {
        id: 'heritage',
        label: t('Heritage & Tourism'),
        to: ROUTES.heritage,
        icon: Castle,
        requires: { resource: 'intelligence', action: 'view' },
        domain: 'heritage',
        description: t('Listed heritage structures and precincts, museums, the zoo and the tourism-facing public realm.'),
      },
      {
        id: 'amenities',
        label: t('Parking & Public Amenities'),
        to: ROUTES.amenities,
        icon: CircleParking,
        requires: { resource: 'intelligence', action: 'view' },
        domain: 'amenities',
        description: t('Parking, public conveniences, bus shelters and the residents-per-facility ratio.'),
      },
    ],
  },
  {
    id: 'citizen-social',
    label: t('Citizen Services'),
    items: [
      {
        id: 'citizen-services',
        label: t('Citizen Service Intelligence'),
        to: ROUTES.citizenServices,
        icon: Headset,
        requires: { resource: 'intelligence', action: 'view' },
        domain: 'citizen-services',
        description: t('Recurring complaints, root-cause association and SLA position.'),
      },
      {
        id: 'resolution-intelligence',
        label: t('Grievance Resolution'),
        to: ROUTES.resolutionIntelligence,
        icon: Workflow,
        requires: { resource: 'intelligence', action: 'view' },
        domain: 'citizen-services',
        description: t('Every complaint as a resolution case - explainable ownership, multi-department orchestration and transfer-loop detection.'),
      },
      {
        id: 'notified-services',
        label: t('Notified Services Register'),
        to: ROUTES.notifiedServices,
        icon: FileCheck2,
        requires: { resource: 'intelligence', action: 'view' },
        description: t('Every statutory certificate, licence and permit measured against its published turnaround, across every department.'),
      },
      {
        id: 'civic-participation',
        label: t('Civic Participation'),
        to: ROUTES.civicParticipation,
        icon: Megaphone,
        requires: { resource: 'intelligence', action: 'view' },
        domain: 'civic-participation',
        description: t('Consultations, suggestion schemes and public feedback the Corporation has run.'),
      },
    ],
  },
  {
    id: 'social-development',
    label: t('Social & Education'),
    items: [
      {
        id: 'housing',
        label: t('Slum & Housing Intelligence'),
        to: ROUTES.housing,
        icon: Home,
        requires: { resource: 'intelligence', action: 'view' },
        description: t('Settlement coverage, basic services and rehabilitation progress.'),
      },
      {
        id: 'welfare',
        label: t('Social Welfare'),
        to: ROUTES.welfare,
        icon: HeartHandshake,
        requires: { resource: 'intelligence', action: 'view' },
        domain: 'welfare',
        description: t('Scheme coverage gap, disbursement delay and statutory accessibility compliance.'),
      },
      {
        id: 'livelihoods',
        label: t('Urban Livelihoods'),
        to: ROUTES.livelihoods,
        icon: HandCoins,
        requires: { resource: 'intelligence', action: 'view' },
        domain: 'livelihoods',
        description: t('Poverty alleviation, skill training, self-help groups and street vendor entitlement.'),
      },
      {
        id: 'education',
        label: t('Education Intelligence'),
        to: ROUTES.education,
        icon: GraduationCap,
        requires: { resource: 'intelligence', action: 'view' },
        description: t('Municipal school capacity, enrolment and facility condition.'),
      },
    ],
  },
  {
    id: 'planning',
    label: t('Planning'),
    items: [
      {
        id: 'planning',
        label: t('Urban Planning'),
        to: ROUTES.planning,
        icon: Globe2,
        requires: { resource: 'intelligence', action: 'view' },
        domain: 'planning',
        description: t('Population pressure, land use and infrastructure adequacy.'),
      },
      {
        id: 'buildings',
        label: t('Building Intelligence'),
        to: ROUTES.buildings,
        icon: Building2,
        requires: { resource: 'intelligence', action: 'view' },
        domain: 'buildings',
        description: t('Structural audits, dilapidation and development control.'),
      },
      {
        id: 'building-entity',
        label: t('Building Entity'),
        to: ROUTES.buildingEntity,
        icon: Layers3,
        requires: { resource: 'intelligence', action: 'view' },
        domain: 'buildings',
        description: t('One building read against its ward’s property, licensing and enforcement position.'),
      },
      {
        id: 'digital-twin',
        label: t('Urban Digital Twin'),
        to: ROUTES.digitalTwin,
        icon: Network,
        requires: { resource: 'intelligence', action: 'view' },
        description: t('Layered spatial view of every municipal entity class.'),
      },
      {
        id: 'development-plan',
        label: t('Development Plan & Zoning'),
        to: ROUTES.developmentPlan,
        icon: LandPlot,
        requires: { resource: 'intelligence', action: 'view' },
        domain: 'planning',
        description: t('Sanctioned land-use zoning, FSI and TDR position, and reservation status ward by ward.'),
      },
      {
        id: 'enforcement',
        label: t('Encroachment & Enforcement'),
        to: ROUTES.enforcement,
        icon: Hammer,
        requires: { resource: 'intelligence', action: 'view' },
        domain: 'enforcement',
        description: t('Notices issued under the MMC Act and MRTP Act, and what became of each one.'),
      },
    ],
  },
  {
    id: 'delivery',
    label: t('Projects & Assets'),
    items: [
      {
        id: 'procurement',
        label: t('Procurement Intelligence'),
        to: ROUTES.procurement,
        icon: FileText,
        requires: { resource: 'procurement', action: 'view' },
        domain: 'procurement',
        description: t('Contracts, vendors, extensions and delivery risk indicators.'),
      },
      {
        id: 'contractors',
        label: t('Contractor Intelligence'),
        to: ROUTES.contractors,
        icon: Handshake,
        requires: { resource: 'procurement', action: 'view' },
        description: t('Supplier delivery standing, computed from the contract and project record.'),
      },
      {
        id: 'projects',
        label: t('Project Intelligence'),
        to: ROUTES.projects,
        icon: HardHat,
        requires: { resource: 'project', action: 'view' },
        domain: 'projects',
        description: t('Capital delivery with the explainable project risk engine.'),
      },
      {
        id: 'assets',
        label: t('Asset Intelligence'),
        to: ROUTES.assets,
        icon: Boxes,
        requires: { resource: 'intelligence', action: 'view' },
        domain: 'assets',
        description: t('Asset register, condition and lifecycle exposure.'),
      },
      {
        id: 'infra-coordination',
        label: t('Infrastructure Coordination'),
        to: ROUTES.infraCoordination,
        icon: TrainFront,
        requires: { resource: 'project', action: 'view' },
        domain: 'projects',
        description: t('Metro, Coastal Road and other agency-led works, and what the Corporation owes each one.'),
      },
    ],
  },
  {
    id: 'institution',
    label: t('Council'),
    items: [
      {
        id: 'council-resolutions',
        label: t('Council & Committees'),
        to: ROUTES.councilResolutions,
        icon: Gavel,
        requires: { resource: 'decision', action: 'view' },
        description: t('Resolutions, committee business and the deliberative record.'),
      },
      {
        id: 'ward-committees',
        label: t('Ward Committees'),
        to: ROUTES.wardCommittees,
        icon: Users2,
        requires: { resource: 'ward', action: 'view' },
        domain: 'wards',
        description: t('The statutory ward committees, their sittings, and corporator casework distinct from the house.'),
      },
      {
        id: 'correspondence',
        label: t('Government Correspondence'),
        to: ROUTES.correspondence,
        icon: FileSignature,
        requires: { resource: 'intelligence', action: 'view' },
        domain: 'correspondence',
        description: t('Government Resolutions, circulars and state directives, and their implementation status.'),
      },
      {
        id: 'legal',
        label: t('Legal & Litigation'),
        to: ROUTES.legal,
        icon: Scale3d,
        requires: { resource: 'intelligence', action: 'view' },
        domain: 'legal',
        description: t('Court matters, RTI applications and contractor arbitration the Corporation is party to.'),
      },
    ],
  },
  {
    id: 'establishment',
    label: t('HR & Establishment'),
    items: [
      {
        id: 'workforce',
        label: t('Workforce Intelligence'),
        to: ROUTES.workforce,
        icon: Users,
        requires: { resource: 'intelligence', action: 'view' },
        domain: 'workforce',
        description: t('Cadre strength, deployment and workload pressure.'),
      },
      {
        id: 'institutional-memory',
        label: t('Institutional Memory'),
        to: ROUTES.institutionalMemory,
        icon: Archive,
        requires: { resource: 'intelligence', action: 'view' },
        domain: 'executive',
        description: t('What the corporation has decided, faced and learned.'),
      },
    ],
  },
  {
    id: 'strategic',
    label: t('Strategy'),
    items: [
      {
        id: 'benchmarking',
        label: t('State Benchmarking'),
        to: ROUTES.benchmarking,
        icon: Scale,
        requires: { resource: 'intelligence', action: 'view' },
        domain: 'executive',
        description: t('Where this corporation stands on Maharashtra’s published municipal indicators.'),
      },
      {
        id: 'outcomes',
        label: t('Outcome Intelligence'),
        to: ROUTES.outcomes,
        icon: Trophy,
        requires: { resource: 'revenue', action: 'view' },
        description: t('Input → Activity → Output → Outcome across every programme.'),
      },
      {
        id: 'scenarios',
        label: t('Scenario Intelligence'),
        to: ROUTES.scenarios,
        icon: SlidersHorizontal,
        requires: { resource: 'intelligence', action: 'view' },
        description: t('Scenario studio for rainfall, demand, budget and workforce.'),
      },
      {
        id: 'infrastructure-graph',
        label: t('City Infrastructure Graph'),
        to: ROUTES.infrastructureGraph,
        icon: Network,
        requires: { resource: 'intelligence', action: 'view' },
        domain: 'executive',
        description: t('Trace an asset through its full accountability chain.'),
      },
      {
        id: 'knowledge-graph',
        label: t('Municipal Knowledge Graph'),
        to: ROUTES.knowledgeGraph,
        icon: GitBranch,
        requires: { resource: 'intelligence', action: 'view' },
        description: t('Explore how wards, works, contracts and decisions connect.'),
      },
      {
        id: 'data-resources',
        label: t('Data & Resources'),
        to: ROUTES.dataResources,
        icon: BookMarked,
        requires: { resource: 'intelligence', action: 'view' },
        domain: 'executive',
        description: t('The citations behind the corporation\'s own baseline record.'),
      },
      {
        id: 'evidence-registry',
        label: t('Evidence Registry'),
        to: ROUTES.evidenceRegistry,
        icon: Library,
        requires: { resource: 'intelligence', action: 'view' },
        domain: 'executive',
        description: t('Every source and figure, traceable to the original document.'),
      },
    ],
  },
  {
    id: 'ai',
    label: t('AI'),
    items: [
      {
        id: 'ai-centre',
        label: t('AI Intelligence Centre'),
        to: ROUTES.aiCentre,
        icon: Cpu,
        requires: { resource: 'ai', action: 'view' },
        description: t('Every AI request with model, confidence and review status.'),
      },
      {
        id: 'ai-agents',
        label: t('AI Agents'),
        to: ROUTES.aiAgents,
        icon: Bot,
        requires: { resource: 'ai-governance', action: 'view' },
        domain: 'ai-governance',
        description: t('The nine controlled agents and their advisory-only lifecycle.'),
      },
      {
        id: 'agent-workflows',
        label: t('Agent Workflows'),
        to: ROUTES.agentWorkflows,
        icon: Workflow,
        requires: { resource: 'ai-governance', action: 'view' },
        description: t('Automated sequences, each with a mandatory human checkpoint.'),
      },
      {
        id: 'ai-recommendations',
        label: t('AI Recommendations'),
        to: ROUTES.aiRecommendations,
        icon: Sparkles,
        requires: { resource: 'ai-governance', action: 'view' },
        badge: 'ai-pending',
        description: t('Advisory recommendations awaiting a named officer decision.'),
      },
    ],
  },
  {
    id: 'trust',
    label: t('Trust & Security'),
    items: [
      {
        id: 'trust-home',
        label: t('Trust Centre'),
        to: ROUTES.trustCentre,
        icon: ShieldCheck,
        // The overview leads with security posture and aggregates the audit,
        // lineage and AI-governance services, so it needs the broadest of
        // those permissions. security:view is the honest gate — a role that
        // cannot read security posture cannot read this summary.
        requires: { resource: 'security', action: 'view' },
        domain: 'security',
        description: t('Security, privacy, AI governance, evidence and resilience.'),
      },
      {
        id: 'security',
        label: t('Security Command Centre'),
        to: ROUTES.security,
        icon: Lock,
        requires: { resource: 'security', action: 'view' },
        domain: 'security',
        badge: 'security-open',
        description: t('Posture, identity, sessions and security event response.'),
      },
      {
        id: 'access',
        label: t('Access Governance'),
        to: ROUTES.accessGovernance,
        icon: KeyRound,
        requires: { resource: 'security', action: 'view' },
        description: t('Roles, permissions, scope and the live permission engine.'),
      },
      {
        id: 'privacy',
        label: t('Privacy & Data Governance'),
        to: ROUTES.privacy,
        icon: Database,
        requires: { resource: 'dataset', action: 'view' },
        description: t('Datasets, purpose limitation, minimisation and retention.'),
      },
      {
        id: 'evidence-audit',
        label: t('Evidence & Audit'),
        to: ROUTES.evidenceAudit,
        icon: FileSearch,
        requires: { resource: 'audit', action: 'view' },
        description: t('Provenance chains and the immutable-style audit timeline.'),
      },
      {
        id: 'lineage',
        label: t('Data Lineage'),
        to: ROUTES.lineage,
        icon: Link2,
        requires: { resource: 'dataset', action: 'view' },
        description: t('Source → ingestion → metric → intelligence → decision.'),
      },
    ],
  },
  {
    id: 'ai-governance-registers',
    label: t('AI Governance'),
    items: [
      {
        id: 'ai-governance',
        label: t('AI Governance'),
        to: ROUTES.aiGovernance,
        icon: Bot,
        requires: { resource: 'ai-governance', action: 'view' },
        domain: 'ai-governance',
        description: t('Model and prompt governance, AI risk and human oversight.'),
      },
      {
        id: 'models',
        label: t('AI Model Registry'),
        to: ROUTES.modelRegistry,
        icon: Brain,
        requires: { resource: 'ai-governance', action: 'view' },
        description: t('Approved use, restricted use, risk class and evaluation status.'),
      },
      {
        id: 'ai-evaluation',
        label: t('AI Evaluation'),
        to: ROUTES.aiEvaluation,
        icon: FlaskConical,
        requires: { resource: 'ai-governance', action: 'view' },
        domain: 'ai-governance',
        description: t('The evidence behind each model evaluation status.'),
      },
      {
        id: 'prompts',
        label: t('Prompt Registry'),
        to: ROUTES.promptRegistry,
        icon: ScrollText,
        requires: { resource: 'ai-governance', action: 'view' },
        description: t('Versioned, approved prompt templates with guardrails.'),
      },
      {
        id: 'ai-incidents',
        label: t('AI Incidents'),
        to: ROUTES.aiIncidents,
        icon: AlertOctagon,
        requires: { resource: 'ai-governance', action: 'view' },
        domain: 'ai-governance',
        description: t('Recorded AI incidents through detection to review.'),
      },
    ],
  },
  {
    id: 'platform-health',
    label: t('Platform'),
    items: [
      {
        id: 'platform',
        label: t('Platform Health'),
        to: ROUTES.platformHealth,
        icon: Gauge,
        requires: { resource: 'platform', action: 'view' },
        domain: 'platform',
        description: t('Service availability, pipelines, AI gateway and storage.'),
      },
      {
        id: 'integrations',
        label: t('Integration Health'),
        to: ROUTES.integrations,
        icon: CircuitBoard,
        requires: { resource: 'connector', action: 'view' },
        description: t('Connector state - simulation, adapter ready or not connected.'),
      },
      {
        id: 'resilience-dr',
        label: t('Resilience & DR'),
        to: ROUTES.resilienceDr,
        icon: LifeBuoy,
        requires: { resource: 'platform', action: 'view' },
        domain: 'platform',
        description: t('Backup, failover and resilience testing posture.'),
      },
      {
        id: 'readiness',
        label: t('Platform Readiness'),
        to: ROUTES.readiness,
        icon: Target,
        requires: { resource: 'platform', action: 'view' },
        description: t('What is implemented here versus required for production.'),
      },
      {
        id: 'testing',
        label: t('Testing & Quality Assurance'),
        to: ROUTES.testing,
        icon: TestTube,
        requires: { resource: 'platform', action: 'view' },
        domain: 'platform',
        description: t('What has actually been verified against this build, how, and what has not - stated plainly.'),
      },
      {
        id: 'capability-roadmap',
        label: t('Capability Roadmap'),
        to: ROUTES.capabilityRoadmap,
        icon: Target,
        requires: { resource: 'intelligence', action: 'view' },
        domain: 'executive',
        description: t('What public evidence proves now, and what authorised data unlocks.'),
      },
      {
        id: 'systems-map',
        label: t('Capability Map'),
        to: ROUTES.systemsMap,
        icon: Layers,
        requires: { resource: 'report', action: 'view' },
        domain: 'executive',
        description: t('The systems the corporation already runs, the decision this platform adds to each, and where it stands.'),
      },
    ],
  },
  {
    id: 'platform-admin',
    label: t('Admin'),
    items: [
      {
        id: 'users',
        label: t('Users & Roles'),
        to: ROUTES.users,
        icon: Users,
        requires: { resource: 'administration', action: 'view' },
        description: t('Principals and the role catalogue - scope, permissions, classification ceilings and MFA posture.'),
      },
      {
        id: 'policies',
        label: t('Policies'),
        to: ROUTES.policies,
        icon: ListChecks,
        requires: { resource: 'administration', action: 'view' },
        description: t('Access policies, conditions and review status.'),
      },
      {
        id: 'connectors',
        label: t('Connectors'),
        to: ROUTES.connectors,
        icon: Link2,
        requires: { resource: 'administration', action: 'view' },
        description: t('Adapter configuration for future departmental integration.'),
      },
      {
        id: 'data-sources',
        label: t('Data Sources'),
        to: ROUTES.dataSources,
        icon: Database,
        requires: { resource: 'administration', action: 'view' },
        description: t('Operational ingestion register — enable, pause, sync and manage feeds.'),
      },
      {
        id: 'pilot-ingestion',
        label: t('Pilot Data Ingestion'),
        to: ROUTES.pilotIngestion,
        icon: UploadCloud,
        requires: { resource: 'connector', action: 'view' },
        description: t('Upload a real property-tax CSV export and see it rendered - the one connector in this platform that is not demonstration data.'),
      },
      {
        id: 'settings',
        label: t('Settings'),
        to: ROUTES.settings,
        icon: Settings,
        requires: { resource: 'administration', action: 'view' },
        description:
          t('Interface preferences, municipal configuration, terminology, enabled modules and the feature-flag register.'),
      },
    ],
  },
]
}
export let NAV_SECTIONS: NavSection[] = build$NAV_SECTIONS()

/**
 * The flattened item list is rebuilt alongside the sections, not derived once.
 * The command palette searches these labels: leaving it frozen at module load
 * would have it matching and displaying the previous language's labels after a
 * switch, while the rail beside it showed the new ones.
 */
export let ALL_NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap((s) => s.items)

registerLayer(() => {
  NAV_SECTIONS = build$NAV_SECTIONS()
  ALL_NAV_ITEMS = NAV_SECTIONS.flatMap((s) => s.items)
})

/**
 * Resolves the navigation item that governs a path - the *most specific* match,
 * never merely the first.
 *
 * `RequirePermission` reads this to decide what a route requires, so a loose
 * match under-enforces: every `/trust/*` page is prefixed by the Trust Centre
 * item at `/trust`, and taking the first match gated all of them on that item's
 * `intelligence:view` instead of their own stricter permission. Longest `to`
 * wins, so a section landing page never speaks for the pages beneath it.
 */
export function navItemForPath(pathname: string): NavItem | undefined {
  let match: NavItem | undefined
  for (const item of ALL_NAV_ITEMS) {
    if (pathname !== item.to && !pathname.startsWith(`${item.to}/`)) continue
    if (!match || item.to.length > match.to.length) match = item
  }
  return match
}

/**
 * The section a path belongs to - resolved through the *most specific* item,
 * for the same reason `navItemForPath` is. The platform operations pages keep
 * their `/trust/*` paths so existing bookmarks still land, but they are read
 * under Platform & Administration; a first-prefix-match would answer Trust
 * Centre for every one of them.
 */
export function sectionForPath(pathname: string): NavSection | undefined {
  const item = navItemForPath(pathname)
  if (!item) return undefined
  return NAV_SECTIONS.find((s) => s.items.some((i) => i.id === item.id))
}
