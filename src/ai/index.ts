import type { AIProvider } from './provider'
import { MockMunicipalAIProvider } from './mock-provider'

export * from './provider'
export { MockMunicipalAIProvider } from './mock-provider'

/**
 * AI provider registry.
 *
 * The platform talks to an AI *abstraction*, never to a model vendor. Every
 * component consumes `AIResponse` and never contains AI logic of its own.
 *
 * To move from the demonstration provider to a governed production model:
 *
 *   1. Implement `AIProvider` against the approved AI gateway.
 *   2. Register it once at application start with `setAIProvider(...)`.
 *
 * No page, hook, drawer or component changes. Model credentials never enter
 * the browser bundle - the gateway holds them, and the gateway enforces the
 * prohibited-intent policy independently of anything the client sends.
 */

let activeProvider: AIProvider = new MockMunicipalAIProvider()

export function getAIProvider(): AIProvider {
  return activeProvider
}

export function setAIProvider(provider: AIProvider): void {
  activeProvider = provider
}

/** Descriptive record of the provider currently in effect, for the Trust Centre. */
export function activeProviderInfo(): { id: string; displayName: string; modelId: string; environment: string } {
  return {
    id: activeProvider.id,
    displayName: activeProvider.displayName,
    modelId: activeProvider.modelId,
    environment: 'demonstration',
  }
}
