import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { InputActions, InputState } from '@deepseek-ai/dsh-client-ui-conversation'
import { useState } from 'react'
import { Menu } from '@deepseek-ai/dsh-client-ui-primitives'

export interface IntentControlState {
  enabled: boolean
  quality: 'fast' | 'balanced' | 'max'
  routingMode: 'automatic' | 'manual'
  manualModel: string
}

export interface IntentControlInjected {
  state: IntentControlState
  setEnabled: (enabled: boolean) => void
  setQuality: (quality: IntentControlState['quality']) => void
  setRoutingMode: (mode: IntentControlState['routingMode']) => void
  inputActions: InputActions
  useInput: (selector: (state: InputState) => InputState['draft']) => string
}

type Props = PropsRuntime<'conversation.input.right'> & IntentControlInjected

export function IntentToggle({ state, setEnabled }: Props) {
  return (
    <button
      type="button"
      aria-pressed={state.enabled}
      title={state.enabled ? 'NexLM Intent: on' : 'NexLM Intent: off'}
      onClick={() => setEnabled(!state.enabled)}
    >
      Intent {state.enabled ? 'On' : 'Off'}
    </button>
  )
}

export function QuickCommands({ state, inputActions, useInput, setQuality }: Props) {
  const [open, setOpen] = useState(false)
  const draft = useInput(value => value)
  const insert = (text: string): void => {
    const next = draft.trim() === '' ? `${text} ` : `${text} ${draft}`
    inputActions.setDraft(next)
  }
  const quality = (value: IntentControlState['quality']): void => {
    setQuality(value)
    insert(`/quality ${value}`)
  }
  return (
    <Menu
      open={open}
      onClose={() => setOpen(false)}
      items={[
        { id: 'quality-fast', label: 'Quality: Fast' },
        { id: 'quality-balanced', label: 'Quality: Balanced' },
        { id: 'quality-max', label: 'Quality: Max' },
        { id: 'model', label: 'Model' },
        { id: 'intent', label: state.enabled ? 'Intent: Off' : 'Intent: On' },
      ]}
      onSelect={id => {
        setOpen(false)
        if (id === 'quality-fast') quality('fast')
        else if (id === 'quality-balanced') quality('balanced')
        else if (id === 'quality-max') quality('max')
        else if (id === 'model') insert('/model ')
      }}
      anchor={<button type="button" onClick={() => setOpen(value => !value)}>Quick</button>}
    />
  )
}
