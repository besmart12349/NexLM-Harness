import type { IconProps } from './icons/props.ts'

/** NexLM name mark. Keeps the BrandWordmark API (size, className). */
export function BrandWordmark({ size = 24, className }: IconProps) {
  const width = (size * 100) / 24
  return (
    <svg
      width={width}
      height={size}
      viewBox="0 0 100 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      focusable="false"
      preserveAspectRatio="xMinYMid meet"
    >
      <text
        x="0"
        y="18"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="18"
        fontWeight="700"
        fill="currentColor"
      >
        NexLM
      </text>
    </svg>
  )
}
