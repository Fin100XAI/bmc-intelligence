import { useCurrentDrawer } from '@/stores/ui.store'
import { EvidenceDrawer } from './EvidenceDrawer'
import {
  ActionDrawer,
  AlertDrawer,
  AssetDrawer,
  ContractDrawer,
  DecisionDrawer,
  GraphNodeDrawer,
  IncidentDrawer,
  IntelligenceDrawer,
  ProjectDrawer,
  SecurityEventDrawer,
  WardDrawer,
} from './entity-drawers'

/**
 * Single mount point for every contextual drilldown.
 *
 * Drawers are stacked, so opening evidence from an intelligence item returns
 * to that item on close - an operator never loses their place.
 */
export function DrawerHost(): React.JSX.Element | null {
  const current = useCurrentDrawer()
  if (!current) return null

  switch (current.kind) {
    case 'evidence':
      return <EvidenceDrawer evidenceId={current.id} />
    case 'intelligence':
      return <IntelligenceDrawer id={current.id} />
    case 'decision':
      return <DecisionDrawer id={current.id} />
    case 'project':
      return <ProjectDrawer id={current.id} />
    case 'incident':
      return <IncidentDrawer id={current.id} />
    case 'ward':
      return <WardDrawer id={current.id} />
    case 'alert':
      return <AlertDrawer id={current.id} />
    case 'action':
      return <ActionDrawer id={current.id} />
    case 'security-event':
      return <SecurityEventDrawer id={current.id} />
    case 'graph-node':
      return <GraphNodeDrawer id={current.id} />
    case 'asset':
      return <AssetDrawer id={current.id} />
    case 'contract':
      return <ContractDrawer id={current.id} />
    case 'ai-explanation':
      return <IntelligenceDrawer id={current.id} />
    default:
      return null
  }
}
