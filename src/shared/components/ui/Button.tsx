import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'default' | 'primary' | 'outline' | 'danger' | 'ghost'
type Size = 'default' | 'compact'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: Size
  children: ReactNode
}

export function Button({ variant = 'default', size = 'default', className, children, ...rest }: ButtonProps) {
  const variantClass =
    variant === 'primary'
      ? 'btn-primary'
      : variant === 'outline'
        ? 'btn-outline'
        : variant === 'danger'
          ? 'btn-danger'
          : variant === 'ghost'
            ? 'btn-ghost'
            : ''
  const sizeClass = size === 'compact' ? 'btn--compact' : ''
  const classes = ['btn', variantClass, sizeClass, className].filter(Boolean).join(' ')
  return (
    <button className={classes} {...rest}>
      {children}
    </button>
  )
}
