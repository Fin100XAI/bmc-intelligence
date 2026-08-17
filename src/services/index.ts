/**
 * src/services/index.ts
 *
 * Barrel for the demonstration service layer. Hooks, components and routes
 * import from here - never from an individual `*.service.ts` file, and
 * never from `src/data/*` or `src/workflows/*` directly. That single import
 * boundary is what makes `src/services/client.ts`'s "swap in a real
 * backend" recipe possible without touching anything above this layer.
 */

export { actionService } from './action.service'
export { adminService } from './admin.service'
export { aiService } from './ai.service'
export { alertService } from './alert.service'
export { auditService } from './audit.service'
export { benchmarkService } from './benchmark.service'
// Ward decision intelligence. `wardService` answers "how is this ward?"; these
// answer "which ward first?", "are we funding the right ones?", "which is
// getting worse?", "what did we promise?" and "is it the ward or the running
// of it?". All derive from the ward record rather than seeding their own, so
// they cannot disagree with Ward Intelligence about the same ward.
export { wardEquityService } from './ward-equity.service'
export { wardTrajectoryService } from './ward-trajectory.service'
export { wardCommitmentsService } from './ward-commitments.service'
export { wardPerformanceService } from './ward-performance.service'
export { wardGovernanceService } from './ward-governance.service'
export { authService } from './auth.service'
export { buildingService, coastalService, planningService, workforceService } from './coastal.service'
export { citizenService } from './citizen.service'
export { civicParticipationService } from './civic-participation.service'
export { cityIndexService } from './city-index.service'
export { connectorService } from './connector.service'
export { pilotService, type PilotDataset } from './pilot.service'
export { contractorService } from './contractor.service'
export { correspondenceService } from './correspondence.service'
export { councilService } from './council.service'
export { decisionService } from './decision.service'
export { drService } from './dr.service'
export { educationService } from './education.service'
export { enforcementService } from './enforcement.service'
export { gardensService } from './gardens.service'
export { housingService } from './housing.service'
export { licenceService } from './licence.service'
export { registrationService } from './registration.service'
export { streetLightService } from './streetlight.service'
// The remainder of the Twelfth Schedule - the obligatory duties a management
// platform most often omits, which is precisely why their absence is felt.
export { deathcareService } from './deathcare.service'
export { developmentPlanService } from './development-plan.service'
export { marketsService } from './markets.service'
export { animalWelfareService } from './animal-welfare.service'
export { livelihoodsService } from './livelihoods.service'
export { welfareService } from './welfare.service'
export { amenitiesService } from './amenities.service'
export { evidenceService } from './evidence.service'
export { financeService } from './finance.service'
export { financialIntelligenceService } from './financial-intelligence.service'
export { governanceService } from './governance.service'
export { graphService } from './graph.service'
export { healthService } from './health.service'
export { heritageService } from './heritage.service'
export { hyperlocalService } from './hyperlocal.service'
export { incidentService } from './incident.service'
export { infrastructureGraphService } from './infrastructure-graph.service'
export { infraCoordinationService } from './infra-coordination.service'
export { intelligenceService } from './intelligence.service'
export { knowledgeService } from './knowledge.service'
export { legalService } from './legal.service'
export { monsoonService } from './monsoon.service'
export { notificationService } from './notification.service'
export { notifiedServicesService } from './notified-services.service'
export { platformService } from './platform.service'
export { procurementService } from './procurement.service'
export { projectService } from './project.service'
export { reconciliationService } from './reconciliation.service'
export { resilienceService } from './resilience.service'
export { revenueService } from './revenue.service'
export { roadsService } from './roads.service'
export { searchService } from './search.service'
export { securityService } from './security.service'
export { sewerageService } from './sewerage.service'
export { wardService } from './ward.service'
export { wasteService } from './waste.service'
export { waterService } from './water.service'

export { ServiceError, TRANSPORT_MODE, type ServiceErrorCode, type ServiceRequestOptions } from './client'
export { subscribe } from './store'
// The public Transparency Portal's data path - deliberately outside the
// `User | null` / ABAC pattern every other service follows. See the file's
// own header for why.
export { transparencyService } from './transparency.service'

// Filter / input / result types each hook needs to call its service - kept
// alongside the service exports so a hook file only ever imports from
// `@/services`, never reaching into an individual `*.service.ts` file.
export type { DemoProfile } from './auth.service'
export type { ComparisonRow, WardProfile, WardRankMetric, WardRankRow } from './ward.service'
export type { IntelligenceFeedCounts, IntelligenceFilters } from './intelligence.service'
export type { AlertFilters, AlertSlaSummary } from './alert.service'
export type { DeployTeamInput, IncidentCreateInput, IncidentFilters } from './incident.service'
export type { DecisionCreateInput, DecisionFilters } from './decision.service'
export type { ActionCreateInput, ActionFilters, AssignableUser } from './action.service'
export type { ProjectFilters } from './project.service'
export type {
  BudgetLineFilters,
  BudgetScenarioResult,
  DepartmentVarianceRow,
  WardBudgetVarianceRow,
} from './finance.service'
export type { RevenueAnomalyFilters, RevenueRecordFilters } from './revenue.service'
export type {
  AssignableOfficer,
  ExceptionDetail,
  ExceptionFilters,
  ReconciliationSummary,
} from './reconciliation.service'
export type { WaterDrilldownParams, WaterDrilldownResult, WaterZoneAnomalies } from './water.service'
export type { MonsoonScenarioPreset } from './monsoon.service'
export type { RoadDefectFilters } from './roads.service'
export type { SecurityEventFilters } from './security.service'
export type { OverflowCluster, SewerageFilters, SewerageSummary } from './sewerage.service'
export { TREATMENT_COMPLIANCE_NORM } from './sewerage.service'
export type { AuditFilters } from './audit.service'
export type { AIRequestFilters, AIRequestInput, OversightFilters, OversightSummary } from './ai.service'
export type { CategoryConcentration, ContractFilters } from './procurement.service'
export type { ContractorFilters, ContractorPortfolioSummary } from './contractor.service'
export type { CitizenServiceFilters } from './citizen.service'
export type { HyperlocalFilters, HyperlocalSummary } from './hyperlocal.service'
export type { FinancialIntelligenceResult } from './financial-intelligence.service'
export type {
  DatasetFilters,
  EvidenceBrowseFilters,
  GovernanceSummary,
} from './governance.service'
export type { ConnectorHealthSummary } from './connector.service'
export type { PlatformSummary } from './platform.service'
export type { DRPosture } from './dr.service'
export type { GraphNeighbourhoodOptions, GraphNeighbourhoodResult } from './graph.service'
export type { ScopedInfrastructureChain } from './infrastructure-graph.service'
export type { MemoryFilters, MemorySummary, SimilarMemory } from './knowledge.service'
export type { GlobalSearchGroup, GlobalSearchItem } from './search.service'
export type { NotificationRule, PlatformSettings } from './admin.service'
export type { ResolutionFilters } from './council.service'
export type { LegalCaseFilters } from './legal.service'
export type { CaseworkFilters } from './ward-governance.service'
export type { EnforcementFilters } from './enforcement.service'
export type { CorrespondenceFilters } from './correspondence.service'
export type { EngagementFilters } from './civic-participation.service'

// The mutable-store record shapes services introduce beyond the domain
// model in `src/types/*` (a saved AI brief; a Situation Room log entry).
export type { CollectionKey, SavedBrief, SituationLogEntry } from './store'
