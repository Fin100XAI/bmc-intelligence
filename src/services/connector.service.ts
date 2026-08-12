import { CONNECTORS } from '@/data/governance.data'
import { filterByScope } from '@/security/access'
import type { AccessContext } from '@/security/model'
import type { Connector } from '@/types/governance'
import type { User } from '@/types/organisation'
import { ServiceError, assertAccess, deepClone, scopeToTenant, simulateLatency } from './client'

/**
 * src/services/connector.service.ts
 *
 * The integration registry. Every connector here is declared as not
 * connected to a live departmental system - see `CONNECTOR_TYPE_LABEL` and
 * each record's `notes` field in `src/data/governance.data.ts`. No method
 * in this file, now or ever, contacts an external endpoint.
 */

export interface ConnectorHealthSummary {
  total: number
  byHealth: Record<Connector['health'], number>
  requiringReview: number
}

function contextFor(connector: Connector): AccessContext {
  return { departmentId: connector.ownerDepartmentId, domain: connector.domain, classification: connector.classification }
}

function meta(connector: Connector): { resourceType: string; resourceId: string; resourceLabel: string } {
  return { resourceType: 'Connector', resourceId: connector.id, resourceLabel: connector.name }
}

function findOrThrow(user: User | null, id: string): Connector {
  if (!user) throw new ServiceError('forbidden', 'No authenticated principal.')
  const connector = CONNECTORS.find((c) => c.id === id && c.tenantId === user.tenantId)
  if (!connector) throw new ServiceError('not-found', `Connector "${id}" was not found.`)
  return connector
}

async function list(user: User | null): Promise<Connector[]> {
  await simulateLatency('connector.list')
  const scoped = scopeToTenant(user, CONNECTORS)
  const visible = filterByScope(user, scoped, contextFor, 'connector')
  return deepClone(visible)
}

async function get(user: User | null, id: string): Promise<Connector> {
  await simulateLatency(`connector.get:${id}`)
  const connector = findOrThrow(user, id)
  assertAccess(user, 'connector', 'view', contextFor(connector), meta(connector))
  return deepClone(connector)
}

async function health(user: User | null): Promise<ConnectorHealthSummary> {
  await simulateLatency('connector.health')
  const scoped = scopeToTenant(user, CONNECTORS)
  const visible = filterByScope(user, scoped, contextFor, 'connector')
  const byHealth: Record<Connector['health'], number> = {
    simulation: 0,
    'adapter-ready': 0,
    'not-connected': 0,
    'review-required': 0,
  }
  for (const connector of visible) byHealth[connector.health] += 1
  return deepClone({
    total: visible.length,
    byHealth,
    requiringReview: byHealth['review-required'] + byHealth['not-connected'],
  })
}

export const connectorService = {
  list,
  get,
  health,
}
