/** User-facing NexLM Intent controls shared by the Settings rows and composer. */
import { createSnapshotStore, type SettingsScope, type SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import z from '@deepseek-ai/schemastery'

export const INTENT_SETTINGS_NAMESPACE = 'nexlm-intent'
export const INTENT_ENABLED_FIELD = 'enabled'
export const INTENT_PATH_FIELD = 'path'
export const INTENT_MODEL_FIELD = 'manualModel'
export const INTENT_QUALITY_FIELD = 'defaultQuality'

export const INTENT_QUALITIES = ['fast', 'balanced', 'max'] as const
export type IntentQuality = typeof INTENT_QUALITIES[number]

export interface IntentSettings {
  enabled: boolean
  path: string
  manualModel: string
  defaultQuality: IntentQuality
}

export const IntentSettingsSchema: z<IntentSettings> = z.object({
  [INTENT_ENABLED_FIELD]: z.boolean().default(true),
  [INTENT_PATH_FIELD]: z.string().default(''),
  [INTENT_MODEL_FIELD]: z.string().default(''),
  [INTENT_QUALITY_FIELD]: z.union([...INTENT_QUALITIES]).default('balanced'),
})

export interface IntentSettingsFace {
  readonly enabled: SnapshotStore<boolean>
  readonly path: SnapshotStore<string>
  readonly manualModel: SnapshotStore<string>
  readonly defaultQuality: SnapshotStore<IntentQuality>
  readonly setEnabled: (value: boolean) => void
  readonly setPath: (value: string) => void
  readonly setManualModel: (value: string) => void
  readonly setDefaultQuality: (value: IntentQuality) => void

  /** Apply the configured directives to a user prompt without changing its visible text. */
  decoratePrompt(prompt: string): string
}

const DEFAULTS: IntentSettings = {
  enabled: true,
  path: '',
  manualModel: '',
  defaultQuality: 'balanced',
}

/** Durable/local Intent settings controller. */
export class IntentSettingsController implements IntentSettingsFace {
  readonly enabled = createSnapshotStore(DEFAULTS.enabled)
  readonly path = createSnapshotStore(DEFAULTS.path)
  readonly manualModel = createSnapshotStore(DEFAULTS.manualModel)
  readonly defaultQuality = createSnapshotStore<IntentQuality>(DEFAULTS.defaultQuality)
  private readonly host: SettingsScope<IntentSettings> | undefined

  constructor(host?: SettingsScope<IntentSettings>) {
    this.host = host
    if (host !== undefined) {
      host.subscribe(() => { this.adopt(host) })
      this.adopt(host)
    }
  }

  setEnabled(value: boolean): void {
    this.enabled.set(value)
    void this.host?.set(INTENT_ENABLED_FIELD, value)
  }

  setPath(value: string): void {
    this.path.set(value.trim())
    void this.host?.set(INTENT_PATH_FIELD, value.trim())
  }

  setManualModel(value: string): void {
    this.manualModel.set(value.trim())
    void this.host?.set(INTENT_MODEL_FIELD, value.trim())
  }

  setDefaultQuality(value: IntentQuality): void {
    this.defaultQuality.set(value)
    void this.host?.set(INTENT_QUALITY_FIELD, value)
  }

  decoratePrompt(prompt: string): string {
    const directives: string[] = []
    directives.push(`/intent ${this.enabled.getSnapshot() ? 'on' : 'off'}`)
    const model = this.manualModel.getSnapshot()
    if (model !== '') directives.push(`/model ${model}`)
    directives.push(`/quality ${this.defaultQuality.getSnapshot()}`)
    return `${directives.join(' ')} ${prompt}`.trim()
  }

  private adopt(host: SettingsScope<IntentSettings>): void {
    const section = host.getSnapshot().value
    if (section === undefined) return
    if (this.enabled.getSnapshot() !== section.enabled) this.enabled.set(section.enabled)
    if (this.path.getSnapshot() !== section.path) this.path.set(section.path)
    if (this.manualModel.getSnapshot() !== section.manualModel) this.manualModel.set(section.manualModel)
    if (this.defaultQuality.getSnapshot() !== section.defaultQuality) this.defaultQuality.set(section.defaultQuality)
  }
}
