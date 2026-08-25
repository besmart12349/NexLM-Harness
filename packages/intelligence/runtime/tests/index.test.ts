import { describe, expect, it } from 'vitest'
import { BuiltInIntelligenceProvider, createIntelligenceRuntime, NexLMIntentProvider } from '../src/index.js'

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
})
