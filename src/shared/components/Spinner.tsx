type SpinnerProps = {
  size?: 'sm' | 'md' | 'lg'
  label?: string
  className?: string
}

const SIZE_PX = {
  sm: 22,
  md: 28,
  lg: 36,
} as const

export function Spinner({ size = 'md', label = 'A carregar…', className }: SpinnerProps) {
  const px = SIZE_PX[size]

  return (
    <span
      className={`spinner spinner--${size}${className ? ` ${className}` : ''}`}
      role="status"
      aria-label={label}
    >
      <svg
        className="spinner__icon"
        width={px}
        height={px}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <circle
          className="spinner__track"
          cx="12"
          cy="12"
          r="9"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeOpacity="0.18"
        />
        <path
          className="spinner__arc"
          d="M12 3a9 9 0 0 1 9 9"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
    </span>
  )
}
