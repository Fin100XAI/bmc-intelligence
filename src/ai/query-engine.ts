import type { User } from '@/types/organisation'
import type { AnswerContext, AnswerHandler, ComposedAnswer } from './answer-kit'
import { authorisedWards, deniedAnswer, standardLimitations } from './answer-kit'
import type { QueryIntentId, QueryUnderstanding } from './nlu'
import { understandQuery } from './nlu'
import { executiveHandlers } from '@/ai/answers/executive'
import { wardHandlers } from '@/ai/answers/wards'
import { waterHandlers } from '@/ai/answers/water'
import { physicalHandlers } from '@/ai/answers/physical'
import { healthHandlers } from '@/ai/answers/health'
import { financeHandlers } from '@/ai/answers/finance'
import { civicHandlers } from '@/ai/answers/civic'
import { governanceHandlers } from '@/ai/answers/governance'
import { t } from '@/i18n'

/**
 * src/ai/query-engine.ts
 *
 * The assembly: a *read* question becomes a composed answer.
 *
 * The engine deliberately owns three things the routes are not trusted with,
 * because each is a place where a municipal assistant fails quietly rather than
 * loudly, and a quiet failure is the one an operator cannot notice:
 *
 *   - **Scope is computed once, here.** A route never derives its own
 *     geography. It is handed `scopeWards` already filtered through the
 *     permission engine, so a route cannot accidentally read outside the
 *     principal's authorisation by forgetting a filter.
 *
 *   - **A named-but-unauthorised ward is refused, not widened.** If the
 *     question named only wards the principal may not read, falling through to
 *     a corporation-wide answer would answer a different question and look
 *     authoritative doing it. That path is closed below.
 *
 *   - **A missing or failing route is stated.** A route that has not landed, or
 *     one that throws, produces a plain statement of the limitation. It never
 *     produces an exception at the page, and never an adjacent answer offered
 *     as though it were the one asked for.
 *
 * PRECONDITION: `evaluateGatewayPolicy` has already permitted the request.
 * Nothing here - not `understandQuery`, not entity binding, not route
 * selection, not retrieval - may run before the gateway has said yes. The
 * gateway is evaluated by the provider in `answerMunicipalQuery`, before this
 * module is reached, and that ordering is the technical enforcement of the
 * human-in-the-loop principle rather than a policy statement about it.
 */

/* ==========================================================================
   The route registry
   ========================================================================== */

/**
 * The eight domain modules merged into one lookup.
 *
 * Ownership is disjoint by contract and the union is exhaustive over
 * `QueryIntentId`, so spread order is a stable tie-break and nothing more. It
 * carries no priority: a route is reached because the question scored for it in
 * `understandQuery`, never because its module happened to be merged last.
 */
const ANSWER_ROUTES: Partial<Record<QueryIntentId, AnswerHandler>> = {
  ...executiveHandlers,
  ...wardHandlers,
  ...waterHandlers,
  ...physicalHandlers,
  ...healthHandlers,
  ...financeHandlers,
  ...civicHandlers,
  ...governanceHandlers,
}

/** Result count applied where the operator stated none. */
const DEFAULT_LIMIT = 6
const MIN_LIMIT = 1
const MAX_LIMIT = 30

/* ==========================================================================
   Context
   ========================================================================== */

/**
 * Binds the principal's authorisation to the question's stated geography.
 *
 * `focusWards` is the intersection, not the union: a ward the question named
 * but the principal may not read is dropped here so that no route ever holds a
 * reference to it. Dropping it is not the whole answer, though - `runQuery`
 * states the omission, because a silently narrower answer reads exactly like a
 * complete one.
 */
export function buildAnswerContext(user: User, understanding: QueryUnderstanding): AnswerContext {
  const wards = authorisedWards(user)
  const focusWards = understanding.entities.wards.filter((named) => wards.some((w) => w.id === named.id))
  const scopeWards = focusWards.length > 0 ? focusWards : wards
  const requested = understanding.entities.limit ?? DEFAULT_LIMIT

  return {
    user,
    understanding,
    wards,
    focusWards,
    scopeWards,
    narrowed: focusWards.length > 0,
    limit: Math.min(MAX_LIMIT, Math.max(MIN_LIMIT, requested)),
  }
}

/* ==========================================================================
   Route resolution
   ========================================================================== */

/**
 * The answer of last resort: the intent resolved, but nothing can run it.
 *
 * Reached only where the route is absent *and* the `capabilities` route is
 * absent too, which means the engine cannot even list what it can answer. The
 * honest output in that state is short: say what was understood, say that it
 * cannot be served, and retrieve nothing in its place.
 */
function unroutedAnswer(ctx: AnswerContext): ComposedAnswer {
  const { intent } = ctx.understanding
  return {
    requestId: `q-unrouted-${intent.id}-${ctx.user.id}`,
    answer:
      `This question was read as "${intent.label}", but no retrieval route is currently implemented for it. `
      + 'Nothing has been retrieved and no figure is inferred in its place. An adjacent answer is not offered, '
      + 'because an answer to a question you did not ask is harder to notice than no answer at all.',
    keyFindings: [],
    evidence: [],
    recommendedActions: [],
    risksAndLimitations: [
      ...standardLimitations(),
      t('This is a stated limitation of the platform, not a statement about the position it was asked about.'),
    ],
    sources: [t('BMC Intelligence Core - retrieval registry')],
    domains: intent.domains,
    grounding: 'general-reasoning',
  }
}

/** The answer given where a route ran and raised. */
function failedAnswer(ctx: AnswerContext): ComposedAnswer {
  const { intent } = ctx.understanding
  return {
    requestId: `q-failed-${intent.id}-${ctx.user.id}`,
    answer:
      `The retrieval route for "${intent.label}" did not complete, so no position is set out here. `
      + 'No partial or inferred figure is offered in its place, because a partial retrieval presented as a whole one '
      + 'would be indistinguishable from a complete answer.',
    keyFindings: [],
    evidence: [],
    recommendedActions: [],
    risksAndLimitations: [
      ...standardLimitations(),
      t('The route raised an error while composing this answer. The failure is stated rather than absorbed, so the gap is visible.'),
    ],
    sources: [t('BMC Intelligence Core - retrieval registry')],
    domains: intent.domains,
    grounding: 'general-reasoning',
  }
}

/**
 * Resolves a route to something runnable.
 *
 * The declared return type keeps `undefined` so no caller may assume a route
 * exists; the implementation never actually produces it. A route can go missing
 * for an ordinary reason - a new intent entering the vocabulary before its
 * handler lands - and the correct response to that is a stated limitation, not
 * a thrown error inside an answer.
 */
export function resolveHandler(id: QueryIntentId): AnswerHandler | undefined {
  return ANSWER_ROUTES[id] ?? ANSWER_ROUTES.capabilities ?? unroutedAnswer
}

/* ==========================================================================
   The public entry point
   ========================================================================== */

/** Appends a limitation without disturbing anything else the route composed. */
function withLimitation(composed: ComposedAnswer, limitation: string): ComposedAnswer {
  return { ...composed, risksAndLimitations: [...composed.risksAndLimitations, limitation] }
}

/**
 * Reads a question, binds it to the principal's scope, and runs its route.
 *
 * Returns the understanding alongside the answer so the interface can publish
 * how the question was read. That pairing is the point: an operator who can see
 * the reading can correct a misreading in one glance, which is not true of an
 * answer presented on its own.
 */
export function runQuery(user: User, question: string): { understanding: QueryUnderstanding; composed: ComposedAnswer } {
  const understanding = understandQuery(question)
  const ctx = buildAnswerContext(user, understanding)

  // Scope-leak guard. A ward named in the question but outside the principal's
  // authorisation is neither read nor disclosed. Where every named ward was
  // withheld, `scopeWards` would silently fall back to the principal's full
  // scope and a ward-specific question would be answered corporation-wide, with
  // nothing in the output to show it had happened. That is refused instead.
  const named = understanding.entities.wards
  const withheld = named.filter((w) => !ctx.wards.some((authorised) => authorised.id === w.id))

  if (named.length > 0 && ctx.focusWards.length === 0) {
    const subject = `ward-level position for the ${withheld.length === 1 ? t('ward named') : t('{0} wards named', withheld.length)} in the question`
    const reason =
      withheld.length === 1
        ? t('The question named a ward that falls outside your authorised ward scope, so it was not read.')
        : t('The question named {0} wards, all of which fall outside your authorised ward scope, so none was read.', withheld.length)
    return {
      understanding,
      composed: withLimitation(
        deniedAnswer(ctx, subject, reason),
        'A corporation-wide answer was not substituted. Widening the geography would answer a different question from the one asked, without saying so.',
      ),
    }
  }

  const routed = ANSWER_ROUTES[understanding.intent.id] !== undefined
  const handler = resolveHandler(understanding.intent.id) ?? unroutedAnswer

  let composed: ComposedAnswer
  try {
    composed = handler(ctx)
  } catch (error) {
    // Surfaced to the developer console, kept out of the operator's answer: an
    // internal failure message is not municipal information and must not read
    // as though it were.
    console.error(`[query-engine] route "${understanding.intent.id}" failed`, error)
    composed = failedAnswer(ctx)
  }

  if (!routed) {
    composed = withLimitation(
      composed,
      `No retrieval route is implemented for "${understanding.intent.label}". What is set out above is a stated fallback, not an answer to that route.`,
    )
  }

  if (withheld.length > 0) {
    composed = withLimitation(
      composed,
      `${withheld.length} ward${withheld.length === 1 ? '' : 's'} named in the question fall${withheld.length === 1 ? 's' : ''} outside your authorised ward scope and ${withheld.length === 1 ? 'was' : 'were'} not retrieved. The figures above cover the named wards you are authorised to read, and no other.`,
    )
  }

  return { understanding, composed }
}
