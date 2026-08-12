/**
 * Domain computation layer.
 *
 * Pure, deterministic TypeScript. Risk engines, composite indices, scenario
 * models and cross-domain correlation live here - never in a component, and
 * never inside a data module. Given the same inputs, every function in this
 * layer returns the same output every time.
 */

export * from './monsoon/scenario'
export * from './budget/scenario'
export * from './planning/scenario'
export * from './wards/profile'
export * from './executive/city-position'
export * from './executive/intelligence-index'
export * from './resilience'
export * from './infrastructure/graph-trace'
export * from './cross-domain/correlations'
export * from './roads/priority'
export * from './contractors/performance'
export * from './citizen-services/root-cause'
export * from './hyperlocal/signals'
export * from './finance/health-index'
