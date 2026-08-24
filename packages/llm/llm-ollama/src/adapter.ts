/**
 * `OllamaAdapter`: fetch + NDJSON streaming against a local (or remote)
 * Ollama server's `/api/chat` endpoint, emitting harness StreamChunks. The
 * adapter is transport-only: connection facts arrive through a thunk
 * resolved once per operation, mirroring `DeepSeekAdapter` so Ollama slots
 * into the same registration/credential/retry machinery.
 *
 * @module dsh-llm-ollama/adapter
 */

import { attributionHeaders, CONTEXT_WINDOW_EXCEEDED_CODE, isContextWindowExceededError, LlmAdapter, LlmError, ProviderRequestId, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type {
  GenerateOptions,
  LlmModelInfo,
  LlmProviderInfo,
  LlmResolvedModelInfo,
  ResolvedRetryPolicy,
  StreamChunk,
} from '@deepseek-ai/dsh-llm'
import type { CredentialRef } from '@deepseek-ai/dsh-credentials'
import { idleWatchdog, timeoutOf } from '@deepseek-ai/dsh-timeout'
import type { AnonymousUserId } from '@deepseek-ai/dsh-anonymous-user-id'
import { serializeRequest } from './serialize.ts'
import type { RequestDefaults } from './serialize.ts'
import { parseNdjson } from './ndjson.ts'
import { translate } from './translate.ts'
import type { WireError } from './types.ts'

/** One model entry advertised by the Ollama adapter, sourced from `agents.yaml` / `/api/tags`. */
export interface OllamaCatalogModel {
  /** Wire model tag accepted by the configured Ollama instance (e.g. `gpt-oss:20b`). */
  id: string
  name?: string
  description?: string
  contextWindow?: number
  maxTokens?: number
  /** Declared input modalities; vision-capable local models (Gemma, Qwen-VL) add `'image'`. */
  inputModalities?: readonly ('text' | 'image')[]
  /** Whether this model supports Ollama-native tool calling. */
  supportsTools?: boolean
}

/** Validated connection facts for one operation, re-read per request (same contract as DeepSeekConnectionOptions). */
export interface OllamaConnectionOptions {
  /** Ollama base URL; `/api/chat` is appended. Typically `http://127.0.0.1:11434`. */
  baseURL: string
  /** Optional credential reference for remote/protected Ollama deployments behind an auth proxy. */
  apiKeyEnv?: CredentialRef
  /** Request defaults applied to every call. */
  defaults: RequestDefaults
  /** Default per-request output cap (`options.num_predict`); explicit request values win. */
  maxTokens: number
  /** Positive context capacity used when the selected model has no exact value. */
  defaultContextWindow: number
  /** Advisory models exposed to discovery consumers; requests remain unrestricted. */
  models: readonly OllamaCatalogModel[]
  /** Maximum provider idle time while one stream read is outstanding. */
  streamIdleTimeoutMs: number
  /** Provider-owned model-request retry policy, already resolved. */
  retryPolicy: ResolvedRetryPolicy
  /**
   * `keep_alive` forwarded on every request -- governs how long Ollama keeps
   * this model resident after the call returns. Boss-role registrations pass
   * `-1`; subagent registrations pass a short duration (e.g. `'2m'`) so RAM
   * frees quickly, matching the Intent Engine's priority-router design.
   */
  keepAlive: string | number
}

/** Constructor options for {@link OllamaAdapter}. */
export interface OllamaAdapterOptions {
  options: () => OllamaConnectionOptions
  /** Resolves an optional bearer token; local Ollama installs return `undefined`. */
  resolveApiKey: (connection: OllamaConnectionOptions) => Promise<string | undefined>
  resolveUserId: () => AnonymousUserId
}

export const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 300_000
export const DEFAULT_CONTEXT_WINDOW = 128_000
export const DEFAULT_MAX_TOKENS = 8_192
const STREAM_IDLE_TIMEOUT_CODE = 'LLM_STREAM_IDLE_TIMEOUT'
const OFF_REASONING_EFFORT = ReasoningEffortId('off')
const HIGH_REASONING_EFFORT = ReasoningEffortId('high')
/** Ollama has no per-request reasoning-effort dial today; models that support "thinking" (e.g. gpt-oss) expose only on/off. */
const THINKING_CAPABLE_EFFORTS = [
  { id: OFF_REASONING_EFFORT, name: 'Off' },
  { id: HIGH_REASONING_EFFORT, name: 'Think' },
] as const
const OFF_ONLY_REASONING_EFFORTS = [
  { id: OFF_REASONING_EFFORT, name: 'Off' },
] as const

function modelInfo(provider: string, model: OllamaCatalogModel): LlmModelInfo {
  return {
    provider,
    id: model.id,
    name: model.name ?? model.id,
    ...model.description === undefined ? {} : { description: model.description },
    inputModalities: model.inputModalities ?? ['text'],
  }
}

function requestId(headers: Headers): ReturnType<typeof ProviderRequestId> | undefined {
  const value = headers.get('x-request-id')
  return value === null || value.length === 0 ? undefined : ProviderRequestId(value)
}

/**
 * Map an HTTP status / Ollama error body to a stable LlmError code. Ollama's
 * error shape is a flat `{ error: string }`, simpler than DeepSeek's nested
 * `{ error: { code, type, message } }` -- there is no separate quota signal.
 */
export function httpErrorCode(status: number, error?: WireError['error']): string {
  if (status === 401 || status === 403) return 'AUTH'
  if (status === 404) return 'MODEL_NOT_FOUND'
  if (status === 400 && error !== undefined && isContextWindowExceededError(error)) {
    return CONTEXT_WINDOW_EXCEEDED_CODE
  }
  if (status === 400) return 'INVALID_REQUEST'
  if (status === 429) return 'RATE_LIMIT'
  if (status >= 500) return 'SERVER'
  return `HTTP_${status}`
}

/**
 * One `OllamaAdapter` instance serves every model tag it is registered
 * under, exactly like `DeepSeekAdapter` -- the harness model name IS the
 * Ollama model tag (`gpt-oss:20b`, `gemma4:e4b`, `qwen3.5:4b`, ...).
 *
 * Streaming uses newline-delimited JSON (Ollama's native wire format), not
 * SSE, so `parseNdjson` replaces `parseSse`; the abort/idle-watchdog
 * contract is otherwise identical to the DeepSeek adapter.
 */
export class OllamaAdapter extends LlmAdapter {
  constructor(private readonly config: OllamaAdapterOptions) {
    super()
  }

  override providerInfo(provider: string): LlmProviderInfo {
    return { id: provider, name: 'Ollama' }
  }

  override providerRetryPolicy(_provider: string): ResolvedRetryPolicy {
    return this.config.options().retryPolicy
  }

  override listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    return Promise.resolve(this.config.options().models.map(model => modelInfo(provider, model)))
  }

  override resolveModel(
    provider: string,
    model: string,
    _signal?: AbortSignal,
  ): Promise<LlmResolvedModelInfo> {
    const connection = this.config.options()
    const configured = connection.models.find(entry => entry.id === model)
    const contextWindow = configured?.contextWindow ?? connection.defaultContextWindow
    const thinkingCapable = connection.defaults.thinking !== 'disabled'
    return Promise.resolve({
      ...configured === undefined
        ? { provider, id: model, name: model, inputModalities: ['text' as const] }
        : modelInfo(provider, configured),
      context: { contextWindow },
      defaultMaxTokens: configured?.maxTokens ?? connection.maxTokens,
      reasoning: thinkingCapable
        ? { efforts: THINKING_CAPABLE_EFFORTS, defaultEffort: HIGH_REASONING_EFFORT }
        : { efforts: OFF_ONLY_REASONING_EFFORTS, defaultEffort: OFF_REASONING_EFFORT },
    })
  }

  async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const connection = this.config.options()
    const apiKey = await this.config.resolveApiKey(connection)
    const userId = this.config.resolveUserId()
    const consumer = new AbortController()
    const upstream = options.signal === undefined
      ? consumer.signal
      : AbortSignal.any([options.signal, consumer.signal])
    using watchdog = idleWatchdog(upstream, connection.streamIdleTimeoutMs, STREAM_IDLE_TIMEOUT_CODE)
    const iterator = this.request(
      options,
      watchdog.signal,
      connection,
      apiKey,
      userId,
      () => { watchdog.pulse() },
    )[Symbol.asyncIterator]()
    let exhausted = false
    try {
      while (true) {
        const result = await watchdog.next(iterator)
        if (result.done) {
          exhausted = true
          return
        }
        yield result.value
      }
    } catch (error: unknown) {
      if (timeoutOf(watchdog.signal, STREAM_IDLE_TIMEOUT_CODE) !== undefined) {
        throw new LlmError(
          `Ollama stream idle timeout after ${connection.streamIdleTimeoutMs}ms`,
          'TIMEOUT',
          { cause: error },
        )
      }
      if (options.signal?.aborted) {
        throw new LlmError('Ollama request aborted by caller', 'ABORTED', { cause: error })
      }
      if (error instanceof LlmError) throw error
      throw new LlmError(`Ollama API stream from ${connection.baseURL} failed`, 'TRANSPORT', { cause: error })
    } finally {
      consumer.abort('Ollama stream consumer stopped')
      if (!exhausted && iterator.return !== undefined) {
        try {
          await iterator.return()
        } catch (_abortedTransportTeardown) {
          // The consumer controller already owns termination.
        }
      }
    }
  }

  private async * request(
    options: GenerateOptions,
    signal: AbortSignal,
    connection: OllamaConnectionOptions,
    apiKey: string | undefined,
    userId: AnonymousUserId,
    onComment: () => void,
  ): AsyncIterable<StreamChunk> {
    const body = serializeRequest(options, connection.defaults, connection.keepAlive)
    const payload = JSON.stringify(body)
    const headers = {
      'content-type': 'application/json',
      ...attributionHeaders(),
      'x-deepseek-harness-user-id': String(userId),
      ...apiKey === undefined ? {} : { authorization: `Bearer ${apiKey}` },
      ...options.sessionId !== undefined
        ? { 'x-deepseek-harness-session-id': String(options.sessionId) }
        : {},
      ...options.purpose === 'compaction'
        ? { 'x-deepseek-harness-compact': '1' }
        : {},
    }

    let response: Response
    try {
      response = await fetch(`${connection.baseURL}/api/chat`, {
        method: 'POST',
        headers,
        body: payload,
        signal,
      })
    } catch (error: unknown) {
      if (signal.aborted) throw error
      throw new LlmError(
        `Ollama API request to ${connection.baseURL} failed -- is \`ollama serve\` running?`,
        'TRANSPORT',
        { cause: error },
      )
    }

    if (!response.ok) {
      let message = `Ollama API error (HTTP ${response.status})`
      let providerError: WireError['error']
      try {
        const parsed = await response.json() as WireError
        providerError = parsed.error
        if (typeof providerError === 'string' && providerError.length > 0) message = providerError
      } catch {
        // HTTP status still identifies the failure even if the body is not JSON.
      }
      const id = requestId(response.headers)
      throw new LlmError(message, httpErrorCode(response.status, providerError), {
        status: response.status,
        ...id === undefined ? {} : { requestId: id },
      })
    }
    if (!response.body) {
      throw new LlmError('Ollama API returned no response body', 'EMPTY_RESPONSE')
    }

    yield* translate(parseNdjson(response.body, onComment))
  }
}
