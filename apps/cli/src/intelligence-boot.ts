import type { RunProfileOptions } from './profile-boot.ts'
import { runProfile } from './profile-boot.ts'

/** Boot the normal profile, then mount the optional intelligence bridge when available. */
export async function runProfileWithIntelligence(options: RunProfileOptions) {
  const result = await runProfile(options)
  const loader = result.ctx.get('loader')
  if (loader !== undefined && result.ctx.get('intelligence') === undefined) {
    await loader.create({ name: '@deepseek-ai/dsh-intelligence/plugin' })
  }
  return result
}
