/** Durable NexLM Intent preferences shared by the host and browser UI. */
import z from '@deepseek-ai/schemastery'

export const NEXLM_INTENT_SETTINGS_NAMESPACE = 'nexlm-intent'
export const INTENT_PATH_FIELD = 'intentPath'
export const ROUTING_MODE_FIELD = 'routingMode'
export const MANUAL_MODEL_FIELD = 'manualModel'
export const DEFAULT_QUALITY_FIELD = 'defaultQuality'

export const ROUTING_MODES = ['automatic', 'manual'] as const
export type RoutingMode = typeof ROUTING_MODES[number]
export const QUALITY_MODES = ['fast', 'balanced', 'max'] as const
export type QualityMode = typeof QUALITY_MODES[number]

export interface NexLMIntentSettings {
  intentPath: string
  routingMode: RoutingMode
  manualModel: string
  defaultQuality: QualityMode
}

export const NexLMIntentSettingsSchema: z<NexLMIntentSettings> = z.object({
  [INTENT_PATH_FIELD]: z.string().default(''),
  [ROUTING_MODE_FIELD]: z.union([...ROUTING_MODES]).default('automatic'),
  [MANUAL_MODEL_FIELD]: z.string().default(''),
  [DEFAULT_QUALITY_FIELD]: z.union([...QUALITY_MODES]).default('balanced'),
})
