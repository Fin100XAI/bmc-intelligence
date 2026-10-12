/**
 * Meaning-based card shades, shared by the Command Centre and Decisions pages.
 *
 * The palette the Commissioner Decision Room's city-brief
 * tiles introduced: a pale tinted tile with a matching hairline border, a
 * solid coloured icon chip, and the figure set in the same hue. The shade is
 * chosen by what the figure MEANS, never by its position in a row:
 *
 *   gold    - money
 *   blue    - works, projects, cases, informational counts
 *   amber   - dates, deadlines, actions, warnings
 *   teal    - dependencies, links, intelligence, data
 *   red     - risk, critical, gaps
 *   orange  - high (below critical) severity
 *   green   - funding, positive, resolved, operational
 *   neutral - no feed connected / not applicable
 *
 * Classes are written out literally so Tailwind's scanner picks them up.
 * Every `tile` carries the `shade-tile` marker, which the stylesheet uses to
 * keep older decoration (`.metric-grid`'s accent rule and gradient) off a
 * card that already wears its own colour.
 */
export type Shade = 'gold' | 'blue' | 'amber' | 'teal' | 'red' | 'orange' | 'green' | 'neutral' | 'auto'

export const SHADE: Record<Shade, { tile: string; chip: string; value: string; soft: string }> = {
  gold: { tile: 'shade-tile border-gold-200 bg-gold-50', chip: 'bg-gold-600', value: 'text-gold-700', soft: 'bg-gold-100 text-gold-700' },
  blue: {
    tile: 'shade-tile border-google-blue-200 bg-google-blue-50',
    chip: 'bg-google-blue-600',
    value: 'text-google-blue-700',
    soft: 'bg-google-blue-100 text-google-blue-700',
  },
  amber: {
    tile: 'shade-tile border-google-yellow-200 bg-google-yellow-50',
    chip: 'bg-google-yellow-600',
    // -800, not -700: the -700 amber is too light to read as a figure on its own wash.
    value: 'text-google-yellow-800',
    soft: 'bg-google-yellow-100 text-google-yellow-800',
  },
  teal: { tile: 'shade-tile border-intel-200 bg-intel-50', chip: 'bg-intel-600', value: 'text-intel-700', soft: 'bg-intel-100 text-intel-700' },
  red: {
    tile: 'shade-tile border-google-red-200 bg-google-red-50',
    chip: 'bg-google-red-600',
    value: 'text-google-red-700',
    soft: 'bg-google-red-100 text-google-red-700',
  },
  orange: { tile: 'shade-tile border-risk-200 bg-risk-50', chip: 'bg-risk-600', value: 'text-risk-700', soft: 'bg-risk-100 text-risk-700' },
  green: {
    tile: 'shade-tile border-google-green-200 bg-google-green-50',
    chip: 'bg-google-green-600',
    value: 'text-google-green-700',
    soft: 'bg-google-green-100 text-google-green-700',
  },
  neutral: { tile: 'shade-tile border-ink-200 bg-ink-50', chip: 'bg-ink-600', value: 'text-ink-700', soft: 'bg-ink-100 text-ink-700' },
  // Informational, no particular meaning: blue and teal alternating down a
  // row of sibling cards (rules in `src/styles/index.css`, "Auto shade").
  auto: { tile: 'shade-tile shade-auto', chip: 'shade-chip', value: 'shade-value', soft: 'bg-google-blue-100 text-google-blue-700' },
}

type AnyTone = 'positive' | 'neutral' | 'warn' | 'risk' | 'critical' | 'default' | 'info'

const MONEY = /₹|\bcrore\b|\bcr\b|\blakh\b|\brevenue|\bbudget|\bfund(s|ing|ed)?\b|\bgrants?\b|\barrears\b|\bexpenditure|\bspend|\bcosts?\b|\btax|\bfees?\b|\brupee|\bfinanc/i

/** True when a figure or its label is about money - which takes gold. */
export function looksLikeMoney(...parts: unknown[]): boolean {
  return parts.some((p) => (typeof p === 'string' || typeof p === 'number') && MONEY.test(String(p)))
}

/**
 * The shade a card wears when its page did not name one: the severity reading
 * if the tone carries one, gold if the figure is money, otherwise the
 * alternating informational blue / teal.
 */
export function autoShade(tone: AnyTone | undefined, ...moneyHints: unknown[]): Shade {
  switch (tone) {
    case 'critical':
      return 'red'
    case 'risk':
      return 'orange'
    case 'warn':
      return 'amber'
    case 'positive':
      return 'green'
    default:
      return looksLikeMoney(...moneyHints) ? 'gold' : 'auto'
  }
}

/** The shade that carries a severity/state reading (critical/risk/warn/positive/neutral). */
export function shadeForTone(tone: AnyTone): Shade {
  switch (tone) {
    case 'critical':
      return 'red'
    case 'risk':
      return 'orange'
    case 'warn':
      return 'amber'
    case 'positive':
      return 'green'
    default:
      return 'blue'
  }
}
