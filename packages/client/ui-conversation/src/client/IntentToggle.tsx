import { useSyncExternalStore } from 'react'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { InputZone } from './contract/slots.ts'
import type { IntentSettingsFace } from '../intent-settings.ts'
import css from './IntentToggle.module.css'

type IntentToggleProps = PropsRuntime<'conversation.input.right'> & InputZone & InjectFace<IntentSettingsFace>

function useSetting<T>(store: { getSnapshot(): T; subscribe(listener: () => void): () => void }): T {
  return useSyncExternalStore(store.subscribe.bind(store), store.getSnapshot.bind(store), store.getSnapshot.bind(store))
}

export function IntentToggle({ path, enabled, setEnabled }: IntentToggleProps) {
  const intentPath = useSetting(path)
  const isEnabled = useSetting(enabled)
  if (intentPath.trim() === '') return null

  return (
    <button
      type="button"
      className={css.button}
      aria-label={`NexLM Intent ${isEnabled ? 'on' : 'off'}`}
      aria-pressed={isEnabled}
      title="Toggle NexLM Intent"
      onMouseDown={event => { event.preventDefault() }}
      onClick={() => setEnabled(!isEnabled)}
    >
      <span className={css.dot} data-enabled={isEnabled || undefined} />
      <span>Intent</span>
    </button>
  )
}
