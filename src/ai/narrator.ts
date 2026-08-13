/**
 * src/ai/narrator.ts
 *
 * The seam between the AI layer and whatever can reach a model.
 *
 * `mock-provider.ts` needs model-written prose when one is available, but it
 * must not import the HTTP transport to get it. Two independent reasons:
 *
 *  - **Layering.** `src/ai/*` is pure composition over retrieved records. It
 *    is imported by the API server, by `scripts/smoke.mjs`, and by the page
 *    render harness — none of which have a browser. `services/http.ts` reads
 *    `window` and `import.meta.env`, so importing it from here drags DOM-only
 *    code into three Node builds. (The import chain is not obvious:
 *    `answers/governance.ts` imports `@/ai/index`, which constructs the
 *    provider, so anything the provider imports is in the server's graph.)
 *
 *  - **Determinism.** The smoke suites assert that the AI layer produces
 *    byte-identical output across runs. A default that quietly does nothing
 *    keeps that true without those harnesses having to know a model exists.
 *
 * So the transport is *injected*: the browser entry point installs the real
 * narrator at startup, and everywhere else the default no-op stands, which is
 * exactly the behaviour the platform had before a model was wired in.
 */

export interface NarratedAnswer {
  answer: string
  keyFindings: string[]
}

export interface Narration {
  narrative?: NarratedAnswer
  modelId: string
  provider: string
  degraded: boolean
  degradedReason?: string
}

export type Narrator = (question: string) => Promise<Narration | null>

/** The default: no model, no narration, deterministic answer served. */
const NO_NARRATOR: Narrator = async () => null

let active: Narrator = NO_NARRATOR

/**
 * Installs the narrator. Called once from the browser entry point.
 *
 * Passing `null` restores the no-op, which is what a sign-out or a switch back
 * to demonstration transport should do rather than leaving a stale binding
 * pointed at an API the application is no longer talking to.
 */
export function setNarrator(narrator: Narrator | null): void {
  active = narrator ?? NO_NARRATOR
}

/** Whether a real narrator is installed. */
export function hasNarrator(): boolean {
  return active !== NO_NARRATOR
}

/**
 * Requests narration. Never throws — a narrator that fails is a narrator that
 * did not narrate, and the caller serves the deterministic answer.
 */
export async function narrate(question: string): Promise<Narration | null> {
  try {
    return await active(question)
  } catch {
    return null
  }
}
