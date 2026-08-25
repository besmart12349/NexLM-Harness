import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { Message } from '@deepseek-ai/dsh-llm'
import type { Agent } from '@deepseek-ai/dsh-agent'
import {
  createIntelligenceRuntime,
  type ExecutionPlan,
  type IntelligenceRequest,
  type IntelligenceRuntime,
  type ModelCandidate,
} from './index.js'

export interface IntelligenceServiceConfig {
  mode?: 'auto' | 'off' | 'required'
  intentUrl?: string
  probeTimeoutMs?: number
  requestTimeoutMs?: number
}

type IntentUiSettings = {
  enabled: boolean
  path: string
  manualModel: string
  defaultQuality: 'fast' | 'balanced' | 'max'
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    intelligence: IntelligenceService
  }
}

function messageText(message: Message): string {
  if (typeof message.content === 'string') return message.content.trim()
  return message.content.filter((block) => block.type === 'text').map((block) => block.text).join('\n').trim()
}

function latestPrompt(agent: Agent): { prompt: string; hasImage: boolean } {
  const messages = agent.session.deriveMessages()
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.role !== 'user') continue
    const prompt = messageText(message)
    const hasImage = typeof message.content !== 'string' && message.content.some((block) => block.type === 'image')
    if (prompt || hasImage) return { prompt, hasImage }
  }
  return { prompt: '', hasImage: false }
}

function inferCapabilities(model: string, inputModalities: readonly string[] | undefined): string[] {
  const value = model.toLowerCase()
  const capabilities = new Set<string>()
  if (inputModalities?.includes('image')) capabilities.add('vision')
  if (/code|coder|devstral/.test(value)) capabilities.add('codegen')
  if (/reason|r1|gpt-oss/.test(value)) capabilities.add('reasoning')
  if (/math|r1/.test(value)) capabilities.add('math')
  if (capabilities.size === 0) capabilities.add('general')
  capabilities.add('tool-calling')
  return [...capabilities]
}

async function availableModels(ctx: Context): Promise<ModelCandidate[]> {
  const candidates: ModelCandidate[] = []
  for (const provider of ctx.llm.listProviders()) {
    try {
      const models = await ctx.llm.listModels(provider.id)
      for (const model of models) {
        const capabilities = inferCapabilities(model.id, model.inputModalities)
        candidates.push({ provider: model.provider, model: model.id, capabilities, roles: capabilities })
      }
    } catch {
      // Catalog discovery is advisory.
    }
  }
  return candidates
}

function parseManualModel(value: string): { provider: string; model: string } | undefined {
  const normalized = value.trim()
  if (!normalized) return undefined
  const separator = normalized.indexOf(':')
  if (separator <= 0 || separator === normalized.length - 1) return undefined
  return { provider: normalized.slice(0, separator), model: normalized.slice(separator + 1) }
}

export class IntelligenceService extends Service {
  static Config: z<IntelligenceServiceConfig> = z.object({
    mode: z.union([z.const('auto'), z.const('off'), z.const('required')]),
    intentUrl: z.string(),
    probeTimeoutMs: z.number(),
    requestTimeoutMs: z.number(),
  })

  readonly runtime: IntelligenceRuntime
  private readonly uiSettings: ReturnType<Context['settingsScope']['bind']<IntentUiSettings>>

  constructor(ctx: Context, config: IntelligenceServiceConfig = {}) {
    super(ctx, 'intelligence')
    this.runtime = createIntelligenceRuntime(config)
    this.uiSettings = ctx.settingsScope.bind<IntentUiSettings>({ namespace: 'nexlm-intent' })

    ctx.on('agent/request', async (payload, next) => {
      const proposed = await next()
      if (payload.signal.aborted || payload.step !== 1) return proposed

      const settings = this.uiSettings.getSnapshot().value
      const manualModel = parseManualModel(settings?.manualModel ?? '')
      if (manualModel !== undefined && settings?.enabled === false) {
        return { ...proposed, provider: manualModel.provider, model: manualModel.model }
      }
      if (settings?.enabled === false) return proposed

      const agent = ctx.agents.currentInitiator()
      if (agent === undefined) return manualModel === undefined ? proposed : { ...proposed, provider: manualModel.provider, model: manualModel.model }

      const { prompt, hasImage } = latestPrompt(agent)
      if (!prompt && !hasImage) return manualModel === undefined ? proposed : { ...proposed, provider: manualModel.provider, model: manualModel.model }

      const candidates = await availableModels(ctx)
      const request: IntelligenceRequest = {
        prompt,
        hasImage,
        quality: settings?.defaultQuality ?? 'balanced',
        currentModel: manualModel ?? { provider: proposed.provider, model: proposed.model },
        models: candidates,
      }
      const plan = await this.analyze(request)
      payload.signal.throwIfAborted()
      const routed = this.applyPrimary(plan, proposed)
      return manualModel === undefined ? routed : { ...routed, provider: manualModel.provider, model: manualModel.model }
    })
  }

  get providers() { return this.runtime.providers }
  analyze(request: IntelligenceRequest): Promise<ExecutionPlan> { return this.runtime.analyze(request) }

  private applyPrimary(plan: ExecutionPlan, proposed: { provider: string; model: string }) {
    if (!plan.primary.provider || !plan.primary.model) return proposed
    return { ...proposed, provider: plan.primary.provider, model: plan.primary.model }
  }
}

export default IntelligenceService
