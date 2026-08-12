import {
  ACTION_STATUS_LABEL,
  DECISION_STATUS_LABEL,
  INCIDENT_STATUS_LABEL,
  type ActionStatus,
  type DecisionStatus,
  type IncidentStatus,
} from '@/types/operations'
import {
  ALERT_STATUS_LABEL,
  INTELLIGENCE_STATUS_LABEL,
  type AlertStatus,
  type IntelligenceStatus,
} from '@/types/intelligence'
import type { StateMachine } from './engine'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/** Intelligence: New → Reviewed → Assigned → In Progress → Resolved → Verified → Closed */
function build$intelligenceWorkflow(): StateMachine<IntelligenceStatus> {
  return {
  id: 'intelligence',
  name: t('Intelligence Workflow'),
  order: ['new', 'reviewed', 'assigned', 'in-progress', 'resolved', 'verified', 'closed'],
  labels: INTELLIGENCE_STATUS_LABEL,
  terminal: ['closed'],
  transitions: [
    {
      from: 'new',
      to: 'reviewed',
      label: t('Mark Reviewed'),
      requires: { resource: 'intelligence', action: 'edit' },
      description: t('A named officer has read the item and accepts it as a genuine signal.'),
      intent: 'primary',
    },
    {
      from: 'new',
      to: 'closed',
      label: t('Dismiss'),
      requires: { resource: 'intelligence', action: 'edit' },
      description: t('The signal is not actionable. A reason is recorded against the audit trail.'),
      requiresReason: true,
      intent: 'neutral',
    },
    {
      from: 'reviewed',
      to: 'assigned',
      label: t('Assign'),
      requires: { resource: 'intelligence', action: 'assign' },
      description: t('Ownership passes to a department or ward officer for action.'),
      intent: 'primary',
    },
    {
      from: 'assigned',
      to: 'in-progress',
      label: t('Start Work'),
      requires: { resource: 'intelligence', action: 'edit' },
      description: t('The owning department has commenced intervention.'),
      intent: 'primary',
    },
    {
      from: 'in-progress',
      to: 'resolved',
      label: t('Mark Resolved'),
      requires: { resource: 'intelligence', action: 'edit' },
      description: t('The department reports the underlying condition has been addressed.'),
      intent: 'positive',
    },
    {
      from: 'resolved',
      to: 'verified',
      label: t('Verify'),
      requires: { resource: 'intelligence', action: 'approve' },
      description: t('An independent officer confirms the resolution against evidence.'),
      intent: 'positive',
    },
    {
      from: 'verified',
      to: 'closed',
      label: t('Close'),
      requires: { resource: 'intelligence', action: 'edit' },
      description: t('The item is closed and retained in the permanent audit record.'),
      intent: 'neutral',
    },
    {
      from: 'in-progress',
      to: 'assigned',
      label: t('Reassign'),
      requires: { resource: 'intelligence', action: 'assign' },
      description: t('Ownership is transferred to a different department or officer.'),
      requiresReason: true,
      intent: 'caution',
    },
  ],
}
}
export let intelligenceWorkflow: StateMachine<IntelligenceStatus> = build$intelligenceWorkflow()
registerLayer(() => {
  intelligenceWorkflow = build$intelligenceWorkflow()
})

/** Decision: Draft → Under Review → Approved / Rejected → Assigned → Implementing → Verification → Closed */
function build$decisionWorkflow(): StateMachine<DecisionStatus> {
  return {
  id: 'decision',
  name: t('Decision Workflow'),
  order: ['draft', 'under-review', 'approved', 'assigned', 'implementing', 'verification', 'closed'],
  labels: DECISION_STATUS_LABEL,
  terminal: ['closed', 'rejected'],
  transitions: [
    {
      from: 'draft',
      to: 'under-review',
      label: t('Submit for Review'),
      requires: { resource: 'decision', action: 'edit' },
      description: t('The case is placed before the competent authority for decision.'),
      intent: 'primary',
    },
    {
      from: 'under-review',
      to: 'approved',
      label: t('Approve'),
      requires: { resource: 'decision', action: 'approve' },
      description: t('The competent authority selects an alternative and records the rationale.'),
      requiresReason: true,
      intent: 'positive',
    },
    {
      from: 'under-review',
      to: 'rejected',
      label: t('Reject'),
      requires: { resource: 'decision', action: 'approve' },
      description: t('The case is declined. The rationale is retained permanently.'),
      requiresReason: true,
      intent: 'critical',
    },
    {
      from: 'under-review',
      to: 'draft',
      label: t('Return for Rework'),
      requires: { resource: 'decision', action: 'edit' },
      description: t('The case is returned to the originator for further analysis.'),
      requiresReason: true,
      intent: 'caution',
    },
    {
      from: 'approved',
      to: 'assigned',
      label: t('Assign Implementation'),
      requires: { resource: 'decision', action: 'assign' },
      description: t('Implementation actions are raised against the responsible departments.'),
      intent: 'primary',
    },
    {
      from: 'assigned',
      to: 'implementing',
      label: t('Begin Implementation'),
      requires: { resource: 'decision', action: 'edit' },
      description: t('Departments have commenced the approved course of action.'),
      intent: 'primary',
    },
    {
      from: 'implementing',
      to: 'verification',
      label: t('Move to Verification'),
      requires: { resource: 'decision', action: 'edit' },
      description: t('Implementation is reported complete and awaits independent verification.'),
      intent: 'positive',
    },
    {
      from: 'verification',
      to: 'closed',
      label: t('Close Case'),
      requires: { resource: 'decision', action: 'approve' },
      description: t('Outcome is recorded and the case is closed into the audit record.'),
      requiresReason: true,
      intent: 'neutral',
    },
  ],
}
}
export let decisionWorkflow: StateMachine<DecisionStatus> = build$decisionWorkflow()
registerLayer(() => {
  decisionWorkflow = build$decisionWorkflow()
})

/** Incident: Detected → Validated → Active → Contained → Resolved → Reviewed */
function build$incidentWorkflow(): StateMachine<IncidentStatus> {
  return {
  id: 'incident',
  name: t('Incident Workflow'),
  order: ['detected', 'validated', 'active', 'contained', 'resolved', 'reviewed'],
  labels: INCIDENT_STATUS_LABEL,
  terminal: ['reviewed'],
  transitions: [
    {
      from: 'detected',
      to: 'validated',
      label: t('Validate'),
      requires: { resource: 'incident', action: 'edit' },
      description: t('Control room confirms the report against a second source or field team.'),
      intent: 'primary',
    },
    {
      from: 'detected',
      to: 'reviewed',
      label: t('Dismiss as Unconfirmed'),
      requires: { resource: 'incident', action: 'edit' },
      description: t('The report could not be substantiated. Recorded for pattern analysis.'),
      requiresReason: true,
      intent: 'neutral',
    },
    {
      from: 'validated',
      to: 'active',
      label: t('Activate Response'),
      requires: { resource: 'incident', action: 'edit' },
      description: t('Response teams are deployed and the incident enters active management.'),
      intent: 'critical',
    },
    {
      from: 'active',
      to: 'contained',
      label: t('Mark Contained'),
      requires: { resource: 'incident', action: 'edit' },
      description: t('Escalation has stopped; recovery operations continue.'),
      intent: 'caution',
    },
    {
      from: 'contained',
      to: 'resolved',
      label: t('Mark Resolved'),
      requires: { resource: 'incident', action: 'edit' },
      description: t('Normal service has been restored at the affected location.'),
      intent: 'positive',
    },
    {
      from: 'resolved',
      to: 'reviewed',
      label: t('Complete Review'),
      requires: { resource: 'incident', action: 'approve' },
      description: t('Post-incident review is recorded with lessons for future preparedness.'),
      requiresReason: true,
      intent: 'neutral',
    },
    {
      from: 'active',
      to: 'active',
      label: t('Escalate'),
      requires: { resource: 'incident', action: 'escalate' },
      description: t('Severity is raised and additional authority is notified.'),
      requiresReason: true,
      intent: 'critical',
    },
  ],
}
}
export let incidentWorkflow: StateMachine<IncidentStatus> = build$incidentWorkflow()
registerLayer(() => {
  incidentWorkflow = build$incidentWorkflow()
})

/** Alert: Open → Acknowledged → Assigned → Escalated → Resolved → Closed */
function build$alertWorkflow(): StateMachine<AlertStatus> {
  return {
  id: 'alert',
  name: t('Alert Workflow'),
  order: ['open', 'acknowledged', 'assigned', 'resolved', 'closed'],
  labels: ALERT_STATUS_LABEL,
  terminal: ['closed'],
  transitions: [
    {
      from: 'open',
      to: 'acknowledged',
      label: t('Acknowledge'),
      requires: { resource: 'alert', action: 'edit' },
      description: t('A named officer accepts visibility of the alert.'),
      intent: 'primary',
    },
    {
      from: 'acknowledged',
      to: 'assigned',
      label: t('Assign'),
      requires: { resource: 'alert', action: 'assign' },
      description: t('Ownership passes to a department for resolution.'),
      intent: 'primary',
    },
    {
      from: 'open',
      to: 'escalated',
      label: t('Escalate'),
      requires: { resource: 'alert', action: 'escalate' },
      description: t('The alert is raised to a higher authority for immediate attention.'),
      requiresReason: true,
      intent: 'critical',
    },
    {
      from: 'acknowledged',
      to: 'escalated',
      label: t('Escalate'),
      requires: { resource: 'alert', action: 'escalate' },
      description: t('The alert is raised to a higher authority for immediate attention.'),
      requiresReason: true,
      intent: 'critical',
    },
    {
      from: 'assigned',
      to: 'resolved',
      label: t('Mark Resolved'),
      requires: { resource: 'alert', action: 'edit' },
      description: t('The underlying condition has been addressed by the owning department.'),
      intent: 'positive',
    },
    {
      from: 'escalated',
      to: 'assigned',
      label: t('Assign'),
      requires: { resource: 'alert', action: 'assign' },
      description: t('Higher authority directs the alert to an owning department.'),
      intent: 'primary',
    },
    {
      from: 'resolved',
      to: 'closed',
      label: t('Close'),
      requires: { resource: 'alert', action: 'edit' },
      description: t('The alert is closed into the permanent record.'),
      intent: 'neutral',
    },
  ],
}
}
export let alertWorkflow: StateMachine<AlertStatus> = build$alertWorkflow()
registerLayer(() => {
  alertWorkflow = build$alertWorkflow()
})

/** Action: Open → Assigned → In Progress → Completed → Verified → Closed */
function build$actionWorkflow(): StateMachine<ActionStatus> {
  return {
  id: 'action',
  name: t('Action Workflow'),
  order: ['open', 'assigned', 'in-progress', 'completed', 'verified', 'closed'],
  labels: ACTION_STATUS_LABEL,
  terminal: ['closed'],
  transitions: [
    {
      from: 'open',
      to: 'assigned',
      label: t('Assign'),
      requires: { resource: 'action', action: 'assign' },
      description: t('A named owner accepts accountability for the task.'),
      intent: 'primary',
    },
    {
      from: 'assigned',
      to: 'in-progress',
      label: t('Start'),
      requires: { resource: 'action', action: 'edit' },
      description: t('Work on the task has commenced.'),
      intent: 'primary',
    },
    {
      from: 'in-progress',
      to: 'blocked',
      label: t('Mark Blocked'),
      requires: { resource: 'action', action: 'edit' },
      description: t('A dependency prevents progress. The obstruction is recorded.'),
      requiresReason: true,
      intent: 'caution',
    },
    {
      from: 'blocked',
      to: 'in-progress',
      label: t('Resume'),
      requires: { resource: 'action', action: 'edit' },
      description: t('The obstruction is cleared and work resumes.'),
      intent: 'primary',
    },
    {
      from: 'in-progress',
      to: 'completed',
      label: t('Mark Complete'),
      requires: { resource: 'action', action: 'edit' },
      description: t('The owner reports the task delivered.'),
      intent: 'positive',
    },
    {
      from: 'completed',
      to: 'verified',
      label: t('Verify'),
      requires: { resource: 'action', action: 'approve' },
      description: t('An independent officer confirms delivery against evidence.'),
      intent: 'positive',
    },
    {
      from: 'verified',
      to: 'closed',
      label: t('Close'),
      requires: { resource: 'action', action: 'edit' },
      description: t('The task is closed into the permanent audit record.'),
      intent: 'neutral',
    },
    {
      from: 'assigned',
      to: 'assigned',
      label: t('Reassign'),
      requires: { resource: 'action', action: 'assign' },
      description: t('Accountability transfers to a different officer.'),
      requiresReason: true,
      intent: 'caution',
    },
  ],
}
}
export let actionWorkflow: StateMachine<ActionStatus> = build$actionWorkflow()
registerLayer(() => {
  actionWorkflow = build$actionWorkflow()
})

export const WORKFLOW_CATALOGUE = [
  intelligenceWorkflow,
  decisionWorkflow,
  incidentWorkflow,
  alertWorkflow,
  actionWorkflow,
]
