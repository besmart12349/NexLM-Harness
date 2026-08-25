import { describe, expect, it } from 'vitest'
import { BuiltInIntelligenceProvider, createIntelligenceRuntime, isExecutionPlan, NexLMIntentProvider } from '../src/index.js'

const request = {
  prompt: 'Build a website from this screenshot',
  hasImage: true,
  quality: 'balanced' as const,
  currentModel: { provider: 'ollama', model: 'qwen3.5:4b' },
  hardware: { totalRamGb: 24, usableRamGb: 19 },
}

describe('BuiltInIntelligenceProvider', () => {
  it('classifies multimodal coding work without requiring Intent', async () => {
    const plan = await new BuiltInIntelligenceProvider().analyze(request)

    expect(plan.provider).toBe('builtin')
    expect(plan.task.kind).toBe('mixed')
    expect(plan.task.modalities).toEqual(['text', 'image'])
    expect(plan.primary.model).toBe('qwen3.5:4b')
    expect(plan.workers).toHaveLength(0)
  })
})

describe('NexLMIntentProvider', () => {
  it('uses the documented local HTTP contract', async () => {
    const provider = new NexLMIntentProvider({
      baseUrl: 'http://127.0.0.1:8420',
      fetchImpl: async (url, init) => {
        expect(url).toBe('http://127.0.0.1:8420/v1/resolve')
        expect(init?.method).toBe('POST')
        return new Response(JSON.stringify({
          schemaVersion: 1,
          provider: 'nexlm-intent',
          task: { kind: 'codegen', modalities: ['text'], requiredCapabilities: ['codegen'] },
          quality: 'balanced',
          primary: { provider: 'ollama', model: 'gpt-oss:20b', role: 'codegen' },
          workers: [],
          constraints: { maxParallel: 1 },
          confidence: 0.9,
        }), { status: 200, headers: { 'content-type': 'application/json' } })
      },
    })

    await expect(provider.analyze({ prompt: 'Build it' })).resolves.toMatchObject({
      provider: 'nexlm-intent',
      primary: { model: 'gpt-oss:20b' },
    })
  })

  it('rejects malformed execution plans', async () => {
    const provider = new NexLMIntentProvider({
      fetchImpl: async () => new Response(JSON.stringify({ schemaVersion: 1, provider: 'nexlm-intent' }), { status: 200 }),
    })

    await expect(provider.analyze({ prompt: 'Build it' })).rejects.toThrow('invalid execution plan')
  })

  it('caches successful availability probes', async () => {
    let probes = 0
    const provider = new NexLMIntentProvider({
      fetchImpl: async (url) => {
        if (url.endsWith('/v1/hardware')) probes += 1
        return new Response('ok', { status: 200 })
      },
    })

    await expect(provider.isAvailable()).resolves.toBe(true)
    await expect(provider.isAvailable()).resolves.toBe(true)
    expect(probes).toBe(1)
  })

  it('times out a hung Intent request', async () => {
    const provider = new NexLMIntentProvider({
      requestTimeoutMs: 10,
      fetchImpl: async (_url, init) => await new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
      }),
    })

    await expect(provider.analyze({ prompt: 'Build it' })).rejects.toThrow('aborted')
  })
})

describe('ExecutionPlan validation', () => {
  it('accepts the versioned contract', () => {
    expect(isExecutionPlan({
      schemaVersion: 1,
      provider: 'nexlm-intent',
      task: { kind: 'codegen', modalities: ['text'], requiredCapabilities: ['codegen'] },
      quality: 'balanced',
      primary: { provider: 'ollama', model: 'gpt-oss:20b', role: 'codegen' },
      workers: [],
      constraints: { maxParallel: 1 },
      confidence: 0.9,
    }, 'nexlm-intent')).toBe(true)
  })

  it('rejects invalid confidence and parallelism', () => {
    const plan = {
      schemaVersion: 1,
      provider: 'nexlm-intent',
      task: { kind: 'codegen', modalities: ['text'], requiredCapabilities: ['codegen'] },
      quality: 'balanced',
      primary: { provider: 'ollama', model: 'gpt-oss:20b', role: 'codegen' },
      workers: [],
      constraints: { maxParallel: 0 },
      confidence: 2,
    }

    expect(isExecutionPlan(plan, 'nexlm-intent')).toBe(false)
  })
})

describe('createIntelligenceRuntime', () => {
  it('falls back to built-in intelligence in auto mode', async () => {
    const runtime = createIntelligenceRuntime({
      probeTimeoutMs: 1,
      intentUrl: 'http://127.0.0.1:1',
    })

    await expect(runtime.analyze({ prompt: 'fix this bug' })).resolves.toMatchObject({
      provider: 'builtin',
      task: { kind: 'debug' },
    })
  })

  it('does not probe Intent when disabled', async () => {
    const runtime = createIntelligenceRuntime({ mode: 'off' })
    expect((await runtime.selectProvider()).id).toBe('builtin')
  })

  it('fails instead of falling back when Intent is required', async () => {
    const runtime = createIntelligenceRuntime({
      mode: 'required',
      probeTimeoutMs: 1,
      intentUrl: 'http://127.0.0.1:1',
    })

    await expect(runtime.analyze({ prompt: 'do the task' })).rejects.toThrow('required')
  })
})
