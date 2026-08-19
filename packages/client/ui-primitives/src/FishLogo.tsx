import type { IconProps } from './icons/props.ts'

/** Hidden. Product branding is the NexLM wordmark, not an icon. */
export function FishLogo({ size = 24, className }: IconProps) {
  return (
    <svg
      width={0}
      height={size}
      viewBox="0 0 1 1"
      className={className}
      aria-hidden="true"
      focusable="false"
    />
  )
}
