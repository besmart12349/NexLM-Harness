import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import {
  createIntelligenceRuntime,
  type ExecutionPlan,
  type IntelligenceRequest,
  type IntelligenceRuntime,
} from './index.js'

export interface IntelligenceServiceConfig {
  mode?: 'auto' | 'off' | 'required'
  intentUrl?: string
  probeTimeoutMs?: number
  requestTimeoutMs?: number
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Harness intelligence planner. */
    intelligence: IntelligenceService
  }
}

/**
 * Harness's provider-neutral intelligence service.
 *
 * The service owns provider discovery and returns execution plans. It does not
 * execute model calls; AgentLoop/LLM/subagent services remain the executors.
 */
export class IntelligenceService extends Service {
  static Config: z<IntelligenceServiceConfig> = z.object({
    mode: z.union([
      z.const('auto'),
      z.const('off'),
      z.const('required'),
    ]),
    intentUrl: z.string(),
    probeTimeoutMs: z.number(),
    requestTimeoutMs: z.number(),
  })

  readonly runtime: IntelligenceRuntime

  constructor(ctx: Context, config: IntelligenceServiceConfig = {}) {
    super(ctx, 'intelligence')
    this.runtime = createIntelligenceRuntime(config)
  }

  /** Available providers in selection order. */
  get providers() {
    return this.runtime.providers
  }

  /** Analyze a request and return a validated execution plan. */
  analyze(request: IntelligenceRequest): Promise<ExecutionPlan> {
    return this.runtime.analyze(request)
  }
}

export default IntelligenceService
