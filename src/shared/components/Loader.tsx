type LoaderProps = {
  size?: 'sm' | 'md' | 'lg'
  label?: string
  className?: string
}

export function Loader({ size = 'md', label = 'Carregando', className }: LoaderProps) {
  return (
    <span
      className={`loader loader--${size}${className ? ` ${className}` : ''}`}
      role="status"
      aria-label={label}
    >
      <span className="loader__track">
        <span className="loader__bar" />
      </span>
    </span>
  )
}
