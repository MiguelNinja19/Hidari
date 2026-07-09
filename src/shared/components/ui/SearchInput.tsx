import type { ChangeEvent, KeyboardEvent, ReactNode } from 'react'

type SearchInputProps = {
  value: string
  placeholder: string
  className?: string
  inputClassName?: string
  disabled?: boolean
  onClick?: () => void
  trailing?: ReactNode
  /** Identificador da aba para atalho Ctrl+F (data-search-focus). */
  searchFocusId?: string
  onChange: (value: string) => void
  /** Chamado ao pressionar Enter no campo. */
  onSubmit?: () => void
}

export function SearchInput({
  value,
  placeholder,
  className = 'browse-search browse-search--bar',
  inputClassName = 'browse-search__input',
  disabled,
  onClick,
  trailing,
  searchFocusId,
  onChange,
  onSubmit,
}: SearchInputProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return
    event.preventDefault()
    onSubmit?.()
  }

  return (
    <div className={className}>
      <span className="browse-search__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="6" />
          <path d="M20 20l-4.2-4.2" />
        </svg>
      </span>
      <input
        className={inputClassName}
        type="search"
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        onClick={onClick}
        data-search-focus={searchFocusId}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        autoComplete="off"
        spellCheck={false}
      />
      {trailing}
    </div>
  )
}
