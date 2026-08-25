import { useEffect, useState } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { IconChevronDownOutline14, Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import type { IntentQuality, IntentSettingsFace } from '../../intent-settings.ts'
import type { ConversationKey } from '../locales.ts'
import css from './IntentSettingsRow.module.css'

export type IntentSettingsRowProps =
  PropsRuntime<'settings.general.item'>
  & PropsLocale<'conversation'>
  & InjectFace<IntentSettingsFace>

const QUALITY_LABELS: Record<IntentQuality, ConversationKey> = {
  fast: 'settings.intent.quality.fast',
  balanced: 'settings.intent.quality.balanced',
  max: 'settings.intent.quality.max',
}

export function IntentSettingsRow({
  enabled, path, manualModel, defaultQuality,
  setEnabled, setPath, setManualModel, setDefaultQuality,
  t,
}: IntentSettingsRowProps) {
  const [pathDraft, setPathDraft] = useState(path.getSnapshot())
  const [modelDraft, setModelDraft] = useState(manualModel.getSnapshot())
  const [qualityOpen, setQualityOpen] = useState(false)

  useEffect(() => enabled.getSnapshot(), [enabled])
  useEffect(() => path.getSnapshot(), [path])
  useEffect(() => manualModel.getSnapshot(), [manualModel])
  useEffect(() => defaultQuality.getSnapshot(), [defaultQuality])

  const quality = defaultQuality.getSnapshot()
  const recognized = pathDraft.trim() !== ''

  const savePath = (): void => setPath(pathDraft)
  const saveModel = (): void => setManualModel(modelDraft)

  return (
    <div className={css.row}>
      <div className={css.header}>
        <div>
          <div className={css.title}>{t('settings.intent.title')}</div>
          <div className={css.desc}>{t('settings.intent.description')}</div>
        </div>
        <button
          type="button"
          className={css.toggle}
          aria-pressed={enabled.getSnapshot()}
          disabled={!recognized}
          onClick={() => setEnabled(!enabled.getSnapshot())}
        >
          {enabled.getSnapshot() ? t('settings.intent.on') : t('settings.intent.off')}
        </button>
      </div>

      <label className={css.field}>
        <span>{t('settings.intent.path')}</span>
        <input
          value={pathDraft}
          onChange={event => setPathDraft(event.target.value)}
          onBlur={savePath}
          placeholder={t('settings.intent.pathPlaceholder')}
        />
      </label>

      <label className={css.field}>
        <span>{t('settings.intent.model')}</span>
        <input
          value={modelDraft}
          onChange={event => setModelDraft(event.target.value)}
          onBlur={saveModel}
          placeholder={t('settings.intent.modelPlaceholder')}
        />
      </label>

      <div className={css.inline}>
        <span>{t('settings.intent.quality')}</span>
        <Menu
          open={qualityOpen}
          onClose={() => setQualityOpen(false)}
          items={(Object.keys(QUALITY_LABELS) as IntentQuality[]).map(value => ({
            id: value,
            label: t(QUALITY_LABELS[value]),
          }))}
          selectedId={quality}
          onSelect={id => {
            setQualityOpen(false)
            setDefaultQuality(id as IntentQuality)
          }}
          align="end"
          portal
          anchor={(
            <button
              type="button"
              className={css.selector}
              aria-haspopup="menu"
              aria-expanded={qualityOpen}
              onClick={() => setQualityOpen(value => !value)}
            >
              {t(QUALITY_LABELS[quality])}
              <IconChevronDownOutline14 className={css.chevron} />
            </button>
          )}
        />
      </div>
    </div>
  )
}
