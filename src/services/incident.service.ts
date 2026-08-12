import { municipality } from '@/config/municipality.config'
import { referencePrefix } from '@/data/naming'
import { WARD_BY_ID } from '@/data/reference'
import { filterByScope } from '@/security/access'
import type { AccessContext } from '@/security/model'
import type { ConfidenceLevel, DataClassification, IntelligenceDomain, Paged, Severity } from '@/types/common'
import type { ActionNote, Incident, IncidentStatus, IncidentType, ResponseTeam, TimelineEvent } from '@/types/operations'
import type { User } from '@/types/organisation'
import { isoFromAnchor } from '@/utils/deterministic'
import { findTransition } from '@/workflows/engine'
import { incidentWorkflow } from '@/workflows/machines'
import { ServiceError, assertAccess, deepClone, paginate, recordAudit, scopeToTenant, simulateLatency } from './client'
import { emitChange, getCollection, setCollection, type SituationLogEntry } from './store'
import { t } from '@/i18n'

/**
 * src/services/incident.service.ts
 *
 * Unified incident management across disaster, fire, infrastructure and
 * health. Every mutation also mirrors a short entry into the shared
 * `situationLog` collection - the city-wide, cross-incident chronological
 * feed the Situation Room renders - in addition to the incident's own
 * `timeline`.
 */

export interface IncidentFilters {
  severity?: Severity[]
  wardId?: string
  departmentId?: string
  type?: IncidentType[]
  status?: IncidentStatus[]
  search?: string
  page?: number
  pageSize?: number
}

export interface IncidentCreateInput {
  title: string
  description: string
  type: IncidentType
  severity: Severity
  wardId: string
  locationName: string
  departmentId: string
  affectedPopulation?: number
  affectedAreaSqKm?: number
  roadsImpacted?: string[]
  hospitalsImpacted?: string[]
  confidence?: ConfidenceLevel
  classification?: DataClassification
}

export interface DeployTeamInput {
  name: string
  type: ResponseTeam['type']
  strength: number
  status?: ResponseTeam['status']
}

/** Incidents do not carry an `IntelligenceDomain` field directly; this maps
 * `IncidentType` onto the nearest domain so `AccessScope.domains` (e.g. a
 * Health Officer's scope, which excludes 'monsoon') still partitions
 * incident visibility the same way it partitions every other surface. */
const INCIDENT_TYPE_DOMAIN: Record<IncidentType, IntelligenceDomain> = {
  flood: 'monsoon',
  fire: 'emergency',
  'building-collapse': 'buildings',
  'infrastructure-failure': 'assets',
  'extreme-weather': 'monsoon',
  'public-health': 'health',
  'road-disruption': 'roads',
  'utility-incident': 'water',
}

function contextFor(incident: Incident): AccessContext {
  return {
    wardId: incident.wardId,
    departmentId: incident.departmentId,
    domain: INCIDENT_TYPE_DOMAIN[incident.type],
    classification: incident.classification,
  }
}

function meta(incident: Incident): { resourceType: string; resourceId: string; resourceLabel: string } {
  return { resourceType: 'Incident', resourceId: incident.id, resourceLabel: incident.title }
}

function findOrThrow(user: User | null, id: string): Incident {
  if (!user) throw new ServiceError('forbidden', 'No authenticated principal.')
  const incident = getCollection('incidents').find((i) => i.id === id && i.tenantId === user.tenantId)
  if (!incident) throw new ServiceError('not-found', `Incident "${id}" was not found.`)
  return incident
}

function persist(updated: Incident): void {
  setCollection('incidents', getCollection('incidents').map((i) => (i.id === updated.id ? updated : i)))
}

function timelineKindForStatus(status: IncidentStatus): TimelineEvent['kind'] {
  switch (status) {
    case 'detected':
      return 'detection'
    case 'validated':
      return 'assessment'
    case 'active':
      return 'deployment'
    case 'contained':
      return 'update'
    case 'resolved':
      return 'resolution'
    case 'reviewed':
      return 'decision'
  }
}

function nextTimelineEvent(incident: Incident, actor: string, title: string, detail: string, kind: TimelineEvent['kind']): TimelineEvent {
  return { id: `${incident.id}-tl-${incident.timeline.length + 1}`, at: isoFromAnchor(0), actor, title, detail, kind }
}

function logSituation(
  user: User,
  entry: Omit<SituationLogEntry, 'id' | 'tenantId' | 'at' | 'actorId' | 'actorName'>,
): void {
  const log = getCollection('situationLog')
  const newEntry: SituationLogEntry = {
    id: `sitlog-${log.length + 1}`,
    tenantId: user.tenantId,
    at: isoFromAnchor(0),
    actorId: user.id,
    actorName: user.name,
    ...entry,
  }
  setCollection('situationLog', [newEntry, ...log])
}

function matchesFilters(incident: Incident, filters: IncidentFilters): boolean {
  if (filters.severity && filters.severity.length > 0 && !filters.severity.includes(incident.severity)) return false
  if (filters.wardId && incident.wardId !== filters.wardId) return false
  if (filters.departmentId && incident.departmentId !== filters.departmentId) return false
  if (filters.type && filters.type.length > 0 && !filters.type.includes(incident.type)) return false
  if (filters.status && filters.status.length > 0 && !filters.status.includes(incident.status)) return false
  if (filters.search) {
    const q = filters.search.toLowerCase()
    if (!incident.title.toLowerCase().includes(q) && !incident.description.toLowerCase().includes(q)) return false
  }
  return true
}

async function list(user: User | null, filters: IncidentFilters = {}): Promise<Paged<Incident>> {
  await simulateLatency(`incident.list:${JSON.stringify(filters)}`)
  const scoped = scopeToTenant(user, getCollection('incidents'))
  const visible = filterByScope(user, scoped, contextFor, 'incident')
  const filtered = visible.filter((i) => matchesFilters(i, filters))
  const sorted = [...filtered].sort((a, b) => (a.detectedAt < b.detectedAt ? 1 : -1))
  const page = paginate(sorted, filters.page ?? 1, filters.pageSize ?? 20)
  return { ...page, items: deepClone(page.items) }
}

async function get(user: User | null, id: string): Promise<Incident> {
  await simulateLatency(`incident.get:${id}`)
  const incident = findOrThrow(user, id)
  assertAccess(user, 'incident', 'view', contextFor(incident), meta(incident))
  return deepClone(incident)
}

async function create(user: User | null, input: IncidentCreateInput): Promise<Incident> {
  await simulateLatency('incident.create', 220, 560)
  const context: AccessContext = {
    wardId: input.wardId,
    departmentId: input.departmentId,
    domain: INCIDENT_TYPE_DOMAIN[input.type],
  }
  const authed = assertAccess(user, 'incident', 'create', context, {
    resourceType: 'Incident',
    resourceId: 'new',
    resourceLabel: input.title,
  })
  const ward = WARD_BY_ID.get(input.wardId)
  const incidents = getCollection('incidents')
  const seq = incidents.length + 1

  const newIncident: Incident = {
    id: `inc-live-${String(seq).padStart(4, '0')}`,
    tenantId: authed.tenantId,
    reference: `${referencePrefix('INC')}/LIVE/${String(seq).padStart(4, '0')}`,
    title: input.title,
    description: input.description,
    type: input.type,
    severity: input.severity,
    status: 'detected',
    wardId: input.wardId,
    locationName: input.locationName,
    location: ward?.centroid ?? { ...municipality.mapConfiguration.centre },
    affectedPopulation: input.affectedPopulation ?? 0,
    affectedAreaSqKm: input.affectedAreaSqKm ?? 0,
    responseTeams: [],
    timeline: [
      { id: `inc-live-${seq}-tl-1`, at: isoFromAnchor(0), actor: authed.name, title: t('Incident detected'), detail: t('Report received and logged against the incident register.'), kind: 'detection' },
    ],
    evidenceIds: [],
    notes: [],
    decisionCaseIds: [],
    actionIds: [],
    ownerId: authed.id,
    departmentId: input.departmentId,
    detectedAt: isoFromAnchor(0),
    updatedAt: isoFromAnchor(0),
    roadsImpacted: input.roadsImpacted ?? [],
    hospitalsImpacted: input.hospitalsImpacted ?? [],
    classification: input.classification ?? 'confidential',
    confidence: input.confidence ?? 'medium',
  }
  setCollection('incidents', [newIncident, ...incidents])
  logSituation(authed, {
    category: 'incident',
    title: t('Incident raised: {0}', newIncident.title),
    detail: newIncident.description,
    severity: newIncident.severity,
    wardIds: [newIncident.wardId],
    incidentId: newIncident.id,
  })
  recordAudit(authed, {
    action: 'create-incident',
    resourceType: 'Incident',
    resourceId: newIncident.id,
    resourceLabel: newIncident.title,
    classification: newIncident.classification,
    outcome: 'success',
  })
  emitChange()
  return deepClone(newIncident)
}

async function transition(user: User | null, id: string, to: IncidentStatus, reason?: string): Promise<Incident> {
  await simulateLatency(`incident.transition:${id}:${to}`)
  const incident = findOrThrow(user, id)
  const definition = findTransition(incidentWorkflow, incident.status, to)
  if (!definition) {
    throw new ServiceError('invalid', `No transition from "${incident.status}" to "${to}" is defined for the incident workflow.`)
  }
  if (definition.requiresReason && !reason) {
    throw new ServiceError('invalid', `A reason is required to ${definition.label.toLowerCase()}.`)
  }
  const authed = assertAccess(user, definition.requires.resource, definition.requires.action, contextFor(incident), meta(incident))
  const updated: Incident = {
    ...incident,
    status: to,
    updatedAt: isoFromAnchor(0),
    resolvedAt: to === 'resolved' || to === 'reviewed' ? isoFromAnchor(0) : incident.resolvedAt,
    timeline: [...incident.timeline, nextTimelineEvent(incident, authed.name, definition.label, definition.description, timelineKindForStatus(to))],
  }
  persist(updated)
  logSituation(authed, {
    category: 'incident',
    title: `${definition.label}: ${incident.title}`,
    detail: definition.description,
    severity: incident.severity,
    wardIds: [incident.wardId],
    incidentId: incident.id,
  })
  recordAudit(authed, {
    action: 'status-change',
    resourceType: 'Incident',
    resourceId: incident.id,
    resourceLabel: incident.title,
    classification: incident.classification,
    outcome: 'success',
    reason,
    detail: `${definition.label}: ${incident.status} → ${to}.`,
  })
  emitChange()
  return deepClone(updated)
}

async function addNote(user: User | null, incidentId: string, body: string): Promise<Incident> {
  await simulateLatency(`incident.addNote:${incidentId}`)
  const incident = findOrThrow(user, incidentId)
  const authed = assertAccess(user, 'incident', 'edit', contextFor(incident), meta(incident))
  const note: ActionNote = {
    id: `${incident.id}-note-${incident.notes.length + 1}`,
    authorId: authed.id,
    authorName: authed.name,
    body,
    createdAt: isoFromAnchor(0),
  }
  const updated: Incident = { ...incident, notes: [...incident.notes, note], updatedAt: isoFromAnchor(0) }
  persist(updated)
  recordAudit(authed, {
    action: 'status-change',
    resourceType: 'Incident',
    resourceId: incident.id,
    resourceLabel: incident.title,
    classification: incident.classification,
    outcome: 'success',
    detail: t('Note added.'),
  })
  emitChange()
  return deepClone(updated)
}

async function deployTeam(user: User | null, incidentId: string, team: DeployTeamInput): Promise<Incident> {
  await simulateLatency(`incident.deployTeam:${incidentId}`)
  const incident = findOrThrow(user, incidentId)
  const authed = assertAccess(user, 'incident', 'edit', contextFor(incident), meta(incident))
  const newTeam: ResponseTeam = {
    id: `${incident.id}-team-${incident.responseTeams.length + 1}`,
    name: team.name,
    type: team.type,
    strength: team.strength,
    status: team.status ?? 'deployed',
    assignedAt: isoFromAnchor(0),
    wardId: incident.wardId,
  }
  const updated: Incident = {
    ...incident,
    responseTeams: [...incident.responseTeams, newTeam],
    timeline: [
      ...incident.timeline,
      nextTimelineEvent(
        incident,
        authed.name,
        `${newTeam.name} deployed`,
        `${newTeam.name} (${newTeam.type}, strength ${newTeam.strength}) deployed to ${incident.locationName}.`,
        'deployment',
      ),
    ],
    updatedAt: isoFromAnchor(0),
  }
  persist(updated)
  logSituation(authed, {
    category: 'resource',
    title: `${newTeam.name} deployed`,
    detail: t('Deployed to {0} at {1}.', incident.title, incident.locationName),
    severity: incident.severity,
    wardIds: [incident.wardId],
    incidentId: incident.id,
  })
  recordAudit(authed, {
    action: 'status-change',
    resourceType: 'Incident',
    resourceId: incident.id,
    resourceLabel: incident.title,
    classification: incident.classification,
    outcome: 'success',
    detail: t('Team deployed: {0}.', newTeam.name),
  })
  emitChange()
  return deepClone(updated)
}

async function appendTimeline(user: User | null, incidentId: string, event: Omit<TimelineEvent, 'id' | 'at'>): Promise<Incident> {
  await simulateLatency(`incident.appendTimeline:${incidentId}`)
  const incident = findOrThrow(user, incidentId)
  const authed = assertAccess(user, 'incident', 'edit', contextFor(incident), meta(incident))
  const newEvent: TimelineEvent = { id: `${incident.id}-tl-${incident.timeline.length + 1}`, at: isoFromAnchor(0), ...event }
  const updated: Incident = { ...incident, timeline: [...incident.timeline, newEvent], updatedAt: isoFromAnchor(0) }
  persist(updated)
  logSituation(authed, {
    category: 'note',
    title: newEvent.title,
    detail: newEvent.detail,
    severity: incident.severity,
    wardIds: [incident.wardId],
    incidentId: incident.id,
  })
  recordAudit(authed, {
    action: 'status-change',
    resourceType: 'Incident',
    resourceId: incident.id,
    resourceLabel: incident.title,
    classification: incident.classification,
    outcome: 'success',
    detail: t('Timeline updated: {0}.', newEvent.title),
  })
  emitChange()
  return deepClone(updated)
}

async function active(user: User | null): Promise<Incident[]> {
  await simulateLatency('incident.active')
  const scoped = scopeToTenant(user, getCollection('incidents'))
  const visible = filterByScope(user, scoped, contextFor, 'incident')
  const activeOnes = visible.filter((i) => i.status === 'active' || i.status === 'validated' || i.status === 'detected')
  return deepClone(activeOnes)
}

/** The city-wide Situation Room feed - every incident mutation above mirrors
 * a short entry here in addition to updating the incident's own timeline. */
async function situationLog(user: User | null, limit = 50): Promise<SituationLogEntry[]> {
  await simulateLatency('incident.situationLog')
  const scoped = scopeToTenant(user, getCollection('situationLog'))
  const visible = filterByScope(user, scoped, (entry) => ({ wardIds: entry.wardIds }), 'incident')
  const sorted = [...visible].sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, limit)
  return deepClone(sorted)
}

export const incidentService = {
  list,
  get,
  create,
  transition,
  addNote,
  deployTeam,
  appendTimeline,
  active,
  situationLog,
}
