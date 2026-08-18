import { lazy } from 'react'
import { Navigate, createBrowserRouter } from 'react-router-dom'
import { ROUTES } from '@/config/navigation'
import { AppShell } from '@/layouts/AppShell'
import { RequireAuth, RequirePermission, RoleLandingRedirect } from './RouteGuard'

/**
 * Route table.
 *
 * Every page is lazily loaded so the initial bundle stays small and each
 * intelligence module is fetched only when an authorised principal opens it.
 * Every authenticated route passes through both guards: authentication, then
 * the permission engine.
 */

// --- Authentication ---------------------------------------------------------
const LoginPage = lazy(() => import('@/pages/auth/LoginPage'))
const PortalLandingPage = lazy(() => import('@/pages/auth/PortalLandingPage'))

// --- Public --------------------------------------------------------------
const TransparencyPortalPage = lazy(() => import('@/pages/public/TransparencyPortalPage'))

// --- Command ---------------------------------------------------------------
const ExecutiveOverviewPage = lazy(() => import('@/pages/command/ExecutiveOverviewPage'))
const CommissionerCockpitPage = lazy(() => import('@/pages/command/CommissionerCockpitPage'))
const CityIntelligenceIndexPage = lazy(() => import('@/pages/command/CityIntelligenceIndexPage'))
const SituationRoomPage = lazy(() => import('@/pages/command/SituationRoomPage'))
const CityCommandMapPage = lazy(() => import('@/pages/command/CityCommandMapPage'))
const IntelligenceFeedPage = lazy(() => import('@/pages/command/IntelligenceFeedPage'))
const DecisionCentrePage = lazy(() => import('@/pages/command/DecisionCentrePage'))
const MyTasksPage = lazy(() => import('@/pages/command/MyTasksPage'))
const AlertsPage = lazy(() => import('@/pages/command/AlertsPage'))
const ReportsPage = lazy(() => import('@/pages/command/ReportsPage'))

// --- City intelligence -----------------------------------------------------
const WardIntelligencePage = lazy(() => import('@/pages/city/WardIntelligencePage'))
const HyperlocalIntelligencePage = lazy(() => import('@/pages/city/HyperlocalIntelligencePage'))
const WardLeaguePage = lazy(() => import('@/pages/city/WardLeaguePage'))
const WardEquityPage = lazy(() => import('@/pages/city/WardEquityPage'))
const WardTrajectoryPage = lazy(() => import('@/pages/city/WardTrajectoryPage'))
const WardCommitmentsPage = lazy(() => import('@/pages/city/WardCommitmentsPage'))
const WardPerformancePage = lazy(() => import('@/pages/city/WardPerformancePage'))
const WaterIntelligencePage = lazy(() => import('@/pages/city/WaterIntelligencePage'))
const SewerageIntelligencePage = lazy(() => import('@/pages/city/SewerageIntelligencePage'))
const StormWaterIntelligencePage = lazy(() => import('@/pages/city/StormWaterIntelligencePage'))
const MonsoonIntelligencePage = lazy(() => import('@/pages/city/MonsoonIntelligencePage'))
const SolidWasteIntelligencePage = lazy(() => import('@/pages/city/SolidWasteIntelligencePage'))
const RoadsIntelligencePage = lazy(() => import('@/pages/city/RoadsIntelligencePage'))
const TrafficIntelligencePage = lazy(() => import('@/pages/city/TrafficIntelligencePage'))
const CitizenServiceIntelligencePage = lazy(() => import('@/pages/city/CitizenServiceIntelligencePage'))
const PublicHealthPage = lazy(() => import('@/pages/city/PublicHealthPage'))
const HospitalIntelligencePage = lazy(() => import('@/pages/city/HospitalIntelligencePage'))
const FireEmergencyPage = lazy(() => import('@/pages/city/FireEmergencyPage'))
const DisasterIntelligencePage = lazy(() => import('@/pages/city/DisasterIntelligencePage'))
const EnvironmentIntelligencePage = lazy(() => import('@/pages/city/EnvironmentIntelligencePage'))
const CoastalIntelligencePage = lazy(() => import('@/pages/city/CoastalIntelligencePage'))
const EducationIntelligencePage = lazy(() => import('@/pages/city/EducationIntelligencePage'))
const HousingIntelligencePage = lazy(() => import('@/pages/city/HousingIntelligencePage'))
const StreetLightingPage = lazy(() => import('@/pages/city/StreetLightingPage'))
const GardensIntelligencePage = lazy(() => import('@/pages/city/GardensIntelligencePage'))
const CitizenRegistrationPage = lazy(() => import('@/pages/city/CitizenRegistrationPage'))
const DeathcarePage = lazy(() => import('@/pages/city/DeathcarePage'))
const MarketsPage = lazy(() => import('@/pages/city/MarketsPage'))
const AnimalWelfarePage = lazy(() => import('@/pages/city/AnimalWelfarePage'))
const LivelihoodsPage = lazy(() => import('@/pages/city/LivelihoodsPage'))
const SocialWelfarePage = lazy(() => import('@/pages/city/SocialWelfarePage'))
const AmenitiesPage = lazy(() => import('@/pages/city/AmenitiesPage'))
const HeritageTourismPage = lazy(() => import('@/pages/city/HeritageTourismPage'))
const CivicParticipationPage = lazy(() => import('@/pages/city/CivicParticipationPage'))

// --- Council ---------------------------------------------------------------
const CouncilResolutionsPage = lazy(() => import('@/pages/council/CouncilResolutionsPage'))
const WardCommitteesPage = lazy(() => import('@/pages/council/WardCommitteesPage'))
const GovernmentCorrespondencePage = lazy(() => import('@/pages/council/GovernmentCorrespondencePage'))
const LegalLitigationPage = lazy(() => import('@/pages/council/LegalLitigationPage'))
const NotifiedServicesRegisterPage = lazy(() => import('@/pages/council/NotifiedServicesRegisterPage'))

// --- Governance & finance --------------------------------------------------
const PropertyIntelligencePage = lazy(() => import('@/pages/governance/PropertyIntelligencePage'))
const RevenueIntelligencePage = lazy(() => import('@/pages/governance/RevenueIntelligencePage'))
const RevenueReconciliationPage = lazy(() => import('@/pages/governance/RevenueReconciliationPage'))
const RecoveryWorklistPage = lazy(() => import('@/pages/governance/RecoveryWorklistPage'))
const RecoveryPilotPage = lazy(() => import('@/pages/governance/RecoveryPilotPage'))
const FinancialIntelligencePage = lazy(() => import('@/pages/governance/FinancialIntelligencePage'))
const BudgetIntelligencePage = lazy(() => import('@/pages/governance/BudgetIntelligencePage'))
const ProcurementIntelligencePage = lazy(() => import('@/pages/governance/ProcurementIntelligencePage'))
const ProjectIntelligencePage = lazy(() => import('@/pages/governance/ProjectIntelligencePage'))
const ContractorIntelligencePage = lazy(() => import('@/pages/governance/ContractorIntelligencePage'))
const BuildingIntelligencePage = lazy(() => import('@/pages/governance/BuildingIntelligencePage'))
const AssetIntelligencePage = lazy(() => import('@/pages/governance/AssetIntelligencePage'))
const BuildingEntityPage = lazy(() => import('@/pages/governance/BuildingEntityPage'))
const WorkforceIntelligencePage = lazy(() => import('@/pages/governance/WorkforceIntelligencePage'))
const LicensingIntelligencePage = lazy(() => import('@/pages/governance/LicensingIntelligencePage'))
const EnforcementPage = lazy(() => import('@/pages/governance/EnforcementPage'))
const InfrastructureCoordinationPage = lazy(() => import('@/pages/governance/InfrastructureCoordinationPage'))

// --- Strategic -------------------------------------------------------------
const BenchmarkingPage = lazy(() => import('@/pages/strategic/BenchmarkingPage'))
const UrbanPlanningPage = lazy(() => import('@/pages/strategic/UrbanPlanningPage'))
const DevelopmentPlanPage = lazy(() => import('@/pages/strategic/DevelopmentPlanPage'))
const DigitalTwinPage = lazy(() => import('@/pages/strategic/DigitalTwinPage'))
const KnowledgeGraphPage = lazy(() => import('@/pages/strategic/KnowledgeGraphPage'))
const InfrastructureGraphPage = lazy(() => import('@/pages/strategic/InfrastructureGraphPage'))
const DataResourcesPage = lazy(() => import('@/pages/strategic/DataResourcesPage'))
const OutcomeIntelligencePage = lazy(() => import('@/pages/strategic/OutcomeIntelligencePage'))
const InstitutionalMemoryPage = lazy(() => import('@/pages/strategic/InstitutionalMemoryPage'))
const ScenarioIntelligencePage = lazy(() => import('@/pages/strategic/ScenarioIntelligencePage'))
const UrbanResiliencePage = lazy(() => import('@/pages/strategic/UrbanResiliencePage'))

// --- AI --------------------------------------------------------------------
const CopilotPage = lazy(() => import('@/pages/ai/CopilotPage'))
const AIIntelligenceCentrePage = lazy(() => import('@/pages/ai/AIIntelligenceCentrePage'))
const AIAgentsPage = lazy(() => import('@/pages/ai/AIAgentsPage'))
const AgentWorkflowsPage = lazy(() => import('@/pages/ai/AgentWorkflowsPage'))
const AIIncidentsPage = lazy(() => import('@/pages/ai/AIIncidentsPage'))
const AIRecommendationsPage = lazy(() => import('@/pages/ai/AIRecommendationsPage'))
const ModelRegistryPage = lazy(() => import('@/pages/ai/ModelRegistryPage'))
const AIEvaluationPage = lazy(() => import('@/pages/ai/AIEvaluationPage'))
const PromptRegistryPage = lazy(() => import('@/pages/ai/PromptRegistryPage'))

// --- Trust centre ----------------------------------------------------------
const TrustCentrePage = lazy(() => import('@/pages/trust/TrustCentrePage'))
const SecurityCommandCentrePage = lazy(() => import('@/pages/trust/SecurityCommandCentrePage'))
const PrivacyGovernancePage = lazy(() => import('@/pages/trust/PrivacyGovernancePage'))
const AIGovernancePage = lazy(() => import('@/pages/trust/AIGovernancePage'))
const EvidenceAuditPage = lazy(() => import('@/pages/trust/EvidenceAuditPage'))
const DataLineagePage = lazy(() => import('@/pages/trust/DataLineagePage'))
const AccessGovernancePage = lazy(() => import('@/pages/trust/AccessGovernancePage'))
const IntegrationHealthPage = lazy(() => import('@/pages/trust/IntegrationHealthPage'))
const PlatformHealthPage = lazy(() => import('@/pages/trust/PlatformHealthPage'))
const PlatformReadinessPage = lazy(() => import('@/pages/trust/PlatformReadinessPage'))
const TestingPage = lazy(() => import('@/pages/trust/TestingPage'))
const ResilienceDRPage = lazy(() => import('@/pages/trust/ResilienceDRPage'))

// --- Administration --------------------------------------------------------
const UsersPage = lazy(() => import('@/pages/admin/UsersPage'))
const PoliciesPage = lazy(() => import('@/pages/admin/PoliciesPage'))
const ConnectorsPage = lazy(() => import('@/pages/admin/ConnectorsPage'))
const DataSourcesPage = lazy(() => import('@/pages/admin/DataSourcesPage'))
const SettingsPage = lazy(() => import('@/pages/admin/SettingsPage'))
const PilotDataIngestionPage = lazy(() => import('@/pages/admin/PilotDataIngestionPage'))

// --- Fallback --------------------------------------------------------------
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'))

function guarded(element: React.JSX.Element): React.JSX.Element {
  return <RequirePermission>{element}</RequirePermission>
}

export const router = createBrowserRouter([
  {
    // Sign-in is now the front door. The portal front page moved behind it —
    // see `ROUTES.portal` below and the note on that constant.
    path: ROUTES.login,
    element: <LoginPage />,
  },
  {
    // Retained so that `?next=`-carrying links minted before this change, and
    // any bookmark an officer kept, still land on the sign-in screen rather
    // than on a 404.
    path: ROUTES.loginDirect,
    element: <LoginPage />,
  },
  {
    // The one genuinely public route in the platform - no `RequireAuth`, no
    // `AppShell`. See `src/pages/public/TransparencyPortalPage.tsx`.
    path: ROUTES.transparency,
    element: <TransparencyPortalPage />,
  },
  {
    // The portal front page, behind the session. `RequireAuth` rather than the
    // full `AppShell`: this page carries its own masthead and navigation and
    // would otherwise render a portal inside the console's chrome.
    path: ROUTES.portal,
    element: (
      <RequireAuth>
        <PortalLandingPage />
      </RequireAuth>
    ),
  },
  {
    path: '/',
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <RoleLandingRedirect /> },

      // Command
      { path: ROUTES.executive, element: guarded(<ExecutiveOverviewPage />) },
      { path: ROUTES.cockpit, element: guarded(<CommissionerCockpitPage />) },
      { path: ROUTES.cityIndex, element: guarded(<CityIntelligenceIndexPage />) },
      { path: ROUTES.situationRoom, element: guarded(<SituationRoomPage />) },
      { path: ROUTES.cityCommandMap, element: guarded(<CityCommandMapPage />) },
      { path: ROUTES.intelligenceFeed, element: guarded(<IntelligenceFeedPage />) },
      { path: ROUTES.decisions, element: guarded(<DecisionCentrePage />) },
      { path: ROUTES.myTasks, element: guarded(<MyTasksPage />) },
      { path: ROUTES.alerts, element: guarded(<AlertsPage />) },
      { path: ROUTES.reports, element: guarded(<ReportsPage />) },

      // City intelligence
      { path: ROUTES.wards, element: guarded(<WardIntelligencePage />) },
      { path: ROUTES.hyperlocal, element: guarded(<HyperlocalIntelligencePage />) },
      { path: ROUTES.wardLeague, element: guarded(<WardLeaguePage />) },
      { path: ROUTES.wardEquity, element: guarded(<WardEquityPage />) },
      { path: ROUTES.wardTrajectory, element: guarded(<WardTrajectoryPage />) },
      { path: ROUTES.wardCommitments, element: guarded(<WardCommitmentsPage />) },
      { path: ROUTES.wardPerformance, element: guarded(<WardPerformancePage />) },
      { path: ROUTES.water, element: guarded(<WaterIntelligencePage />) },
      { path: ROUTES.sewerage, element: guarded(<SewerageIntelligencePage />) },
      { path: ROUTES.stormwater, element: guarded(<StormWaterIntelligencePage />) },
      { path: ROUTES.monsoon, element: guarded(<MonsoonIntelligencePage />) },
      { path: ROUTES.waste, element: guarded(<SolidWasteIntelligencePage />) },
      { path: ROUTES.roads, element: guarded(<RoadsIntelligencePage />) },
      { path: ROUTES.traffic, element: guarded(<TrafficIntelligencePage />) },
      { path: ROUTES.citizenServices, element: guarded(<CitizenServiceIntelligencePage />) },
      { path: ROUTES.health, element: guarded(<PublicHealthPage />) },
      { path: ROUTES.hospitals, element: guarded(<HospitalIntelligencePage />) },
      { path: ROUTES.emergency, element: guarded(<FireEmergencyPage />) },
      { path: ROUTES.disaster, element: guarded(<DisasterIntelligencePage />) },
      { path: ROUTES.environment, element: guarded(<EnvironmentIntelligencePage />) },
      { path: ROUTES.coastal, element: guarded(<CoastalIntelligencePage />) },
      { path: ROUTES.education, element: guarded(<EducationIntelligencePage />) },
      { path: ROUTES.housing, element: guarded(<HousingIntelligencePage />) },
      { path: ROUTES.streetLighting, element: guarded(<StreetLightingPage />) },
      { path: ROUTES.gardens, element: guarded(<GardensIntelligencePage />) },
      { path: ROUTES.registration, element: guarded(<CitizenRegistrationPage />) },
      { path: ROUTES.deathcare, element: guarded(<DeathcarePage />) },
      { path: ROUTES.markets, element: guarded(<MarketsPage />) },
      { path: ROUTES.animalWelfare, element: guarded(<AnimalWelfarePage />) },
      { path: ROUTES.livelihoods, element: guarded(<LivelihoodsPage />) },
      { path: ROUTES.welfare, element: guarded(<SocialWelfarePage />) },
      { path: ROUTES.amenities, element: guarded(<AmenitiesPage />) },
      { path: ROUTES.heritage, element: guarded(<HeritageTourismPage />) },
      { path: ROUTES.civicParticipation, element: guarded(<CivicParticipationPage />) },

      // Council
      { path: ROUTES.councilResolutions, element: guarded(<CouncilResolutionsPage />) },
      { path: ROUTES.wardCommittees, element: guarded(<WardCommitteesPage />) },
      { path: ROUTES.correspondence, element: guarded(<GovernmentCorrespondencePage />) },
      { path: ROUTES.legal, element: guarded(<LegalLitigationPage />) },
      { path: ROUTES.notifiedServices, element: guarded(<NotifiedServicesRegisterPage />) },

      // Governance & finance
      { path: ROUTES.property, element: guarded(<PropertyIntelligencePage />) },
      { path: ROUTES.revenue, element: guarded(<RevenueIntelligencePage />) },
      { path: ROUTES.reconciliation, element: guarded(<RevenueReconciliationPage />) },
      { path: ROUTES.recoveryWorklist, element: guarded(<RecoveryWorklistPage />) },
      { path: ROUTES.recoveryPilot, element: guarded(<RecoveryPilotPage />) },
      { path: ROUTES.financialIntelligence, element: guarded(<FinancialIntelligencePage />) },
      { path: ROUTES.budget, element: guarded(<BudgetIntelligencePage />) },
      { path: ROUTES.procurement, element: guarded(<ProcurementIntelligencePage />) },
      { path: ROUTES.projects, element: guarded(<ProjectIntelligencePage />) },
      { path: ROUTES.contractors, element: guarded(<ContractorIntelligencePage />) },
      { path: ROUTES.buildings, element: guarded(<BuildingIntelligencePage />) },
      { path: ROUTES.assets, element: guarded(<AssetIntelligencePage />) },
      { path: ROUTES.buildingEntity, element: guarded(<BuildingEntityPage />) },
      { path: ROUTES.workforce, element: guarded(<WorkforceIntelligencePage />) },
      { path: ROUTES.licensing, element: guarded(<LicensingIntelligencePage />) },
      { path: ROUTES.enforcement, element: guarded(<EnforcementPage />) },
      { path: ROUTES.infraCoordination, element: guarded(<InfrastructureCoordinationPage />) },

      // Strategic
      { path: ROUTES.benchmarking, element: guarded(<BenchmarkingPage />) },
      { path: ROUTES.planning, element: guarded(<UrbanPlanningPage />) },
      { path: ROUTES.developmentPlan, element: guarded(<DevelopmentPlanPage />) },
      { path: ROUTES.digitalTwin, element: guarded(<DigitalTwinPage />) },
      { path: ROUTES.knowledgeGraph, element: guarded(<KnowledgeGraphPage />) },
      { path: ROUTES.dataResources, element: guarded(<DataResourcesPage />) },
      { path: ROUTES.infrastructureGraph, element: guarded(<InfrastructureGraphPage />) },
      { path: ROUTES.outcomes, element: guarded(<OutcomeIntelligencePage />) },
      { path: ROUTES.institutionalMemory, element: guarded(<InstitutionalMemoryPage />) },
      { path: ROUTES.scenarios, element: guarded(<ScenarioIntelligencePage />) },
      { path: ROUTES.resilience, element: guarded(<UrbanResiliencePage />) },

      // AI
      { path: ROUTES.copilot, element: guarded(<CopilotPage />) },
      { path: ROUTES.aiCentre, element: guarded(<AIIntelligenceCentrePage />) },
      { path: ROUTES.aiAgents, element: guarded(<AIAgentsPage />) },
      { path: ROUTES.agentWorkflows, element: guarded(<AgentWorkflowsPage />) },
      { path: ROUTES.aiRecommendations, element: guarded(<AIRecommendationsPage />) },
      { path: ROUTES.modelRegistry, element: guarded(<ModelRegistryPage />) },
      { path: ROUTES.aiEvaluation, element: guarded(<AIEvaluationPage />) },
      { path: ROUTES.promptRegistry, element: guarded(<PromptRegistryPage />) },
      { path: ROUTES.aiIncidents, element: guarded(<AIIncidentsPage />) },

      // Trust centre
      { path: ROUTES.trustCentre, element: guarded(<TrustCentrePage />) },
      { path: ROUTES.security, element: guarded(<SecurityCommandCentrePage />) },
      { path: ROUTES.privacy, element: guarded(<PrivacyGovernancePage />) },
      { path: ROUTES.aiGovernance, element: guarded(<AIGovernancePage />) },
      { path: ROUTES.evidenceAudit, element: guarded(<EvidenceAuditPage />) },
      { path: ROUTES.lineage, element: guarded(<DataLineagePage />) },
      { path: ROUTES.accessGovernance, element: guarded(<AccessGovernancePage />) },
      { path: ROUTES.integrations, element: guarded(<IntegrationHealthPage />) },
      { path: ROUTES.platformHealth, element: guarded(<PlatformHealthPage />) },
      { path: ROUTES.readiness, element: guarded(<PlatformReadinessPage />) },
      { path: ROUTES.testing, element: guarded(<TestingPage />) },
      { path: ROUTES.resilienceDr, element: guarded(<ResilienceDRPage />) },

      // Administration
      { path: ROUTES.users, element: guarded(<UsersPage />) },
      { path: ROUTES.policies, element: guarded(<PoliciesPage />) },
      { path: ROUTES.connectors, element: guarded(<ConnectorsPage />) },
      { path: ROUTES.dataSources, element: guarded(<DataSourcesPage />) },
      { path: ROUTES.settings, element: guarded(<SettingsPage />) },
      { path: ROUTES.pilotIngestion, element: guarded(<PilotDataIngestionPage />) },

      // The role catalogue and the feature-flag register are now sections of
      // the screens above rather than screens of their own. Their former paths
      // redirect rather than 404: the content still exists, it simply moved,
      // and an operator following an old link should arrive at it.
      { path: '/admin/roles', element: <Navigate to={ROUTES.users} replace /> },
      // Anchored, so an old bookmark lands on the register itself rather than
      // at the top of a long settings document.
      { path: '/admin/feature-flags', element: <Navigate to={`${ROUTES.settings}#feature-flags`} replace /> },

      { path: '*', element: <NotFoundPage /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])
