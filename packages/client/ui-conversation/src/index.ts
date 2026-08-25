/** Host registration for browser conversation preferences. */

import type { Context } from '@deepseek-ai/cordis'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import { CONVERSATION_SETTINGS_NAMESPACE, ConversationSettingsSchema } from './submission-settings.ts'
import { NEXLM_INTENT_SETTINGS_NAMESPACE, NexLMIntentSettingsSchema } from './nexlm-intent-settings.ts'

export {
  BUSY_ENTER_BEHAVIORS, BUSY_ENTER_FIELD, CONVERSATION_SETTINGS_NAMESPACE,
  DEFAULT_BUSY_ENTER_BEHAVIOR, type BusyEnterBehavior, type ConversationSettings,
} from './submission-settings.ts'
export {
  DEFAULT_QUALITY_FIELD, INTENT_PATH_FIELD, MANUAL_MODEL_FIELD, NEXLM_INTENT_SETTINGS_NAMESPACE,
  QUALITY_MODES, ROUTING_MODE_FIELD, ROUTING_MODES, type NexLMIntentSettings, type QualityMode,
  type RoutingMode,
} from './nexlm-intent-settings.ts'

/** Register durable conversation and optional NexLM Intent preference sections. */
export function apply(ctx: Context): void {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(
      settingsNamespace(CONVERSATION_SETTINGS_NAMESPACE),
      ConversationSettingsSchema,
    )
    settingsCtx.settings.register(
      settingsNamespace(NEXLM_INTENT_SETTINGS_NAMESPACE),
      NexLMIntentSettingsSchema,
    )
  })
}
