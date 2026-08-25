import { useState } from 'react'
import type { SettingsScope, SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import { Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import {
  DEFAULT_QUALITY_FIELD,
  INTENT_PATH_FIELD,
  MANUAL_MODEL_FIELD,
  QUALITY_MODES,
  ROUTING_MODE_FIELD,
  ROUTING_MODES,
  type NexLMIntentSettings,
} from '../../nexlm-intent-settings.ts'

export interface NexLMIntentSettingsInjected {
  settings: SettingsScope<NexLMIntentSettings>
  quality: SnapshotStore<NexLMIntentSettings['defaultQuality']>
  routingMode: SnapshotStore<NexLMIntentSettings['routingMode']>
  setQuality: (value: NexLMIntentSettings['defaultQuality']) => void
  setRoutingMode: (value: NexLMIntentSettings['routingMode']) => void
}

type Props = NexLMIntentSettingsInjected

export function NexLMIntentSettingsRow({ settings, quality, routingMode, setQuality, setRoutingMode }: Props) {
  const [open, setOpen] = useState(false)
  const [path, setPath] = useState(() => settings.getSnapshot().value?.intentPath ?? '')
  const [manualModel, setManualModel] = useState(() => settings.getSnapshot().value?.manualModel ?? '')
  const currentQuality = quality.getSnapshot()
  const currentRouting = routingMode.getSnapshot()

  const savePath = (): void => { void settings.set(INTENT_PATH_FIELD, path.trim()) }
  const saveModel = (): void => { void settings.set(MANUAL_MODEL_FIELD, manualModel.trim()) }

  return (
    <div style={{ display: 'grid', gap: 10, padding: '10px 0' }}>
      <div style={{ fontWeight: 600 }}>NexLM Intent</div>
      <div style={{ opacity: 0.7, fontSize: 12 }}>Optional local intelligence and model routing.</div>

      <label style={{ display: 'grid', gap: 4 }}>
        <span>Intent folder path</span>
        <input
          value={path}
          onChange={event => setPath(event.target.value)}
          onBlur={savePath}
          placeholder="/path/to/NexLM-Intent"
          spellCheck={false}
        />
      </label>

      <label style={{ display: 'grid', gap: 4 }}>
        <span>Manual model selection</span>
        <input
          value={manualModel}
          onChange={event => setManualModel(event.target.value)}
          onBlur={saveModel}
          placeholder="Provider/model (blank = automatic)"
          spellCheck={false}
        />
      </label>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span>Routing</span>
        <Menu
          open={open}
          onClose={() => setOpen(false)}
          items={ROUTING_MODES.map(id => ({ id, label: id === 'automatic' ? 'Automatic' : 'Manual' }))}
          selectedId={currentRouting}
          onSelect={id => { setOpen(false); setRoutingMode(id as NexLMIntentSettings['routingMode']) }}
          align="end"
          portal
          anchor={<button type="button" onClick={() => setOpen(value => !value)}>{currentRouting}</button>}
        />
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span>Default quality</span>
        <select
          value={currentQuality}
          onChange={event => setQuality(event.target.value as NexLMIntentSettings['defaultQuality'])}
          aria-label="Default quality"
        >
          {QUALITY_MODES.map(mode => <option key={mode} value={mode}>{mode}</option>)}
        </select>
      </div>
    </div>
  )
}
