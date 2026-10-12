import { t } from '@/i18n'

/**
 * src/utils/enum-label.ts
 *
 * DISPLAY READING OF A RECORD'S ENUM VALUE
 *
 * Registers carry their states, kinds and categories as kebab-case identifiers
 * - `not-required`, `en-route`, `pending-approval`. Several surfaces showed
 * them by swapping the hyphens for spaces, which reads acceptably in English
 * and leaves English on a Marathi screen. This is the one place those values
 * are turned into words: the English reading is exactly the hyphen-for-space
 * form the screens already showed, so nothing changes in English, and every
 * value has a catalogue entry for Marathi.
 *
 * The value itself is never translated - filters, tones and comparisons keep
 * using the identifier. Only what is rendered passes through here. A value
 * not listed falls back to the hyphen-for-space form.
 */
export function enumLabel(value: string): string {
  switch (value) {
    // Review, approval and workflow states
    case 'accepted': return t('accepted')
    case 'active': return t('active')
    case 'approved': return t('approved')
    case 'closed': return t('closed')
    case 'contained': return t('contained')
    case 'draft': return t('draft')
    case 'escalated': return t('escalated')
    case 'failed': return t('failed')
    case 'false-positive': return t('false positive')
    case 'flagged': return t('flagged')
    case 'blocked': return t('blocked')
    case 'in-progress': return t('in progress')
    case 'investigating': return t('investigating')
    case 'mitigated': return t('mitigated')
    case 'modified': return t('modified')
    case 'monitoring': return t('monitoring')
    case 'not-required': return t('not required')
    case 'not-started': return t('not started')
    case 'open': return t('open')
    case 'passed': return t('passed')
    case 'paused': return t('paused')
    case 'pending': return t('pending')
    case 'pending-approval': return t('pending approval')
    case 're-evaluation-due': return t('re evaluation due')
    case 'rejected': return t('rejected')
    case 'restricted': return t('restricted')
    case 'retired': return t('retired')
    case 'review-required': return t('review required')
    case 'suspended': return t('suspended')
    case 'under-review': return t('under review')
    case 'withdrawn': return t('withdrawn')
    // Risk classes and environments
    case 'limited': return t('limited')
    case 'low': return t('low')
    case 'medium': return t('medium')
    case 'moderate': return t('moderate')
    case 'high': return t('high')
    case 'demonstration': return t('demonstration')
    case 'evaluation': return t('evaluation')
    case 'staging': return t('staging')
    case 'production': return t('production')
    // Operational and connector states
    case 'operational': return t('operational')
    case 'degraded': return t('degraded')
    case 'at-risk': return t('at risk')
    case 'critical': return t('critical')
    case 'simulation': return t('simulation')
    case 'adapter-ready': return t('adapter ready')
    case 'not-connected': return t('not connected')
    case 'planned': return t('planned')
    // Evidence kinds
    case 'source-record': return t('source record')
    case 'derived-metric': return t('derived metric')
    case 'sensor-reading': return t('sensor reading')
    case 'field-report': return t('field report')
    case 'inspection': return t('inspection')
    case 'document': return t('document')
    case 'model-output': return t('model output')
    case 'complaint': return t('complaint')
    case 'financial-record': return t('financial record')
    // Security event types
    case 'failed-authentication': return t('failed authentication')
    case 'privilege-escalation-request': return t('privilege escalation request')
    case 'unusual-session': return t('unusual session')
    case 'policy-violation': return t('policy violation')
    case 'restricted-access-attempt': return t('restricted access attempt')
    case 'bulk-export': return t('bulk export')
    case 'configuration-change': return t('configuration change')
    case 'integration-auth-failure': return t('integration auth failure')
    case 'anomalous-query-volume': return t('anomalous query volume')
    // Outcome effectiveness
    case 'effective': return t('effective')
    case 'partially-effective': return t('partially effective')
    case 'not-effective': return t('not effective')
    case 'too-early': return t('too early')
    // Response teams
    case 'fire': return t('fire')
    case 'disaster-response': return t('disaster response')
    case 'medical': return t('medical')
    case 'engineering': return t('engineering')
    case 'dewatering': return t('dewatering')
    case 'police-liaison': return t('police liaison')
    case 'deployed': return t('deployed')
    case 'en-route': return t('en route')
    case 'standby': return t('standby')
    case 'stood-down': return t('stood down')
    // Emergency stations
    case 'fire-station': return t('fire station')
    case 'disaster-control': return t('disaster control')
    case 'ambulance-base': return t('ambulance base')
    // Incident types
    case 'flood': return t('flood')
    case 'building-collapse': return t('building collapse')
    case 'infrastructure-failure': return t('infrastructure failure')
    case 'extreme-weather': return t('extreme weather')
    case 'public-health': return t('public health')
    case 'road-disruption': return t('road disruption')
    case 'utility-incident': return t('utility incident')
    // Asset categories
    case 'water-asset': return t('water asset')
    case 'pumping-station': return t('pumping station')
    case 'drain': return t('drain')
    case 'road': return t('road')
    case 'bridge': return t('bridge')
    case 'building': return t('building')
    case 'hospital': return t('hospital')
    case 'school': return t('school')
    case 'waste-facility': return t('waste facility')
    case 'vehicle': return t('vehicle')
    case 'street-light': return t('street light')
    case 'park': return t('park')
    case 'market': return t('market')
    case 'crematorium': return t('crematorium')
    case 'public-convenience': return t('public convenience')
    // Road defects
    case 'pothole': return t('pothole')
    case 'crack': return t('crack')
    case 'depression': return t('depression')
    case 'edge-failure': return t('edge failure')
    case 'utility-cut': return t('utility cut')
    case 'manhole': return t('manhole')
    case 'reported': return t('reported')
    case 'verified': return t('verified')
    case 'work-order-issued': return t('work order issued')
    case 'in-repair': return t('in repair')
    case 'repaired': return t('repaired')
    case 'verified-closed': return t('verified closed')
    // Revenue streams
    case 'property-tax': return t('property tax')
    case 'water-charges': return t('water charges')
    case 'development-charges': return t('development charges')
    case 'licence-fees': return t('licence fees')
    case 'advertisement': return t('advertisement')
    case 'rentals': return t('rentals')
    case 'octroi-compensation': return t('octroi compensation')
    case 'other': return t('other')
    // AI risk categories
    case 'hallucination': return t('hallucination')
    case 'bias': return t('bias')
    case 'privacy': return t('privacy')
    case 'data-leakage': return t('data leakage')
    case 'prompt-injection': return t('prompt injection')
    case 'unsafe-recommendation': return t('unsafe recommendation')
    case 'excessive-automation': return t('excessive automation')
    case 'model-drift': return t('model drift')
    case 'explainability': return t('explainability')
    case 'dependency': return t('dependency')
    default: return value.replace(/-/g, ' ')
  }
}
