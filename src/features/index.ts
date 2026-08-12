/**
 * Cross-cutting feature composition.
 *
 * Features that belong to no single page and are consumed by several - the
 * human confirmation gate that enforces reserved-act authority is used by the
 * decision workflow, the AI recommendation surfaces and the approval paths in
 * every drawer.
 */
export * from './human-oversight/HumanConfirmationGate'
