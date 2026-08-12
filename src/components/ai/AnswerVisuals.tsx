import type { AIVisual } from '@/types/ai'
import type { NamedSeries, SeriesPoint } from '@/types/common'
import { MetricGrid } from '@/components/ui'
import { MetricCard } from '@/components/cards'
import {
  CHART_COLOURS,
  ChartFrame,
  CompositionBar,
  HeatmapMatrix,
  LegendItem,
  RankedBarChart,
  TrendChart,
} from '@/components/charts'
import { formatNumber } from '@/utils/format'
import { t } from '@/i18n'

/**
 * Renders the structured payload that accompanies a Copilot answer.
 *
 * The division of labour is deliberate and it runs one way only: the AI layer
 * computes figures, this file decides how they are drawn. Nothing here reads
 * the question, re-derives a number or chooses what is worth showing - a
 * renderer that quietly recalculated would put a second, unaudited arithmetic
 * path into a governed answer.
 *
 * Every frame is a platform chart in a platform frame, for the same reason
 * every other intelligence surface uses them: a chart that states its title,
 * unit, timeframe and provenance is evidence, and one that does not is
 * decoration. An answer is not the place to lower that bar.
 */

/**
 * The payload carries no timeframe of its own because every figure in it is
 * read from the corporation's position as it stands now. Stating that once,
 * uniformly, is honest; inventing a per-chart period would not be.
 */
const VISUAL_TIMEFRAME = 'Current reporting period'

/** The 0-100 scale `HeatmapMatrix` documents for its cell values. */
const HEATMAP_UNIT = '0-100 index'

/**
 * The AI layer's tone vocabulary mapped onto the metric card's. Written out
 * rather than passed through so that if either vocabulary moves, the build
 * fails here instead of a card silently losing its meaning.
 */
type VisualTone = NonNullable<Extract<AIVisual, { kind: 'metrics' }>['items'][number]['tone']>
const METRIC_TONE: Record<VisualTone, 'default' | 'positive' | 'warn' | 'critical'> = {
  default: 'default',
  positive: 'positive',
  warn: 'warn',
  critical: 'critical',
}

/** Keeps a computed chart height inside a band that stays readable and never dominates the answer. */
function clampHeight(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function AnswerVisuals({ visuals }: { visuals: AIVisual[] }): React.JSX.Element | null {
  if (!visuals || visuals.length === 0) return null
  return (
    <section className="min-w-0 space-y-5">
      {visuals.map((visual) => (
        <VisualBlock key={visual.id} visual={visual} />
      ))}
    </section>
  )
}

function VisualBlock({ visual }: { visual: AIVisual }): React.JSX.Element | null {
  switch (visual.kind) {
    case 'metrics':
      return <MetricsVisual visual={visual} />
    case 'ranked-bar':
      return <RankedBarVisual visual={visual} />
    case 'trend':
      return <TrendVisual visual={visual} />
    case 'composition':
      return <CompositionVisual visual={visual} />
    case 'heatmap':
      return <HeatmapVisual visual={visual} />
    default:
      // A kind this renderer does not yet draw is omitted rather than
      // half-drawn. The prose above it still stands on its own.
      return null
  }
}

/* ==========================================================================
   Metrics
   ========================================================================== */

function MetricsVisual({ visual }: { visual: Extract<AIVisual, { kind: 'metrics' }> }): React.JSX.Element | null {
  if (visual.items.length === 0) return null
  const columns = visual.items.length >= 4 ? 4 : visual.items.length === 3 ? 3 : 2
  return (
    <div className="min-w-0">
      {visual.caption ? <p className="label-institutional mb-2.5">{visual.caption}</p> : null}
      <MetricGrid columns={columns}>
        {visual.items.map((item) => (
          <MetricCard
            key={item.label}
            label={item.label}
            value={item.value}
            support={item.support}
            tone={item.tone ? METRIC_TONE[item.tone] : 'default'}
            size="sm"
          />
        ))}
      </MetricGrid>
    </div>
  )
}

/* ==========================================================================
   Ranked bar
   ========================================================================== */

function RankedBarVisual({
  visual,
}: {
  visual: Extract<AIVisual, { kind: 'ranked-bar' }>
}): React.JSX.Element | null {
  if (visual.data.length === 0) return null
  // A ranked list is read row by row, so the frame grows with the rows rather
  // than compressing them into an unreadable band.
  const height = clampHeight(visual.data.length * 26 + 18, 130, 400)
  return (
    <div className="min-w-0">
      <ChartFrame title={visual.caption} unit={visual.unit} timeframe={VISUAL_TIMEFRAME} height={height}>
        <RankedBarChart data={visual.data} unit={visual.unit} higherIsWorse={!visual.higherIsBetter} />
      </ChartFrame>
    </div>
  )
}

/* ==========================================================================
   Trend
   ========================================================================== */

/**
 * Folds a second series onto the first as `comparison`, aligned by axis label.
 * `TrendChart` draws a comparison as a dashed line against the same axes, which
 * is the only honest way to read two series that share a unit - stacking them
 * in separate frames invites a comparison the eye cannot actually make.
 */
function withComparison(primary: NamedSeries, comparison?: NamedSeries): SeriesPoint[] {
  if (!comparison) return primary.points
  const byLabel = new Map(comparison.points.map((p) => [p.label, p.value]))
  return primary.points.map((point) => {
    const other = byLabel.get(point.label)
    return typeof other === 'number' ? { ...point, comparison: other } : point
  })
}

/** Pairs the series so each frame carries at most one subject and one comparison. */
function pairSeries(series: NamedSeries[]): Array<{ primary: NamedSeries; comparison?: NamedSeries }> {
  const out: Array<{ primary: NamedSeries; comparison?: NamedSeries }> = []
  for (let i = 0; i < series.length; i += 2) {
    out.push({ primary: series[i], comparison: series[i + 1] })
  }
  return out
}

function TrendVisual({ visual }: { visual: Extract<AIVisual, { kind: 'trend' }> }): React.JSX.Element | null {
  const pairs = pairSeries(visual.series).filter((pair) => pair.primary.points.length > 0)
  if (pairs.length === 0) return null
  return (
    <div className="min-w-0 space-y-4">
      {pairs.map((pair, index) => (
        <ChartFrame
          key={`${pair.primary.id}~${pair.comparison?.id ?? ''}`}
          // Only the first frame carries the payload's caption; the rest are
          // titled by their own series, so no two frames claim the same label.
          title={index === 0 ? visual.caption : pair.primary.name}
          unit={pair.primary.unit || visual.unit}
          timeframe={VISUAL_TIMEFRAME}
          height={200}
          legend={
            <>
              <LegendItem colour={CHART_COLOURS.primary} label={pair.primary.name} />
              {pair.comparison ? (
                <LegendItem colour={CHART_COLOURS.neutral} label={pair.comparison.name} dashed />
              ) : null}
            </>
          }
        >
          <TrendChart
            points={withComparison(pair.primary, pair.comparison)}
            unit={pair.primary.unit || visual.unit}
            seriesLabel={pair.primary.name}
            comparisonLabel={pair.comparison?.name}
            variant={pair.comparison ? 'line' : 'area'}
          />
        </ChartFrame>
      ))}
    </div>
  )
}

/* ==========================================================================
   Composition
   ========================================================================== */

function CompositionVisual({
  visual,
}: {
  visual: Extract<AIVisual, { kind: 'composition' }>
}): React.JSX.Element | null {
  const segments = visual.segments.filter((segment) => segment.value > 0)
  if (segments.length === 0) return null
  const total = segments.reduce((sum, segment) => sum + segment.value, 0)
  return (
    <div className="min-w-0 rounded-xl border border-ink-100 bg-surface-sunken/50 p-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="label-institutional">{visual.caption}</p>
        <p className="numeric text-[0.6875rem] text-ink-400">{t('Total {0}', formatNumber(total))}</p>
      </div>
      {/* The bar's own legend names and quantifies every segment - a composition
          read only by colour is not readable at all. */}
      <CompositionBar className="mt-2.5" segments={segments} height={10} />
    </div>
  )
}

/* ==========================================================================
   Heatmap
   ========================================================================== */

function HeatmapVisual({ visual }: { visual: Extract<AIVisual, { kind: 'heatmap' }> }): React.JSX.Element | null {
  if (visual.rows.length === 0 || visual.columns.length === 0) return null
  // Fixed height, because the matrix scrolls within itself: a matrix that grew
  // with its rows would push the rest of the answer off the reading surface.
  const height = clampHeight(visual.rows.length * 26 + 56, 170, 440)
  return (
    <div className="min-w-0">
      <ChartFrame title={visual.caption} unit={HEATMAP_UNIT} timeframe={VISUAL_TIMEFRAME} height={height}>
        {/* The ramp always runs favourable to adverse, so the legend states
            which end of the *value* range that is - otherwise a matrix where
            a high figure is good reads as a wall of alarm. */}
        <HeatmapMatrix
          rows={visual.rows}
          columns={visual.columns}
          values={visual.values}
          higherIsBetter={visual.higherIsBetter}
          legendLow={visual.higherIsBetter ? 'Higher (better)' : 'Lower (better)'}
          legendHigh={visual.higherIsBetter ? 'Lower (worse)' : 'Higher (worse)'}
        />
      </ChartFrame>
    </div>
  )
}
