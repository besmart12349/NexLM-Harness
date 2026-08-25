import type {
  ExecutionPlan,
  HardwareProfile,
  IntelligenceProvider,
  IntelligenceQuality,
  IntelligenceRequest,
  ModelCandidate,
  TaskKind,
} from './types.js'

const QUALITY_DEFAULT: IntelligenceQuality = 'balanced'

const KEYWORDS: Record<TaskKind, readonly string[]> = {
  codegen: ['code', 'website', 'app', 'script', 'function', 'implement', 'build'],
  debug: ['debug', 'bug', 'error', 'fix', 'broken', 'failing', 'lint', 'review'],
  vision: ['image', 'screenshot', 'photo', 'diagram', 'picture', 'visual'],
  math: ['calculate', 'equation', 'proof', 'solve', 'math'],
  research: ['research', 'compare', 'sources', 'investigate', 'find out'],
  general: [],
  mixed: [],
}

function inferTask(prompt: string, hasImage: boolean): { kind: TaskKind; capabilities: string[] } {
  const normalized = prompt.toLowerCase()
  const matches = (Object.entries(KEYWORDS) as Array<[TaskKind, readonly string[]]>)
    .filter(([kind, words]) => kind !== 'general' && words.some((word) => normalized.includes(word)))
    .map(([kind]) => kind)

  if (hasImage && !matches.includes('vision')) matches.push('vision')

  const unique = [...new Set(matches)]
  if (unique.length === 0) return { kind: 'general', capabilities: ['tool-calling'] }
  if (unique.length > 1) return { kind: 'mixed', capabilities: unique }

  return { kind: unique[0], capabilities: [unique[0], 'tool-calling'] }
}

function pickPrimary(
  request: IntelligenceRequest,
  kind: TaskKind,
  candidates: readonly ModelCandidate[],
): ModelCandidate {
  if (request.currentModel) {
    const current = candidates.find(
      (candidate) => candidate.provider === request.currentModel?.provider && candidate.model === request.currentModel?.model,
    )
    if (current) return current
  }

  const role = kind === 'mixed' ? 'general' : kind
  const capable = candidates.find(
    (candidate) => candidate.roles?.includes(role) || candidate.capabilities?.includes(role),
  )

  return capable ?? candidates[0] ?? {
    provider: request.currentModel?.provider ?? 'configured',
    model: request.currentModel?.model ?? 'configured',
  }
}

export class BuiltInIntelligenceProvider implements IntelligenceProvider {
  readonly id = 'builtin'

  async analyze(request: IntelligenceRequest): Promise<ExecutionPlan> {
    const quality = request.quality ?? QUALITY_DEFAULT
    const task = inferTask(request.prompt, Boolean(request.hasImage))
    const candidates = request.models ?? []
    const primary = pickPrimary(request, task.kind, candidates)

    return {
      schemaVersion: 1,
      provider: this.id,
      task: {
        kind: task.kind,
        modalities: request.hasImage ? ['text', 'image'] : ['text'],
        requiredCapabilities: task.capabilities,
      },
      quality,
      primary: {
        provider: primary.provider,
        model: primary.model,
        role: task.kind,
        reason: request.currentModel
          ? 'preserved current model because no stronger local signal was available'
          : 'selected from available local candidates',
      },
      workers: [],
      constraints: {
        usableRamGb: request.hardware?.usableRamGb,
        maxParallel: 1,
      },
      confidence: candidates.length > 0 || request.currentModel ? 0.6 : 0.25,
    }
  }
}

export interface NexLMIntentProviderOptions {
  baseUrl?: string
  probeTimeoutMs?: number
  fetchImpl?: typeof fetch
}

export class NexLMIntentProvider implements IntelligenceProvider {
  readonly id = 'nexlm-intent'
  private readonly baseUrl: string
  private readonly probeTimeoutMs: number
  private readonly fetchImpl: typeof fetch

  constructor(options: NexLMIntentProviderOptions = {}) {
    this.baseUrl = (options.baseUrl ?? process.env.NEXLM_INTENT_URL ?? 'http://127.0.0.1:8420').replace(/\/$/, '')
    this.probeTimeoutMs = options.probeTimeoutMs ?? 300
    this.fetchImpl = options.fetchImpl ?? fetch
  }

  async isAvailable(): Promise<boolean> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.probeTimeoutMs)
    try {
      const response = await this.fetchImpl(`${this.baseUrl}/v1/hardware`, {
        method: 'GET',
        signal: controller.signal,
      })
      return response.ok
    } catch {
      return false
    } finally {
      clearTimeout(timeout)
    }
  }

  async analyze(request: IntelligenceRequest): Promise<ExecutionPlan> {
    const response = await this.fetchImpl(`${this.baseUrl}/v1/resolve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    })

    if (!response.ok) throw new Error(`NexLM Intent returned HTTP ${response.status}`)

    const plan = await response.json() as ExecutionPlan
    if (plan.schemaVersion !== 1 || plan.provider !== 'nexlm-intent') {
      throw new Error('NexLM Intent returned an unsupported execution-plan schema')
    }
    return plan
  }
}

export interface IntelligenceRuntime {
  readonly providers: readonly IntelligenceProvider[]
  selectProvider(): Promise<IntelligenceProvider>
  analyze(request: IntelligenceRequest): Promise<ExecutionPlan>
}

export function createIntelligenceRuntime(
  config: import('./types.js').IntelligenceRuntimeConfig = {},
): IntelligenceRuntime {
  const mode = config.mode ?? 'auto'
  const builtin = new BuiltInIntelligenceProvider()
  const intent = new NexLMIntentProvider({
    baseUrl: config.intentUrl,
    probeTimeoutMs: config.probeTimeoutMs,
  })
  const providers = mode === 'off' ? [builtin] : [intent, builtin]

  return {
    providers,
    async selectProvider() {
      if (mode === 'off') return builtin
      if (await intent.isAvailable()) return intent
      if (mode === 'required') throw new Error('NexLM Intent is required but is not available')
      return builtin
    },
    async analyze(request) {
      const provider = await this.selectProvider()
      try {
        return await provider.analyze(request)
      } catch (error) {
        if (provider.id === 'nexlm-intent' && mode === 'auto') return builtin.analyze(request)
        throw error
      }
    },
  }
}

export type {
  ExecutionPlan,
  HardwareProfile,
  IntelligenceProvider,
  IntelligenceQuality,
  IntelligenceRequest,
  ModelCandidate,
  TaskKind,
} from './types.js'

export type { IntelligenceRuntimeConfig } from './types.js'
