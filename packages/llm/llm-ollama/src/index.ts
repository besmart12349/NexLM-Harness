/**
 * Register an {@link OllamaAdapter} for the `ollama` provider route on
 * `ctx.llm`, with connection facts resolved per request instead of frozen at
 * load: the plugin layers its `cordis.yml` entry config under the optional
 * `llm-ollama` user-settings section (`ctx.settings`) and resolves an
 * optional bearer token through the credential seam (`ctx.credentials`) only
 * when `apiKeyEnv` is configured, so a changed base URL, catalog, or
 * keep-alive policy reaches the very next request without restarting
 * anything. Unlike `llm-deepseek`, a missing credential is not an error --
 * local Ollama installs have none -- so this route never throws
 * `MISSING_CREDENTIAL` unless the user explicitly configured `apiKeyEnv`
 * for a remote/proxied deployment and that reference cannot be resolved.
 * @module @deepseek-ai/dsh-llm-ollama
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { assertUsableApiKey, LlmError, resolveRetryPolicy, RetryPolicySchema } from '@deepseek-ai/dsh-llm'
import type { RetryPolicyConfig } from '@deepseek-ai/dsh-llm'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { launchEnvironmentOf, type LaunchEnvironmentSnapshot } from '@deepseek-ai/dsh-launch-environment'
import { deepEqualJson, installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import { MAX_TIMER_DELAY_MS } from '@deepseek-ai/dsh-timeout'
import { getOrCreateAnonymousUserId, type AnonymousUserId } from '@deepseek-ai/dsh-anonymous-user-id'
import {
  DEFAULT_CONTEXT_WINDOW,
  DEFAULT_MAX_TOKENS,
  DEFAULT_STREAM_IDLE_TIMEOUT_MS,
  OllamaAdapter,
} from './adapter.ts'
import type { OllamaCatalogModel, OllamaConnectionOptions } from './adapter.ts'

export {
  DEFAULT_CONTEXT_WINDOW,
  DEFAULT_MAX_TOKENS,
  DEFAULT_STREAM_IDLE_TIMEOUT_MS,
  OllamaAdapter,
} from './adapter.ts'
export type { OllamaAdapterOptions, OllamaCatalogModel, OllamaConnectionOptions } from './adapter.ts'
export type { RequestDefaults } from './serialize.ts'
export type * from './types.ts'

export const name = 'llm-ollama'
export const inject = ['llm']

const NS = settingsNamespace('llm-ollama')
/** The single provider route this plugin owns. */
const PROVIDER = 'ollama'

const DEFAULT_MODELS: OllamaCatalogModel[] = [
  { id: 'gpt-oss:20b', name: 'GPT-OSS 20B', contextWindow: DEFAULT_CONTEXT_WINDOW, supportsTools: true },
  { id: 'gemma4:e4b', name: 'Gemma4 E4B', contextWindow: DEFAULT_CONTEXT_WINDOW, inputModalities: ['text', 'image'], supportsTools: true },
  { id: 'qwen3.5:4b', name: 'Qwen3.5 4B', contextWindow: DEFAULT_CONTEXT_WINDOW, supportsTools: true },
]

/**
 * Plugin config, validated by the same-named schemastery schema and doubling
 * as the `llm-ollama` settings-section shape. Every field is optional: an
 * unset `apiKeyEnv` means no credential is ever required for this route,
 * unset `baseURL` falls back to `$OLLAMA_BASE_URL` from a trusted
 * environment layer and then localhost, and unset `keepAlive` falls back to
 * Ollama's own server-side default.
 */
export interface Config {
  /** Credential reference resolved per request; unset by default -- local Ollama needs no key. */
  apiKeyEnv?: string
  /** Endpoint base; falls back to $OLLAMA_BASE_URL from a trusted environment layer, then localhost. */
  baseURL?: string
  /** Deployment thinking policy for models that support it (e.g. `gpt-oss`); `disabled` forces `off` per request. */
  thinking?: 'enabled' | 'disabled'
  /** Default per-request output cap (`options.num_predict`); a model's own cap and explicit request values win. */
  maxTokens?: number
  /** Positive context capacity used when the selected model has no exact value. */
  defaultContextWindow?: number
  /** Advisory models shown by discovery consumers; defaults to the three-agent GPT-OSS/Gemma4/Qwen3.5 set. */
  models?: OllamaCatalogModel[]
  /** Maximum provider idle time while one stream read is outstanding (default five minutes). */
  streamIdleTimeoutMs?: number
  /** Forwarded on every request; how long Ollama keeps a model resident after the call returns (e.g. `-1`, `'2m'`). */
  keepAlive?: string | number
  /** Provider-owned model-request retry policy; omission uses normal defaults. */
  retryPolicy?: RetryPolicyConfig
}

const catalogModel: z<OllamaCatalogModel> = z.object({
  id: z.string().required(),
  name: z.string(),
  description: z.string(),
  contextWindow: z.number().step(1).min(1),
  maxTokens: z.number().step(1).min(1),
  inputModalities: z.array(z.union(['text', 'image'])),
  supportsTools: z.boolean(),
})

export const Config: z<Config> = z.object({
  apiKeyEnv: z.string().role('credential-ref'),
  baseURL: z.string(),
  thinking: z.union(['enabled', 'disabled']),
  maxTokens: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(DEFAULT_MAX_TOKENS),
  defaultContextWindow: z.number().step(1).min(1).default(DEFAULT_CONTEXT_WINDOW),
  models: z.array(catalogModel).default(DEFAULT_MODELS),
  streamIdleTimeoutMs: z.number().min(Number.MIN_VALUE).max(MAX_TIMER_DELAY_MS).default(DEFAULT_STREAM_IDLE_TIMEOUT_MS),
  keepAlive: z.union([z.string(), z.number()]).default('5m'),
  retryPolicy: RetryPolicySchema,
})

/** Default local Ollama endpoint; overridden by `$OLLAMA_BASE_URL` or explicit config for remote/proxied instances. */
export const LOCAL_BASE_URL = 'http://127.0.0.1:11434'

/** Environment variable naming this provider's endpoint, honored only from trusted layers. */
const BASE_URL_ENV = 'OLLAMA_BASE_URL'

export type ResolvedOllamaOptions = OllamaConnectionOptions

/** Resolve, validate, and detach the advisory model catalog. */
function resolveModels(models: readonly OllamaCatalogModel[] | undefined): OllamaCatalogModel[] {
  const seen = new Set<string>()
  return (models ?? DEFAULT_MODELS).map((model) => {
    if (model.id.length === 0) throw new Error('llm-ollama: catalog model ids must be non-empty')
    if (model.name !== undefined && model.name.length === 0) {
      throw new Error(`llm-ollama: catalog model "${model.id}" has an empty name`)
    }
    if (model.contextWindow !== undefined
      && (!Number.isInteger(model.contextWindow) || model.contextWindow <= 0)) {
      throw new Error(`llm-ollama: catalog model "${model.id}" contextWindow must be a positive integer`)
    }
    if (model.maxTokens !== undefined
      && (!Number.isInteger(model.maxTokens) || model.maxTokens <= 0)) {
      throw new Error(`llm-ollama: catalog model "${model.id}" maxTokens must be a positive integer`)
    }
    if (seen.has(model.id)) throw new Error(`llm-ollama: duplicate catalog model "${model.id}"`)
    seen.add(model.id)
    return {
      id: model.id,
      ...model.name === undefined ? {} : { name: model.name },
      ...model.description === undefined ? {} : { description: model.description },
      ...model.contextWindow === undefined ? {} : { contextWindow: model.contextWindow },
      ...model.maxTokens === undefined ? {} : { maxTokens: model.maxTokens },
      ...model.inputModalities === undefined ? {} : { inputModalities: model.inputModalities },
      ...model.supportsTools === undefined ? {} : { supportsTools: model.supportsTools },
    }
  })
}

/**
 * The one explicit resolve step from raw config to validated connection
 * facts, re-judged for the composition entry at load and for each settings
 * snapshot at its first use -- same contract as `llm-deepseek`.
 */
export function resolveAdapterOptions(config: Config, environment?: LaunchEnvironmentSnapshot): ResolvedOllamaOptions {
  if (config.defaultContextWindow !== undefined
    && (!Number.isInteger(config.defaultContextWindow) || config.defaultContextWindow <= 0)) {
    throw new Error('llm-ollama: defaultContextWindow must be a positive integer')
  }
  if (config.maxTokens !== undefined
    && (!Number.isSafeInteger(config.maxTokens) || config.maxTokens <= 0)) {
    throw new Error('llm-ollama: maxTokens must be a positive safe integer')
  }
  if (typeof config.keepAlive === 'number' && !Number.isFinite(config.keepAlive)) {
    throw new Error('llm-ollama: keepAlive must be a finite number of seconds, or a duration string, or -1')
  }
  const streamIdleTimeoutMs = config.streamIdleTimeoutMs ?? DEFAULT_STREAM_IDLE_TIMEOUT_MS
  if (!Number.isFinite(streamIdleTimeoutMs)
    || streamIdleTimeoutMs <= 0
    || streamIdleTimeoutMs > MAX_TIMER_DELAY_MS) {
    throw new Error(
      `llm-ollama: streamIdleTimeoutMs must be a positive finite number no greater than ${MAX_TIMER_DELAY_MS}`,
    )
  }
  return {
    ...config.apiKeyEnv === undefined ? {} : { apiKeyEnv: credentialRef(config.apiKeyEnv) },
    baseURL: config.baseURL
      ?? environment?.get(BASE_URL_ENV)?.value
      ?? LOCAL_BASE_URL,
    defaults: { thinking: config.thinking ?? 'enabled' },
    maxTokens: config.maxTokens ?? DEFAULT_MAX_TOKENS,
    defaultContextWindow: config.defaultContextWindow ?? DEFAULT_CONTEXT_WINDOW,
    models: resolveModels(config.models),
    streamIdleTimeoutMs,
    keepAlive: config.keepAlive ?? '5m',
    retryPolicy: resolveRetryPolicy(config.retryPolicy, 'llm-ollama: retryPolicy'),
  }
}

export function apply(ctx: Context, config: Config): void {
  let current: () => Config = () => config
  let lastRaw: Config | undefined
  let lastGood: ResolvedOllamaOptions | undefined
  const options = (): ResolvedOllamaOptions => {
    const raw = current()
    if (raw === lastRaw && lastGood !== undefined) return lastGood
    try {
      const next = resolveAdapterOptions(raw, launchEnvironmentOf(ctx))
      lastRaw = raw
      lastGood = next
      return next
    } catch (error) {
      if (lastGood === undefined) throw error
      lastRaw = raw
      ctx.logger.error('llm-ollama: keeping the last good configuration after an invalid settings section')
      ctx.logger.error(error)
      return lastGood
    }
  }
  options()

  const resolveApiKey = async (connection: ResolvedOllamaOptions): Promise<string | undefined> => {
    const ref = connection.apiKeyEnv
    if (ref === undefined) return undefined
    const credentials = ctx.get('credentials')
    if (credentials !== undefined) {
      const hit = await credentials.resolve(ref)
      if (hit !== undefined) return assertUsableApiKey(hit.value, 'llm-ollama', ref)
    } else {
      const ambient = launchEnvironmentOf(ctx).get(ref)
      if (ambient !== undefined && ambient.value.length > 0) {
        return assertUsableApiKey(ambient.value, 'llm-ollama', ref)
      }
    }
    throw new LlmError(
      `llm-ollama: apiKeyEnv "${ref}" was configured for provider route "${PROVIDER}" but could not be`
      + ` resolved; store it through the credentials service or export it in the launching environment`,
      'MISSING_CREDENTIAL',
    )
  }

  let userId: AnonymousUserId | undefined
  const resolveUserId = (): AnonymousUserId => userId ??= getOrCreateAnonymousUserId()
  const adapter = new OllamaAdapter({ options, resolveApiKey, resolveUserId })
  ctx.llm.registerConfigurableProviders([
    { provider: PROVIDER, displayName: 'Ollama', settingsNs: NS, settingsPath: [] },
  ])
  const registration = ctx.llm.registerAdapter([PROVIDER], adapter)
  let registeredPolicy = options().retryPolicy
  const ensureRegistrationFacts = (): void => {
    const policy = options().retryPolicy
    if (deepEqualJson(policy, registeredPolicy)) return
    registration.replace([PROVIDER])
    registeredPolicy = policy
  }

  installSettingsSection(ctx, NS, Config, config, {
    setSource: (source) => {
      current = source
    },
    onChange: ensureRegistrationFacts,
  })
}
