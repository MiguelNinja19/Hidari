import type { ReactNode } from 'react'

type PageHeaderProps = {
  tag: string
  title: string
  description?: string
  compact?: boolean
  children?: ReactNode
}

export function PageHeader({ tag, title, description, compact = false, children }: PageHeaderProps) {
  return (
    <header className={compact ? 'page-hero page-hero--compact' : 'page-hero'}>
      <div className="page-hero__copy">
        <p className="page-hero__tag">{tag}</p>
        <h2 className="page-hero__title">{title}</h2>
        {description ? <p className="page-hero__desc">{description}</p> : null}
      </div>
      {children}
    </header>
  )
}
