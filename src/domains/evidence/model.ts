/**
 * src/domains/evidence/model.ts
 *
 * The source and evidence model of the decision-intelligence layer - see
 * `docs/architecture/08-decision-intelligence.md` §3.
 *
 * Core ontology: nothing here knows about any one corporation. A deployment
 * supplies its own registry (`src/config/nellore/sources.ts` for Nellore).
 */

/** How far a figure has been checked against a source. */
export type VerificationState =
  /** Read on an official (government) document. */
  | 'OFFICIAL_DOCUMENT_VERIFIED'
  /** Read on a reputable public source and not contradicted. */
  | 'PUBLIC_SOURCE_CORROBORATED'
  /** Supplied in engagement material; not yet found in a public source. */
  | 'ENGAGEMENT_SOURCE'
  /** Recorded, but no source has been opened. */
  | 'UNVERIFIED'

export type SourceType =
  | 'official-portal'
  | 'official-api'
  | 'official-document'
  | 'government-dashboard'
  | 'news'
  | 'aggregator'
  | 'open-data'
  | 'engagement'

export type SourceReliability = 'primary' | 'secondary' | 'tertiary'

/** Whether and how a source may be used - "accessible online" is not a licence. */
export type AccessClassification =
  | 'public-official'
  | 'public-reporting'
  | 'open-licence'
  | 'engagement-confidential'

/** One entry in the Source Registry (spec §60). */
export interface SourceRecord {
  id: string
  title: string
  authority: string
  sourceType: SourceType
  url: string
  accessMethod: string
  accessClassification: AccessClassification
  /** Expected refresh interval, in days; null where the source is a one-off document. */
  refreshDays: number | null
  reliability: SourceReliability
  geographicCoverage: string
  temporalCoverage: string
  format: string
  schemaNote: string
  /** ISO date this source was last opened and read. */
  lastRetrieved: string
  /** ISO date the source itself was published or last updated, where it states one. */
  publishedOn?: string
  dataQuality: 'good' | 'fair' | 'poor'
  notes?: string
}

/** One material figure and everything needed to trace it (spec §91). */
export interface EvidenceRecord {
  id: string
  /** The figure as displayed. */
  value: string
  /** What the figure measures. */
  label: string
  /** The period or date the figure describes - never compared across periods silently. */
  period: string
  sourceId: string
  /** Text on the source the figure was read from. */
  quote: string
  /** ISO date the figure was extracted. */
  extractedOn: string
  /** How the displayed number was produced from the source text. */
  transformation: string
  state: VerificationState
  confidence: 'high' | 'medium' | 'low'
  /** Where sources disagree, or the figure is dated. */
  note?: string
  /** Ids of evidence records that state a different value for the same thing. */
  conflictsWith?: string[]
}

export const VERIFICATION_RANK: Record<VerificationState, number> = {
  OFFICIAL_DOCUMENT_VERIFIED: 3,
  PUBLIC_SOURCE_CORROBORATED: 2,
  ENGAGEMENT_SOURCE: 1,
  UNVERIFIED: 0,
}

/** Days since a source was published, or null when it states no date. */
export function sourceAgeDays(source: SourceRecord, now: Date): number | null {
  if (!source.publishedOn) return null
  return Math.floor((now.getTime() - new Date(source.publishedOn).getTime()) / 86_400_000)
}

/** A source is stale when it has outlived its own declared refresh interval. */
export function isSourceStale(source: SourceRecord, now: Date): boolean {
  const age = sourceAgeDays(source, now)
  return source.refreshDays !== null && age !== null && age > source.refreshDays
}
