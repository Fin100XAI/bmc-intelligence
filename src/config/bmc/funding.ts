import type { FundingNeed } from '@/domains/public-money/model'

/**
 * src/config/bmc/funding.ts
 *
 * Funding Opportunity Intelligence for Mumbai (spec §85). Empty until each
 * need and scheme match has been read on its source: a funding match the
 * platform cannot evidence is not offered.
 */
export function bmcFundingNeeds(): FundingNeed[] {
  return []
}
