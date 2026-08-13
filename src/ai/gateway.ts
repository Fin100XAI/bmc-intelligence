import type { IntelligenceDomain } from '@/types/common'
import type { AIResponse } from '@/types/ai'
import type { DecisionCase, Incident } from '@/types/operations'
import type { MonsoonScenarioInput, MonsoonScenarioResult } from '@/types/city-domains'
import { MockMunicipalAIProvider } from './mock-provider'
import type { AIProvider, AIRequestContext, ExecutiveBrief, MetricExplanation, RiskAnalysisResult } from './provider'

/**
 * src/ai/gateway.ts
 *
 * SCAFFOLDING — not registered via `setAIProvider()` anywhere. See
 * docs/architecture/04-ai-gateway.md.
 *
 * `src/ai/provider.ts` already defines the seam this needs (`AIProvider`)
 * and `src/ai/index.ts` already documents the two-step migration
 * ("1. Implement AIProvider against the approved AI gateway. 2. Register it
 * with setAIProvider(...)"). This file is step 1, incomplete on purpose:
 * every method currently delegates straight to `MockMunicipalAIProvider`,
 * wrapped in the three hooks a real gateway actually adds - routing,
 * cost/rate metering, and guardrail enforcement at the network boundary -
 * each marked with a `TODO` rather than faked. Registering this class in
 * place of the mock provider is the migration step itself
 * (docs/architecture/04, step 6), not something to do quietly here.
 */

export interface GatewayConfig {
  /** Base URL of the deployed gateway service. Unused until routeRequest is implemented. */
  endpoint: string
  /** Resolves which upstream model handles a request, keyed by classification/risk class. */
  resolveRoute: (ctx: AIRequestContext) => GatewayRoute
}

export interface GatewayRoute {
  /** Model Registry id (src/pages/ai/ModelRegistryPage.tsx) this request should be billed and logged against. */
  modelRegistryId: string
  /** Whether this route target is the sovereign/on-premise model behind `ff-sovereign-model`. */
  sovereign: boolean
}

export class GatewayAIProvider implements AIProvider {
  readonly id = 'gateway'
  readonly displayName = 'Governed AI Gateway'
  readonly modelId = 'routed-via-gateway'

  private readonly fallback = new MockMunicipalAIProvider()
  private readonly config: GatewayConfig

  constructor(config: GatewayConfig) {
    this.config = config
  }

  /**
   * TODO(gateway): rate limiting and cost tracking per requesting officer /
   * department, against a real budget rather than the demonstration
   * environment's unlimited request volume.
   */
  private async withMetering<T>(ctx: AIRequestContext, run: () => Promise<T>): Promise<T> {
    const route = this.config.resolveRoute(ctx)
    void route // TODO(gateway): forward the resolved route to the real HTTP call once one exists.
    return run()
  }

  async generateExecutiveBrief(ctx: AIRequestContext): Promise<ExecutiveBrief> {
    return this.withMetering(ctx, () => this.fallback.generateExecutiveBrief(ctx))
  }

  async analyseRisk(ctx: AIRequestContext, domain?: IntelligenceDomain): Promise<RiskAnalysisResult> {
    return this.withMetering(ctx, () => this.fallback.analyseRisk(ctx, domain))
  }

  async explainMetric(ctx: AIRequestContext, metricId: string): Promise<MetricExplanation> {
    return this.withMetering(ctx, () => this.fallback.explainMetric(ctx, metricId))
  }

  async answerMunicipalQuery(ctx: AIRequestContext, question: string): Promise<AIResponse> {
    return this.withMetering(ctx, () => this.fallback.answerMunicipalQuery(ctx, question))
  }

  async recommendActions(ctx: AIRequestContext, subject: string): Promise<AIResponse> {
    return this.withMetering(ctx, () => this.fallback.recommendActions(ctx, subject))
  }

  async summariseIncident(ctx: AIRequestContext, incident: Incident): Promise<AIResponse> {
    return this.withMetering(ctx, () => this.fallback.summariseIncident(ctx, incident))
  }

  async generateDecisionOptions(ctx: AIRequestContext, decisionCase: DecisionCase): Promise<AIResponse> {
    return this.withMetering(ctx, () => this.fallback.generateDecisionOptions(ctx, decisionCase))
  }

  async interpretScenario(
    ctx: AIRequestContext,
    inputs: MonsoonScenarioInput,
    result: MonsoonScenarioResult,
  ): Promise<AIResponse> {
    return this.withMetering(ctx, () => this.fallback.interpretScenario(ctx, inputs, result))
  }
}
