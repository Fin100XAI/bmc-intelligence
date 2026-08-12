import { z } from 'zod'

/**
 * Validation schemas for every operator-entered form in the platform.
 *
 * All free text is length-bounded and sanitised before it reaches the service
 * layer. The platform never renders operator input as markup.
 */

const SEVERITY = z.enum(['critical', 'high', 'medium', 'low', 'info'])
const CONFIDENCE = z.enum(['high', 'medium', 'low'])

/** Institutional reason recorded against a consequential action. */
export const reasonSchema = z
  .string()
  .trim()
  .min(8, 'A reason of at least eight characters is required. It is recorded permanently in the audit trail.')
  .max(600, 'Keep the recorded reason under 600 characters.')

export const noteSchema = z.object({
  body: z
    .string()
    .trim()
    .min(3, 'A note must contain at least three characters.')
    .max(2000, 'Keep a note under 2,000 characters.'),
})

export type NoteInput = z.infer<typeof noteSchema>

/** Raising a decision case from an intelligence item. */
export const createDecisionSchema = z.object({
  title: z
    .string()
    .trim()
    .min(12, 'State the decision required in at least twelve characters.')
    .max(180, 'Keep the title under 180 characters.'),
  problemStatement: z
    .string()
    .trim()
    .min(30, 'A problem statement of at least thirty characters is required.')
    .max(2000, 'Keep the problem statement under 2,000 characters.'),
  background: z.string().trim().max(3000).optional().default(''),
  domain: z.string().min(1, 'Select the primary intelligence domain.'),
  severity: SEVERITY,
  wardIds: z.array(z.string()).min(1, 'Select at least one affected ward.'),
  departmentIds: z.array(z.string()).min(1, 'Select at least one accountable department.'),
  financialImpactCrore: z
    .number({ error: 'Enter an indicative financial impact in ₹ crore.' })
    .min(0, 'Financial impact cannot be negative.')
    .max(100000, 'Verify this figure - it exceeds the corporation budget.'),
  citizenImpact: z
    .string()
    .trim()
    .min(10, 'Describe the citizen impact.')
    .max(1000, 'Keep the citizen impact statement under 1,000 characters.'),
  dueDate: z.string().min(1, 'Set a due date for the decision.'),
  sourceIntelligenceIds: z.array(z.string()).default([]),
  evidenceIds: z.array(z.string()).default([]),
})

export type CreateDecisionInput = z.infer<typeof createDecisionSchema>

/** Recording the human decision on a case. */
export const recordDecisionSchema = z.object({
  selectedAlternativeId: z.string().min(1, 'Select the alternative being adopted.'),
  rationale: z
    .string()
    .trim()
    .min(20, 'Record the institutional rationale in at least twenty characters.')
    .max(2000, 'Keep the rationale under 2,000 characters.'),
})

export type RecordDecisionInput = z.infer<typeof recordDecisionSchema>

/** Opening an incident. */
export const createIncidentSchema = z.object({
  title: z
    .string()
    .trim()
    .min(10, 'State the incident in at least ten characters.')
    .max(180, 'Keep the title under 180 characters.'),
  description: z
    .string()
    .trim()
    .min(20, 'Describe the situation in at least twenty characters.')
    .max(2000, 'Keep the description under 2,000 characters.'),
  type: z.enum([
    'flood',
    'fire',
    'building-collapse',
    'infrastructure-failure',
    'extreme-weather',
    'public-health',
    'road-disruption',
    'utility-incident',
  ]),
  severity: SEVERITY,
  wardId: z.string().min(1, 'Select the ward.'),
  locationName: z
    .string()
    .trim()
    .min(3, 'Record the location.')
    .max(200, 'Keep the location under 200 characters.'),
  affectedPopulation: z
    .number()
    .min(0, 'An affected population estimate cannot be negative.')
    .max(25_000_000, 'Verify this estimate - it exceeds the city population.')
    .optional(),
})

export type CreateIncidentInput = z.infer<typeof createIncidentSchema>

/** Raising an action against an intelligence item or decision. */
export const createActionSchema = z.object({
  title: z
    .string()
    .trim()
    .min(10, 'State the action in at least ten characters.')
    .max(180, 'Keep the title under 180 characters.'),
  description: z.string().trim().max(2000).optional().default(''),
  ownerId: z.string().min(1, 'Assign a named owner.'),
  departmentId: z.string().min(1, 'Select the accountable department.'),
  wardIds: z.array(z.string()).default([]),
  priority: SEVERITY,
  dueDate: z.string().min(1, 'Set a due date.'),
})

export type CreateActionInput = z.infer<typeof createActionSchema>

/** Assigning ownership of an item. */
export const assignSchema = z.object({
  ownerId: z.string().min(1, 'Select the officer taking accountability.'),
  reason: reasonSchema.optional(),
})

export type AssignInput = z.infer<typeof assignSchema>

/** Human review of an AI recommendation. */
export const reviewRecommendationSchema = z.object({
  outcome: z.enum(['accepted', 'modified', 'rejected', 'escalated']),
  note: z
    .string()
    .trim()
    .max(2000, 'Keep the review note under 2,000 characters.')
    .optional()
    .default(''),
})

export type ReviewRecommendationInput = z.infer<typeof reviewRecommendationSchema>

/** Copilot question. */
export const copilotQuerySchema = z.object({
  question: z
    .string()
    .trim()
    .min(5, 'Ask a municipal question of at least five characters.')
    .max(500, 'Keep the question under 500 characters.'),
})

export type CopilotQueryInput = z.infer<typeof copilotQuerySchema>

/** Monsoon scenario inputs - bounded to physically plausible ranges. */
export const monsoonScenarioSchema = z.object({
  rainfallMm24h: z.number().min(0, 'Rainfall cannot be negative.').max(600, 'Cap rainfall at 600 mm / 24 h.'),
  tideHeightM: z.number().min(0, 'Tide height cannot be negative.').max(6, 'Cap tide height at 6 m.'),
  pumpAvailabilityPct: z.number().min(0).max(100),
  desiltingCompletionPct: z.number().min(0).max(100),
  durationHours: z.number().min(1, 'A scenario must run for at least one hour.').max(96, 'Cap duration at 96 hours.'),
})

export type MonsoonScenarioFormInput = z.infer<typeof monsoonScenarioSchema>

/** Budget scenario inputs. */
export const budgetScenarioSchema = z.object({
  capitalAllocationDeltaPct: z.number().min(-50).max(50),
  revenueExpenditureDeltaPct: z.number().min(-50).max(50),
  collectionEfficiencyDeltaPct: z.number().min(-30).max(30),
  contingencyCrore: z.number().min(0).max(5000),
})

export type BudgetScenarioFormInput = z.infer<typeof budgetScenarioSchema>

/** Planning scenario inputs. */
export const planningScenarioSchema = z.object({
  populationDeltaPct: z.number().min(-20).max(50),
  capitalInvestmentDeltaPct: z.number().min(-50).max(100),
  transportDemandDeltaPct: z.number().min(-30).max(80),
  extremeRainfallDeltaPct: z.number().min(-20).max(100),
})

export type PlanningScenarioFormInput = z.infer<typeof planningScenarioSchema>

/** Updating the status of a revenue anomaly. */
export const anomalyStatusSchema = z.object({
  status: z.enum(['open', 'under-review', 'reconciled', 'referred', 'closed']),
  reason: reasonSchema,
})

export type AnomalyStatusInput = z.infer<typeof anomalyStatusSchema>

/** Confidence declaration used where an analyst records a manual assessment. */
export const analystAssessmentSchema = z.object({
  assessment: z.string().trim().min(20).max(2000),
  confidence: CONFIDENCE,
  evidenceIds: z.array(z.string()).min(1, 'Cite at least one evidence record.'),
})

export type AnalystAssessmentInput = z.infer<typeof analystAssessmentSchema>
