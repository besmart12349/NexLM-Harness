import type {
  ExecutionPlan,
  IntelligenceProvider,
  IntelligenceQuality,
  IntelligenceRequest,
  IntelligenceRuntimeConfig,
  ModelAssignment,
  ModelCandidate,
  TaskKind,
} from './types.js'

const QUALITY_DEFAULT: IntelligenceQuality = 'balanced'
const PROBE_CACHE_SUCCESS_MS = 5_000
const PROBE_CACHE_FAILURE_MS = 1_000

const KEYWORDS: Record<TaskKind, readonly string[]> = {
  codegen: ['code', 'website', 'app', 'script', 'function', 'implement', 'build'],
  debug: ['debug', 'bug', 'error', 'fix', 'broken', 'failing', 'lint', 'review'],
  vision: ['image', 'screenshot', 'photo', 'diagram', 'picture', 'visual'],
  math: ['calculate', 'equation', 'proof', 'solve', 'math'],
  research: ['research', 'compare', 'sources', 'investigate', 'find out'],
  general: [],
  mixed: [],
}

const TASK_KINDS = new Set<TaskKind>(['general', 'codegen', 'debug', 'vision', 'math', 'research', 'mixed'])
const MODALITIES = new Set(['text', 'image'])
const QUALITY_LEVELS = new Set<IntelligenceQuality>(['fast', 'balanced', 'max'])

function inferTask(prompt: string, hasImage: boolean): { kind: TaskKind; capabilities: string[] } {
  const normalized = prompt.toLowerCase()
  const matches: TaskKind[] = (Object.entries(KEYWORDS) as Array<[TaskKind, readonly string[]]>)
    .filter(([kind, words]) => kind !== 'general' && words.some((word) => normalized.includes(word)))
    .map(([kind]) => kind)

  if (hasImage && !matches.includes('vision')) matches.push('vision')

  const unique: TaskKind[] = [...new Set(matches)]
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

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function isModelAssignment(value: unknown): value is ModelAssignment {
  if (!value || typeof value !== 'object') return false
  const assignment = value as Record<string, unknown>
  return (
    typeof assignment.provider === 'string' &&
    assignment.provider.length > 0 &&
    typeof assignment.model === 'string' &&
    assignment.model.length > 0 &&
    typeof assignment.role === 'string' &&
    assignment.role.length > 0 &&
    (assignment.reason === undefined || typeof assignment.reason === 'string')
  )
}

export function isExecutionPlan(value: unknown, provider: string): value is ExecutionPlan {
  if (!value || typeof value !== 'object') return false

  const plan = value as Record<string, unknown>
  const task = plan.task
  const primary = plan.primary
  const workers = plan.workers
  const constraints = plan.constraints

  if (plan.schemaVersion !== 1 || plan.provider !== provider) return false
  if (!task || typeof task !== 'object') return false
  if (!primary || !isModelAssignment(primary)) return false
  if (!Array.isArray(workers) || !workers.every(isModelAssignment)) return false
  if (!constraints || typeof constraints !== 'object') return false
  if (typeof plan.quality !== 'string' || !QUALITY_LEVELS.has(plan.quality as IntelligenceQuality)) return false
  if (!isFiniteNonNegative(plan.confidence) || plan.confidence > 1) return false

  const taskRecord = task as Record<string, unknown>
  if (typeof taskRecord.kind !== 'string' || !TASK_KINDS.has(taskRecord.kind as TaskKind)) return false
  if (!Array.isArray(taskRecord.modalities) || !taskRecord.modalities.every((value) => typeof value === 'string' && MODALITIES.has(value))) return false
  if (!Array.isArray(taskRecord.requiredCapabilities) || !taskRecord.requiredCapabilities.every((value) => typeof value === 'string')) return false

  const constraintRecord = constraints as Record<string, unknown>
  if (constraintRecord.usableRamGb !== undefined && !isFiniteNonNegative(constraintRecord.usableRamGb)) return false
  if (
    constraintRecord.maxParallel !== undefined &&
    (!Number.isInteger(constraintRecord.maxParallel) || Number(constraintRecord.maxParallel) < 1)
  ) return false

  return true
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
  requestTimeoutMs?: number
  fetchImpl?: typeof fetch
}

interface AvailabilityCache {
  value: boolean
  expiresAt: number
}

export class NexLMIntentProvider implements IntelligenceProvider {
  readonly id = 'nexlm-intent'
  private readonly baseUrl: string
  private readonly probeTimeoutMs: number
  private readonly requestTimeoutMs: number
  private readonly fetchImpl: typeof fetch
  private availability?: AvailabilityCache

  constructor(options: NexLMIntentProviderOptions = {}) {
    this.baseUrl = (options.baseUrl ?? process.env.NEXLM_INTENT_URL ?? 'http://127.0.0.1:8420').replace(/\/$/, '')
    this.probeTimeoutMs = options.probeTimeoutMs ?? 300
    this.requestTimeoutMs = options.requestTimeoutMs ?? 30_000
    this.fetchImpl = options.fetchImpl ?? fetch
  }

  async isAvailable(force = false): Promise<boolean> {
    const now = Date.now()
    if (!force && this.availability && this.availability.expiresAt > now) return this.availability.value

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.probeTimeoutMs)

    try {
      const response = await this.fetchImpl(`${this.baseUrl}/v1/hardware`, {
        method: 'GET',
        signal: controller.signal,
      })
      const value = response.ok
      this.availability = {
        value,
        expiresAt: now + (value ? PROBE_CACHE_SUCCESS_MS : PROBE_CACHE_FAILURE_MS),
      }
      return value
    } catch {
      this.availability = { value: false, expiresAt: now + PROBE_CACHE_FAILURE_MS }
      return false
    } finally {
      clearTimeout(timeout)
    }
  }

  async analyze(request: IntelligenceRequest): Promise<ExecutionPlan> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs)

    try {
      const response = await this.fetchImpl(`${this.baseUrl}/v1/resolve`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request),
        signal: controller.signal,
      })

      if (!response.ok) throw new Error(`NexLM Intent returned HTTP ${response.status}`)

      let plan: unknown
      try {
        plan = await response.json()
      } catch {
        throw new Error('NexLM Intent returned invalid JSON')
      }

      if (!isExecutionPlan(plan, this.id)) {
        throw new Error('NexLM Intent returned an invalid execution plan')
      }

      return plan
    } finally {
      clearTimeout(timeout)
    }
  }
}

export interface IntelligenceRuntime {
  readonly providers: readonly IntelligenceProvider[]
  selectProvider(): Promise<IntelligenceProvider>
  analyze(request: IntelligenceRequest): Promise<ExecutionPlan>
}

export function createIntelligenceRuntime(config: IntelligenceRuntimeConfig = {}): IntelligenceRuntime {
  const mode = config.mode ?? 'auto'
  const builtin = new BuiltInIntelligenceProvider()
  const intent = new NexLMIntentProvider({
    baseUrl: config.intentUrl,
    probeTimeoutMs: config.probeTimeoutMs,
    requestTimeoutMs: config.requestTimeoutMs,
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
  ModelAssignment,
  ModelCandidate,
  TaskKind,
} from './types.js'

export type { IntelligenceRuntimeConfig } from './types.js'
