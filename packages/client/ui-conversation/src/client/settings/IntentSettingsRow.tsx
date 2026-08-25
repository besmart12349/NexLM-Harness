import { useEffect, useState, useSyncExternalStore } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { IconChevronDownOutline14, Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import type { IntentQuality, IntentSettingsFace } from '../../intent-settings.ts'
import css from './IntentSettingsRow.module.css'

export type IntentSettingsRowProps = PropsRuntime<'settings.general.item'> & PropsLocale<'conversation'> & InjectFace<IntentSettingsFace>

const QUALITY_LABELS: Record<IntentQuality, string> = { fast: 'Fast', balanced: 'Balanced', max: 'Maximum' }

function useSetting<T>(store: { getSnapshot(): T; subscribe(listener: () => void): () => void }): T {
  return useSyncExternalStore(store.subscribe.bind(store), store.getSnapshot.bind(store), store.getSnapshot.bind(store))
}

export function IntentSettingsRow({
  enabled, path, manualModel, defaultQuality,
  setEnabled, setPath, setManualModel, setDefaultQuality,
}: IntentSettingsRowProps) {
  const isEnabled = useSetting(enabled)
  const pathValue = useSetting(path)
  const modelValue = useSetting(manualModel)
  const quality = useSetting(defaultQuality)
  const [pathDraft, setPathDraft] = useState(pathValue)
  const [modelDraft, setModelDraft] = useState(modelValue)
  const [qualityOpen, setQualityOpen] = useState(false)
  const recognized = pathValue.trim() !== ''

  useEffect(() => setPathDraft(pathValue), [pathValue])
  useEffect(() => setModelDraft(modelValue), [modelValue])

  const routing = !recognized
    ? 'Not configured'
    : isEnabled
      ? 'Intent enabled'
      : 'Intent disabled'

  return (
    <div className={css.row}>
      <div className={css.header}>
        <div>
          <div className={css.title}>NexLM Intent</div>
          <div className={css.desc}>Optional local planner for hardware-aware model routing.</div>
        </div>
        <button type="button" className={css.toggle} aria-pressed={isEnabled} disabled={!recognized} onClick={() => setEnabled(!isEnabled)}>
          {isEnabled ? 'On' : 'Off'}
        </button>
      </div>

      <div className={css.status}>
        <span className={css.statusDot} data-active={recognized && isEnabled || undefined} />
        <span>{routing}</span>
        {recognized && <span className={css.statusMeta}>{quality} quality</span>}
      </div>

      <label className={css.field}>
        <span>Intent folder path</span>
        <input value={pathDraft} onChange={event => setPathDraft(event.target.value)} onBlur={() => setPath(pathDraft)} placeholder="/path/to/NexLM-Intent" />
      </label>

      <label className={css.field}>
        <span>Manual model</span>
        <input value={modelDraft} onChange={event => setModelDraft(event.target.value)} onBlur={() => setManualModel(modelDraft)} placeholder="provider:model (optional)" />
      </label>

      <div className={css.inline}>
        <span>Default quality</span>
        <Menu
          open={qualityOpen}
          onClose={() => setQualityOpen(false)}
          items={(Object.keys(QUALITY_LABELS) as IntentQuality[]).map(value => ({ id: value, label: QUALITY_LABELS[value] }))}
          selectedId={quality}
          onSelect={id => { setQualityOpen(false); setDefaultQuality(id as IntentQuality) }}
          align="end"
          portal
          anchor={(
            <button type="button" className={css.selector} aria-haspopup="menu" aria-expanded={qualityOpen} onClick={() => setQualityOpen(value => !value)}>
              {QUALITY_LABELS[quality]}
              <IconChevronDownOutline14 className={css.chevron} />
            </button>
          )}
        />
      </div>

      <div className={css.summary}>
        <div><span>Routing</span><strong>{isEnabled && recognized ? 'Automatic' : 'Manual / default'}</strong></div>
        <div><span>Model</span><strong>{modelValue || 'Automatic'}</strong></div>
        <div><span>Quality</span><strong>{QUALITY_LABELS[quality]}</strong></div>
      </div>

      {!recognized && <div className={css.desc}>Set the Intent folder path to enable Intent controls.</div>}
      {modelValue !== modelDraft && <div className={css.desc}>Model changes apply when the field loses focus.</div>}
    </div>
  )
}
