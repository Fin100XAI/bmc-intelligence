import type { Ward, Department } from '@/types/organisation'
import type { IntelligenceDomain, Severity } from '@/types/common'
import type { DiseaseIndicator } from '@/types/city-domains'
import type { AIResolvedEntity } from '@/types/ai'
import { DEPARTMENTS, WARDS, departmentName, wardName } from '@/data/reference'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/**
 * src/ai/nlu.ts
 *
 * Deterministic query understanding for the Municipal Copilot.
 *
 * This layer exists because the honest failure mode of a municipal assistant
 * is not a wrong number - it is answering a question adjacent to the one that
 * was asked. A first-match regex router does exactly that silently: it reads
 * "dengue in Andheri" as "health", discards "Andheri", and returns a city-wide
 * table that looks authoritative and answers nothing.
 *
 * So understanding here is explicit and inspectable:
 *
 *   - **Every route competes.** Intents are *scored*, not matched in order, so
 *     adding a route cannot silently capture traffic from an existing one.
 *   - **Entities bind before retrieval.** Wards, departments, conditions,
 *     severities and result limits are resolved from the question itself and
 *     handed to the handler, which is what makes a ward-specific question
 *     produce a ward-specific answer.
 *   - **The reading is published.** `QueryUnderstanding` is rendered to the
 *     operator alongside the answer. A misreading is then visible in one
 *     glance rather than buried under a plausible paragraph.
 *
 * It is entirely deterministic - no model, no network, no randomness. The same
 * question always resolves the same way, which is what allows the platform's
 * audit trail to mean anything.
 */

/* ==========================================================================
   Intent vocabulary
   ========================================================================== */

export type QueryIntentId =
  // Executive and cross-cutting
  | 'capabilities'
  | 'city-position'
  | 'top-risks'
  | 'my-attention'
  | 'alerts'
  | 'incidents'
  | 'decisions'
  | 'cross-domain'
  // Wards and citizen services
  | 'ward-profile'
  | 'ward-ranking'
  | 'ward-compare'
  | 'service-quality'
  | 'complaint-trend'
  // Water group
  | 'monsoon-readiness'
  | 'waterlogging'
  | 'stormwater'
  | 'water-supply'
  | 'sewerage'
  | 'coastal'
  // Environment, assets and the physical city
  | 'waste'
  | 'roads'
  | 'traffic'
  | 'street-lighting'
  | 'assets'
  | 'air-quality'
  | 'gardens'
  | 'planning'
  | 'buildings'
  // Health and emergency
  | 'health-signals'
  | 'hospitals'
  | 'emergency'
  | 'disaster'
  // Finance
  | 'budget-variance'
  | 'revenue'
  | 'property-tax'
  | 'projects'
  | 'procurement'
  | 'contractors'
  // Obligatory civic services
  | 'education'
  | 'housing'
  | 'welfare'
  | 'livelihoods'
  | 'licensing'
  | 'registration'
  | 'deathcare'
  | 'markets'
  | 'animal-welfare'
  | 'amenities'
  | 'workforce'
  | 'council'
  // Governance of the platform itself
  | 'data-quality'
  | 'security'
  | 'ai-governance'

export interface QueryIntentSpec {
  id: QueryIntentId
  /** Shown to the operator as "read as: …". */
  label: string
  /** Domains this route reports on. Drives badging and follow-ups. */
  domains: IntelligenceDomain[]
  /** Phrases that strongly indicate this route. Weight 4. */
  anchors: string[]
  /**
   * Phrases that indicate the route but are too generic to *claim* a question
   * against a route that matched a true anchor. Weight 2.5. "How is …" and
   * "the position in …" belong here: they shape a question without choosing
   * its subject.
   */
  weak?: string[]
  /** Phrases that support it without being decisive. Weight 1.5. */
  support: string[]
  /** Phrases that disqualify the route outright. */
  veto?: string[]
  /** The canonical way to ask for this route, offered as a correction. */
  example: string
}

/**
 * The route registry.
 *
 * Ordering carries no priority - it is a stable tie-break only. A route is
 * reached because its terms scored highest, which means a new route competes
 * on its merits instead of being wedged above or below an existing one.
 */
function build$QUERY_INTENTS(): QueryIntentSpec[] {
  return [
  {
    id: 'capabilities',
    label: t('What this Copilot can answer'),
    domains: ['executive'],
    anchors: ['what can you do', 'what can you answer', 'what do you know', 'what questions', 'how do you work', 'capabilit', 'what are you able', 'help me understand what'],
    support: ['help', 'able'],
    example: 'What can you answer?',
  },
  {
    id: 'city-position',
    label: t('Overall corporation position'),
    domains: ['executive', 'wards'],
    anchors: ['how is the city', 'overall position', 'city position', 'state of the city', 'overall health', 'how are we doing', 'city health', 'give me a brief', 'brief me', 'overall picture', 'city index', 'intelligence index', 'summary of the city', 'executive summary'],
    support: ['overall', 'summary', 'position', 'city'],
    example: 'What is the overall city position?',
  },
  {
    id: 'top-risks',
    label: t('Ranked operational risks'),
    domains: ['executive'],
    anchors: ['highest risk', 'top risk', 'biggest risk', 'worst risk', 'operational risk', 'key risk', 'main risk', 'greatest risk', 'most serious', 'critical risk', 'highest operational'],
    support: ['risk', 'critical', 'severity', 'urgent', 'exposure'],
    example: 'What are the five highest operational risks right now?',
  },
  {
    id: 'my-attention',
    label: t('Items awaiting the acting officer'),
    domains: ['executive', 'wards'],
    anchors: ['my attention', 'requires my', 'need my attention', 'what should i', 'my priorit', 'on my desk', 'what requires', 'attention today', 'my day', 'what do i need'],
    support: ['today', 'priority', 'pending'],
    example: 'What requires my attention today?',
  },
  {
    id: 'alerts',
    label: t('Open alerts and SLA position'),
    domains: ['executive', 'wards'],
    anchors: ['alert', 'sla breach', 'breached sla', 'overdue', 'escalat'],
    support: ['open', 'breach', 'sla', 'pending', 'response'],
    example: 'Which alerts have breached their response SLA?',
  },
  {
    id: 'incidents',
    label: t('Active incidents and response'),
    domains: ['disaster', 'emergency'],
    anchors: ['incident', 'active respon', 'response team', 'ongoing event'],
    support: ['active', 'deploy', 'team', 'affected'],
    example: 'Which incidents are currently active?',
  },
  {
    id: 'decisions',
    label: t('Decision cases awaiting determination'),
    domains: ['executive'],
    anchors: ['decision case', 'pending decision', 'awaiting decision', 'decisions required', 'decision required', 'decisions awaiting', 'awaiting determination', 'decisions pending'],
    support: ['decide', 'determination', 'alternative', 'approval'],
    example: 'Which decision cases are awaiting determination?',
  },
  {
    id: 'cross-domain',
    label: t('Cross-domain correlations'),
    domains: ['executive'],
    anchors: ['cross domain', 'cross-domain', 'correlat', 'connected to each other', 'pattern across', 'compound', 'knock on', 'linked across'],
    support: ['across', 'link', 'relationship', 'together'],
    example: 'What cross-domain exposures are currently identified?',
  },

  {
    id: 'ward-profile',
    label: t('Single ward position'),
    domains: ['wards'],
    anchors: ['ward profile', 'how is ward', 'tell me about ward', 'ward position'],
    // Locatives shape a question without choosing its subject: "the position
    // in Andheri" is a ward profile, but "the water supply position in
    // Andheri" is a water question narrowed to Andheri.
    weak: ['situation in', 'position in', 'happening in', 'going on in', 'how is', 'how are things', 'tell me about', 'what about', 'look at'],
    support: ['ward'],
    example: 'How is Andheri West performing?',
  },
  {
    id: 'ward-ranking',
    label: t('Wards ranked by composite risk'),
    domains: ['wards'],
    anchors: ['which ward', 'wards need', 'ward need', 'worst ward', 'rank ward', 'ward ranking', 'wards requiring', 'wards at risk', 'ward risk', 'wards should', 'wards are struggling'],
    // The plural alone signals a ranking question, but must not outrank a
    // domain route that matched its own anchor ("readiness across wards").
    weak: ['wards'],
    support: ['ward', 'rank', 'attention', 'priorit'],
    example: 'Which wards need the most attention?',
  },
  {
    id: 'ward-compare',
    label: t('Ward comparison'),
    domains: ['wards'],
    anchors: ['compare ward', 'ward versus', 'ward vs', 'difference between', 'compare', 'versus', ' vs '],
    support: ['against', 'better', 'worse', 'than'],
    example: 'Compare Andheri West and Kurla.',
  },
  {
    id: 'service-quality',
    label: t('Service delivery and SLA compliance'),
    domains: ['citizen-services', 'wards'],
    anchors: ['sla', 'service level', 'service quality', 'services below', 'service deterior', 'citizen service', 'grievance', 'below sla', 'service performance', 'resolution time', 'service delivery'],
    support: ['service', 'complaint', 'resolution', 'compliance', 'deterior'],
    example: 'Which services are below their SLA?',
  },
  {
    id: 'complaint-trend',
    label: t('Complaint volume and movement'),
    domains: ['citizen-services', 'wards'],
    anchors: ['complaint', 'why are complaints', 'complaints increas', 'complaints rising', 'complaint trend'],
    support: ['increase', 'rising', 'trend', 'citizen', 'volume'],
    example: 'Why are complaints increasing?',
  },

  {
    id: 'monsoon-readiness',
    label: t('Monsoon preparedness'),
    domains: ['monsoon', 'stormwater'],
    anchors: ['monsoon', 'pre monsoon', 'desilt', 'flood readiness', 'rain readiness', 'prepared for', 'flood preparedness', 'monsoon readiness'],
    support: ['rain', 'ready', 'prepar', 'pump', 'season'],
    example: 'How prepared are we for this monsoon?',
  },
  {
    id: 'waterlogging',
    label: t('Waterlogging and flood exposure'),
    domains: ['monsoon', 'stormwater'],
    anchors: ['waterlog', 'water logg', 'flooding spot', 'flood spot', 'chronic location', 'flood risk', 'inundation', 'flooded'],
    support: ['flood', 'spot', 'risk', 'clearance'],
    example: 'Where is waterlogging risk concentrated?',
  },
  {
    id: 'stormwater',
    label: t('Storm water drainage network'),
    domains: ['stormwater'],
    anchors: ['storm water', 'stormwater', 'nallah', 'culvert', 'pumping station', 'drainage network', 'storm drain'],
    support: ['drain', 'desilt', 'pump', 'discharge'],
    example: 'What is the state of the storm water drainage network?',
  },
  {
    id: 'water-supply',
    label: t('Water supply and distribution'),
    domains: ['water'],
    anchors: ['water supply', 'water pressure', 'tanker', 'non revenue water', 'nrw', 'water zone', 'water distribution', 'drinking water', 'supply hour', 'water quality', 'reservoir'],
    support: ['water', 'supply', 'pressure', 'leak', 'deficit'],
    example: 'What is the current water supply position?',
  },
  {
    id: 'sewerage',
    label: t('Sewerage and treatment'),
    domains: ['sewerage'],
    anchors: ['sewer', 'sewage', 'effluent', 'treatment plant', 'treatment facilit', 'overflow', 'blockage', 'stp'],
    support: ['treatment', 'discharge', 'compliance', 'network'],
    example: 'What is the sewerage treatment compliance position?',
  },
  {
    id: 'coastal',
    label: t('Coastal and water-body protection'),
    domains: ['coastal', 'environment'],
    anchors: ['coastal', 'mangrove', 'seawall', 'shoreline', 'beach', 'erosion', 'promenade', 'creek'],
    support: ['coast', 'sea', 'tide', 'protect'],
    example: 'What is the coastal vulnerability position?',
  },

  {
    id: 'waste',
    label: t('Solid waste management'),
    domains: ['waste'],
    // Colloquial forms included deliberately: an operator asking "what about
    // the bins" is asking a solid-waste question, and routing that to a
    // capability listing is the dead end this rebuild exists to remove.
    anchors: ['waste', 'garbage', 'refuse', 'swm', 'segregat', 'dumping', 'litter', 'collection coverage', 'sweeping', 'bins', 'dustbin', 'rubbish', 'trash', 'scavenging'],
    support: ['collect', 'clean', 'hotspot', 'disposal'],
    example: 'What is the solid waste collection position?',
  },
  {
    id: 'roads',
    label: t('Road condition and defects'),
    domains: ['roads'],
    anchors: ['road', 'pothole', 'resurfac', 'pavement', 'carriageway', 'road defect', 'road asset'],
    support: ['defect', 'repair', 'surface', 'condition', 'intervention'],
    example: 'Which road assets need intervention?',
  },
  {
    id: 'traffic',
    label: t('Traffic and mobility'),
    domains: ['mobility'],
    anchors: ['traffic', 'congestion', 'corridor speed', 'junction', 'mobility', 'peak speed'],
    support: ['speed', 'congest', 'corridor', 'closure'],
    example: 'Which traffic corridors are most congested?',
  },
  {
    id: 'street-lighting',
    label: t('Street lighting'),
    domains: ['street-lighting'],
    anchors: ['street light', 'streetlight', 'lighting', 'dark stretch', 'led conversion', 'lamp', 'burning hour'],
    support: ['light', 'dark', 'energy', 'pole', 'circuit'],
    example: 'What is the street lighting fault position?',
  },
  {
    id: 'assets',
    label: t('Municipal asset condition'),
    domains: ['assets'],
    anchors: ['municipal asset', 'asset condition', 'asset register', 'estates', 'replacement value', 'asset'],
    support: ['condition', 'inspect', 'criticality', 'maintenance'],
    example: 'Which municipal assets are in the worst condition?',
  },
  {
    id: 'air-quality',
    label: t('Air and noise quality'),
    domains: ['environment'],
    anchors: ['air quality', 'aqi', 'pm2', 'pm10', 'pollution', 'noise', 'decibel', 'emission'],
    support: ['air', 'pollut', 'environment', 'exceedance'],
    example: 'What is the air quality position across the city?',
  },
  {
    id: 'gardens',
    label: t('Gardens, trees and open space'),
    domains: ['gardens'],
    anchors: ['garden', 'park', 'tree', 'canopy', 'open space', 'playground', 'recreation ground', 'felling', 'plantation'],
    support: ['green', 'space', 'survival'],
    example: 'What is the tree canopy and open space position?',
  },
  {
    id: 'planning',
    label: t('Urban planning and development plan'),
    domains: ['planning'],
    anchors: ['urban planning', 'development plan', 'land use', 'density', 'growth corridor', 'infrastructure adequacy', 'town planning'],
    support: ['planning', 'growth', 'reservation'],
    example: 'Where is infrastructure adequacy lowest against projected growth?',
  },
  {
    id: 'buildings',
    label: t('Building safety and permissions'),
    domains: ['buildings'],
    anchors: ['dilapidat', 'structural audit', 'unauthorised construction', 'building proposal', 'occupancy certificate', 'building permission', 'cessed building', 'building'],
    support: ['structur', 'audit', 'notice', 'proposal'],
    example: 'Which buildings carry an overdue structural audit?',
  },

  {
    id: 'health-signals',
    label: t('Aggregate disease surveillance'),
    domains: ['health'],
    anchors: ['outbreak', 'dengue', 'malaria', 'leptospir', 'lepto', 'chikungunya', 'gastroenter', 'gastro', 'hepatitis', 'disease', 'public health', 'vector', 'epidemic', 'health signal', 'communicable'],
    support: ['health', 'case', 'surveillance', 'signal', 'infection'],
    example: 'Are there any public health signals I should know about?',
  },
  {
    id: 'hospitals',
    label: t('Hospital capacity and utilisation'),
    domains: ['hospitals'],
    anchors: ['hospital', 'bed occupancy', 'icu', 'dispensary', 'maternity', 'emergency load', 'bed'],
    support: ['occupancy', 'capacity', 'medical', 'staffing'],
    example: 'What is the hospital bed and ICU occupancy position?',
  },
  {
    id: 'emergency',
    label: t('Fire and emergency response'),
    domains: ['emergency'],
    anchors: ['fire', 'fire brigade', 'response time', 'fire station', 'ambulance', 'rescue', 'appliance'],
    support: ['emergency', 'response', 'station', 'readiness'],
    example: 'What is the fire and emergency response position?',
  },
  {
    id: 'disaster',
    label: t('Disaster management readiness'),
    domains: ['disaster'],
    anchors: ['disaster', 'evacuation', 'emergency operations', 'cyclone', 'earthquake', 'eoc', 'contingency'],
    support: ['readiness', 'response', 'shelter'],
    example: 'What is the disaster management readiness position?',
  },

  {
    id: 'budget-variance',
    label: t('Budget utilisation and variance'),
    domains: ['budget'],
    anchors: ['budget', 'utilisation', 'utilization', 'variance', 'expenditure', 'capital outlay', 'underspend', 'under spend', 'overspend', 'phased plan'],
    support: ['crore', 'allocation', 'plan', 'spend', 'head'],
    example: 'Show me department budget variance against the phased plan.',
  },
  {
    id: 'revenue',
    label: t('Revenue collection and arrears'),
    domains: ['revenue'],
    anchors: ['revenue', 'collection efficiency', 'arrear', 'octroi', 'tax collection', 'collection pattern', 'income', 'receipt'],
    support: ['collect', 'target', 'demand', 'anomal'],
    example: 'What are the current revenue risks?',
  },
  {
    id: 'property-tax',
    label: t('Property assessment and tax'),
    domains: ['property'],
    anchors: ['property tax', 'property assessment', 'assessed unit', 'property segment', 'capital value', 'reassessment', 'rateable'],
    support: ['property', 'assess', 'segment'],
    example: 'What is the property tax assessment and collection position?',
  },
  {
    id: 'projects',
    label: t('Capital works delivery'),
    domains: ['projects'],
    anchors: ['project', 'capital work', 'milestone', 'schedule risk', 'works programme', 'slippage', 'delayed work'],
    support: ['delay', 'risk', 'complete', 'sanction', 'progress'],
    example: 'Which capital projects are showing schedule risk or delay?',
  },
  {
    id: 'procurement',
    label: t('Procurement and contracts'),
    domains: ['procurement'],
    anchors: ['procurement', 'tender', 'contract', 'award', 'variation', 'bid', 'purchase'],
    support: ['vendor', 'extension', 'value', 'stage'],
    example: 'Are there any unusual procurement patterns?',
  },
  {
    id: 'contractors',
    label: t('Contractor delivery performance'),
    domains: ['procurement', 'projects'],
    anchors: ['contractor', 'agency performance', 'empanel', 'vendor performance', 'executing agency'],
    support: ['performance', 'delivery', t('on time'), 'observation'],
    example: 'Which contractors carry the weakest delivery performance?',
  },

  {
    id: 'education',
    label: t('Municipal schools'),
    domains: ['education'],
    anchors: ['school', 'education', 'pupil', 'enrolment', 'teacher', 'dropout', 'mid day meal', 'student'],
    support: ['attend', 'classroom', 'vacancy'],
    example: 'What is the municipal school position?',
  },
  {
    id: 'housing',
    label: t('Settlements and rehousing'),
    domains: ['housing'],
    anchors: ['slum', 'settlement', 'housing', 'rehous', 'tenement', 'transit accommodation', 'redevelopment', 'informal'],
    support: ['scheme', 'household', t('basic service')],
    example: 'What is the settlement service adequacy position?',
  },
  {
    id: 'welfare',
    label: t('Social welfare schemes'),
    domains: ['welfare'],
    anchors: ['welfare', 'pension', 'beneficiar', 'disburse', 'entitlement', 'social scheme', 'ration'],
    support: ['scheme', 'benefit', 'enrol'],
    example: 'What is the welfare scheme disbursement position?',
  },
  {
    id: 'livelihoods',
    label: t('Urban livelihoods'),
    domains: ['livelihoods'],
    anchors: ['livelihood', 'self help group', 'shg', 'skill training', 'vendor zone', 'hawker', 'street vendor', 'employment'],
    support: ['training', 'placement', 'centre'],
    example: 'What is the urban livelihoods position?',
  },
  {
    id: 'licensing',
    label: t('Trade licences and enforcement'),
    domains: ['licensing'],
    // Both spellings, and both parts of speech: British English writes the
    // noun "licence" with a c and the verb "licensing" with an s, so an anchor
    // on one alone misses half the ways an operator will ask.
    anchors: ['licenc', 'licens', 'trade licence', 'shop and establishment', 'unlicensed', 'eating house', 'lodging'],
    support: ['permit', 'trade', 'renewal', 'charter'],
    example: 'What is the trade licensing and enforcement position?',
  },
  {
    id: 'registration',
    label: t('Birth and death registration'),
    domains: ['registration'],
    anchors: ['birth', 'death registration', 'vital statistic', 'certificate issue', 'registration centre', 'registrar'],
    support: ['registration', 'certificate', 'backlog'],
    example: 'What is the birth and death registration position?',
  },
  {
    id: 'deathcare',
    label: t('Cemeteries and crematoria'),
    domains: ['deathcare'],
    anchors: ['cemeter', 'cremator', 'burial', 'cremation', 'funeral', 'crematoria'],
    support: ['capacity', 'wait', 'ground'],
    example: 'What is the cemetery and crematorium capacity position?',
  },
  {
    id: 'markets',
    label: t('Markets and slaughterhouses'),
    domains: ['markets'],
    anchors: ['market', 'slaughterhouse', 'abattoir', 'stall', 'hygiene score', 'trader', 'mandi'],
    support: ['hygiene', 'inspection', 'occupancy'],
    example: 'What is the municipal market hygiene position?',
  },
  {
    id: 'animal-welfare',
    label: t('Animal welfare'),
    domains: ['animal-welfare'],
    anchors: ['animal', 'stray', 'sterilisation', 'sterilization', 'rabies', 'cattle', 'veterinar', 'dog'],
    support: ['impound', 'vaccinat', 'shelter'],
    example: 'What is the stray animal sterilisation position?',
  },
  {
    id: 'amenities',
    label: t('Public toilets, parking and amenities'),
    domains: ['amenities'],
    anchors: ['public toilet', 'amenit', 'parking', 'community hall', 'swimming pool', 'sanitation block'],
    support: ['toilet', 'occupancy', 'accessible'],
    example: 'What is the public toilet and amenity adequacy position?',
  },
  {
    id: 'workforce',
    label: t('Workforce and staffing'),
    domains: ['workforce'],
    anchors: ['workforce', 'staffing', 'vacancy', 'cadre', 'sanctioned post', 'personnel', 'manpower', 'establishment'],
    support: ['staff', 'vacan', 'deploy', 'workload'],
    example: 'Where is the workforce vacancy position most acute?',
  },
  {
    id: 'council',
    label: t('Council and committees'),
    domains: ['council'],
    anchors: ['council', 'corporator', 'committee', 'resolution', 'standing committee', 'general body', 'deliberative'],
    support: ['tabled', 'vote', 'implementation'],
    example: 'What is the status of council resolutions?',
  },

  {
    id: 'data-quality',
    label: t('Data lineage and provenance'),
    domains: ['platform'],
    // "computed" / "calculated" anchor here rather than on the domain route,
    // because "how is the ward risk index computed" is a lineage question that
    // merely happens to name a ward - and the domain route would otherwise win
    // on the word "ward" and answer the wrong question.
    anchors: ['data quality', 'lineage', 'provenance', 'computed', 'calculated', 'derived from', 'what feeds', 'how is this', 'how is it', 'where does this data', 'freshness', 'how do you know', 'can i trust', 'data source'],
    support: ['source', 'quality', 'evidence', 'compute'],
    example: 'How is the ward risk index computed, and from what sources?',
  },
  {
    id: 'security',
    label: t('Security posture'),
    domains: ['security'],
    anchors: ['security posture', 'cyber', 'access review', 'security event', 'authentication', 'breach attempt', 'information security'],
    support: ['security', 'access', 'control'],
    example: 'What is the information security posture?',
  },
  {
    id: 'ai-governance',
    label: t('AI governance'),
    domains: ['ai-governance'],
    anchors: ['ai governance', 'model registry', 'prompt template', 'human oversight', 'model evaluation', 'ai risk', 'which model'],
    support: ['model', 'oversight', 'approval', 'evaluation'],
    example: 'What is the AI human-oversight position?',
  },
]
}
export let QUERY_INTENTS: QueryIntentSpec[] = build$QUERY_INTENTS()
registerLayer(() => {
  QUERY_INTENTS = build$QUERY_INTENTS()
})

export const INTENT_BY_ID: Map<QueryIntentId, QueryIntentSpec> = new Map(
  QUERY_INTENTS.map((intent) => [intent.id, intent]),
)

/* ==========================================================================
   Normalisation
   ========================================================================== */

/**
 * Lower-cases and strips punctuation, keeping `/` because ward codes carry it
 * ("K/W"), and wrapping in spaces so every phrase test can assert a leading
 * word boundary without a regular expression.
 */
export function normalise(text: string): string {
  return ` ${text.toLowerCase().replace(/[^a-z0-9/]+/g, ' ').replace(/\s+/g, ' ').trim()} `
}

/**
 * Word-boundary *prefix* match. ` project` matches "project", "projects" and
 * "project's" but never "subproject", which is the right trade-off for English
 * morphology without carrying a stemmer.
 */
function hasPhrase(hay: string, phrase: string): boolean {
  return hay.includes(` ${phrase}`)
}

/** Whole-word match, used for proper nouns where a prefix match would over-fire. */
function hasWord(hay: string, word: string): boolean {
  return hay.includes(` ${word} `)
}

/* ==========================================================================
   Entity resolution
   ========================================================================== */

/** Locality tokens too generic to identify a ward on their own. */
const GENERIC_PLACE_TOKENS = new Set([
  'north', 'south', 'east', 'west', 'central', 'nagar', 'colony', 'road', 'marg',
  'park', 'hill', 'hills', 'village', 'town', 'city', 'chowk', 'gaon', 'wadi',
  'estate', 'sector', 'phase', 'block', 'lane', 'cross', 'main', 'link', 'ward',
])

/**
 * Candidate labels that identify a ward.
 *
 * `whole` labels name the ward unambiguously - a full locality segment
 * ("Andheri West") or the ward code. `partial` labels are single tokens
 * ("Andheri") which several wards may legitimately share.
 */
function wardCandidates(ward: Ward): { whole: string[]; partial: string[] } {
  const whole: string[] = []
  const partial: string[] = []
  for (const segment of ward.name.split('·')) {
    const locality = segment.trim().toLowerCase()
    if (locality.length >= 4) whole.push(locality)
    for (const token of locality.split(' ')) {
      if (token.length >= 5 && !GENERIC_PLACE_TOKENS.has(token) && token !== locality) partial.push(token)
    }
  }
  return { whole: Array.from(new Set(whole)), partial: Array.from(new Set(partial)) }
}

export interface ResolvedWard {
  ward: Ward
  matchedText: string
  /** True where the question named the ward unambiguously. */
  precise: boolean
}

/**
 * Binds wards named anywhere in the question.
 *
 * Two rules keep this from over-firing:
 *
 * **Codes are matched conservatively.** A bare "A" or "B" is a ward code in
 * this corporation and an article or a grade everywhere else, so a code shorter
 * than three characters only binds when the operator wrote "ward A".
 *
 * **A precise naming beats a shared token.** "Andheri West" names one ward;
 * "Andheri" alone names two, and both are correct answers to what was asked.
 * So where any ward matched on a full locality or a code, wards that matched
 * only on a shared token are dropped - otherwise asking about Andheri West
 * would silently pull Andheri East in alongside it.
 */
export function resolveWards(hay: string): ResolvedWard[] {
  const out: ResolvedWard[] = []
  for (const ward of WARDS) {
    const code = ward.code.toLowerCase()
    const { whole, partial } = wardCandidates(ward)

    const wholeHit = whole.find((candidate) => hasWord(hay, candidate))
    if (wholeHit) {
      out.push({ ward, matchedText: wholeHit, precise: true })
      continue
    }

    if (code.length >= 3 && (hasWord(hay, code) || hasWord(hay, code.replace(/\//g, ' ')))) {
      out.push({ ward, matchedText: ward.code, precise: true })
      continue
    }
    if (hasWord(hay, `ward ${code}`)) {
      out.push({ ward, matchedText: `ward ${ward.code}`, precise: true })
      continue
    }

    const partialHit = partial.find((candidate) => hasWord(hay, candidate))
    if (partialHit) out.push({ ward, matchedText: partialHit, precise: false })
  }

  const precise = out.filter((r) => r.precise)
  return precise.length > 0 ? precise : out
}

export interface ResolvedDepartment {
  department: Department
  matchedText: string
}

/** Words that mark a phrase as naming an organisation rather than a subject. */
const DEPARTMENT_CUES = ['department', 'dept', 'cell', 'office', 'brigade', 'wing', 'directorate']

/**
 * Binds departments named in the question.
 *
 * Deliberately conservative, because a department's short name is usually also
 * the ordinary noun for its subject. "Projects" is the Project Management
 * Department; it is also the word in "which projects are delayed?", where the
 * operator means every capital work in the corporation and not the handful the
 * Project Management Department itself owns. Binding the department there is
 * worse than binding nothing: the route filters correctly to a department that
 * owns almost none of the register and returns an empty answer that reads like
 * a finding. The same collision exists for Roads, Hospitals, Education,
 * Housing, Finance, Procurement, Environment, Planning and Gardens.
 *
 * So a department binds only where the question names it *as an organisation*:
 * by its full title, by an unambiguous acronym, or by its short name alongside
 * a departmental cue.
 */
export function resolveDepartments(hay: string): ResolvedDepartment[] {
  const out: ResolvedDepartment[] = []
  for (const department of DEPARTMENTS) {
    const full = department.name.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
    const short = department.shortName.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
    let matchedText: string | null = null

    if (full.length >= 4 && hasWord(hay, full)) {
      matchedText = department.name
    } else if (
      // An all-capitals acronym of three characters or more names only itself:
      // "SWM", "SWD". Two-character ones are excluded - "IT" is a pronoun.
      department.shortName.length >= 3
      && department.shortName === department.shortName.toUpperCase()
      && hasWord(hay, short)
    ) {
      matchedText = department.shortName
    } else if (short.length >= 3 && DEPARTMENT_CUES.some((cue) => short.includes(cue)) && hasWord(hay, short)) {
      // The short name already carries its own cue - "Fire Brigade".
      matchedText = department.shortName
    } else if (short.length >= 3) {
      const cued = DEPARTMENT_CUES.find(
        (cue) => hasWord(hay, `${short} ${cue}`) || hasWord(hay, `${cue} of ${short}`) || hasWord(hay, `${cue} ${short}`),
      )
      if (cued) matchedText = `${department.shortName} ${cued}`
    }

    if (matchedText) out.push({ department, matchedText })
  }
  return out
}

const CONDITION_TERMS: Array<{ id: DiseaseIndicator; terms: string[] }> = [
  { id: 'dengue', terms: ['dengue'] },
  { id: 'malaria', terms: ['malaria'] },
  { id: 'leptospirosis', terms: ['leptospir', 'lepto'] },
  { id: 'gastroenteritis', terms: ['gastroenter', 'gastro'] },
  { id: 'hepatitis', terms: ['hepatitis', 'jaundice'] },
  { id: 'respiratory', terms: ['respirator', 'influenza', 'breathing'] },
  { id: 'chikungunya', terms: ['chikungunya', 'chikun'] },
]

export interface ResolvedCondition {
  condition: DiseaseIndicator
  matchedText: string
}

/** Binds the aggregate disease indicators named in the question. */
export function resolveConditions(hay: string): ResolvedCondition[] {
  const out: ResolvedCondition[] = []
  for (const entry of CONDITION_TERMS) {
    const hit = entry.terms.find((term) => hasPhrase(hay, term))
    if (hit) out.push({ condition: entry.id, matchedText: hit })
  }
  return out
}

const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20,
}

/**
 * The result count the operator asked for. Returns `null` where none was
 * stated, so a handler can apply its own default rather than pretend a limit
 * was requested.
 */
export function resolveLimit(hay: string): number | null {
  const digits = /\b(?:top|first|highest|worst|best|lowest|bottom)\s+(\d{1,2})\b/.exec(hay)
    ?? /\b(\d{1,2})\s+(?:highest|worst|biggest|largest|top|lowest|most)\b/.exec(hay)
  if (digits?.[1]) {
    const parsed = Number.parseInt(digits[1], 10)
    if (parsed >= 1 && parsed <= 30) return parsed
  }
  for (const [word, value] of Object.entries(WORD_NUMBERS)) {
    if (
      hasPhrase(hay, `top ${word}`)
      || hasPhrase(hay, `${word} highest`)
      || hasPhrase(hay, `${word} biggest`)
      || hasPhrase(hay, `${word} worst`)
      || hasPhrase(hay, `first ${word}`)
    ) {
      return value
    }
  }
  return null
}

function build$SEVERITY_TERMS(): Array<{ id: Severity; terms: string[] }> {
  return [
  { id: 'critical', terms: ['critical', 'severe'] },
  { id: 'high', terms: [t('high severity'), t('high priority'), 'serious'] },
  { id: 'medium', terms: [t('medium severity'), 'moderate'] },
  { id: 'low', terms: [t('low severity'), 'minor'] },
]
}
let SEVERITY_TERMS: Array<{ id: Severity; terms: string[] }> = build$SEVERITY_TERMS()
registerLayer(() => {
  SEVERITY_TERMS = build$SEVERITY_TERMS()
})

/** Binds an explicit severity filter where the operator stated one. */
export function resolveSeverity(hay: string): Severity | null {
  for (const entry of SEVERITY_TERMS) {
    if (entry.terms.some((term) => hasPhrase(hay, term))) return entry.id
  }
  return null
}

function build$COMPARISON_TERMS() {
  return ['compare', 'versus', ' vs ', t('against each other'), t('difference between'), t('better than'), t('worse than'), t('relative to')]
}
let COMPARISON_TERMS: ReturnType<typeof build$COMPARISON_TERMS> = build$COMPARISON_TERMS()
registerLayer(() => {
  COMPARISON_TERMS = build$COMPARISON_TERMS()
})

/** True where the operator asked for a comparison rather than a position. */
export function resolveComparison(hay: string): boolean {
  return COMPARISON_TERMS.some((term) => (term.startsWith(' ') ? hay.includes(term) : hasPhrase(hay, term)))
}

/* ==========================================================================
   Intent scoring
   ========================================================================== */

const ANCHOR_WEIGHT = 4
const WEAK_WEIGHT = 2.5
const SUPPORT_WEIGHT = 1.5
/** Below this, no route has earned the question and the fallback applies. */
const MATCH_FLOOR = 4

interface IntentScore {
  intent: QueryIntentSpec
  score: number
  matchedTerms: string[]
  /** True anchor hits only. A route with none has not claimed the subject. */
  anchorHits: number
}

function scoreIntent(hay: string, intent: QueryIntentSpec): IntentScore {
  if (intent.veto?.some((term) => hasPhrase(hay, term))) {
    return { intent, score: 0, matchedTerms: [], anchorHits: 0 }
  }
  const matchedTerms: string[] = []
  let score = 0
  let anchorHits = 0
  for (const anchor of intent.anchors) {
    if (anchor.startsWith(' ') ? hay.includes(anchor) : hasPhrase(hay, anchor)) {
      score += ANCHOR_WEIGHT
      anchorHits += 1
      matchedTerms.push(anchor.trim())
    }
  }
  for (const term of intent.weak ?? []) {
    if (hasPhrase(hay, term)) {
      score += WEAK_WEIGHT
      matchedTerms.push(term.trim())
    }
  }
  for (const term of intent.support) {
    if (hasPhrase(hay, term)) {
      score += SUPPORT_WEIGHT
      matchedTerms.push(term.trim())
    }
  }
  return { intent, score, matchedTerms, anchorHits }
}

/** 0-100 strength, so a weak reading can be shown as weak rather than implied. */
function strengthFrom(score: number): number {
  return Math.max(0, Math.min(100, Math.round((score / 8) * 100)))
}

/**
 * Entity affinity.
 *
 * A bound entity is evidence about what a question is *about*, independent of
 * the words that phrase it. "What is the dengue situation in Andheri West?"
 * scores identically as a ward question and as a health question on wording
 * alone - both match one anchor. The bound condition is what should break that
 * tie, and it should break it towards health, because that is what the operator
 * asked about. Wording alone would decide it by registry order, which is
 * arbitrary and therefore wrong.
 */
function applyAffinity(scored: IntentScore, entities: QueryEntities): IntentScore {
  if (scored.score === 0) return scored

  // A ward profile with no ward cannot name its own subject, so it is not a
  // route. Without this, the locative anchors ("position in", "situation in")
  // capture questions like "what is the position in the budget?".
  if (scored.intent.id === 'ward-profile' && entities.wards.length === 0) {
    return { ...scored, score: 0, matchedTerms: [] }
  }

  let bonus = 0
  if (entities.conditions.length > 0 && scored.intent.domains.includes('health')) bonus += 3
  if (entities.wards.length > 0 && scored.intent.id === 'ward-profile') bonus += 2
  if (
    entities.departments.length > 0
    && entities.departments.some((d) => scored.intent.domains.includes(d.domain))
  ) {
    bonus += 2
  }
  return bonus > 0 ? { ...scored, score: scored.score + bonus } : scored
}

/* ==========================================================================
   The public result
   ========================================================================== */

export interface QueryEntities {
  wards: Ward[]
  departments: Department[]
  conditions: DiseaseIndicator[]
  severity: Severity | null
  /** Null where the operator stated no limit; handlers apply their own default. */
  limit: number | null
  comparison: boolean
}

export interface QueryUnderstanding {
  /** The question exactly as asked. */
  question: string
  /** Normalised form the matcher worked over, retained for explainability. */
  normalised: string
  intent: QueryIntentSpec
  matchStrength: number
  matchedTerms: string[]
  entities: QueryEntities
  /** Rendered bindings, ready for the interpretation strip. */
  resolvedEntities: AIResolvedEntity[]
  alternatives: Array<{ intentId: QueryIntentId; label: string; question: string }>
  /** Stated where the engine narrowed, widened or fell back. */
  note?: string
  /** True where no route scored above the floor and a fallback was applied. */
  fellBack: boolean
}

/** Routes a ward-shaped question to `ward-profile` when nothing else scored. */
function fallbackIntent(entities: QueryEntities): { id: QueryIntentId; note: string } {
  if (entities.comparison && entities.wards.length >= 2) {
    return {
      id: 'ward-compare',
      note: t('No specific retrieval route matched the wording, but two or more wards and a comparison were named, so the wards were compared.'),
    }
  }
  if (entities.wards.length > 0) {
    return {
      id: 'ward-profile',
      note: t('No specific retrieval route matched the wording, but a ward was named, so its full operational position is set out instead.'),
    }
  }
  if (entities.conditions.length > 0) {
    return {
      id: 'health-signals',
      note: t('No specific retrieval route matched the wording, but an aggregate disease indicator was named, so the surveillance position for it is set out instead.'),
    }
  }
  if (entities.departments.length > 0) {
    return {
      id: 'city-position',
      note: t('No specific retrieval route matched the wording. The corporation-wide position is set out instead, with the named department highlighted where it appears.'),
    }
  }
  return {
    id: 'capabilities',
    note: t('No retrieval route matched this wording. Rather than answer an adjacent question, the routes this Copilot can answer are set out below.'),
  }
}

/**
 * Reads a free-text question into a route and a set of bound entities.
 *
 * Never throws and never returns "unknown": either a route scored, or a
 * fallback is applied *and stated*. Silence about a failed reading is the one
 * outcome this function will not produce.
 */
export function understandQuery(question: string): QueryUnderstanding {
  const hay = normalise(question)

  const wards = resolveWards(hay)
  const departments = resolveDepartments(hay)
  const conditions = resolveConditions(hay)
  const entities: QueryEntities = {
    wards: wards.map((w) => w.ward),
    departments: departments.map((d) => d.department),
    conditions: conditions.map((c) => c.condition),
    severity: resolveSeverity(hay),
    limit: resolveLimit(hay),
    comparison: resolveComparison(hay),
  }

  const scores = QUERY_INTENTS
    .map((intent) => applyAffinity(scoreIntent(hay, intent), entities))
    .sort((a, b) => b.score - a.score)
  const best = scores[0]

  let chosen: IntentScore
  let note: string | undefined
  let fellBack = false

  if (!best || best.score < MATCH_FLOOR) {
    const fallback = fallbackIntent(entities)
    const spec = INTENT_BY_ID.get(fallback.id)
    // The registry is exhaustive over `QueryIntentId`, but the lookup is
    // defended anyway: a route that vanished must degrade to a stated
    // fallback, never to a thrown error inside an answer.
    chosen = {
      intent: spec ?? QUERY_INTENTS[0]!,
      score: best?.score ?? 0,
      matchedTerms: best?.matchedTerms ?? [],
      anchorHits: 0,
    }
    note = fallback.note
    fellBack = true
  } else {
    chosen = best

    // A bound ward narrows an answer; it does not choose its subject. Where a
    // domain route matched a true anchor on its own wording, that route
    // answers and the ward becomes its filter - otherwise "the water supply
    // position in Andheri" reads as a ward profile that happens to mention
    // water, which is the class of near-miss this whole layer exists to stop.
    if (chosen.anchorHits === 0 && (chosen.intent.id === 'ward-profile' || chosen.intent.id === 'ward-ranking')) {
      const domainRoute = scores.find((s) => s.intent.id !== chosen.intent.id && s.anchorHits > 0)
      if (domainRoute) {
        chosen = domainRoute
        note = `Read as ${domainRoute.intent.label.toLowerCase()}${entities.wards.length > 0 ? t(', narrowed to the ward named in the question') : ''}.`
      }
    }
    // A ward-shaped question that landed on the generic ward ranking is
    // almost always asking about the ward it named.
    if (chosen.intent.id === 'ward-ranking' && entities.wards.length === 1 && !entities.comparison) {
      const spec = INTENT_BY_ID.get('ward-profile')
      if (spec) {
        chosen = { intent: spec, score: chosen.score, matchedTerms: chosen.matchedTerms, anchorHits: chosen.anchorHits }
        note = 'A single ward was named, so its own position is set out rather than a city-wide ranking.'
      }
    }
    if (entities.comparison && entities.wards.length >= 2 && chosen.intent.id !== 'ward-compare') {
      const spec = INTENT_BY_ID.get('ward-compare')
      if (spec) {
        chosen = { intent: spec, score: chosen.score, matchedTerms: chosen.matchedTerms, anchorHits: chosen.anchorHits }
        note = 'Two or more wards were named alongside a comparison, so they are compared side by side.'
      }
    }
  }

  const resolvedEntities: AIResolvedEntity[] = [
    ...wards.map((w) => ({ kind: 'ward' as const, id: w.ward.id, label: wardName(w.ward.id), matchedText: w.matchedText })),
    ...departments.map((d) => ({
      kind: 'department' as const,
      id: d.department.id,
      label: departmentName(d.department.id),
      matchedText: d.matchedText,
    })),
    ...conditions.map((c) => ({ kind: 'condition' as const, id: c.condition, label: c.condition, matchedText: c.matchedText })),
    ...(entities.severity ? [{ kind: 'severity' as const, label: `${entities.severity} severity`, matchedText: entities.severity }] : []),
    ...(entities.limit ? [{ kind: 'limit' as const, label: `top ${entities.limit}`, matchedText: String(entities.limit) }] : []),
    ...(entities.comparison ? [{ kind: 'comparison' as const, label: t('comparison requested'), matchedText: 'compare' }] : []),
  ]

  const alternatives = scores
    .filter((s) => s.intent.id !== chosen.intent.id && s.score >= MATCH_FLOOR / 2 && s.score > 0)
    .slice(0, 3)
    .map((s) => ({ intentId: s.intent.id, label: s.intent.label, question: s.intent.example }))

  return {
    question,
    normalised: hay.trim(),
    intent: chosen.intent,
    matchStrength: strengthFrom(chosen.score),
    matchedTerms: Array.from(new Set(chosen.matchedTerms)).slice(0, 6),
    entities,
    resolvedEntities,
    alternatives,
    note,
    fellBack,
  }
}
