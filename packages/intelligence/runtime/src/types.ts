/** Provider-neutral request/plan vocabulary for Harness intelligence. */

export type IntelligenceQuality = 'fast' | 'balanced' | 'max'

export type TaskKind =
  | 'general'
  | 'codegen'
  | 'debug'
  | 'vision'
  | 'math'
  | 'research'
  | 'mixed'

export interface HardwareProfile {
  totalRamGb?: number
  usableRamGb?: number
  platform?: string
  architecture?: string
}

export interface ModelCandidate {
  provider: string
  model: string
  roles?: readonly string[]
  capabilities?: readonly string[]
  estimatedRamGb?: number
  contextWindow?: number
}

export interface IntelligenceRequest {
  prompt: string
  hasImage?: boolean
  quality?: IntelligenceQuality
  currentModel?: { provider: string; model: string }
  hardware?: HardwareProfile
  models?: readonly ModelCandidate[]
}

export interface ModelAssignment {
  provider: string
  model: string
  role: string
  reason?: string
}

export interface ExecutionPlan {
  schemaVersion: 1
  provider: string
  task: {
    kind: TaskKind
    modalities: readonly ('text' | 'image')[]
    requiredCapabilities: readonly string[]
  }
  quality: IntelligenceQuality
  primary: ModelAssignment
  workers: readonly ModelAssignment[]
  constraints: {
    usableRamGb?: number
    maxParallel?: number
  }
  confidence: number
}

export interface IntelligenceProvider {
  readonly id: string
  analyze(request: IntelligenceRequest): Promise<ExecutionPlan>
  isAvailable?(): Promise<boolean>
}

export interface IntelligenceRuntimeConfig {
  mode?: 'auto' | 'off' | 'required'
  intentUrl?: string
  probeTimeoutMs?: number
  requestTimeoutMs?: number
}
