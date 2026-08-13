import { isApiEnabled, request } from './http'

/**
 * src/services/copilot.service.ts
 *
 * The browser's half of the Copilot's model path.
 *
 * The application does not hold a model credential and does not call a model
 * provider. It asks this platform's own API, which holds the credential, runs
 * the gateway policy, retrieves against the authoritative principal, and
 * records the request. Everything the browser gets back is prose.
 *
 * Why the browser still runs its own retrieval: the evidence, citations,
 * visuals and recommended actions rendered beside the answer come from the
 * deterministic layer here, exactly as they did before. The model's paragraph
 * is placed into that structure, not used to build it. A model outage
 * therefore costs the phrasing of one paragraph and nothing else.
 */

export interface CopilotNarrative {
  blocked?: { reason: string; intent: string }
  narrative?: { answer: string; keyFindings: string[] }
  modelId: string
  provider: string
  degraded: boolean
  degradedReason?: string
  latencyMs: number
  promptTokens: number
  completionTokens: number
}

export interface CopilotHealth {
  configured: boolean
  provider: string
  model: string | null
  reason: string | null
}

/**
 * Asks the platform's API for a model-written answer.
 *
 * Returns `null` — never throws — on any failure, including a server that is
 * not running. The caller treats `null` as "use the deterministic answer",
 * which is the platform's behaviour without a model at all. An officer
 * mid-question should not see an error banner because a provider is having a
 * bad afternoon.
 */
export async function narrate(question: string): Promise<CopilotNarrative | null> {
  if (!isApiEnabled()) return null

  try {
    return await request<CopilotNarrative>('/api/ai/copilot', {
      method: 'POST',
      body: { question },
    })
  } catch {
    return null
  }
}

/** Whether a model is configured, for the interface's provenance labelling. */
export async function health(): Promise<CopilotHealth | null> {
  if (!isApiEnabled()) return null
  try {
    return await request<CopilotHealth>('/api/ai/health')
  } catch {
    return null
  }
}
