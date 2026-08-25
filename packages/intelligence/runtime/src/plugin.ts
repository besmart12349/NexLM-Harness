import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { Message } from '@deepseek-ai/dsh-llm'
import type { Agent } from '@deepseek-ai/dsh-agent'
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

function messageText(message: Message): string {
  if (typeof message.content === 'string') return message.content.trim()
  return message.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim()
}

function latestPrompt(agent: Agent): string {
  const messages = agent.session.deriveMessages()
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.role !== 'user') continue
    const text = messageText(message)
    if (text) return text
  }
  return ''
}

/**
 * Harness's provider-neutral intelligence service.
 *
 * The service owns provider discovery and returns execution plans. AgentLoop
 * remains the executor; this service only participates in the existing
 * `agent/request` waterfall to select a primary route before the LLM adapter
 * is prepared.
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

    ctx.on('agent/request', async (payload, next) => {
      const proposed = await next()
      if (payload.signal.aborted || payload.step !== 1) return proposed

      const agent = ctx.agents.currentInitiator()
      if (agent === undefined) return proposed

      const prompt = latestPrompt(agent)
      if (!prompt) return proposed

      const request: IntelligenceRequest = {
        prompt,
        currentModel: {
          provider: proposed.provider,
          model: proposed.model,
        },
      }
      const plan = await this.analyze(request)
      payload.signal.throwIfAborted()
      return this.applyPrimary(plan, proposed)
    })
  }

  /** Available providers in selection order. */
  get providers() {
    return this.runtime.providers
  }

  /** Analyze a request and return a validated execution plan. */
  analyze(request: IntelligenceRequest): Promise<ExecutionPlan> {
    return this.runtime.analyze(request)
  }

  private applyPrimary(plan: ExecutionPlan, proposed: { provider: string; model: string }) {
    if (!plan.primary.provider || !plan.primary.model) return proposed
    return {
      ...proposed,
      provider: plan.primary.provider,
      model: plan.primary.model,
    }
  }
}

export default IntelligenceService
