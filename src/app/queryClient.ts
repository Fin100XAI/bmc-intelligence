import { QueryClient } from '@tanstack/react-query'
import { onAfterRebuild } from '@/data/runtime'

/**
 * Query client configuration.
 *
 * Service-derived data lives here; Zustand holds only interface state. The
 * demonstration services are deterministic, so aggressive caching is correct -
 * a real deployment would tune `staleTime` per domain against the connector
 * refresh cadence declared in each dataset's freshness envelope.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 10 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
      // Operational software should not silently reshuffle beneath an operator.
      refetchOnMount: false,
    },
    mutations: {
      retry: 0,
    },
  },
})

/**
 * A municipal corporation switch invalidates every cached answer at once: the
 * keys below are scoped by ward, department and filter, never by tenant, so a
 * cached `wards('all')` from Pune would otherwise be served to Nagpur. This is
 * the one legitimate use of `clear()` in the application - `invalidateQueries`
 * would leave the previous corporation's figures on screen as stale-but-shown
 * data while the refetch runs, which is exactly the failure this platform must
 * not have.
 */
onAfterRebuild(() => {
  queryClient.clear()
})

/** Stable query-key factory so invalidation is precise rather than global. */
export const queryKeys = {
  all: ['bmc-mii'] as const,
  wards: (scope?: string) => ['bmc-mii', 'wards', scope ?? 'all'] as const,
  ward: (id: string) => ['bmc-mii', 'ward', id] as const,
  wardProfile: (id: string) => ['bmc-mii', 'ward-profile', id] as const,
  intelligence: (filters?: unknown) => ['bmc-mii', 'intelligence', filters ?? null] as const,
  intelligenceItem: (id: string) => ['bmc-mii', 'intelligence', 'item', id] as const,
  alerts: (filters?: unknown) => ['bmc-mii', 'alerts', filters ?? null] as const,
  incidents: (filters?: unknown) => ['bmc-mii', 'incidents', filters ?? null] as const,
  decisions: (filters?: unknown) => ['bmc-mii', 'decisions', filters ?? null] as const,
  actions: (filters?: unknown) => ['bmc-mii', 'actions', filters ?? null] as const,
  action: (id: string) => ['bmc-mii', 'action', id] as const,
  myTasks: (scope?: string) => ['bmc-mii', 'my-tasks', scope ?? 'all'] as const,
  projects: (filters?: unknown) => ['bmc-mii', 'projects', filters ?? null] as const,
  finance: (scope?: string) => ['bmc-mii', 'finance', scope ?? 'all'] as const,
  revenue: (scope?: string) => ['bmc-mii', 'revenue', scope ?? 'all'] as const,
  reconciliation: (scope?: string) => ['bmc-mii', 'reconciliation', scope ?? 'all'] as const,
  water: (scope?: string) => ['bmc-mii', 'water', scope ?? 'all'] as const,
  monsoon: (scope?: string) => ['bmc-mii', 'monsoon', scope ?? 'all'] as const,
  waste: (scope?: string) => ['bmc-mii', 'waste', scope ?? 'all'] as const,
  roads: (scope?: string) => ['bmc-mii', 'roads', scope ?? 'all'] as const,
  health: (scope?: string) => ['bmc-mii', 'health', scope ?? 'all'] as const,
  security: (scope?: string) => ['bmc-mii', 'security', scope ?? 'all'] as const,
  audit: (filters?: unknown) => ['bmc-mii', 'audit', filters ?? null] as const,
  evidence: (id: string) => ['bmc-mii', 'evidence', id] as const,
  ai: (scope?: string) => ['bmc-mii', 'ai', scope ?? 'all'] as const,
  connectors: () => ['bmc-mii', 'connectors'] as const,
  platform: () => ['bmc-mii', 'platform'] as const,
  dr: () => ['bmc-mii', 'dr'] as const,
  graph: (scope?: string) => ['bmc-mii', 'graph', scope ?? 'all'] as const,
  knowledge: (scope?: string) => ['bmc-mii', 'knowledge', scope ?? 'all'] as const,
  infraGraph: (scope?: string) => ['bmc-mii', 'infra-graph', scope ?? 'all'] as const,
  search: (query: string) => ['bmc-mii', 'search', query] as const,
  notifications: () => ['bmc-mii', 'notifications'] as const,
  admin: (scope?: string) => ['bmc-mii', 'admin', scope ?? 'all'] as const,
  executive: () => ['bmc-mii', 'executive'] as const,
  cityIndex: () => ['bmc-mii', 'city-index'] as const,
  resilience: () => ['bmc-mii', 'resilience'] as const,
  contractors: (scope?: string) => ['bmc-mii', 'contractors', scope ?? 'all'] as const,
  citizen: (scope?: string) => ['bmc-mii', 'citizen', scope ?? 'all'] as const,
  hyperlocal: (scope?: string) => ['bmc-mii', 'hyperlocal', scope ?? 'all'] as const,
  // The obligatory services beyond engineering and finance.
  education: (scope?: string) => ['bmc-mii', 'education', scope ?? 'all'] as const,
  housing: (scope?: string) => ['bmc-mii', 'housing', scope ?? 'all'] as const,
  streetLighting: (scope?: string) => ['bmc-mii', 'street-lighting', scope ?? 'all'] as const,
  licensing: (scope?: string) => ['bmc-mii', 'licensing', scope ?? 'all'] as const,
  registration: (scope?: string) => ['bmc-mii', 'registration', scope ?? 'all'] as const,
  gardens: (scope?: string) => ['bmc-mii', 'gardens', scope ?? 'all'] as const,
  // The remainder of the Twelfth Schedule.
  deathcare: (scope?: string) => ['bmc-mii', 'deathcare', scope ?? 'all'] as const,
  markets: (scope?: string) => ['bmc-mii', 'markets', scope ?? 'all'] as const,
  animalWelfare: (scope?: string) => ['bmc-mii', 'animal-welfare', scope ?? 'all'] as const,
  livelihoods: (scope?: string) => ['bmc-mii', 'livelihoods', scope ?? 'all'] as const,
  welfare: (scope?: string) => ['bmc-mii', 'welfare', scope ?? 'all'] as const,
  amenities: (scope?: string) => ['bmc-mii', 'amenities', scope ?? 'all'] as const,
  // Cross-corporation benchmarking.
  benchmark: (scope?: string) => ['bmc-mii', 'benchmark', scope ?? 'all'] as const,
  // Ward decision intelligence - comparison, allocation equity, trajectory,
  // commitments and like-for-like performance.
  wardLeague: (scope?: string) => ['bmc-mii', 'ward-league', scope ?? 'all'] as const,
  wardEquity: (scope?: string) => ['bmc-mii', 'ward-equity', scope ?? 'all'] as const,
  wardTrajectory: (scope?: string) => ['bmc-mii', 'ward-trajectory', scope ?? 'all'] as const,
  wardCommitments: (scope?: string) => ['bmc-mii', 'ward-commitments', scope ?? 'all'] as const,
  wardPerformance: (scope?: string) => ['bmc-mii', 'ward-performance', scope ?? 'all'] as const,
  council: (scope?: string) => ['bmc-mii', 'council', scope ?? 'all'] as const,
  // Institutional functions previously unrepresented anywhere in the platform.
  wardGovernance: (scope?: string) => ['bmc-mii', 'ward-governance', scope ?? 'all'] as const,
  correspondence: (scope?: string) => ['bmc-mii', 'correspondence', scope ?? 'all'] as const,
  legal: (scope?: string) => ['bmc-mii', 'legal', scope ?? 'all'] as const,
  enforcement: (scope?: string) => ['bmc-mii', 'enforcement', scope ?? 'all'] as const,
  infraCoordination: (scope?: string) => ['bmc-mii', 'infra-coordination', scope ?? 'all'] as const,
  developmentPlan: (scope?: string) => ['bmc-mii', 'development-plan', scope ?? 'all'] as const,
  heritage: (scope?: string) => ['bmc-mii', 'heritage', scope ?? 'all'] as const,
  civicParticipation: (scope?: string) => ['bmc-mii', 'civic-participation', scope ?? 'all'] as const,
  buildings: (scope?: string) => ['bmc-mii', 'buildings', scope ?? 'all'] as const,
  transparency: (scope?: string) => ['bmc-mii', 'transparency', scope ?? 'all'] as const,
  notifiedServices: (scope?: string) => ['bmc-mii', 'notified-services', scope ?? 'all'] as const,
  // The one live, non-demonstration connector - see `pilot.service.ts`.
  pilotRevenue: () => ['bmc-mii', 'pilot-revenue'] as const,
} as const
